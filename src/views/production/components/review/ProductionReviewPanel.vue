<template>
  <div class="productionReviewPanel">
    <div class="reviewHeader">
      <div>
        <div class="reviewTitle">{{ title }}</div>
        <div class="reviewSummary">
          {{ $t("workbench.productionReview.summary.open") }} {{ counts.total }} ·
          {{ $t("workbench.productionReview.summary.highPriority") }} {{ counts.blocking }} ·
          {{ $t("workbench.productionReview.summary.warning") }} {{ counts.warning }}
        </div>
      </div>
      <div class="reviewActions">
        <t-button size="small" variant="outline" :loading="loading" @click="emit('refresh')">
          {{ $t("workbench.productionReview.action.refresh") }}
        </t-button>
        <t-button v-if="showApply" size="small" theme="primary" :disabled="!acceptedIds.length" :loading="applying" @click="emit('apply', acceptedIds)">
          {{ $t("workbench.productionReview.action.apply") }}
        </t-button>
      </div>
    </div>

    <div v-if="musicPlan" class="musicPlan">
      <div class="musicHeader">
        <span>BGM</span>
        <t-tag size="small" variant="light">仅作参考</t-tag>
      </div>
      <div class="musicLine">
        <span>{{ musicPlan.mood || "待补充情绪" }}</span>
        <span v-if="musicPlan.intensity">强度 {{ musicPlan.intensity }}/5</span>
        <span v-if="musicPlan.tempoBpm">{{ musicPlan.tempoBpm }} BPM</span>
      </div>
      <div v-if="musicPlan.instrumentation?.length" class="musicText">{{ musicPlan.instrumentation.join(", ") }}</div>
      <div v-if="musicPlan.postNote" class="musicText">{{ musicPlan.postNote }}</div>
    </div>

    <t-alert
      v-if="fallbackFactReview"
      theme="warning"
      class="blockingAlert"
      message="当前轨道使用旧分镜描述兼容解析，建议重新生成或审校分镜表。" />
    <t-alert
      v-if="blockingReview"
      theme="error"
      class="blockingAlert"
      :message="$t('workbench.productionReview.highPriorityHint')" />

    <div v-if="!reviews.length" class="emptyReview">
      <t-empty size="small" :description="$t('workbench.productionReview.noSuggestions')" />
    </div>

    <div v-else class="reviewList">
      <div
        v-for="review in displayedReviews"
        :key="review.id"
        class="reviewCard"
        :class="[`severity-${review.severity}`, `status-${review.status}`, { selected: selectedIds.includes(review.id) }]">
        <div class="reviewCardHeader">
          <div class="reviewMeta">
            <t-tag size="small" :theme="getSeverityTheme(review.severity)" variant="light">
              {{ $t(getSeverityI18nKey(review.severity)) }}
            </t-tag>
            <span>{{ getIssueTypeLabel(review) }}</span>
          </div>
          <t-tag size="small" variant="outline">{{ $t(getReviewStatusI18nKey(review.status)) }}</t-tag>
        </div>

        <div class="reviewMessage">{{ review.message }}</div>
        <div v-if="formatEvidence(review.evidence)" class="reviewEvidence">{{ formatEvidence(review.evidence) }}</div>
        <div v-if="review.reason" class="reviewReason">{{ review.reason }}</div>
        <div v-if="review.proposedAction" class="reviewActionText">{{ review.proposedAction }}</div>
        <div v-if="getProposedPrompt(review)" class="proposedPrompt">{{ getProposedPrompt(review) }}</div>

        <div v-if="isVideoPromptBatch && review.status === 'open'" class="reviewDecision">
          <t-radio-group
            :value="decisionMap[review.id] || ''"
            variant="default-filled"
            size="small"
            @change="handleDecisionChange(review.id, $event)">
            <t-radio-button value="accept">{{ $t("workbench.productionReview.action.accept") }}</t-radio-button>
            <t-radio-button value="revise">{{ $t("workbench.productionReview.action.revise") }}</t-radio-button>
            <t-radio-button value="ignore">{{ $t("workbench.productionReview.action.ignore") }}</t-radio-button>
          </t-radio-group>
          <t-button v-if="decisionMap[review.id]" size="small" variant="text" @click="clearDecision(review.id)">
            {{ $t("workbench.productionReview.action.clear") }}
          </t-button>
        </div>

        <div v-if="!isVideoPromptBatch" class="reviewCardActions">
          <t-button size="small" theme="primary" :disabled="review.status !== 'open'" @click="emit('accept', review)">
            {{ $t("workbench.productionReview.action.accept") }}
          </t-button>
          <t-button size="small" variant="outline" :disabled="review.status !== 'open'" @click="emit('ignore', review)">
            {{ $t("workbench.productionReview.action.ignore") }}
          </t-button>
          <t-button size="small" variant="text" @click="openFeedback(review)">
            {{ $t("workbench.productionReview.action.feedback") }}
          </t-button>
          <t-button size="small" variant="text" @click="emit('recalculate', review)">
            {{ $t("workbench.productionReview.action.recalculate") }}
          </t-button>
          <t-button size="small" variant="text" :disabled="review.status !== 'accepted'" @click="emit('rollback', review)">
            {{ $t("workbench.productionReview.action.rollback") }}
          </t-button>
        </div>
      </div>
    </div>

    <div v-if="isVideoPromptBatch && reviews.length" class="batchReviewActions">
      <div class="batchSelection">
        {{ $t("workbench.productionReview.batchSummary", {
          selected: selectedIds.length,
          accepted: acceptIds.length,
          revised: reviseIds.length,
          ignored: ignoreIds.length,
        }) }}
      </div>
      <t-textarea
        v-if="reviseIds.length"
        v-model="userInstruction"
        class="batchInstruction"
        :autosize="{ minRows: 3, maxRows: 7 }"
        :placeholder="$t('workbench.productionReview.instructionPlaceholder')" />
      <div class="batchButtons">
        <t-button size="small" theme="primary" :disabled="!canSubmitMixedBatch || applying" :loading="applying" @click="submitMixedBatch">
          {{ $t("workbench.productionReview.action.submit") }}
        </t-button>
        <t-button size="small" variant="outline" :disabled="!openReviewIds.length || applying" @click="markAllOpen('accept')">
          {{ $t("workbench.productionReview.action.acceptAll") }}
        </t-button>
        <t-button size="small" variant="outline" :disabled="!openReviewIds.length || applying" @click="markAllOpen('ignore')">
          {{ $t("workbench.productionReview.action.ignoreAll") }}
        </t-button>
        <t-button size="small" variant="text" :disabled="!selectedIds.length || applying" @click="clearAllDecisions">
          {{ $t("workbench.productionReview.action.clearAll") }}
        </t-button>
      </div>
      <div class="batchHint">{{ $t("workbench.productionReview.batchHint") }}</div>
    </div>

    <t-dialog v-model:visible="feedbackVisible" :header="$t('workbench.productionReview.feedbackTitle')" width="520px" @confirm="submitFeedback">
      <t-textarea
        v-model="feedbackText"
        :autosize="{ minRows: 4, maxRows: 8 }"
        :placeholder="$t('workbench.productionReview.feedbackPlaceholder')" />
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import type { ProductionReviewSuggestion, TrackBgmSuggestion } from "@/types/productionReview";
import {
  countOpenReviews,
  getBlockingReview,
  getReviewStatusI18nKey,
  getSeverityI18nKey,
  getSeverityTheme,
} from "@/utils/productionReview";

