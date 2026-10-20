import { createContext, useContext, useEffect } from "react";

export const DisclaimerContext = createContext<{ ping: () => void }>({ ping: () => undefined });

/** Call with a value that changes on each new answer/report so the banner re-expands. */
export function usePingDisclaimer(trigger: unknown): void {
  const { ping } = useContext(DisclaimerContext);
  useEffect(() => {
    if (trigger) ping();
  }, [trigger, ping]);
}
