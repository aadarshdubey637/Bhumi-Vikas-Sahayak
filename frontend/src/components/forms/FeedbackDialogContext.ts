import { createContext, useContext } from "react";
import type { FeedbackPrefill } from "./FeedbackForm";

export interface FeedbackDialogApi {
  openFeedback: (prefill?: FeedbackPrefill) => void;
}
export const FeedbackCtx = createContext<FeedbackDialogApi>({ openFeedback: () => undefined });
export const useFeedbackDialog = (): FeedbackDialogApi => useContext(FeedbackCtx);