type ReviewDecision = "accept" | "revise" | "ignore";

const props = withDefaults(
  defineProps<{
    title?: string;
    reviews?: ProductionReviewSuggestion[];
    musicPlan?: TrackBgmSuggestion | null;
    loading?: boolean;
    applying?: boolean;
    showApply?: boolean;
    mode?: "legacy" | "videoPromptBatch";
  }>(),
  {
    title: "",
    reviews: () => [],
    musicPlan: null,
    loading: false,
    applying: false,
    showApply: false,
    mode: "legacy",
  },
);

const emit = defineEmits<{
  refresh: [];
  accept: [review: ProductionReviewSuggestion];
  ignore: [review: ProductionReviewSuggestion];
  recalculate: [review: ProductionReviewSuggestion];
  rollback: [review: ProductionReviewSuggestion];
  feedback: [review: ProductionReviewSuggestion, comment: string];
  apply: [suggestionIds: number[]];
  resolveBatch: [
    payload: {
      actions: Array<{ suggestionId: number; action: ReviewDecision; instruction?: string }>;
      userInstruction?: string;
    },
  ];
}>();

const feedbackVisible = ref(false);
const feedbackText = ref("");
const feedbackTarget = ref<ProductionReviewSuggestion | null>(null);
const decisionMap = ref<Record<number, ReviewDecision | undefined>>({});
const userInstruction = ref("");

