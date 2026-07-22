<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    placement="center"
    width="min(900px, 94vw)"
    class="storyboardPromptDialog"
    :header="`${$t('workbench.production.node.storyboard.editInfo')} ${shotLabel}`"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: $t('common.save'), loading: saving, disabled: loading || primaryRequired }"
    :cancel-btn="$t('common.cancel')"
    destroy-on-close
    @confirm="emit('confirm')">
    <t-loading :loading="loading" show-overlay>
      <div class="storyboardPromptEditor">
        <div v-if="nodeOptions.length > 1" class="promptSourceRow">
          <div>
            <strong>{{ $t("workbench.production.node.storyboard.promptSourceNode") }}</strong>
            <p v-if="primaryRequired">{{ $t("workbench.production.node.storyboard.selectPrimaryRequired") }}</p>
          </div>
          <t-select v-model="primaryNodeId" :options="nodeOptions" style="width: 320px" />
        </div>

        <section class="promptEditorSection">
          <div class="sectionHeader">
            <strong>{{ $t("workbench.production.node.storyboard.referenceManage") }}</strong>
            <div class="referenceActions">
              <t-button size="small" variant="outline" @click="emit('pickAssets')">
                <template #icon><i-folder-open /></template>
                {{ $t("workbench.production.node.storyboard.pickFromAssets") }}
              </t-button>
              <t-button size="small" variant="outline" @click="emit('pickStoryboardImages')">
                <template #icon><i-image /></template>
                {{ $t("components.storyboardImageCheck.dialogTitle") }}
              </t-button>
              <t-button size="small" variant="outline" @click="emit('uploadLocal')">
                <template #icon><i-upload /></template>
                {{ $t("workbench.production.node.storyboard.localUpload") }}
              </t-button>
            </div>
          </div>

          <div v-if="references.length" class="promptReferenceList">
            <div v-for="ref in references" :key="ref.key" class="promptReferenceItem">
              <button class="promptReferencePreview" type="button" @click="emit('previewReference', ref)">
                <img v-if="ref.type === 'image'" :src="ref.src" :alt="ref.label" />
                <span v-else-if="ref.type === 'audio'" class="audioReferenceIcon">
                  <i-volume-notice size="22" />
                  <small>音频</small>
                </span>
                <span v-else class="audioReferenceIcon">
                  <i-volume-notice size="22" />
                </span>
              </button>
              <div class="promptReferenceInfo">
                <strong>{{ ref.label }}</strong>
                <span>{{ ref.group }}</span>
              </div>
              <t-tooltip v-if="ref.type === 'audio'" content="等待后端私有音频上传接口支持">
                <t-button size="small" variant="text" disabled>截取</t-button>
              </t-tooltip>
              <t-button shape="circle" variant="text" theme="danger" @click="emit('removeReference', ref)">
                <template #icon><i-delete /></template>
              </t-button>
            </div>
          </div>
          <t-empty v-else />
        </section>

        <section class="promptEditorSection">
          <div class="sectionHeader">
            <strong>视频事实</strong>
            <span class="sectionHint">用于视频提示词生成，不替代分镜图提示词。</span>
          </div>
          <div class="factGrid">
            <label v-for="field in factFields" :key="field.key" class="factField">
              <span>{{ field.label }}</span>
              <t-textarea
                v-if="field.multiline"
                v-model="facts[field.key]"
                :autosize="{ minRows: 2, maxRows: 4 }"
                :placeholder="field.placeholder" />
              <t-input v-else v-model="facts[field.key]" :placeholder="field.placeholder" />
            </label>
          </div>
          <div class="characterFactsEditor">
            <div class="sectionHeader">
              <div>
                <strong>人物站位与朝向</strong>
                <span class="sectionHint">姓名、站位、朝向与动作会作为本镜头的结构化事实保存。</span>
              </div>
              <t-button size="small" variant="outline" @click="addCharacter">添加人物</t-button>
            </div>
            <div v-if="characters.length" class="characterFactList">
              <article v-for="(character, index) in characters" :key="index" class="characterFactCard">
                <div class="characterFactHeader">
                  <strong>人物 {{ index + 1 }}</strong>
                  <t-button size="small" shape="circle" variant="text" theme="danger" @click="removeCharacter(index)">
                    <template #icon><i-delete /></template>
                  </t-button>
                </div>
                <div class="characterFactGrid">
                  <label><span>姓名</span><t-input v-model="character.name" /></label>
                  <label><span>空间位置</span><t-input v-model="character.spatialPosition" /></label>
                  <label><span>朝向</span><t-input v-model="character.orientation" /></label>
                  <label><span>动作</span><t-input v-model="character.action" /></label>
                  <label><span>姿态</span><t-input v-model="character.posture" /></label>
                  <label><span>视线</span><t-input v-model="character.gaze" /></label>
                  <label class="characterWide"><span>手部动作</span><t-input v-model="character.handAction" /></label>
                </div>
              </article>
            </div>
            <span v-else class="sectionHint">暂无可见人物。</span>
          </div>
        </section>

        <section class="promptEditorSection promptTextSection">
          <strong>分镜图提示词</strong>
          <PromptEditor
            v-model="prompt"
            :references="promptReferences"
            :placeholder="$t('workbench.production.node.storyboard.promptPlaceholder')" />
        </section>

      </div>
    </t-loading>
  </t-dialog>
</template>

<script setup lang="ts">
import PromptEditor from "@/components/promptEditor.vue";
import type { ReferenceView } from "../types";

