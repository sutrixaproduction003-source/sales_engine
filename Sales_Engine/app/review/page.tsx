// Compatibility route: the sidebar links to /review, while /review-queue is the canonical path.
import { ReviewQueuePageContent } from "@/components/ReviewQueuePage";

export default function ReviewPage() {
  return <ReviewQueuePageContent />;
}
