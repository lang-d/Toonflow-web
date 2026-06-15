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
            </div>
            <div v-if="item.src && item.state === '已完成'" class="frameImgWrap" :style="{ aspectRatio: getImageRatio(item.src) }" @click="emit('editStoryboardImage', item, [item.src])">
              <img :src="item.src" class="frameImg" loading="lazy" @load="emit('imageLoad', item.src, $event)" />
            </div>
            <div v-else class="generatingPlaceholder" :style="{ aspectRatio: defaultImageRatio }" @click="emit('editStoryboardImage', item, [])">
              <t-loading v-if="item.state === '生成中'" size="small" />
              <t-tooltip v-else-if="item.state === '生成失败'" :content="item.reason">
                <span style="color: #ff4d4f">{{ $t("workbench.production.node.storyboard.genFailed") }}</span>
              </t-tooltip>
              <t-empty v-else size="small" :title="$t('workbench.production.node.storyboard.notGenerated')" />
            </div>
            <div class="cardActions" :style="{ transform: `scale(${styleMaxSize})` }" @click.stop>
              <t-button size="small" shape="circle" @click="emit('regenerateSingleImage', item)">
                <template #icon><i-play-one /></template>
              </t-button>
              <t-button size="small" shape="circle" @click="emit('editStoryboardImage', item, [item.src || ''])">
                <template #icon><i-edit /></template>
              </t-button>
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
}>();

const emit = defineEmits<{
  "update:selectedIds": [ids: number[]];
  editStoryboardImage: [row: any, images: string[]];
  regenerateSingleImage: [row: any];
  remove: [id: number];
  imageLoad: [src: string, event: Event];
}>();
</script>