const isVideoPromptBatch = computed(() => props.mode === "videoPromptBatch");
const counts = computed(() => countOpenReviews(props.reviews));
const blockingReview = computed(() => getBlockingReview({ reviewIssues: props.reviews }));
const displayedReviews = computed(() => {
  const severityRank = { blocking: 0, warning: 1, info: 2 } as const;
  return props.reviews
    .map((review, index) => ({ review, index }))
    .sort((a, b) => severityRank[a.review.severity] - severityRank[b.review.severity] || a.index - b.index)
    .map(({ review }) => review);
});
const fallbackFactReview = computed(() => props.reviews.find((review) => review.status === "open" && review.issueType === "video_prompt_fact_fallback"));
const acceptedIds = computed(() => props.reviews.filter((review) => review.status === "accepted").map((review) => review.id));
const openReviewIds = computed(() => props.reviews.filter((review) => review.status === "open").map((review) => review.id));
const selectedIds = computed(() => openReviewIds.value.filter((id) => Boolean(decisionMap.value[id])));
const acceptIds = computed(() => openReviewIds.value.filter((id) => decisionMap.value[id] === "accept"));
const reviseIds = computed(() => openReviewIds.value.filter((id) => decisionMap.value[id] === "revise"));
const ignoreIds = computed(() => openReviewIds.value.filter((id) => decisionMap.value[id] === "ignore"));
const canSubmitMixedBatch = computed(() => {
  if (!selectedIds.value.length) return false;
  if (reviseIds.value.length && !userInstruction.value.trim()) return false;
  return true;
});

watch(
  () => props.reviews.map((review) => `${review.id}:${review.status}`).join("|"),
  () => {
    const openIds = new Set(openReviewIds.value);
    decisionMap.value = Object.fromEntries(
      Object.entries(decisionMap.value)
        .map(([id, decision]) => [Number(id), decision] as const)
        .filter(([id, decision]) => openIds.has(id) && Boolean(decision)),
    );
  },
);

function getProposedPrompt(review: ProductionReviewSuggestion) {
  const values = review.proposedPatch?.values as Record<string, unknown> | undefined;
  const prompt = values?.prompt ?? values?.videoPrompt;
  return typeof prompt === "string" ? prompt : "";
}

function getIssueTypeLabel(review: ProductionReviewSuggestion) {
  const map: Record<string, string> = {
    video_prompt_fact_fallback: "旧分镜描述兼容解析",
    bgm_in_prompt: "BGM 混入视频提示词",
    safety_risk: "安全风险",
    prompt_pollution: "提示词污染",
    continuity_conflict: "连续性冲突",
    bgm_missing: "缺少 BGM 建议",
  };
  return map[review.issueType] ?? review.issueType;
}

function formatEvidence(evidence: unknown) {
  if (!evidence) return "";
  if (typeof evidence === "string") return evidence;
  if (Array.isArray(evidence)) return evidence.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("\n");
  if (typeof evidence === "object") return JSON.stringify(evidence, null, 2);
  return String(evidence);
}

