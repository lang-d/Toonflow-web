import axios from "@/utils/axios";
import type {
  ProductionReviewSuggestion,
  ProductionReviewStatus,
  ProductionReviewTargetType,
  ReviewListParams,
  ResolveProductionReviewBatchParams,
  ResolveProductionReviewBatchResult,
  StoryboardGroupPlan,
} from "@/types/productionReview";

type ApiEnvelope<T> = {
  code?: number;
  data: T;
  message?: string;
};

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as ApiEnvelope<T>).data;
  }
  return response as T;
}

export function listProductionReviews(params: ReviewListParams) {
  return axios.post("/production/review/list", params).then((response) => unwrapData<ProductionReviewSuggestion[]>(response));
}

export function getProductionReviewDetail(params: { id: number }) {
  return axios.post("/production/review/detail", params).then((response) => unwrapData<ProductionReviewSuggestion>(response));
}

export function createProductionReviewFeedback(params: { suggestionId: number; comment: string; mode: "note" | "recalculate" }) {
  return axios.post("/production/review/createFeedback", params).then((response) => unwrapData<ProductionReviewSuggestion>(response));
}

export function recalculateProductionReview(params: { suggestionId: number; comment?: string }) {
  return axios
    .post("/production/review/recalculate", params)
    .then((response) => unwrapData<{ feedback: unknown; recalculated: VideoTrackReviewResult | null }>(response));
}

export function acceptProductionReview(params: { id: number }) {
  return axios.post("/production/review/accept", params).then((response) => unwrapData<ProductionReviewSuggestion>(response));
}

export function ignoreProductionReview(params: { id: number }) {
  return axios.post("/production/review/ignore", params).then((response) => unwrapData<ProductionReviewSuggestion>(response));
}

export function rollbackProductionReview(params: { id: number }) {
  return axios.post("/production/review/rollback", params).then((response) => unwrapData<ProductionReviewSuggestion>(response));
}

export function reviewStoryboardTable(params: { projectId: number; scriptId: number }) {
  return axios
    .post("/production/storyboard/reviewStoryboardTable", params)
    .then((response) => unwrapData<{ groups: StoryboardGroupPlan[]; suggestions: ProductionReviewSuggestion[] }>(response));
}

export function applyStoryboardTableReview(params: { suggestionIds: number[] }) {
  return axios.post("/production/storyboard/applyStoryboardTableReview", params).then((response) => unwrapData(response));
}

export interface VideoTrackReviewResult {
  tracks?: unknown[];
  suggestions: ProductionReviewSuggestion[];
}

export function reviewVideoTracks(params: { projectId: number; scriptId?: number; trackIds?: number[] }) {
  return axios.post("/production/workbench/reviewVideoTracks", params).then((response) => unwrapData<VideoTrackReviewResult>(response));
}

export function resolveProductionReviewBatch(params: ResolveProductionReviewBatchParams) {
  return axios
    .post("/production/review/resolveBatch", params)
    .then((response) => unwrapData<ResolveProductionReviewBatchResult>(response));
}

export function applyVideoTrackReview(params: { suggestionIds: number[] }) {
  return axios.post("/production/workbench/applyVideoTrackReview", params).then((response) => unwrapData(response));
}

export function updateReviewStatusLocally(
  reviews: ProductionReviewSuggestion[],
  id: number,
  status: ProductionReviewStatus,
): ProductionReviewSuggestion[] {
  return reviews.map((review) => (review.id === id ? { ...review, status } : review));
}

export function getTargetReviews(
  reviews: ProductionReviewSuggestion[],
  targetType: ProductionReviewTargetType,
  targetId?: string | number,
) {
  return reviews.filter((review) => review.targetType === targetType && (targetId == null || String(review.targetId) === String(targetId)));
}
