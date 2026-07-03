<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    :header="$t('workbench.production.node.storyboard.preview')"
    width="min(1520px, 96vw)"
    :footer="false"
    class="storyboardPreviewDialog">
    <div class="previewDialog">
      <t-button class="previewDownloadBtn" size="small" variant="outline" @click="emit('downloadPreview')">
        {{ $t("workbench.production.node.storyboard.downloadAllPreview") }}
      </t-button>
      <t-tabs v-model="previewMode">
        <t-tab-panel value="grid" :label="$t('workbench.production.node.storyboard.grid')">
          <div class="previewTabBody">
            <div class="previewPager ac jb">
              <t-button size="small" variant="outline" :disabled="!canPreviewPrev" @click="emit('changePreview', -1)">
                <template #icon><i-left /></template>
              </t-button>
              <span>{{ previewTitle }}</span>
              <t-button size="small" variant="outline" :disabled="!canPreviewNext" @click="emit('changePreview', 1)">
                <template #icon><i-right /></template>
              </t-button>
            </div>
            <div class="previewGridPanel">
              <div class="previewGrid" :style="previewGridStyle">
                <div
                  v-for="item in currentPreviewItems"
                  :key="item.id"
                  class="previewGridItem"
                  :class="{ placeholder: !hasStoryboardPreviewImage(item) }"
                  @click="emit('openImageViewer', item)">
                  <img
                    v-if="hasStoryboardPreviewImage(item)"
                    :src="getStoryboardImageUrl(item, 'preview') || getStoryboardImageUrl(item, 'display')"
                    :style="{ objectFit: getPreviewImageFit(item) }"
                    loading="eager"
                    @load="emit('imageLoad', getStoryboardImageUrl(item, 'preview') || getStoryboardImageUrl(item, 'display'), $event)" />
                  <div v-else class="previewPlaceholder">
                    <strong>{{ getStoryboardPreviewLabel(item) }}</strong>
                  </div>
                  <t-tag class="previewShotTag" size="small">S{{ String(getStoryboardIndex(item) + 1).padStart(2, "0") }}</t-tag>
                </div>
              </div>
            </div>
          </div>
        </t-tab-panel>
        <t-tab-panel value="timeline" :label="$t('workbench.production.node.storyboard.timeline')">
          <div class="previewTabBody">
            <div class="timelinePlayer">
              <div class="timelineMainStage">
                <t-button class="timelineArrow timelineArrowLeft" shape="circle" variant="text" :disabled="timelineIndex <= 0" @click="emit('update:timelineIndex', timelineIndex - 1)">
                  <template #icon><i-left /></template>
                </t-button>
                <div
                  v-if="timelineCurrent"
                  class="timelineHero"
                  :class="{ placeholder: !hasStoryboardPreviewImage(timelineCurrent) }"
                  @click="emit('openImageViewer', timelineCurrent)">
                  <img v-if="hasStoryboardPreviewImage(timelineCurrent)" :src="getStoryboardImageUrl(timelineCurrent, 'preview') || getStoryboardImageUrl(timelineCurrent, 'display')" />
                  <div v-else class="timelineHeroPlaceholder">
                    <strong>{{ getStoryboardPreviewLabel(timelineCurrent) }}</strong>
                    <span>S{{ String(getStoryboardIndex(timelineCurrent) + 1).padStart(2, "0") }}</span>
                  </div>
                </div>
                <div v-else class="timelineEmpty">
                  <strong>{{ $t("workbench.production.node.storyboard.noPreviewImages") }}</strong>
                </div>
                <t-button
                  class="timelineArrow timelineArrowRight"
                  shape="circle"
                  variant="text"
                  :disabled="timelineIndex >= timelineItems.length - 1"
                  @click="emit('update:timelineIndex', timelineIndex + 1)">
                  <template #icon><i-right /></template>
                </t-button>
              </div>
              <aside v-if="timelineCurrent" class="timelineInfoPanel">
                <div class="timelineInfoHead">
                  <strong>S{{ String(getStoryboardIndex(timelineCurrent) + 1).padStart(2, "0") }}</strong>
                  <span>{{ timelineCurrent.duration || 0 }}s</span>
                </div>
                <p>{{ getStoryboardDescription(timelineCurrent) }}</p>
              </aside>
              <div ref="timelineStripRef" class="timelineStrip">
                <div
                  v-for="(item, index) in timelineItems"
                  :key="item.id"
                  :data-timeline-index="index"
                  class="timelineThumb"
                  :class="{ active: index === timelineIndex, placeholder: !hasStoryboardPreviewImage(item) }"
                  @click="emit('update:timelineIndex', index)">
                  <img v-if="hasStoryboardPreviewImage(item)" :src="getStoryboardImageUrl(item, 'display') || getStoryboardImageUrl(item, 'preview')" loading="lazy" />
                  <div v-else class="timelineThumbPlaceholder">
                    {{ getStoryboardPreviewLabel(item) }}
                  </div>
                  <div>
                    <span>S{{ String(getStoryboardIndex(item) + 1).padStart(2, "0") }}</span>
                    <small>{{ item.duration || 0 }}s</small>
                  </div>
                </div>
              </div>
              <div class="timelineCounter">{{ timelineIndex + 1 }} / {{ timelineItems.length || 1 }}</div>
            </div>
          </div>
        </t-tab-panel>
      </t-tabs>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false });
const previewMode = defineModel<"grid" | "timeline">("previewMode", { default: "grid" });

const props = defineProps<{
  currentPreviewItems: any[];
  previewGridStyle: Record<string, string>;
  previewTitle: string;
  canPreviewPrev: boolean;
  canPreviewNext: boolean;
  timelineItems: any[];
  timelineCurrent: any;
  timelineIndex: number;
  getStoryboardIndex: (row: any) => number;
  getStoryboardDescription: (row: any) => string;
  getStoryboardImageUrl: (row: any, purpose?: "preview" | "display") => string;
  hasStoryboardPreviewImage: (row: any) => boolean;
  getStoryboardPreviewLabel: (row: any) => string;
  getPreviewImageFit: (row: any) => "cover" | "contain";
}>();

const emit = defineEmits<{
  changePreview: [delta: number];
  openImageViewer: [row: any];
  imageLoad: [src: string, event: Event];
  "update:timelineIndex": [index: number];
  downloadPreview: [];
}>();

const timelineStripRef = ref<HTMLElement | null>(null);

function scrollActiveTimelineThumbIntoView() {
  if (previewMode.value !== "timeline") return;
  nextTick(() => {
    const strip = timelineStripRef.value;
    const activeThumb = strip?.querySelector<HTMLElement>(`[data-timeline-index="${props.timelineIndex}"]`);
    activeThumb?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  });
}

watch(
  () => [props.timelineIndex, props.timelineItems.length, previewMode.value, visible.value] as const,
  () => scrollActiveTimelineThumbIntoView(),
  { immediate: true },
);
</script>
