<template>
  <div class="productionMusic">
    <header class="pageHeader">
      <div>
        <h2>{{ $t("workbench.productionMusic.title") }}</h2>
        <p>{{ $t("workbench.productionMusic.subtitle") }}</p>
      </div>
      <t-space>
        <t-button v-if="!agentVisible" theme="primary" variant="outline" @click="agentVisible = true">
          <template #icon><i-message /></template>
          {{ $t("workbench.productionMusic.agent.open") }}
        </t-button>
        <t-button variant="outline" :loading="loading" @click="loadAll">
          <template #icon><i-refresh /></template>
          {{ $t("workbench.productionMusic.refresh") }}
        </t-button>
      </t-space>
    </header>

    <section class="controlBar">
      <t-radio-group v-model="planMode" variant="default-filled" @change="handleModeChange">
        <t-radio-button value="concept">{{ $t("workbench.productionMusic.mode.concept") }}</t-radio-button>
        <t-radio-button value="project">{{ $t("workbench.productionMusic.mode.project") }}</t-radio-button>
        <t-radio-button value="episode">{{ $t("workbench.productionMusic.mode.episode") }}</t-radio-button>
      </t-radio-group>
      <t-select
        v-if="planMode === 'episode'"
        v-model="selectedScriptId"
        class="episodeSelect"
        :placeholder="$t('workbench.production.selectPlaceholder')"
        :options="scriptOptions"
        filterable
        @change="handleEpisodeChange" />
    </section>

    <main class="directorLayout" :class="{ agentHidden: !agentVisible }">
      <section class="pipelineShell">
        <aside class="stageRail">
          <button
            v-for="stage in stages"
            :key="stage.key"
            type="button"
            class="stageButton"
            :class="[stage.status, { selected: activeStage === stage.key }]"
            @click="activeStage = stage.key">
            <span class="stageDot"></span>
            <span class="stageText">
              <strong>{{ stage.title }}</strong>
              <small>{{ stage.summary }}</small>
            </span>
          </button>
        </aside>

        <section class="stageDetail">
          <div class="stageDetailHeader">
            <div>
              <h3>{{ activeStageConfig?.title }}</h3>
              <p>{{ activeStageConfig?.description }}</p>
            </div>
            <t-tag size="small" :theme="stageTheme(activeStageConfig?.status)" variant="light">
              {{ stageStatusLabel(activeStageConfig?.status) }}
            </t-tag>
          </div>

          <t-loading :loading="loading" show-overlay>
            <div v-if="activeStage === 'bible'" class="stageBody">
              <VersionHeader
                :empty="!selectedBible"
                :options="bibleOptions"
                v-model="selectedBibleId"
                @change="handleBibleChange" />
              <EmptyGuide v-if="!selectedBible" :text="$t('workbench.productionMusic.bible.emptyGuide')" />
              <template v-else>
                <div class="metaLine">
                  <t-tag size="small" variant="light">v{{ selectedBible.version ?? selectedBible.id }}</t-tag>
                  <t-tag size="small" :theme="stateTheme(selectedBible.state)" variant="light">{{ selectedBible.state || "complete" }}</t-tag>
                </div>
                <t-collapse :default-value="['style']" expand-icon-placement="right">
                  <t-collapse-panel value="style" :header="$t('workbench.productionMusic.bible.styleProfile')">
                    <div class="profileGrid">
                      <div v-for="item in objectSummaryItems(selectedBible.styleProfile)" :key="item.key" class="profileItem">
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </t-collapse-panel>
                  <t-collapse-panel v-if="selectedBible.content" value="content" :header="$t('workbench.productionMusic.content')">
                    <div class="textPreview">{{ selectedBible.content }}</div>
                  </t-collapse-panel>
                  <t-collapse-panel value="rawStyle" header="Raw">
                    <pre class="jsonPreview">{{ formatJson(selectedBible.styleProfile) }}</pre>
                  </t-collapse-panel>
                </t-collapse>
              </template>
            </div>

            <div v-else-if="activeStage === 'bibleReview'" class="stageBody">
              <EmptyGuide v-if="!selectedBible" :text="$t('workbench.productionMusic.bibleReview.needsBible')" />
              <ProductionReviewPanel
                v-else
                class="reviewPanel"
                :title="$t('workbench.productionMusic.review.bible')"
                :reviews="bibleReviews"
                :loading="reviewLoading"
                @refresh="loadBibleReviews" />
            </div>

            <div v-else-if="activeStage === 'plan'" class="stageBody">
              <VersionHeader
                :empty="!selectedPlan"
                :options="planOptions"
                v-model="selectedPlanId"
                @change="handlePlanChange" />
              <EmptyGuide v-if="!selectedPlan" :text="selectedBible ? $t('workbench.productionMusic.plan.emptyGuide') : $t('workbench.productionMusic.plan.needsBible')" />
              <template v-else>
                <div class="metaLine">
                  <t-tag size="small" variant="light">{{ selectedPlan.mode || planMode }}</t-tag>
                  <t-tag size="small" variant="light">v{{ selectedPlan.version ?? selectedPlan.id }}</t-tag>
                  <t-tag size="small" :theme="stateTheme(selectedPlan.state)" variant="light">{{ selectedPlan.state || "complete" }}</t-tag>
                </div>
                <t-collapse :default-value="['cueSheet']" expand-icon-placement="right">
                  <t-collapse-panel value="cueSheet" :header="$t('workbench.productionMusic.plan.cueSheet')">
                    <div v-if="planCueSheetItems.length" class="cueSheetCards">
                      <article v-for="(cue, index) in planCueSheetItems" :key="cue.id || cue.cueKey || index" class="cueSheetCard">
                        <header>
                          <div>
                            <span class="cueIndex">{{ String(index + 1).padStart(2, "0") }}</span>
                            <strong>{{ cue.title || cue.cueKey || $t("workbench.productionMusic.untitled") }}</strong>
                          </div>
                          <t-space size="small">
                            <t-tag size="small" variant="light">{{ cue.cueType || "-" }}</t-tag>
                            <t-tag v-if="cue.durationSec" size="small" variant="light">{{ cue.durationSec }}s</t-tag>
                          </t-space>
                        </header>
                        <p v-if="cue.narrativePurpose" class="cuePurpose">{{ cue.narrativePurpose }}</p>
                        <div class="cueSpecPills">
                          <span v-for="item in cueSpecSummaryItems(cue.musicSpec)" :key="item.key">
                            <b>{{ item.label }}</b>{{ item.value }}
                          </span>
                        </div>
                        <footer v-if="cue.promptBrief">{{ cue.promptBrief }}</footer>
                      </article>
                    </div>
                    <EmptyGuide v-else :text="$t('workbench.productionMusic.cue.empty')" compact />
                  </t-collapse-panel>
                  <t-collapse-panel v-if="selectedPlan.content" value="content" :header="$t('workbench.productionMusic.content')">
                    <div class="textPreview">{{ selectedPlan.content }}</div>
                  </t-collapse-panel>
                  <t-collapse-panel value="rawCueSheet" header="Raw">
                    <pre class="jsonPreview">{{ formatJson(selectedPlan.cueSheet) }}</pre>
                  </t-collapse-panel>
                </t-collapse>
              </template>
            </div>

            <div v-else-if="activeStage === 'planReview'" class="stageBody">
              <EmptyGuide v-if="!selectedPlan" :text="$t('workbench.productionMusic.planReview.needsPlan')" />
              <ProductionReviewPanel
                v-else
                class="reviewPanel"
                :title="$t('workbench.productionMusic.review.plan')"
                :reviews="planReviews"
                :loading="reviewLoading"
                @refresh="loadPlanReviews" />
            </div>

            <div v-else class="stageBody cueStage">
              <div class="cueToolbar">
                <div>
                  <strong>{{ $t("workbench.productionMusic.cue.queue") }}</strong>
                  <span>{{ $t("workbench.productionMusic.cue.queueHint") }}</span>
                </div>
                <div class="cueToolbarActions">
                  <modelSelect v-model="musicModel" class="modelSelect" type="music" size="small" :placeholder="$t('workbench.productionMusic.modelPlaceholder')" />
                  <t-button variant="outline" :disabled="!selectedPlan" :loading="cueLoading" @click="loadCues">
                    {{ $t("workbench.productionMusic.refreshCues") }}
                  </t-button>
                </div>
              </div>
              <EmptyGuide v-if="!selectedPlan" :text="$t('workbench.productionMusic.cue.needsPlan')" />
              <EmptyGuide v-else-if="!cues.length" :text="$t('workbench.productionMusic.cue.empty')" />
              <div v-else class="cueTableWrap">
                <table class="cueTable">
                  <thead>
                    <tr>
                      <th>{{ $t("workbench.productionMusic.cue.key") }}</th>
                      <th>{{ $t("workbench.productionMusic.cue.type") }}</th>
                      <th>{{ $t("workbench.productionMusic.cue.name") }}</th>
                      <th>{{ $t("workbench.productionMusic.cue.duration") }}</th>
                      <th>{{ $t("workbench.productionMusic.cue.selectedVersion") }}</th>
                      <th>{{ $t("workbench.productionMusic.cue.generationState") }}</th>
                      <th>{{ $t("workbench.productionMusic.cue.reviewState") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="cue in cues"
                      :key="cue.id"
                      :class="{ selected: selectedCueId === cue.id }"
                      @click="selectCue(cue)">
                      <td>{{ cue.cueKey || cue.id }}</td>
                      <td>{{ cue.cueType || "-" }}</td>
                      <td><strong>{{ cue.title || $t("workbench.productionMusic.untitled") }}</strong></td>
                      <td>{{ cue.durationSec ? `${cue.durationSec}s` : "-" }}</td>
                      <td>{{ selectedAssetLabel(cue) }}</td>
                      <td>
                        <t-tag size="small" :theme="assetStateTheme(selectedAsset(cue)?.state)" variant="light">
                          {{ selectedAsset(cue)?.state || "-" }}
                        </t-tag>
                      </td>
                      <td>
                        <t-tag size="small" :theme="cueReviewTheme(cue.id)" variant="light">{{ cueReviewLabel(cue.id) }}</t-tag>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="selectedCue" class="cueInspector">
                <div class="inspectorHeader">
                  <div>
                    <strong>{{ selectedCue.title || selectedCue.cueKey }}</strong>
                    <span>{{ selectedCue.durationSec ? `${selectedCue.durationSec}s` : "" }}</span>
                  </div>
                  <t-space>
                    <t-button size="small" variant="outline" @click="activeStage = 'cuePrompt'">{{ $t("workbench.productionMusic.compilePrompt") }}</t-button>
                    <t-button size="small" variant="outline" @click="activeStage = 'audio'">{{ $t("workbench.productionMusic.generateAudio") }}</t-button>
                  </t-space>
                </div>
                <t-collapse expand-icon-placement="right">
                  <t-collapse-panel value="spec" :header="$t('workbench.productionMusic.musicSpec')">
                    <div class="profileGrid compactGrid">
                      <div v-for="item in cueSpecSummaryItems(selectedCue.musicSpec)" :key="item.key" class="profileItem">
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                    <pre class="jsonPreview rawInline">{{ formatJson(selectedCue.musicSpec) }}</pre>
                  </t-collapse-panel>
                  <t-collapse-panel value="prompt" :header="$t('workbench.productionMusic.compiledPrompt')">
                    <EmptyGuide v-if="!compiledPromptByCue[selectedCue.id]" :text="$t('workbench.productionMusic.noCompiledPrompt')" compact />
                    <template v-else>
                      <t-textarea v-model="compiledPromptByCue[selectedCue.id].prompt" :autosize="{ minRows: 4, maxRows: 8 }" />
                      <pre class="jsonPreview">{{ formatJson(compiledPromptByCue[selectedCue.id].compiledPrompt) }}</pre>
                    </template>
                  </t-collapse-panel>
                  <t-collapse-panel value="assets" :header="$t('workbench.productionMusic.assetVersions')">
                    <div v-if="!selectedCue.assets.length" class="assetEmpty">{{ $t("workbench.productionMusic.noAssets") }}</div>
                    <div v-for="asset in selectedCue.assets" :key="asset.id" class="assetVersion">
                      <div class="assetMain">
                        <strong>v{{ asset.version ?? asset.id }}</strong>
                        <t-tag size="small" :theme="assetStateTheme(asset.state)" variant="light">{{ asset.state || "-" }}</t-tag>
                        <t-tag v-if="asset.selected" size="small" theme="success" variant="light">{{ $t("workbench.productionMusic.selected") }}</t-tag>
                        <span v-if="asset.errorReason" class="errorText">{{ asset.errorReason }}</span>
                      </div>
                      <div class="assetActions">
                        <audio v-if="getAudioSource(asset)" :src="getAudioSource(asset)" controls />
                        <span v-else class="assetIds">assetsId {{ asset.assetsId || "-" }} / child {{ asset.childAssetId || "-" }}</span>
                        <t-button size="small" :disabled="asset.state !== 'complete' || Boolean(asset.selected)" @click="submitSelectAsset(selectedCue, asset)">
                          {{ $t("workbench.productionMusic.selectVersion") }}
                        </t-button>
                      </div>
                    </div>
                  </t-collapse-panel>
                </t-collapse>
              </div>
            </div>
          </t-loading>
        </section>
      </section>

      <aside v-if="agentVisible" class="agentSlot">
        <AgentChatPanel
          :title="$t('workbench.productionMusic.agent.title')"
          :placeholder="$t('workbench.productionMusic.agent.placeholder')"
          :connected="musicAgentConnected"
          :loading="agentPanelLoading"
          :messages="agentMessages"
          @send="handleAgentSend"
          @stop="handleAgentStop"
          @close="agentVisible = false" />
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, resolveComponent, type PropType } from "vue";
import { useI18n } from "vue-i18n";
import AgentChatPanel, { type AgentPanelAction, type AgentPanelMessage } from "@/components/AgentChatPanel.vue";
import modelSelect from "@/components/modelSelect.vue";
import ProductionReviewPanel from "@/views/production/components/review/ProductionReviewPanel.vue";
import {
  compileMusicCuePrompt,
  generateMusicBible,
  generateMusicCueAudio,
  generateMusicPlan,
  getMusicBibleDetail,
  getMusicPlanDetail,
  getMusicStageState,
  listMusicBibles,
  listMusicCues,
  listMusicPlans,
  normalizeCompiledMusicPrompt,
  reviewMusicBible,
  reviewMusicCuePrompt,
  reviewMusicPlan,
  selectMusicCueAsset,
  type CompiledMusicPrompt,
  type MusicBible,
  type MusicCue,
  type MusicCueAsset,
  type MusicPlan,
  type MusicPlanMode,
  type MusicStageState,
  type MusicTaskEnvelope,
} from "@/api/productionMusic";
import { listProductionReviews } from "@/api/productionReview";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import type { ProductionReviewSuggestion } from "@/types/productionReview";
import { useChat } from "@/utils/useChat";
import axios from "@/utils/axios";
import { getPlayableMediaUrl } from "@/utils/mediaRef";

type StageKey = "bible" | "bibleReview" | "plan" | "planReview" | "cuePrompt" | "audio" | "select";
type StageStatus = "pending" | "active" | "running" | "complete" | "warning";
type AgentAction =
  | "generateBible"
  | "reviewBible"
  | "generatePlan"
  | "reviewPlan"
  | "compilePrompt"
  | "reviewPrompt"
  | "generateAudio";

const { t } = useI18n();
const { project } = storeToRefs(projectStore());
const taskCenter = useTaskCenterStore();
const setting = settingStore();

const loading = ref(false);
const cueLoading = ref(false);
const reviewLoading = ref(false);
const agentLoading = ref(false);
const stageState = ref<MusicStageState | null>(null);
const planMode = ref<MusicPlanMode>("project");
const selectedScriptId = ref<number>();
const scriptOptions = ref<{ label: string; value: number }[]>([]);
const musicModel = ref("");

const bibles = ref<MusicBible[]>([]);
const selectedBibleId = ref<number>();
const selectedBibleDetail = ref<MusicBible | null>(null);
const plans = ref<MusicPlan[]>([]);
const selectedPlanId = ref<number>();
const selectedPlanDetail = ref<MusicPlan | null>(null);
const cues = ref<MusicCue[]>([]);
const selectedCueId = ref<number>();
const bibleReviews = ref<ProductionReviewSuggestion[]>([]);
const planReviews = ref<ProductionReviewSuggestion[]>([]);
const cuePromptReviews = ref<ProductionReviewSuggestion[]>([]);
const compiledPromptByCue = ref<Record<number, CompiledMusicPrompt>>({});

const activeStage = ref<StageKey>("bible");
const agentVisible = ref(true);
const activeTaskByStage = ref<Record<string, boolean>>({});
const releaseTaskListeners = new Map<string, () => void>();
const handledTerminalTasks = new Set<string>();
const agentPendingMessageByTask = new Map<string, string>();
const registeredAgentTaskIds = new Set<string>();
const lastInstruction = ref("");
const localAgentMessages = ref<AgentPanelMessage[]>([
  {
    id: "welcome",
    role: "assistant",
    content: $t("workbench.productionMusic.agent.welcome"),
    status: "complete",
    actions: [],
  },
]);

const VersionHeader = defineComponent({
  props: {
    modelValue: Number,
    options: {
      type: Array as PropType<Array<{ label: string; value: number }>>,
      default: () => [],
    },
    empty: Boolean,
  },
  emits: ["update:modelValue", "change"],
  setup(props, { emit }) {
    return () =>
      h("div", { class: "versionHeader" }, [
        h("span", props.empty ? $t("workbench.productionMusic.noVersion") : $t("workbench.productionMusic.currentVersion")),
        h(resolveComponent("t-select") as any, {
          modelValue: props.modelValue,
          "onUpdate:modelValue": (value: number) => emit("update:modelValue", value),
          options: props.options,
          disabled: !props.options.length,
          placeholder: $t("workbench.productionMusic.selectVersion"),
          class: "versionSelect",
          onChange: () => emit("change"),
        }),
      ]);
  },
});

const EmptyGuide = defineComponent({
  props: {
    text: {
      type: String,
      required: true,
    },
    compact: Boolean,
  },
  setup(props) {
    return () => h("div", { class: ["emptyGuide", { compact: props.compact }] }, [h("span", props.text)]);
  },
});

const projectId = computed(() => Number(project.value?.id || 0));
const musicAgentMode = computed<MusicPlanMode>(() => (planMode.value === "episode" ? "episode" : "project"));
const musicAgentContext = computed(() => ({
  projectId: projectId.value,
  mode: musicAgentMode.value,
  ...(musicAgentMode.value === "episode" && selectedScriptId.value ? { scriptId: selectedScriptId.value } : {}),
  isolationKey: buildMusicIsolationKey(),
}));
const musicAgentContextKey = computed(() => JSON.stringify(musicAgentContext.value));
const musicAgent = useChat({
  url: `${setting.baseUrl}/socket/musicProductionAgent`,
  auth: () => musicAgentContext.value,
  autoConnect: false,
  manageLifecycle: false,
  onError: (error) => {
    window.$message.error(error.message || t("workbench.productionMusic.taskFailed"));
  },
});
const musicAgentConnected = computed(() => Boolean(projectId.value) && musicAgent.connected.value);
const agentPanelLoading = computed(() => agentLoading.value || musicAgent.isGenerating.value);
const agentMessages = computed<AgentPanelMessage[]>(() => {
  const socketMessages = musicAgent.messages.value.map(mapSocketMessageToAgentMessage).filter((message) => message.content);
  const overlays = localAgentMessages.value.filter((message) => message.id !== "welcome");
  return socketMessages.length ? [...socketMessages, ...overlays] : localAgentMessages.value;
});
const selectedBible = computed(() => selectedBibleDetail.value ?? bibles.value.find((item) => item.id === selectedBibleId.value) ?? null);
const selectedPlan = computed(() => selectedPlanDetail.value ?? plans.value.find((item) => item.id === selectedPlanId.value) ?? null);
const selectedCue = computed(() => cues.value.find((cue) => cue.id === selectedCueId.value) ?? null);
const bibleOpenReviewCount = computed(() => bibleReviews.value.filter((review) => review.status === "open").length);
const planOpenReviewCount = computed(() => planReviews.value.filter((review) => review.status === "open").length);
const cueOpenReviewCount = computed(() => cuePromptReviews.value.filter((review) => review.status === "open").length);

const bibleOptions = computed(() =>
  bibles.value.map((item) => ({
    label: `v${item.version ?? item.id} ${item.state || ""}`.trim(),
    value: item.id,
  })),
);
const planOptions = computed(() =>
  plans.value.map((item) => ({
    label: `${item.mode || planMode.value} v${item.version ?? item.id}`,
    value: item.id,
  })),
);
const planCueSheetItems = computed(() => normalizeCueSheetItems(selectedPlan.value?.cueSheet));

const stages = computed(() =>
  [
    {
      key: "bible",
      title: t("workbench.productionMusic.bible.title"),
      summary: selectedBible.value ? t("workbench.productionMusic.stage.done") : t("workbench.productionMusic.stage.ready"),
      description: t("workbench.productionMusic.bible.hint"),
      status: getStageStatus("bible", Boolean(selectedBible.value)),
    },
    {
      key: "bibleReview",
      title: t("workbench.productionMusic.bibleReview.title"),
      summary: bibleOpenReviewCount.value ? t("workbench.productionMusic.stage.issues", { count: bibleOpenReviewCount.value }) : t("workbench.productionMusic.stage.advisory"),
      description: t("workbench.productionMusic.bibleReview.hint"),
      status: getReviewStageStatus("bibleReview", Boolean(selectedBible.value), bibleOpenReviewCount.value),
    },
    {
      key: "plan",
      title: t("workbench.productionMusic.plan.title"),
      summary: selectedPlan.value ? t("workbench.productionMusic.stage.done") : t("workbench.productionMusic.stage.waiting"),
      description: t("workbench.productionMusic.plan.hint"),
      status: getStageStatus("plan", Boolean(selectedPlan.value), Boolean(selectedBible.value)),
    },
    {
      key: "planReview",
      title: t("workbench.productionMusic.planReview.title"),
      summary: planOpenReviewCount.value ? t("workbench.productionMusic.stage.issues", { count: planOpenReviewCount.value }) : t("workbench.productionMusic.stage.advisory"),
      description: t("workbench.productionMusic.planReview.hint"),
      status: getReviewStageStatus("planReview", Boolean(selectedPlan.value), planOpenReviewCount.value),
    },
    {
      key: "cuePrompt",
      title: t("workbench.productionMusic.cuePrompt.title"),
      summary: cues.value.length ? t("workbench.productionMusic.stage.cues", { count: cues.value.length }) : t("workbench.productionMusic.stage.waiting"),
      description: t("workbench.productionMusic.cuePrompt.hint"),
      status: getStageStatus("cuePrompt", Boolean(cues.value.length), Boolean(selectedPlan.value)),
    },
    {
      key: "audio",
      title: t("workbench.productionMusic.audio.title"),
      summary: selectedCue.value ? t("workbench.productionMusic.stage.selectedCue") : t("workbench.productionMusic.stage.pickCue"),
      description: t("workbench.productionMusic.audio.hint"),
      status: getStageStatus("audio", cues.value.some((cue) => cue.assets.length > 0), Boolean(selectedCue.value)),
    },
    {
      key: "select",
      title: t("workbench.productionMusic.select.title"),
      summary: selectedCue.value ? selectedAssetLabel(selectedCue.value) : t("workbench.productionMusic.stage.pickCue"),
      description: t("workbench.productionMusic.select.hint"),
      status: getStageStatus("select", cues.value.some((cue) => cue.assets.some((asset) => Boolean(asset.selected))), Boolean(selectedCue.value)),
    },
  ] as Array<{ key: StageKey; title: string; summary: string; description: string; status: StageStatus }>,
);
const activeStageConfig = computed(() => stages.value.find((stage) => stage.key === activeStage.value));

watch(
  () => [selectedBible.value?.id, selectedPlan.value?.id, cues.value.length, selectedCue.value?.id, bibleOpenReviewCount.value, planOpenReviewCount.value].join("|"),
  () => updateAgentGuidance(),
);

watch(
  musicAgentContextKey,
  () => {
    syncMusicAgentContext();
  },
  { immediate: true },
);

watch(
  () => musicAgent.messages.value,
  (messages) => {
    messages.forEach(registerTasksFromAgentMessage);
  },
  { deep: true },
);

onMounted(() => {
  void loadScripts();
  void loadAll();
  updateAgentGuidance();
});

onBeforeUnmount(() => {
  releaseTaskListeners.forEach((release) => release());
  releaseTaskListeners.clear();
  musicAgent.disconnect();
});

async function loadAll() {
  if (!projectId.value) return;
  loading.value = true;
  try {
    await loadStageState();
    await Promise.all([loadBibles(), loadPlans()]);
    await Promise.all([loadBibleReviews(), loadPlanReviews()]);
    await loadCues();
  } finally {
    loading.value = false;
  }
}

async function loadStageState() {
  if (!projectId.value) return;
  if (musicAgentMode.value === "episode" && !selectedScriptId.value) return;
  const state = await getMusicStageState({
    projectId: projectId.value,
    mode: musicAgentMode.value,
    ...(musicAgentMode.value === "episode" && selectedScriptId.value ? { scriptId: selectedScriptId.value } : {}),
  });
  stageState.value = state;
  if (state.latestBible?.id) selectedBibleId.value = state.latestBible.id;
  if (state.latestPlan?.id) selectedPlanId.value = state.latestPlan.id;
  activeStage.value = stageToStageKey(state.stage);
  syncStageActiveTasks(state.activeTasks ?? []);
}

function syncMusicAgentContext() {
  if (!projectId.value) {
    musicAgent.disconnect();
    return;
  }
  if (musicAgentMode.value === "episode" && !selectedScriptId.value) return;
  const socket = musicAgent.socket.value as any;
  if (socket) socket.auth = { token: localStorage.getItem("token"), ...musicAgentContext.value };
  if (!musicAgent.socket.value) {
    musicAgent.connect();
    return;
  }
  if (!musicAgent.connected.value) {
    musicAgent.reconnect();
    return;
  }
  musicAgent.socket.value.emit("updateContext", musicAgentContext.value);
}

function buildMusicIsolationKey() {
  if (!projectId.value) return "";
  if (planMode.value === "episode" && selectedScriptId.value) return `musicProductionAgent:${projectId.value}:episode:${selectedScriptId.value}`;
  return `musicProductionAgent:${projectId.value}:project`;
}

function stageToStageKey(stage?: string): StageKey {
  const map: Record<string, StageKey> = {
    bible_generating: "bible",
    bible_reviewing: "bibleReview",
    plan_generating: "plan",
    plan_reviewing: "planReview",
    cue_prompting: "cuePrompt",
    audio_generating: "audio",
    completed: "select",
    failed: "select",
  };
  return map[stage || ""] ?? activeStage.value ?? "bible";
}

function syncStageActiveTasks(tasks: Array<{ taskId?: string; status?: string; targetType?: string; targetId?: string | number | null; legacyTaskId?: string | number | null }>) {
  const next: Record<string, boolean> = {
    bible: false,
    bibleReview: false,
    plan: false,
    planReview: false,
    musicPrompt: false,
    compilePrompt: false,
    promptReview: false,
    audio: false,
  };
  tasks.forEach((task) => {
    const status = normalizeTaskStatus(task.status, "pending");
    const refreshTarget = inferRefreshTarget(task.targetType, stageState.value?.stage);
    const running = ["queued", "submitting", "processing"].includes(status);
    next[refreshTarget] = running;
    if (task.taskId && running) {
      registerMusicTask(
        {
          taskId: task.taskId,
          legacyTaskId: task.legacyTaskId,
          status,
          targetType: task.targetType || "media",
          targetId: task.targetId ?? undefined,
        },
        refreshTarget,
      );
    }
  });
  activeTaskByStage.value = { ...activeTaskByStage.value, ...next };
}

async function loadScripts() {
  if (!projectId.value) return;
  const { data } = await axios.post("/script/getScrptApi", {
    projectId: projectId.value,
    name: "",
  });
  scriptOptions.value = (Array.isArray(data) ? data : []).map((item: any) => ({
    label: item.name,
    value: Number(item.id),
  }));
  if (!selectedScriptId.value && scriptOptions.value.length) selectedScriptId.value = scriptOptions.value[0].value;
}

async function loadBibles() {
  if (!projectId.value) return;
  bibles.value = await listMusicBibles({ projectId: projectId.value, state: "complete" });
  if (!selectedBibleId.value || !bibles.value.some((item) => item.id === selectedBibleId.value)) {
    selectedBibleId.value = bibles.value[0]?.id;
  }
  await loadSelectedBibleDetail();
}

async function loadSelectedBibleDetail() {
  if (!projectId.value || !selectedBibleId.value) {
    selectedBibleDetail.value = null;
    return;
  }
  selectedBibleDetail.value = await getMusicBibleDetail({ projectId: projectId.value, bibleId: selectedBibleId.value });
}

async function loadPlans() {
  if (!projectId.value) return;
  const params = {
    projectId: projectId.value,
    mode: planMode.value,
    state: "complete",
    ...(planMode.value === "episode" && selectedScriptId.value ? { scriptId: selectedScriptId.value } : {}),
  };
  plans.value = await listMusicPlans(params);
  if (!selectedPlanId.value || !plans.value.some((item) => item.id === selectedPlanId.value)) {
    selectedPlanId.value = plans.value[0]?.id;
  }
  await loadSelectedPlanDetail();
}

async function loadSelectedPlanDetail() {
  if (!projectId.value || !selectedPlanId.value) {
    selectedPlanDetail.value = null;
    cues.value = [];
    return;
  }
  selectedPlanDetail.value = await getMusicPlanDetail({ projectId: projectId.value, planId: selectedPlanId.value, includeCues: true });
  cues.value = selectedPlanDetail.value.cues ?? [];
  if (!selectedCueId.value || !cues.value.some((cue) => cue.id === selectedCueId.value)) selectedCueId.value = cues.value[0]?.id;
}

async function loadCues() {
  if (!projectId.value || !selectedPlanId.value) {
    cues.value = [];
    return;
  }
  cueLoading.value = true;
  try {
    cues.value = await listMusicCues({
      projectId: projectId.value,
      planId: selectedPlanId.value,
      ...(planMode.value === "episode" && selectedScriptId.value ? { scriptId: selectedScriptId.value } : {}),
    });
    if (!selectedCueId.value || !cues.value.some((cue) => cue.id === selectedCueId.value)) selectedCueId.value = cues.value[0]?.id;
  } finally {
    cueLoading.value = false;
  }
}

async function loadBibleReviews() {
  if (!projectId.value || !selectedBibleId.value) {
    bibleReviews.value = [];
    return;
  }
  reviewLoading.value = true;
  try {
    bibleReviews.value = await listProductionReviews({ projectId: projectId.value, targetType: "musicBible", targetId: selectedBibleId.value });
  } finally {
    reviewLoading.value = false;
  }
}

async function loadPlanReviews() {
  if (!projectId.value || !selectedPlanId.value) {
    planReviews.value = [];
    cuePromptReviews.value = [];
    return;
  }
  reviewLoading.value = true;
  try {
    planReviews.value = await listProductionReviews({ projectId: projectId.value, targetType: "musicPlan", targetId: selectedPlanId.value });
    cuePromptReviews.value = await listProductionReviews({ projectId: projectId.value, targetType: "musicPrompt" });
  } finally {
    reviewLoading.value = false;
  }
}

function handleModeChange() {
  selectedPlanId.value = undefined;
  selectedCueId.value = undefined;
  void loadAll();
  syncMusicAgentContext();
}

function handleEpisodeChange() {
  selectedPlanId.value = undefined;
  selectedCueId.value = undefined;
  void loadAll();
  syncMusicAgentContext();
}

function handleBibleChange() {
  void loadSelectedBibleDetail().then(loadBibleReviews);
}

function handlePlanChange() {
  void loadSelectedPlanDetail().then(() => Promise.all([loadCues(), loadPlanReviews()]));
}

function selectCue(cue: MusicCue) {
  selectedCueId.value = cue.id;
  activeStage.value = "cuePrompt";
  updateAgentGuidance(true);
}

function handleAgentSend(text: string) {
  lastInstruction.value = text;
  if (!musicAgent.connected.value) syncMusicAgentContext();
  const sent = musicAgent.chat(text, undefined, musicAgentContext.value);
  if (!sent) window.$message.warning(t("workbench.productionMusic.taskFailed"));
}

function handleAgentStop() {
  musicAgent.stopGenerate(undefined, musicAgentContext.value);
}

function handleAgentAction(action: string) {
  const value = action as AgentAction;
  void runAgentAction(value, lastInstruction.value);
}

async function runAgentAction(action: AgentAction, instruction: string) {
  const messageId = `assistant-${Date.now()}`;
  pushAgentMessage({
    id: messageId,
    role: "assistant",
    content: t("workbench.productionMusic.agent.submitting"),
    status: "loading",
  });
  agentLoading.value = true;
  try {
    if (action === "generateBible") await submitBibleGeneration(instruction, messageId);
    else if (action === "reviewBible") await submitBibleReview(messageId);
    else if (action === "generatePlan") await submitPlanGeneration(instruction, messageId);
    else if (action === "reviewPlan") await submitPlanReview(messageId);
    else if (action === "compilePrompt") await submitCompilePrompt(instruction, messageId);
    else if (action === "reviewPrompt") await submitPromptReview(messageId);
    else if (action === "generateAudio") await submitCueAudioGenerate(instruction, messageId);
  } catch (error) {
    updateAgentMessage(messageId, {
      content: getErrorMessage(error, t("workbench.productionMusic.taskFailed")),
      status: "error",
    });
  } finally {
    agentLoading.value = false;
  }
}

async function submitBibleGeneration(instruction: string, messageId: string) {
  if (!projectId.value) return;
  const envelope = await generateMusicBible({ projectId: projectId.value, instruction: instruction.trim() || undefined });
  registerMusicTask(envelope, "bible", messageId);
  activeStage.value = "bible";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitBibleReview(messageId: string) {
  if (!projectId.value || !selectedBible.value) throw new Error(t("workbench.productionMusic.bibleReview.needsBible"));
  const envelope = await reviewMusicBible({ projectId: projectId.value, bibleId: selectedBible.value.id });
  registerMusicTask(envelope, "bibleReview", messageId);
  activeStage.value = "bibleReview";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitPlanGeneration(instruction: string, messageId: string) {
  if (!projectId.value) return;
  if (planMode.value === "episode" && !selectedScriptId.value) throw new Error(t("workbench.productionMusic.plan.selectEpisode"));
  const envelope = await generateMusicPlan({
    projectId: projectId.value,
    mode: planMode.value,
    bibleId: selectedBible.value?.id,
    ...(planMode.value === "episode" && selectedScriptId.value ? { scriptId: selectedScriptId.value } : {}),
    instruction: instruction.trim() || undefined,
  });
  registerMusicTask(envelope, "plan", messageId);
  activeStage.value = "plan";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitPlanReview(messageId: string) {
  if (!projectId.value || !selectedPlan.value) throw new Error(t("workbench.productionMusic.planReview.needsPlan"));
  const envelope = await reviewMusicPlan({ projectId: projectId.value, planId: selectedPlan.value.id });
  registerMusicTask(envelope, "planReview", messageId);
  activeStage.value = "planReview";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitCompilePrompt(instruction: string, messageId: string) {
  if (!projectId.value || !selectedCue.value) throw new Error(t("workbench.productionMusic.cue.pickCueFirst"));
  if (!musicModel.value) throw new Error(t("workbench.productionMusic.cue.selectModelFirst"));
  const envelope = await compileMusicCuePrompt({
    projectId: projectId.value,
    cueId: selectedCue.value.id,
    model: musicModel.value,
    instruction: instruction.trim() || undefined,
  });
  registerMusicTask(envelope, "compilePrompt", messageId, selectedCue.value.id);
  activeStage.value = "cuePrompt";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitPromptReview(messageId: string) {
  if (!projectId.value || !selectedCue.value) throw new Error(t("workbench.productionMusic.cue.pickCueFirst"));
  if (!musicModel.value) throw new Error(t("workbench.productionMusic.cue.selectModelFirst"));
  const compiled = compiledPromptByCue.value[selectedCue.value.id];
  if (!compiled?.prompt) throw new Error(t("workbench.productionMusic.noCompiledPrompt"));
  const envelope = await reviewMusicCuePrompt({
    projectId: projectId.value,
    cueId: selectedCue.value.id,
    model: musicModel.value,
    prompt: compiled.prompt,
    compiledPromptJson: compiled.compiledPrompt ?? undefined,
  });
  registerMusicTask(envelope, "promptReview", messageId, selectedCue.value.id);
  activeStage.value = "cuePrompt";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitCueAudioGenerate(instruction: string, messageId: string) {
  if (!projectId.value || !selectedCue.value) throw new Error(t("workbench.productionMusic.cue.pickCueFirst"));
  if (!musicModel.value) throw new Error(t("workbench.productionMusic.cue.selectModelFirst"));
  const envelope = await generateMusicCueAudio({
    projectId: projectId.value,
    cueId: selectedCue.value.id,
    model: musicModel.value,
    instruction: instruction.trim() || undefined,
    select: true,
  });
  registerMusicTask(envelope, "audio", messageId, selectedCue.value.id);
  activeStage.value = "audio";
  updateAgentMessage(messageId, { content: t("workbench.productionMusic.agent.taskSubmitted"), status: "loading" });
}

async function submitSelectAsset(cue: MusicCue, asset: MusicCueAsset) {
  if (!projectId.value) return;
  await selectMusicCueAsset({ projectId: projectId.value, cueId: cue.id, musicCueAssetId: asset.id });
  window.$message.success(t("workbench.productionMusic.selectSuccess"));
  await loadCues();
}

function registerTasksFromAgentMessage(message: any) {
  collectTaskEnvelopes(message).forEach((envelope) => {
    const taskId = envelope.taskId;
    if (!taskId || registeredAgentTaskIds.has(taskId)) return;
    registeredAgentTaskIds.add(taskId);
    registerMusicTask(envelope, inferRefreshTarget(envelope.targetType, stageState.value?.stage));
  });
}

function collectTaskEnvelopes(value: unknown, envelopes: MusicTaskEnvelope[] = [], seen = new Set<unknown>()) {
  if (!value || seen.has(value)) return envelopes;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        collectTaskEnvelopes(JSON.parse(trimmed), envelopes, seen);
      } catch {
        // Ignore non-JSON message text.
      }
    }
    return envelopes;
  }
  if (typeof value !== "object") return envelopes;
  seen.add(value);
  const record = value as Record<string, unknown>;
  if (typeof record.taskId === "string" && typeof record.targetType === "string") {
    envelopes.push({
      taskId: record.taskId,
      legacyTaskId: (record.legacyTaskId as string | number | null | undefined) ?? null,
      status: String(record.status || "queued"),
      targetType: record.targetType,
      targetId: (record.targetId as string | number | null | undefined) ?? null,
    });
  }
  Object.values(record).forEach((child) => collectTaskEnvelopes(child, envelopes, seen));
  return envelopes;
}

function mapSocketMessageToAgentMessage(message: any): AgentPanelMessage {
  const status = ["pending", "streaming"].includes(message?.status) ? "loading" : message?.status === "error" ? "error" : "complete";
  return {
    id: String(message?.id ?? `${message?.role || "assistant"}-${Date.now()}`),
    role: message?.role === "user" ? "user" : "assistant",
    content: extractMessageText(message),
    status,
  };
}

function extractMessageText(message: any) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(message?.text || message?.message || "");
  return content
    .map((item) => {
      const data = item?.data;
      if (typeof data === "string") return data;
      if (typeof data?.text === "string") return data.text;
      if (typeof data?.content === "string") return data.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function inferRefreshTarget(targetType?: string, stage?: string) {
  if (targetType === "musicBible") return stage === "bible_reviewing" ? "bibleReview" : "bible";
  if (targetType === "musicPlan") return stage === "plan_reviewing" ? "planReview" : "plan";
  if (targetType === "musicCueAsset") return "audio";
  if (targetType === "musicPrompt") return "musicPrompt";
  return "audio";
}

function registerMusicTask(envelope: MusicTaskEnvelope, refreshTarget: string, messageId?: string, cueId?: number) {
  const taskId = envelope.taskId;
  if (!projectId.value || !taskId) return;
  const targetId = envelope.targetId ?? cueId ?? taskId;
  const key = createTaskKey("media", projectId.value, targetId, undefined, taskId);
  releaseTaskListeners.get(key)?.();
  activeTaskByStage.value = { ...activeTaskByStage.value, [refreshTarget]: true };
  if (messageId) agentPendingMessageByTask.set(key, messageId);
  const release = taskCenter.registerTask(
    {
      key,
      domain: "media",
      taskId,
      unifiedTaskId: taskId,
      legacyTaskId: envelope.legacyTaskId ?? undefined,
      targetType: envelope.targetType,
      targetId,
      projectId: projectId.value,
      scriptId: selectedScriptId.value,
      status: normalizeTaskStatus(envelope.status, "queued"),
    },
    (task) => handleMusicTaskUpdate(task, refreshTarget, cueId),
  );
  releaseTaskListeners.set(key, release);
}

function handleMusicTaskUpdate(task: RuntimeTask, refreshTarget: string, cueId?: number) {
  if (!["completed", "failed", "cancelled"].includes(task.status)) return;
  const terminalKey = `${task.key}:${task.status}:${task.updatedAt}`;
  if (handledTerminalTasks.has(terminalKey)) return;
  handledTerminalTasks.add(terminalKey);
  activeTaskByStage.value = { ...activeTaskByStage.value, [refreshTarget]: false };

  const result = (task.result ?? {}) as Record<string, unknown>;
  const resultCueId = Number(result.cueId ?? result.musicCueId ?? cueId);
  if (task.status === "completed" && (refreshTarget === "compilePrompt" || refreshTarget === "musicPrompt")) {
    const compiled = normalizeCompiledMusicPrompt(result);
    if (compiled.prompt && Number.isFinite(resultCueId) && resultCueId > 0) {
      compiledPromptByCue.value = { ...compiledPromptByCue.value, [resultCueId]: compiled };
    }
  }

  if (task.status === "completed") {
    const bibleId = Number(result.bibleId ?? result.musicBibleId ?? result.targetId);
    const planId = Number(result.planId ?? result.musicPlanId ?? result.targetId);
    if (refreshTarget === "bible" && Number.isFinite(bibleId) && bibleId > 0) selectedBibleId.value = bibleId;
    if (refreshTarget === "plan" && Number.isFinite(planId) && planId > 0) selectedPlanId.value = planId;
    if ((refreshTarget === "compilePrompt" || refreshTarget === "musicPrompt" || refreshTarget === "audio") && Number.isFinite(resultCueId) && resultCueId > 0) {
      selectedCueId.value = resultCueId;
    }
  }

  const messageId = agentPendingMessageByTask.get(task.key);
  const refresh = async () => {
    await loadStageState();
    if (refreshTarget === "bible" || refreshTarget === "bibleReview") {
      await loadBibles();
      await loadBibleReviews();
    } else if (refreshTarget === "plan" || refreshTarget === "planReview") {
      await loadPlans();
      await loadPlanReviews();
      await loadCues();
    } else if (refreshTarget === "promptReview" || refreshTarget === "musicPrompt") {
      await loadPlanReviews();
    } else if (refreshTarget === "audio") {
      await loadCues();
    }
  };
  void refresh().then(() => {
    if (!messageId) return;
    if (task.status === "completed") {
      updateAgentMessage(messageId, {
        content: getTaskCompleteMessage(refreshTarget),
        status: "complete",
        actions: [],
      });
    } else {
      updateAgentMessage(messageId, {
        content: task.reason || t("workbench.productionMusic.taskFailed"),
        status: "error",
        actions: [],
      });
    }
  });
}

function getRecommendedActions(): AgentPanelAction[] {
  if (!selectedBible.value) return [agentAction("generateBible", "workbench.productionMusic.agent.action.generateBible", "primary")];
  if (!selectedPlan.value) {
    return [
      agentAction("reviewBible", "workbench.productionMusic.agent.action.reviewBible"),
      agentAction("generatePlan", "workbench.productionMusic.agent.action.generatePlan", "primary"),
    ];
  }
  if (!selectedCue.value) {
    return [
      agentAction("reviewPlan", "workbench.productionMusic.agent.action.reviewPlan"),
      agentAction("generatePlan", "workbench.productionMusic.agent.action.regeneratePlan"),
    ];
  }
  return [
    agentAction("reviewPlan", "workbench.productionMusic.agent.action.reviewPlan"),
    agentAction("compilePrompt", "workbench.productionMusic.agent.action.compilePrompt", "primary"),
    agentAction("reviewPrompt", "workbench.productionMusic.agent.action.reviewPrompt"),
    agentAction("generateAudio", "workbench.productionMusic.agent.action.generateAudio", "primary"),
  ];
}

function agentAction(value: AgentAction, labelKey: string, theme: AgentPanelAction["theme"] = "default"): AgentPanelAction {
  return {
    value,
    label: t(labelKey),
    theme,
    variant: theme === "primary" ? "base" : "outline",
  };
}

function getAgentReply() {
  if (!selectedBible.value) return t("workbench.productionMusic.agent.reply.needBible");
  if (!selectedPlan.value) return t("workbench.productionMusic.agent.reply.needPlan");
  if (!selectedCue.value) return t("workbench.productionMusic.agent.reply.needCue");
  return t("workbench.productionMusic.agent.reply.cueReady", { cue: selectedCue.value.title || selectedCue.value.cueKey || selectedCue.value.id });
}

function updateAgentGuidance(force = false) {
  const last = agentMessages.value.at(-1);
  if (!force && last?.id !== "welcome" && last?.status === "loading") return;
  if (musicAgent.messages.value.length) return;
  const content = getAgentReply();
  if (last?.id === "welcome") {
    updateAgentMessage("welcome", { content, actions: [] });
  }
}

function pushAgentMessage(message: AgentPanelMessage) {
  localAgentMessages.value = [...localAgentMessages.value, message];
}

function updateAgentMessage(id: string, patch: Partial<AgentPanelMessage>) {
  localAgentMessages.value = localAgentMessages.value.map((message) => (message.id === id ? { ...message, ...patch } : message));
}

function getTaskCompleteMessage(refreshTarget: string) {
  const map: Record<string, string> = {
    bible: t("workbench.productionMusic.agent.done.bible"),
    bibleReview: t("workbench.productionMusic.agent.done.bibleReview"),
    plan: t("workbench.productionMusic.agent.done.plan"),
    planReview: t("workbench.productionMusic.agent.done.planReview"),
    compilePrompt: t("workbench.productionMusic.agent.done.compilePrompt"),
    promptReview: t("workbench.productionMusic.agent.done.promptReview"),
    audio: t("workbench.productionMusic.agent.done.audio"),
  };
  return map[refreshTarget] ?? t("workbench.productionMusic.agent.done.default");
}

function getStageStatus(stage: string, complete: boolean, enabled = true): StageStatus {
  if (isStageRunning(stage)) return "running";
  if (complete) return "complete";
  if (enabled && activeStage.value === stage) return "active";
  if (enabled) return "active";
  return "pending";
}

function getReviewStageStatus(stage: string, enabled: boolean, issues: number): StageStatus {
  if (isStageRunning(stage)) return "running";
  if (issues > 0) return "warning";
  if (enabled) return "active";
  return "pending";
}

function isStageRunning(stage: string) {
  if (stage === "cuePrompt") return Boolean(activeTaskByStage.value.musicPrompt || activeTaskByStage.value.compilePrompt || activeTaskByStage.value.promptReview);
  return Boolean(activeTaskByStage.value[stage]);
}

function selectedAsset(cue: MusicCue) {
  return cue.assets.find((asset) => Boolean(asset.selected)) ?? cue.assets.at(-1);
}

function selectedAssetLabel(cue: MusicCue) {
  const asset = selectedAsset(cue);
  if (!asset) return "-";
  return `v${asset.version ?? asset.id}`;
}

function cueReviewLabel(cueId: number) {
  const reviews = cuePromptReviews.value.filter((review) => Number(review.targetId) === cueId && review.status === "open");
  if (!reviews.length) return t("workbench.productionReview.state.passed");
  if (reviews.some((review) => review.severity === "blocking")) return t("workbench.productionReview.state.blocked");
  return t("workbench.productionReview.state.hasIssues");
}

function cueReviewTheme(cueId: number) {
  const reviews = cuePromptReviews.value.filter((review) => Number(review.targetId) === cueId && review.status === "open");
  if (!reviews.length) return "success";
  if (reviews.some((review) => review.severity === "blocking")) return "danger";
  return "warning";
}

function stageTheme(status?: StageStatus) {
  if (status === "complete") return "success";
  if (status === "warning") return "warning";
  if (status === "running") return "primary";
  if (status === "active") return "primary";
  return "default";
}

function stageStatusLabel(status?: StageStatus) {
  return t(`workbench.productionMusic.stage.status.${status || "pending"}`);
}

function stateTheme(state?: string | null) {
  if (!state || state === "complete" || state === "ready") return "success";
  if (state === "failed") return "danger";
  if (state === "generating" || state === "processing" || state === "queued") return "warning";
  return "default";
}

function assetStateTheme(state?: string | null) {
  if (state === "complete") return "success";
  if (state === "failed") return "danger";
  if (state === "generating") return "warning";
  return "default";
}

function getAudioSource(asset: MusicCueAsset) {
  return getPlayableMediaUrl(asset.media ?? asset, "audio");
}

function normalizeCueSheetItems(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const candidates = [record.cues, record.cueSheet, record.items, record.list, record.sections];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  return [];
}

function objectSummaryItems(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .slice(0, 12)
    .map(([key, item]) => ({
      key,
      label: humanizeKey(key),
      value: formatSummaryValue(item),
    }));
}

function cueSpecSummaryItems(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const preferred = ["moodArc", "instrumentation", "structure", "vocalLyricPolicy", "avoidList", "tempoBpm", "style", "genre"];
  const keys = [...preferred.filter((key) => record[key] !== undefined), ...Object.keys(record).filter((key) => !preferred.includes(key))];
  return keys
    .filter((key) => record[key] !== null && record[key] !== undefined && record[key] !== "")
    .slice(0, 6)
    .map((key) => ({
      key,
      label: humanizeKey(key),
      value: formatSummaryValue(record[key]),
    }));
}

function humanizeKey(key: string) {
  return key
    .replace(/Json$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSummaryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatSummaryValue(item)).filter(Boolean).join(" / ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined && item !== "")
      .slice(0, 4)
      .map(([key, item]) => `${humanizeKey(key)}: ${formatSummaryValue(item)}`)
      .join(" / ");
  }
  return String(value ?? "");
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return (error as any)?.response?.data?.message || (error as any)?.message || fallback;
}
</script>

<style scoped lang="scss">
.productionMusic {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.pageHeader,
.controlBar,
.pipelineShell {
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
}

.pageHeader {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;

  h2 {
    margin: 0;
    font-size: 20px;
  }

  p {
    margin: 5px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}

.controlBar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.episodeSelect {
  width: 240px;
}

.directorLayout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(390px, 440px);
  gap: 12px;
}

.directorLayout.agentHidden {
  grid-template-columns: minmax(0, 1fr);
}

.pipelineShell {
  min-height: 0;
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  overflow: hidden;
}

.stageRail {
  min-height: 0;
  padding: 12px;
  border-right: 1px solid var(--td-component-border);
  overflow: auto;
}

.stageButton {
  position: relative;
  width: 100%;
  min-height: 58px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-primary);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  text-align: left;
  cursor: pointer;

  & + .stageButton {
    margin-top: 6px;
  }

  &:hover,
  &.selected {
    background: var(--td-bg-color-container-hover);
  }

  &.complete .stageDot {
    background: var(--td-success-color);
  }

  &.warning .stageDot {
    background: var(--td-warning-color);
  }

  &.running .stageDot,
  &.active .stageDot {
    background: var(--td-brand-color);
  }

  &.pending {
    color: var(--td-text-color-placeholder);
  }
}

.stageDot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--td-component-border);
  flex: 0 0 auto;
}

.stageText {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--td-text-color-secondary);
  }
}

.stageDetail {
  min-width: 0;
  min-height: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stageDetailHeader {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--td-component-border);

  h3 {
    margin: 0;
    font-size: 18px;
  }

  p {
    margin: 5px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}

.stageDetail :deep(.t-loading),
.stageDetail :deep(.t-loading__parent),
.stageDetail :deep(.t-loading__content) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stageBody {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  overflow: auto;
}

.versionHeader,
.metaLine,
.cueToolbar,
.inspectorHeader,
.assetVersion,
.assetMain,
.assetActions {
  display: flex;
  align-items: center;
}

.versionHeader,
.cueToolbar,
.inspectorHeader,
.assetVersion {
  justify-content: space-between;
  gap: 12px;
}

.versionHeader {
  color: var(--td-text-color-secondary);
  font-size: 13px;
}

.versionSelect {
  width: 180px;
}

.metaLine,
.assetMain,
.assetActions {
  gap: 8px;
  flex-wrap: wrap;
}

.jsonPreview,
.textPreview {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-primary);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.rawInline {
  margin-top: 10px;
  max-height: 180px;
  overflow: auto;
  color: var(--td-text-color-secondary);
}

.profileGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}

.compactGrid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.profileItem {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: var(--td-bg-color-container);

  span {
    display: block;
    margin-bottom: 5px;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }

  strong {
    display: -webkit-box;
    overflow: hidden;
    color: var(--td-text-color-primary);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.55;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
}

.cueSheetCards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 10px;
}

.cueSheetCard {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: var(--td-bg-color-container);

  header,
  footer {
    display: flex;
    gap: 10px;
  }

  header {
    align-items: flex-start;
    justify-content: space-between;

    > div {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
    }
  }

  footer {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--td-component-border);
    color: var(--td-text-color-secondary);
    font-size: 12px;
    line-height: 1.6;
  }
}

.cueIndex {
  flex: 0 0 auto;
  width: 26px;
  height: 22px;
  border-radius: 4px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  text-align: center;
}

.cuePurpose {
  display: -webkit-box;
  margin: 10px 0;
  overflow: hidden;
  color: var(--td-text-color-primary);
  font-size: 13px;
  line-height: 1.65;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.cueSpecPills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    max-width: 100%;
    padding: 4px 7px;
    border-radius: 4px;
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-secondary);
    font-size: 12px;
    line-height: 1.45;
  }

  b {
    margin-right: 4px;
    color: var(--td-text-color-primary);
    font-weight: 500;
  }
}

