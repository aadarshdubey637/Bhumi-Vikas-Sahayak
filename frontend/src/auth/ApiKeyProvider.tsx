import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { rearmUnauthorized } from "@/api/client";
import { ApiKeyContext } from "./ApiKeyContext";
import { keyStore } from "./keyStore";

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const hasKey = useSyncExternalStore(keyStore.subscribe, () => keyStore.getKey() !== null);
  const authDisabled = useSyncExternalStore(keyStore.subscribe, () => keyStore.isAuthOpen());

  const setKey = useCallback((key: string, persistForTab: boolean) => {
    keyStore.setKey(key, persistForTab);
    rearmUnauthorized();
  }, []);
  const signOut = useCallback(() => {
    keyStore.clear();
    qc.clear();
    rearmUnauthorized();
  }, [qc]);

  const value = useMemo(
    () => ({ hasKey, authDisabled, setKey, signOut }),
    [hasKey, authDisabled, setKey, signOut],
  );
  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}
