<template>
  <div class="gridWrapper">
    <t-checkbox-group :model-value="selectedIds" @update:model-value="emit('update:selectedIds', $event as number[])">
      <div class="frameGrid">
        <div v-for="(item, index) in storyboard" :key="item.id" class="frameItem">
          <div class="frameImage" :style="{ width: `${180 * gridScale}px` }">
            <div class="ac frameCheckbox" :style="{ transform: `scale(${styleMaxSize})` }">
              <t-checkbox :checked="selectedIds.includes(item.id!)" @click.stop :value="item.id" />
              <t-tag class="frameTypeTag" :style="{ backgroundColor: tagColors[index % tagColors.length] }">
                S{{ String(index + 1).padStart(2, "0") }}
              </t-tag>
              <t-tag v-if="item.factStatus && item.factStatus !== 'ready'" class="frameFactTag" size="small" :theme="getFactStatusTheme(item.factStatus)" variant="light">
                {{ getFactStatusLabel(item.factStatus) }}
              </t-tag>
              <t-tag v-if="item.imageStale" class="frameFactTag" size="small" theme="warning" variant="light">
                {{ $t("workbench.production.node.storyboard.imageStale") }}
              </t-tag>
            </div>
            <div
              v-if="getStoryboardImageUrl(item, 'display') && isStoryboardCompleted(item)"
              class="frameImgWrap"
              :style="{ aspectRatio: getImageRatio(getStoryboardImageUrl(item, 'display')) }"
              @click="emit('editStoryboardImage', item, [getStoryboardImageUrl(item, 'preview')])">
              <img
                :src="getStoryboardImageUrl(item, 'display')"
                class="frameImg"
                loading="lazy"
                @load="emit('imageLoad', getStoryboardImageUrl(item, 'display'), $event)" />
            </div>
            <div v-else class="generatingPlaceholder" :style="{ aspectRatio: defaultImageRatio }" @click="emit('editStoryboardImage', item, [])">
              <t-loading v-if="isStoryboardActive(item)" size="small" />
              <t-tooltip v-else-if="isStoryboardFailed(item)" :content="item.reason">
                <span style="color: #ff4d4f">{{ $t("workbench.production.node.storyboard.genFailed") }}</span>
              </t-tooltip>
              <t-empty v-else size="small" :title="$t('workbench.production.node.storyboard.notGenerated')" />
            </div>
            <div class="cardActions" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop>
              <t-button size="small" shape="circle" @click="emit('regenerateSingleImage', item)">
                <template #icon><i-play-one /></template>
              </t-button>
              <t-button size="small" shape="circle" @click="emit('editStoryboardImage', item, [getStoryboardImageUrl(item, 'preview') || ''])">
                <template #icon><i-edit /></template>
              </t-button>
              <t-tooltip content="编辑分镜图 Prompt">
                <t-button size="small" shape="circle" @click="emit('openPromptEditor', item)">
                  <template #icon><i-edit-one /></template>
                </t-button>
              </t-tooltip>
              <t-tooltip content="编辑正式分镜事实">
                <t-button size="small" shape="circle" @click="emit('openFactEditor', item)">
                  <template #icon><i-notes /></template>
                </t-button>
              </t-tooltip>
              <t-button size="small" shape="circle" theme="danger" @click="emit('remove', item.id!)">
                <template #icon><i-delete /></template>
              </t-button>
            </div>
          </div>
        </div>
      </div>
    </t-checkbox-group>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  storyboard: any[];
  selectedIds: number[];
  gridScale: number;
  styleMaxSize: number;
  defaultImageRatio: string;
  tagColors: string[];
  getImageRatio: (src: string) => string;
  getStoryboardImageUrl: (row: any, purpose?: "preview" | "display") => string;
  isStoryboardActive: (row: any) => boolean;
  isStoryboardCompleted: (row: any) => boolean;
  isStoryboardFailed: (row: any) => boolean;
}>();

const emit = defineEmits<{
  "update:selectedIds": [ids: number[]];
  editStoryboardImage: [row: any, images: string[]];
  openPromptEditor: [row: any];
  openFactEditor: [row: any];
  regenerateSingleImage: [row: any];
  remove: [id: number];
  imageLoad: [src: string, event: Event];
}>();

function getFactStatusLabel(status?: string) {
  if (status === "draft") return "草稿";
  if (status === "legacy") return "旧数据";
  return status || "";
}

function getFactStatusTheme(status?: string) {
  if (status === "draft") return "warning";
  if (status === "legacy") return "default";
  return "success";
}
</script>
