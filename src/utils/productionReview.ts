import type {
  ProductionReviewSeverity,
  ProductionReviewState,
  ProductionReviewStatus,
  ProductionReviewSuggestion,
} from "@/types/productionReview";

export function isOpenReview(review: ProductionReviewSuggestion) {
  return review.status === "open";
}

export function isBlockingReview(review: ProductionReviewSuggestion) {
  return review.severity === "blocking" && isOpenReview(review);
}

export function getBlockingReview(track?: { reviewState?: string; reviewIssues?: ProductionReviewSuggestion[] } | null) {
  if (!track) return null;
  return track.reviewIssues?.find(isBlockingReview) ?? null;
}

export function getSeverityTheme(severity: ProductionReviewSeverity): "default" | "primary" | "warning" | "danger" {
  if (severity === "blocking") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "info") return "primary";
  return "default";
}

export function getReviewStateTheme(state?: ProductionReviewState): "default" | "primary" | "warning" | "danger" | "success" {
  if (state === "blocked") return "danger";
  if (state === "hasIssues") return "warning";
  if (state === "passed") return "success";
  if (state === "pending") return "primary";
  return "default";
}

export function getReviewStateI18nKey(state: ProductionReviewState) {
  if (state === "blocked") return "workbench.productionReview.state.blocked";
  if (state === "hasIssues") return "workbench.productionReview.state.hasIssues";
  if (state === "passed") return "workbench.productionReview.state.passed";
  return "workbench.productionReview.state.pending";
}

export function getSeverityI18nKey(severity: ProductionReviewSeverity) {
  if (severity === "blocking") return "workbench.productionReview.severity.blocking";
  if (severity === "warning") return "workbench.productionReview.severity.warning";
  return "workbench.productionReview.severity.info";
}

export function getReviewStatusI18nKey(status: ProductionReviewStatus) {
  if (status === "accepted") return "workbench.productionReview.status.accepted";
  if (status === "ignored") return "workbench.productionReview.status.ignored";
  if (status === "revised") return "workbench.productionReview.status.revised";
  if (status === "resolved") return "workbench.productionReview.status.resolved";
  return "workbench.productionReview.status.open";
}

export function getReviewMessage(error: unknown) {
  const payload = error as any;
  const response = payload?.response?.data;
  const data = response?.data ?? payload?.data;
  const issues = data?.issues ?? response?.issues;
  const issueMessage = Array.isArray(issues) ? issues.find((issue) => typeof issue?.message === "string")?.message : undefined;
  const message = issueMessage || data?.message || response?.message || payload?.message;
  return message || "操作失败";
}

export function countOpenReviews(reviews: ProductionReviewSuggestion[] = []) {
  return reviews.reduce(
    (count, review) => {
      if (!isOpenReview(review)) return count;
      count.total += 1;
      count[review.severity] += 1;
      return count;
    },
    { total: 0, info: 0, warning: 0, blocking: 0 },
  );
}
