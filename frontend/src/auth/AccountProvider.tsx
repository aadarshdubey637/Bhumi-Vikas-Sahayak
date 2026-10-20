import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, type ReactNode } from "react";
import { getAuthConfig, getMe, logout, type AccountUser } from "@/api/endpoints/auth";
import { isApiError } from "@/api/errors";
import { AccountContext } from "./accountContext";
import { CONFIG_KEY, ME_KEY } from "./queryKeys";


/** Who is signed in, from the server (HttpOnly session cookie): the browser never sees or stores the session token or a password. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: CONFIG_KEY, queryFn: ({ signal }) => getAuthConfig(signal), retry: 1, staleTime: 5 * 60_000 });
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await getMe(signal);
      } catch (e) {
        if (isApiError(e) && e.status === 401) return null; // signed out, or the session expired
        throw e;
      }
    },
    retry: 1,
    staleTime: 60_000,
  });

  const setUser = useCallback((u: AccountUser | null) => qc.setQueryData(ME_KEY, u), [qc]);
  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      qc.setQueryData(ME_KEY, null);
      // owner-scoped data from the previous account must not stay in memory
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    }
  }, [qc]);

  const value = useMemo(
    () => ({
      status: me.isPending ? ("loading" as const) : me.data ? ("user" as const) : ("guest" as const),
      user: me.data ?? null,
      config: config.data ?? null,
      configLoaded: config.isFetched,
      accountsEnforced: config.data?.auth_mode === "accounts",
      setUser,
      signOut,
    }),
    [me.isPending, me.data, config.data, config.isFetched, setUser, signOut],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
