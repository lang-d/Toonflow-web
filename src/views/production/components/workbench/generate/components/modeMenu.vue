<template>
  <div class="modeMenu">
    <div class="left f ac">
      <div class="model">
        <modelSelect v-model="modelParmas.model" type="video" size="small" />
      </div>
      <t-select
        v-if="videoPromptTypeCapability?.options.length"
        size="small"
        class="videoPromptType"
        :value="videoPromptType ?? undefined"
        :options="videoPromptTypeCapability.options"
        clearable
        placeholder="视频类型"
        @change="handleVideoPromptTypeChange" />
      <t-select size="small" class="mode" :value="modelParmas.mode" :onChange="handleBeforeChange">
        <t-option v-for="(item, index) in modeList" :key="index" :value="item.value" :label="item.label"></t-option>
      </t-select>
      <t-button
        size="small"
        variant="outline"
        :theme="modelParmas.audio ? 'success' : 'danger'"
        class="audio"
        :disabled="audioFixed"
        :title="audioFixed ? audioFixedHint : undefined"
        @click="emit('audioChange', !modelParmas.audio)">
        <template #icon>
          <i-volume-notice v-if="modelParmas.audio" size="16" />
          <i-volume-mute v-else size="16" />
        </template>
      </t-button>
      <div class="status">
        <t-popup
          v-model:visible="pickerVisible"
          trigger="click"
          placement="bottom"
          overlay-class-name="resDurPickerPopup"
          :overlay-inner-style="{ padding: '16px', borderRadius: '8px' }">
          <t-tag class="btn" :theme="durationInvalid ? 'warning' : 'default'" variant="outline">{{ modelParmas.resolution }}·{{ modelParmas.duration }}s</t-tag>
          <template #content>
            <div class="resolutionDurationPicker">
              <div v-if="resolutionOptions.length" class="pickerSection resolutionSection">
                <div class="pickerLabel">{{ $t("workbench.generate.resolution") }}</div>
                <div class="pickerOptions">
                  <div
                    v-for="res in resolutionOptions"
                    :key="res"
                    class="pickerOption"
                    :class="{ active: modelParmas.resolution == res }"
                    @click="emit('resolutionChange', res)">
                    {{ res }}
                  </div>
                </div>
              </div>
              <div v-if="durationOptions.length" class="pickerSection durationSection">
                <div class="pickerLabel">{{ $t("workbench.generate.duration") }}</div>
                <div ref="durationOptionsEl" class="pickerOptions durationOptions">
                  <div
                    v-for="dur in durationOptions"
                    :key="dur"
                    class="pickerOption"
                    :class="{ active: modelParmas.duration == dur }"
                    :data-duration="dur"
                    @click="emit('durationChange', dur)">
                    {{ dur }}s
                  </div>
                </div>
              </div>
            </div>
          </template>
        </t-popup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import "@/views/production/components/workbench/type/type";
import type { SelectValue } from "tdesign-vue-next";
import { getSupportedDurations, getSupportedResolutions, isSupportedDuration } from "../videoGenerationCapabilities";

const props = defineProps<{
  modeOptions: VideoModel;
  modeList: { value: string; label: string }[];
  videoPromptTypeCapability?: VideoPromptTypeCapability | null;
  videoPromptType?: string | null;
}>();
const modelParmas = defineModel<ModelSetting>({
  default: {
    mode: "",
    model: "",
    resolution: "480p",
    duration: 8,
    audio: true,
  },
});
const emit = defineEmits<{
  modeChange: [value: string];
  resolutionChange: [value: string];
  durationChange: [value: number];
  audioChange: [value: boolean];
  videoPromptTypeChange: [value: string | null];
}>();
const pickerVisible = ref(false);
const durationOptionsEl = ref<HTMLElement>();
const resolutionOptions = computed(() => getSupportedResolutions(props.modeOptions));
const durationOptions = computed(() => getSupportedDurations(props.modeOptions, modelParmas.value.resolution));
const durationInvalid = computed(() => !isSupportedDuration(props.modeOptions, modelParmas.value.resolution, modelParmas.value.duration));
const audioFixed = computed(() => props.modeOptions.audio === true || props.modeOptions.audio === false);
const audioFixedHint = computed(() => props.modeOptions.audio === true ? "当前模型始终生成音频" : "当前模型不支持生成音频");

function handleBeforeChange(newVal: SelectValue) {
  emit("modeChange", String(newVal));
}

function handleVideoPromptTypeChange(value: SelectValue) {
  emit("videoPromptTypeChange", typeof value === "string" && value ? value : null);
}

watch(pickerVisible, async (visible) => {
  if (!visible) return;
  await nextTick();
  durationOptionsEl.value?.querySelector<HTMLElement>(`[data-duration="${modelParmas.value.duration}"]`)?.scrollIntoView({ block: "center" });
});
</script>

<style lang="scss" scoped>
.modeMenu {
  width: 100%;
  .left {
    flex: 1;
    gap: 8px;
    .mode {
      width: 280px;
    }
    .videoPromptType {
      width: 160px;
    }
    .status {
      .btn {
        cursor: pointer;
        &:hover {
          background-color: var(--td-bg-color-secondarycontainer);
        }
      }
    }
  }
}
</style>
<style lang="scss">
.resolutionDurationPicker {
  min-width: 240px;
  max-height: min(420px, calc(100dvh - 32px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  .pickerSection {
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }

    .pickerLabel {
      font-size: 13px;
      font-weight: 600;
      color: var(--td-text-color-primary);
      margin-bottom: 10px;
    }

    .pickerOptions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;

      .pickerOption {
        padding: 6px 0;
        border-radius: 8px;
        border: 1.5px solid var(--td-border-level-1-color);
        font-size: 13px;
        color: var(--td-text-color-primary);
        cursor: pointer;
        transition: all 0.15s;
        user-select: none;
        text-align: center;
        background: var(--td-bg-color-container);

        &:hover {
          border-color: var(--td-border-level-2-color);
        }

        &.active {
          border-color: var(--td-text-color-primary);
          color: var(--td-text-color-primary);
          font-weight: 500;
        }
      }
    }

    &.durationSection {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .durationOptions {
      max-height: 260px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }
  }
}
</style>
