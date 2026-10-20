import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { rearmUnauthorized, setUnauthorizedHandler } from "@/api/client";
import type { AuthConfig } from "@/api/endpoints/auth";
import { AccountProvider } from "@/auth/AccountProvider";
import { CONFIG_KEY, ME_KEY } from "@/auth/queryKeys";
import { ApiKeyProvider } from "@/auth/ApiKeyProvider";
import { keyStore } from "@/auth/keyStore";

/**
 * A 401 from the API means one of two things, depending on how the server is set up:
 *  - accounts: the visitor is signed out or the session expired -> sign-in page (remembering where they were going);
 *  - api_key: the access key is missing or wrong -> access-key page.
 */
function UnauthorizedRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const accounts = qc.getQueryData<AuthConfig>(CONFIG_KEY)?.auth_mode === "accounts";
      if (accounts) {
        const wasSignedIn = !!qc.getQueryData(ME_KEY);
        qc.setQueryData(ME_KEY, null);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
        rearmUnauthorized();
        if (["/login", "/signup", "/forgot-password", "/reset-password"].includes(location.pathname)) return;
        // the intended route travels in router state only, never in storage or the URL
        navigate("/login", { state: { from: location.pathname + location.search, expired: wasSignedIn }, replace: true });
        return;
      }
      keyStore.clear();
      qc.clear();
      if (location.pathname === "/access-key") return;
      navigate("/access-key", { state: { from: location.pathname + location.search }, replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, location.pathname, location.search, qc]);
  return null;
}

export function RootLayout() {
  return (
    <ApiKeyProvider>
      <AccountProvider>
        <UnauthorizedRedirect />
        <Outlet />
      </AccountProvider>
    </ApiKeyProvider>
  );
}