function setDecision(id: number, decision: ReviewDecision) {
  decisionMap.value = { ...decisionMap.value, [id]: decision };
}

function handleDecisionChange(id: number, value: unknown) {
  setDecision(id, String(value) as ReviewDecision);
}

function clearDecision(id: number) {
  const next = { ...decisionMap.value };
  delete next[id];
  decisionMap.value = next;
}

function markAllOpen(decision: ReviewDecision) {
  decisionMap.value = Object.fromEntries(openReviewIds.value.map((id) => [id, decision]));
  if (decision !== "revise") userInstruction.value = "";
}

function clearAllDecisions() {
  decisionMap.value = {};
  userInstruction.value = "";
}

function submitMixedBatch() {
  if (!canSubmitMixedBatch.value) return;
  const instruction = userInstruction.value.trim();
  emit("resolveBatch", {
    actions: [
      ...acceptIds.value.map((suggestionId) => ({ suggestionId, action: "accept" as const })),
      ...reviseIds.value.map((suggestionId) => ({
        suggestionId,
        action: "revise" as const,
        instruction,
      })),
      ...ignoreIds.value.map((suggestionId) => ({ suggestionId, action: "ignore" as const })),
    ],
    userInstruction: instruction || undefined,
  });
}

function openFeedback(review: ProductionReviewSuggestion) {
  feedbackTarget.value = review;
  feedbackText.value = "";
  feedbackVisible.value = true;
}

function submitFeedback() {
  if (feedbackTarget.value && feedbackText.value.trim()) {
    emit("feedback", feedbackTarget.value, feedbackText.value.trim());
  }
  feedbackVisible.value = false;
}
</script>

<style scoped lang="scss">
.productionReviewPanel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reviewHeader,
.reviewCardHeader,
.reviewCardActions,
.reviewActions,
.reviewMeta,
.musicHeader,
.musicLine {
  display: flex;
  align-items: center;
}
.reviewHeader {
  justify-content: space-between;
  gap: 8px;
}
.reviewTitle {
  font-weight: 600;
}
.reviewSummary,
.reviewReason,
.reviewActionText,
.musicText,
.musicLine {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
.reviewActions,
.reviewCardActions,
.reviewMeta,
.musicLine {
  gap: 6px;
}
.musicPlan,
.reviewCard {
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  padding: 10px;
  background: var(--td-bg-color-container);
}
.musicHeader,
.reviewCardHeader {
  justify-content: space-between;
  gap: 8px;
}
.blockingAlert {
  flex-shrink: 0;
}
.reviewList {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.reviewCard {
  border-left-width: 3px;
}
.reviewCard.selected {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}
.severity-info {
  border-left-color: var(--td-brand-color);
}
.severity-warning {
  border-left-color: var(--td-warning-color);
}
.severity-blocking {
  border-left-color: var(--td-error-color);
}
.status-accepted,
.status-ignored,
.status-resolved {
  opacity: 0.72;
}
.reviewMessage {
  margin-top: 8px;
  line-height: 1.45;
}
.reviewReason,
.reviewActionText,
.reviewEvidence,
.reviewDecision,
.proposedPrompt {
  margin-top: 6px;
}
.reviewDecision {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}
.reviewEvidence {
  max-height: 100px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 4px;
  padding: 6px 8px;
}
.proposedPrompt {
  max-height: 120px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 4px;
  padding: 8px;
}
.emptyReview {
  flex: 1;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.batchReviewActions {
  flex-shrink: 0;
  border-top: 1px solid var(--td-component-border);
  padding-top: 10px;
}
.batchSelection,
.batchButtons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batchSelection {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
.batchInstruction {
  margin-top: 8px;
}
.batchButtons {
  flex-wrap: wrap;
  margin-top: 8px;
}
.batchHint {
  margin-top: 6px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
</style>
