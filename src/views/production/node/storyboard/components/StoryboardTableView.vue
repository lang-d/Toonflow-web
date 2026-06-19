<template>
  <div class="tableWrapper">
    <template v-for="group in groups" :key="group.key">
      <div v-if="hasTrackGroups" class="groupHeader">
        <div class="groupTitle">
          <t-button size="small" shape="circle" variant="text" @click="emit('toggleGroup', group.key)">
            <template #icon>
              <i-down v-if="!collapsedGroupKeys.includes(group.key)" />
              <i-right v-else />
            </template>
          </t-button>
          <span>{{ group.title }}</span>
          <t-tag size="small" variant="light">{{ group.items.length }}</t-tag>
          <t-tag v-if="group.beatId" size="small" variant="outline">{{ group.beatId }}</t-tag>
        </div>
        <t-tooltip v-if="group.intent" :content="group.intent">
          <div class="groupIntent">{{ group.intent }}</div>
        </t-tooltip>
        <t-button size="small" variant="outline" :disabled="!group.items.some((item: any) => item.id)" @click="emit('generateGroup', group.items)">
          <template #icon><i-play-one /></template>
          {{ $t("workbench.production.node.storyboard.generateImage") }}
        </t-button>
      </div>
      <t-table
        v-show="!collapsedGroupKeys.includes(group.key)"
        :columns="tableColumns"
        :data="group.items"
        row-key="id"
        size="small"
        hover
        bordered
        table-layout="fixed"
        :pagination="undefined">
        <template #shot="{ row }">
          <div class="shotCell">
            <t-checkbox :checked="selectedIds.includes(row.id!)" :disabled="!row.id" @change="(checked: boolean) => emit('toggleSelect', row.id!, checked)" />
            <t-tag :style="{ backgroundColor: tagColors[getStoryboardIndex(row) % tagColors.length], color: '#fff', border: 'none' }">
              S{{ String(getStoryboardIndex(row) + 1).padStart(2, "0") }}
            </t-tag>
            <t-tag v-if="row.factStatus && row.factStatus !== 'ready'" size="small" :theme="getFactStatusTheme(row.factStatus)" variant="light">
              {{ getFactStatusLabel(row.factStatus) }}
            </t-tag>
          </div>
        </template>
        <template #assets="{ row }">
          <div class="assetsCell">
            <template v-if="getStoryboardReferences(row).length">
              <div v-for="assetGroup in getGroupedReferences(row)" :key="assetGroup.group" class="assetGroup">
                <span class="assetGroupName">{{ assetGroup.group }}</span>
                <div class="assetThumbs">
                  <t-popup v-for="ref in assetGroup.items" :key="ref.key" placement="top" destroy-on-close>
                    <template #content>
                      <div class="assetPreviewPopup">
                        <img :src="ref.src" />
                        <div>{{ ref.label }}</div>
                      </div>
                    </template>
                    <div class="assetChip">
                      <img :src="ref.src" />
                      <span>{{ ref.label }}</span>
                    </div>
                  </t-popup>
                </div>
              </div>
            </template>
            <span v-else class="emptyHint">{{ $t("workbench.production.node.storyboard.noReferences") }}</span>
            <t-button class="assetAddBtn" size="small" shape="circle" variant="outline" @click="emit('openPromptEditor', row)">
              <template #icon><i-plus /></template>
            </t-button>
          </div>
        </template>
        <template #prompt="{ row }">
          <button class="promptCell" type="button" @click="emit('openPromptEditor', row)">
            <div v-if="getStoryboardReferences(row).length" class="promptReferenceSummary">
              <span v-for="ref in getStoryboardReferences(row).slice(0, 3)" :key="ref.key" class="promptReferenceChip">
                <img :src="ref.src" />
                {{ ref.label }}
              </span>
              <span v-if="getStoryboardReferences(row).length > 3" class="promptReferenceMore">
                +{{ getStoryboardReferences(row).length - 3 }}
              </span>
            </div>
            <div class="promptTextSummary">{{ row.prompt || $t("workbench.production.node.storyboard.promptPlaceholder") }}</div>
            <span class="promptEditIcon"><i-edit /></span>
          </button>
        </template>
        <template #image="{ row }">
          <div class="tableImageCell">
            <div
              v-if="getStoryboardImageUrl(row, 'display') && row.state === '已完成'"
              class="storyboardThumbWrap"
              :style="{ aspectRatio: getImageRatio(getStoryboardImageUrl(row, 'display')) }"
              @click="emit('openImageViewer', row)">
              <img
                :src="getStoryboardImageUrl(row, 'display')"
                class="storyboardThumb"
                loading="lazy"
                @load="emit('imageLoad', getStoryboardImageUrl(row, 'display'), $event)" />
            </div>
            <div v-else class="thumbPlaceholder">
              <t-loading v-if="row.state === '生成中'" size="small" />
              <t-tooltip v-else-if="row.state === '生成失败'" :content="row.reason">
                <span class="stateError">{{ $t("workbench.production.node.storyboard.genFailed") }}</span>
              </t-tooltip>
              <span v-else class="statePending">{{ $t("workbench.production.node.storyboard.notGenerated") }}</span>
            </div>
            <div class="imageActions">
              <t-tooltip :content="$t('workbench.production.node.storyboard.regenerate')">
                <t-button size="small" shape="circle" variant="text" :disabled="row.state === '生成中'" @click="emit('regenerateSingleImage', row)">
                  <template #icon><i-play-one /></template>
                </t-button>
              </t-tooltip>
              <t-tooltip :content="$t('workbench.production.node.storyboard.editNode')">
                <t-button size="small" shape="circle" variant="text" @click="emit('editStoryboardImage', row, [getStoryboardImageUrl(row, 'preview') || ''], null)">
                  <template #icon><i-edit /></template>
                </t-button>
              </t-tooltip>
              <t-tooltip :content="$t('workbench.production.node.storyboard.history')">
                <t-button size="small" shape="circle" variant="text" @click="emit('openStoryboardHistory', row)">
                  <template #icon><i-history /></template>
                </t-button>
              </t-tooltip>
            </div>
          </div>
        </template>
        <template #duration="{ row }">
          <div class="durationCell">
            <t-button size="small" variant="outline" class="durationStep" @click="changeDuration(row, -1)">-</t-button>
            <input class="durationInput" type="number" min="0" :value="row.duration || 0" @change="handleDurationInput(row, $event)" />
            <t-button size="small" variant="outline" class="durationStep" @click="changeDuration(row, 1)">+</t-button>
          </div>
        </template>
        <template #operate="{ row }">
          <div class="rowActions">
            <t-tooltip :content="$t('workbench.production.node.storyboard.editInfo')">
              <t-button size="small" shape="circle" variant="text" @click="emit('openPromptEditor', row)">
                <template #icon><i-edit /></template>
              </t-button>
            </t-tooltip>
            <t-tooltip :content="$t('workbench.production.node.storyboard.deleteNode')">
              <t-button size="small" shape="circle" variant="text" theme="danger" @click="emit('remove', row.id!)">
                <template #icon><i-delete /></template>
              </t-button>
            </t-tooltip>
          </div>
        </template>
      </t-table>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  groups: any[];
  hasTrackGroups: boolean;
  collapsedGroupKeys: string[];
  tableColumns: any[];
  selectedIds: number[];
  tagColors: string[];
  getStoryboardIndex: (row: any) => number;
  getStoryboardReferences: (row: any) => any[];
  getGroupedReferences: (row: any) => any[];
  getImageRatio: (src: string) => string;
  getStoryboardImageUrl: (row: any, purpose?: "preview" | "display") => string;
}>();

const emit = defineEmits<{
  toggleGroup: [key: string];
  generateGroup: [rows: any[]];
  toggleSelect: [id: number, checked: boolean];
  openPromptEditor: [row: any];
  saveStoryboardInfo: [row: any];
  openImageViewer: [row: any];
  regenerateSingleImage: [row: any];
  editStoryboardImage: [row: any, images: string[], insertAfterIndex: number | null];
  openStoryboardHistory: [row: any];
  remove: [id: number];
  imageLoad: [src: string, event: Event];
}>();

function changeDuration(row: any, delta: number) {
  row.duration = Math.max(0, Number(row.duration || 0) + delta);
  emit("saveStoryboardInfo", row);
}

function handleDurationInput(row: any, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  row.duration = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  emit("saveStoryboardInfo", row);
}

function getFactStatusLabel(status?: string) {
  if (status === "draft") return "草稿/待补齐";
  if (status === "legacy") return "旧数据/待整理";
  return status || "";
}

function getFactStatusTheme(status?: string) {
  if (status === "draft") return "warning";
  if (status === "legacy") return "default";
  return "success";
}
</script>