.reviewPanel {
  min-height: 360px;
}

.emptyGuide {
  min-height: 180px;
  border: 1px dashed var(--td-component-border);
  border-radius: 8px;
  color: var(--td-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;

  &.compact {
    min-height: 76px;
  }
}

.cueToolbar {
  flex: 0 0 auto;

  span {
    display: block;
    margin-top: 4px;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.cueToolbarActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modelSelect {
  width: 260px;
}

.cueTableWrap {
  min-height: 220px;
  overflow: auto;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
}

.cueTable {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 9px 10px;
    border-bottom: 1px solid var(--td-component-border);
    text-align: left;
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--td-bg-color-container);
    color: var(--td-text-color-secondary);
    font-weight: 600;
  }

  tr {
    cursor: pointer;
  }

  tbody tr:hover,
  tbody tr.selected {
    background: var(--td-bg-color-container-hover);
  }
}

.cueInspector {
  flex: 0 0 auto;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  padding: 12px;
}

.inspectorHeader {
  margin-bottom: 10px;

  span {
    margin-left: 8px;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.assetEmpty,
.assetIds,
.errorText {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.assetVersion {
  padding: 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;

  & + .assetVersion {
    margin-top: 8px;
  }
}

.assetActions {
  justify-content: flex-end;

  audio {
    width: 240px;
    max-width: 100%;
  }
}

.errorText {
  color: var(--td-error-color);
}

.agentSlot {
  position: relative;
  min-height: 0;
}

.agentSlot :deep(.agentChatPanel) {
  position: relative;
  inset: auto;
  width: 100% !important;
  height: 100%;
  min-width: 0;
  margin: 0;
  z-index: 1;
}

@media (max-width: 1200px) {
  .directorLayout,
  .pipelineShell {
    grid-template-columns: 1fr;
  }

  .stageRail {
    display: flex;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--td-component-border);
  }

  .stageButton {
    min-width: 220px;

    & + .stageButton {
      margin-top: 0;
      margin-left: 6px;
    }
  }
}
</style>
