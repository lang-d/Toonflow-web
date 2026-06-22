import { computed, type Ref, watch } from "vue";
import type { Storyboard } from "../../../utils/flowBuilder";
import type { StoryboardGroup } from "../types";
import { normalizeTaskStatus } from "@/stores/taskCenter";

export function useStoryboardPreview(options: {
  storyboard: Ref<Storyboard[]>;
  previewGroupIndex: Ref<number>;
  previewPageIndex: Ref<number>;
  timelineIndex: Ref<number>;
  getTrackTitle: (index: number) => string;
  getStoryboardIndex: (row: Storyboard) => number;
}) {
  const hasTrackGroups = computed(() => options.storyboard.value.some((item) => item.groupKey || item.groupName || item.trackId != null));
  const storyboardGroups = computed<StoryboardGroup[]>(() => {
    if (!hasTrackGroups.value) {
      return [{ key: "all", title: options.getTrackTitle(0), items: options.storyboard.value }];
    }
    const groups: StoryboardGroup[] = [];
    const keyIndex = new Map<string, number>();
    options.storyboard.value.forEach((item) => {
      const key = item.groupKey ? `group-${item.groupKey}` : `track-${item.trackId ?? "none"}`;
      let index = keyIndex.get(key);
      if (index == null) {
        index = groups.length;
        keyIndex.set(key, index);
        groups.push({
          key,
          title: item.groupName || item.trackName || options.getTrackTitle(groups.length),
          intent: item.groupIntent,
          beatId: item.beatId,
          items: [],
        });
      }
      groups[index].items.push(item);
    });
    return groups;
  });

  const isFinished = (item: Storyboard) =>
    Boolean(
      (item.media || item.src || item.url || item.imageUrl || item.thumbnail || item.thumb) &&
        normalizeTaskStatus(item.status ?? item.state, "pending") === "completed",
    );
  const previewItems = computed(() => options.storyboard.value.filter(isFinished));
  const sliceStoryboardPages = (items: Storyboard[]) => {
    const pages: Storyboard[][] = [];
    for (let i = 0; i < items.length; i += 9) pages.push(items.slice(i, i + 9));
    return pages;
  };
  const previewGroups = computed(() => {
    if (!hasTrackGroups.value) return [];
    return storyboardGroups.value
      .map((group) => ({
        ...group,
        items: group.items.filter(isFinished),
      }))
      .filter((group) => group.items.length);
  });
  const ungroupedPreviewPages = computed(() => sliceStoryboardPages(previewItems.value));
  const currentPreviewItems = computed(() => {
    if (hasTrackGroups.value) return previewGroups.value[options.previewGroupIndex.value]?.items ?? [];
    return ungroupedPreviewPages.value[options.previewPageIndex.value] ?? [];
  });
  const timelineItems = computed(() => {
    if (hasTrackGroups.value) return previewGroups.value[options.previewGroupIndex.value]?.items ?? [];
    return previewItems.value;
  });
  const previewGridStyle = computed(() => {
    if (!hasTrackGroups.value) {
      return {
        "--preview-cols": "3",
        "--preview-rows": "3",
      };
    }
    const count = Math.max(currentPreviewItems.value.length, 1);
    const cols = count <= 2 ? count : count <= 6 ? 3 : count <= 12 ? 4 : Math.ceil(Math.sqrt(count));
    return {
      "--preview-cols": String(cols),
      "--preview-rows": String(Math.ceil(count / cols)),
    };
  });
  const previewTitle = computed(() => {
    if (hasTrackGroups.value) {
      const group = previewGroups.value[options.previewGroupIndex.value];
      return group ? `${group.title} ${options.previewGroupIndex.value + 1} / ${previewGroups.value.length || 1}` : "";
    }
    return `${options.previewPageIndex.value + 1} / ${ungroupedPreviewPages.value.length || 1}`;
  });
  const canPreviewPrev = computed(() => (hasTrackGroups.value ? options.previewGroupIndex.value > 0 : options.previewPageIndex.value > 0));
  const canPreviewNext = computed(
    () =>
      hasTrackGroups.value
        ? options.previewGroupIndex.value < previewGroups.value.length - 1
        : options.previewPageIndex.value < ungroupedPreviewPages.value.length - 1,
  );
  const timelineCurrent = computed(() => timelineItems.value[options.timelineIndex.value]);

  watch(timelineItems, () => {
    options.timelineIndex.value = 0;
  });
  watch(previewItems, () => {
    options.previewPageIndex.value = 0;
  });
  watch(previewGroups, () => {
    options.previewGroupIndex.value = 0;
  });

  function changePreview(delta: number) {
    if (hasTrackGroups.value) {
      const nextGroup = options.previewGroupIndex.value + delta;
      if (nextGroup < 0 || nextGroup >= previewGroups.value.length) return;
      options.previewGroupIndex.value = nextGroup;
      return;
    }
    const nextPage = options.previewPageIndex.value + delta;
    if (nextPage >= 0 && nextPage < ungroupedPreviewPages.value.length) {
      options.previewPageIndex.value = nextPage;
    }
  }

  function getStoryboardDescription(item: Storyboard) {
    const fallback = `S${String(options.getStoryboardIndex(item) + 1).padStart(2, "0")}`;
    const structured = [item.location, item.timeOfDay, item.picture, item.action, item.dialogue, item.sound]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" · ");
    return structured || fallback;
  }

  return {
    hasTrackGroups,
    storyboardGroups,
    previewItems,
    previewGroups,
    currentPreviewItems,
    timelineItems,
    previewGridStyle,
    previewTitle,
    canPreviewPrev,
    canPreviewNext,
    timelineCurrent,
    changePreview,
    getStoryboardDescription,
  };
}
