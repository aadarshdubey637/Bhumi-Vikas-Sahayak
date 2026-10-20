import { createContext, useContext } from "react";

export interface ToastApi {
  /** Short, non-blocking confirmation (polite live region, auto-dismisses). Not for errors that need action. */
  success: (message: string) => void;
}

export const ToastContext = createContext<ToastApi>({ success: () => undefined });

/** Safe outside a provider (returns a no-op), so components stay testable in isolation. */
export const useToast = () => useContext(ToastContext);
