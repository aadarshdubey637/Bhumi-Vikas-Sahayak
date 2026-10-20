import { createContext } from "react";

export interface ApiKeyContextValue {
  hasKey: boolean;
  /** true when an authenticated call succeeded without a key: the server runs with auth disabled (dev). */
  authDisabled: boolean;
  setKey: (key: string, persistForTab: boolean) => void;
  signOut: () => void;
}

export const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);
