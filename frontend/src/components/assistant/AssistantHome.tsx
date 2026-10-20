import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { chatStore, newChatId } from "@/lib/chatStore";
import { AssistantChat } from "./AssistantChat";

const LAST_KEY = "ns.chat.last";
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** The home screen: the assistant on the chat named in ?c= (a new one when there is none, otherwise the one used last). */
export function AssistantHome() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const raw = params.get("c");
  const id = raw && SAFE_ID.test(raw) ? raw : null;

  useEffect(() => {
    if (id) {
      try {
        window.localStorage.setItem(LAST_KEY, id);
      } catch {
        /* not remembered */
      }
      return;
    }
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_KEY);
    } catch {
      /* ignore */
    }
    const known = last && chatStore.getSnapshot().some((c) => c.id === last) ? last : null;
    navigate(`${pathname}?c=${known ?? newChatId()}`, { replace: true });
  }, [id, navigate, pathname]);

  if (!id) return null;
  return <AssistantChat key={id} chatId={id} />;
}
