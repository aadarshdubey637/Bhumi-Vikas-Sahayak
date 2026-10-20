import { createContext } from "react";
import type { AccountUser, AuthConfig } from "@/api/endpoints/auth";

export interface AccountContextValue {
  /** loading until /auth/me answered; "user" when a valid session cookie exists; otherwise "guest" */
  status: "loading" | "guest" | "user";
  user: AccountUser | null;
  config: AuthConfig | null;
  /** the server answered (or failed to answer) GET /auth/config */
  configLoaded: boolean;
  /** true when the server needs a signed-in account for owner data (AUTH_MODE=accounts) */
  accountsEnforced: boolean;
  setUser: (u: AccountUser | null) => void;
  signOut: () => Promise<void>;
}

export const AccountContext = createContext<AccountContextValue>({
  status: "guest",
  user: null,
  config: null,
  configLoaded: true,
  accountsEnforced: false,
  setUser: () => undefined,
  signOut: async () => undefined,
});
