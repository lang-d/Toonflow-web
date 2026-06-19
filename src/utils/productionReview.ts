import type { ProductionReviewSeverity, ProductionReviewSuggestion } from "@/types/productionReview";

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

export function isTrackBlocked(track?: { reviewState?: string; reviewIssues?: ProductionReviewSuggestion[] } | null) {
  return track?.reviewState === "blocked" || Boolean(getBlockingReview(track));
}

export function getSeverityTheme(severity: ProductionReviewSeverity): "default" | "primary" | "warning" | "danger" {
  if (severity === "blocking") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "info") return "primary";
  return "default";
}

export function getSeverityLabel(severity: ProductionReviewSeverity) {
  if (severity === "blocking") return "阻塞";
  if (severity === "warning") return "提醒";
  return "建议";
}

export function getReviewMessage(error: unknown) {
  const payload = error as any;
  const blockingReview = payload?.data?.blockingReview ?? payload?.response?.data?.data?.blockingReview;
  const message = blockingReview?.message || payload?.message || payload?.response?.data?.message;
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
