import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAccount } from "@/auth/useAccount";
import { LoadingSkeleton } from "@/components/common/States";

/**
 * Pages that store or show an account's own data. Visitors are sent to sign in and come back afterwards. When the server does not
 * enforce accounts (local development, API-key deployments) the page is open as before.
 */
export function RequireAccount() {
  const { status, accountsEnforced, configLoaded } = useAccount();
  const location = useLocation();
  if (status === "loading" || !configLoaded) return <LoadingSkeleton lines={4} />;
  if (status === "guest" && accountsEnforced) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