type StoryboardFactKey =
  | "scene"
  | "location"
  | "timeOfDay"
  | "sceneContinuityId"
  | "transitionFromPrevious"
  | "picture"
  | "action"
  | "shotSize"
  | "cameraMove"
  | "cameraAngle"
  | "dialogue"
  | "sound"
  | "visibleEmotion";

const visible = defineModel<boolean>("visible", { default: false });
const prompt = defineModel<string>("prompt", { default: "" });
const primaryNodeId = defineModel<string>("primaryNodeId", { default: "" });
const facts = defineModel<Record<StoryboardFactKey, string>>("facts", {
  default: () => ({
    scene: "",
    location: "",
    timeOfDay: "",
    sceneContinuityId: "",
    transitionFromPrevious: "",
    picture: "",
    action: "",
    shotSize: "",
    cameraMove: "",
    cameraAngle: "",
    dialogue: "",
    sound: "",
    visibleEmotion: "",
  }),
});

const factFields: Array<{ key: StoryboardFactKey; label: string; placeholder: string; multiline?: boolean }> = [
  { key: "scene", label: "场景摘要", placeholder: "旧数据兼容场景摘要" },
  { key: "location", label: "地点", placeholder: "明确的拍摄地点或空间" },
  { key: "timeOfDay", label: "时间", placeholder: "早晨、白天、黄昏、夜晚等" },
  { key: "sceneContinuityId", label: "场景连续性", placeholder: "连续场景标识，可选" },
  { key: "transitionFromPrevious", label: "承接 / 转场", placeholder: "上一个镜头的承接或转场方式", multiline: true },
  { key: "picture", label: "画面", placeholder: "画面主体与构图", multiline: true },
  { key: "action", label: "动作", placeholder: "人物或镜头内动作", multiline: true },
  { key: "shotSize", label: "景别", placeholder: "远景/中景/近景/特写" },
  { key: "cameraMove", label: "运镜", placeholder: "推拉摇移跟等" },
  { key: "cameraAngle", label: "轴线 / 机位", placeholder: "完整机位签名，例如轴线、人物朝向与相机位置", multiline: true },
  { key: "dialogue", label: "对白", placeholder: "本镜头对白", multiline: true },
  { key: "sound", label: "声音", placeholder: "音效、环境声、音乐提示", multiline: true },
  { key: "visibleEmotion", label: "可见情绪", placeholder: "可被画面看见的情绪" },
];

const props = defineProps<{
  loading: boolean;
  saving: boolean;
  shotLabel: string;
  references: ReferenceView[];
  nodeOptions: { label: string; value: string }[];
}>();

type CharacterFactDraft = {
  name: string;
  spatialPosition: string;
  orientation: string;
  action: string;
  posture?: string;
  gaze?: string;
  handAction?: string;
};

const characters = defineModel<CharacterFactDraft[]>("characters", { default: () => [] });

const primaryRequired = computed(() => props.nodeOptions.length > 1 && !primaryNodeId.value);
const promptReferences = computed(() =>
  props.references.map((item) => ({
    type: item.type,
    src: item.src,
    label: item.label,
    token: item.token,
    group: item.group,
  })),
);

const emit = defineEmits<{
  confirm: [];
  pickAssets: [];
  pickStoryboardImages: [];
  uploadLocal: [];
  removeReference: [ref: ReferenceView];
  previewReference: [ref: ReferenceView];
}>();

function addCharacter() {
  characters.value.push({ name: "", spatialPosition: "", orientation: "", action: "" });
}

function removeCharacter(index: number) {
  characters.value.splice(index, 1);
}
</script>

<style lang="scss">
.storyboardPromptDialog .t-dialog__body {
  min-height: 0;
  max-height: min(760px, calc(92vh - 130px));
  overflow: auto;
}

.storyboardPromptEditor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.promptSourceRow,
.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.promptSourceRow {
  padding: 12px;
  border: 1px solid var(--td-warning-color-3);
  border-radius: 6px;
  background: var(--td-warning-color-1);
}

.promptSourceRow p {
  margin: 4px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.promptEditorSection {
  padding: 14px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  background: var(--td-bg-color-container);
}

.sectionHint {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.factGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.factField {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.factField span {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.characterFactsEditor {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--td-border-level-1-color);
}

.characterFactList {
  display: grid;
  gap: 10px;
}

.characterFactCard {
  padding: 12px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer);
}

.characterFactHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.characterFactGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.characterFactGrid label {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.characterFactGrid span {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.characterWide {
  grid-column: 1 / -1;
}

.referenceActions {
  display: flex;
  gap: 8px;
}

.promptReferenceList {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.promptReferenceItem {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
}

.promptReferencePreview {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  overflow: hidden;
  cursor: zoom-in;
  background: var(--td-bg-color-container-hover);
}

.promptReferencePreview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audioReferenceIcon {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  gap: 2px;
  color: var(--td-brand-color);
}

.audioReferenceIcon small {
  font-size: 11px;
}

.promptReferenceInfo {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promptReferenceInfo strong,
.promptReferenceInfo span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.promptReferenceInfo span {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.promptTextSection .textareaWrapper {
  min-height: 250px;
  margin-top: 10px;
}

.promptTextSection .promptEditor {
  min-height: 250px;
  max-height: 420px;
  overflow: auto;
}

.videoDescReadonly {
  max-height: 150px;
  margin-top: 10px;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 5px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
