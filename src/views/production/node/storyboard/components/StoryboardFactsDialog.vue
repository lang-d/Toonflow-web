<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    placement="center"
    width="min(860px, 94vw)"
    class="storyboardFactsDialog"
    :header="`正式分镜事实 ${shotLabel}`"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: $t('common.save'), loading: saving, disabled: loading || Boolean(error) }"
    :cancel-btn="$t('common.cancel')"
    destroy-on-close
    @confirm="emit('confirm')">
    <t-loading :loading="loading" show-overlay>
      <div class="storyboardFactsEditor">
        <t-alert v-if="error" theme="error" :message="error" />
        <template v-else>
          <p class="factsIntro">
            {{ factVersion === 3 ? "镜头描述按镜头内可见时间顺序记录，不拆分为人物表演或首帧构图。" : "历史分镜按原生版本编辑，保存不会转换为 V3。" }}
          </p>
          <div class="factsGrid">
            <label v-for="field in fields" :key="field.key" class="factsField" :class="{ wide: field.wide }">
              <span>{{ field.label }}</span>
              <t-textarea
                v-if="field.multiline"
                v-model="facts[field.key]"
                :autosize="field.key === 'shotDescription' ? { minRows: 7, maxRows: 16 } : { minRows: 2, maxRows: 5 }"
                :placeholder="field.placeholder" />
              <t-input v-else v-model="facts[field.key]" :placeholder="field.placeholder" />
            </label>
          </div>

          <section class="requiredAssetsSection">
            <strong>所需资产</strong>
            <span>只选择本镜实际需要的正式资产；图片 Prompt 面板的参考图另行管理。</span>
            <t-select v-model="requiredAssetIds" multiple filterable clearable :options="assetOptions" placeholder="选择正式资产" />
          </section>

          <section v-if="legacyPerformance" class="legacySection">
            <strong>历史 V1 表演信息</strong>
            <span>仅只读保留；保存时会原样保存在 V1 JSON 中。</span>
            <dl>
              <template v-if="legacyPerformance.visibleEmotion"><dt>可见情绪</dt><dd>{{ legacyPerformance.visibleEmotion }}</dd></template>
              <template v-for="(character, index) in legacyPerformance.characters" :key="`${character.name}-${index}`">
                <dt>人物 {{ index + 1 }}</dt><dd>{{ formatLegacyCharacter(character) }}</dd>
              </template>
            </dl>
          </section>
        </template>
      </div>
    </t-loading>
  </t-dialog>
</template>

<script setup lang="ts">
type FactKey =
  | "location"
  | "timeOfDay"
  | "sceneContinuityId"
  | "transitionFromPrevious"
  | "shotDescription"
  | "picture"
  | "action"
  | "shotSize"
  | "cameraMove"
  | "cameraAngle"
  | "dialogue"
  | "sound";

type LegacyCharacter = {
  name: string;
  spatialPosition?: string;
  orientation?: string;
  action?: string;
  posture?: string;
  expression?: string;
  gaze?: string;
  handAction?: string;
  movement?: string;
};

const visible = defineModel<boolean>("visible", { default: false });
const facts = defineModel<Record<FactKey, string>>("facts", { required: true });
const requiredAssetIds = defineModel<number[]>("requiredAssetIds", { default: () => [] });

const props = defineProps<{
  loading: boolean;
  saving: boolean;
  shotLabel: string;
  factVersion: 1 | 2 | 3;
  error?: string;
  assetOptions: Array<{ label: string; value: number }>;
  legacyPerformance?: { visibleEmotion?: string; characters: LegacyCharacter[] } | null;
}>();

const fields = computed(() => [
  { key: "location" as const, label: "地点", placeholder: "镜头所在地点" },
  { key: "timeOfDay" as const, label: "时间", placeholder: "如清晨、夜晚" },
  { key: "sceneContinuityId" as const, label: "连续性标识", placeholder: "同一连续空间/时间的标识" },
  { key: "shotSize" as const, label: "景别", placeholder: "如中景、近景、特写" },
  ...(props.factVersion === 3
    ? [{ key: "shotDescription" as const, label: "镜头描述", placeholder: "按时间顺序描述开拍状态、连续变化与结束状态", multiline: true, wide: true }]
    : [
        { key: "picture" as const, label: "画面", placeholder: "原生画面字段", multiline: true, wide: true },
        { key: "action" as const, label: "动作", placeholder: "原生动作字段", multiline: true, wide: true },
      ]),
  { key: "cameraMove" as const, label: "运镜", placeholder: "如固定、推、摇、跟随" },
  { key: "cameraAngle" as const, label: "机位", placeholder: "机位方向与角度", multiline: true },
  { key: "transitionFromPrevious" as const, label: "与上一镜转场", placeholder: "硬切、淡入或其他衔接", multiline: true },
  { key: "dialogue" as const, label: "台词", placeholder: "每行一条：角色：台词", multiline: true, wide: true },
  { key: "sound" as const, label: "声音", placeholder: "每行一条声音事实", multiline: true, wide: true },
]);

const emit = defineEmits<{ confirm: [] }>();

function formatLegacyCharacter(character: LegacyCharacter) {
  return [
    character.name,
    character.spatialPosition && `站位：${character.spatialPosition}`,
    character.orientation && `朝向：${character.orientation}`,
    character.action && `动作：${character.action}`,
    character.posture && `姿态：${character.posture}`,
    character.expression && `表情：${character.expression}`,
    character.gaze && `视线：${character.gaze}`,
    character.handAction && `手部：${character.handAction}`,
    character.movement && `移动：${character.movement}`,
  ]
    .filter(Boolean)
    .join("；");
}
</script>

<style lang="scss">
.storyboardFactsDialog .t-dialog__body {
  min-height: 0;
  max-height: min(760px, calc(92vh - 130px));
  overflow: auto;
}

.storyboardFactsEditor { display: grid; gap: 14px; }
.factsIntro { margin: 0; color: var(--td-text-color-secondary); font-size: 13px; line-height: 1.6; }
.factsGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.factsField { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
.factsField > span, .requiredAssetsSection > span, .legacySection > span { color: var(--td-text-color-secondary); font-size: 12px; }
.factsField.wide { grid-column: 1 / -1; }
.requiredAssetsSection, .legacySection { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--td-border-level-1-color); border-radius: 6px; }
.legacySection { background: var(--td-bg-color-secondarycontainer); }
.legacySection dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 12px; margin: 0; line-height: 1.6; }
.legacySection dt { color: var(--td-text-color-secondary); }
.legacySection dd { min-width: 0; margin: 0; word-break: break-word; }
</style>
