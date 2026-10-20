import { useContext } from "react";
import { ApiKeyContext, type ApiKeyContextValue } from "./ApiKeyContext";

export function useApiKey(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used inside ApiKeyProvider");
  return ctx;
}
