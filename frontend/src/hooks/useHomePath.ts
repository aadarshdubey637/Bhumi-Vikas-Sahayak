import { useNavigate } from "react-router-dom";
import { useAccount } from "@/auth/useAccount";
import { newChatId } from "@/lib/chatStore";

/** The assistant's address: the dashboard when signed in (or accounts are not enforced), the public assistant page otherwise. */
export function useHomePath(): { home: string; openChat: (id: string) => void; newChat: () => void } {
  const { status, accountsEnforced } = useAccount();
  const navigate = useNavigate();
  const home = status === "user" || !accountsEnforced ? "/dashboard" : "/assistant";
  return {
    home,
    openChat: (id) => navigate(`${home}?c=${encodeURIComponent(id)}`),
    newChat: () => navigate(`${home}?c=${newChatId()}`),
  };
}
