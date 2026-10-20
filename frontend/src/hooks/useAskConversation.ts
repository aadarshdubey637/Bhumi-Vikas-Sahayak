import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@/api/endpoints/ask";
import { isApiError } from "@/api/errors";
import { buildAskRequest, type AskFormValues } from "@/api/schemas";
import type { AskResponse } from "@/api/types";

export interface Turn {
  id: number;
  question: string;
  response?: AskResponse;
  error?: unknown;
  /** i18n key of an info note (e.g. explain fallback) */
  noteKey?: string;
}

const MAX_SAVED = 20;
type Kind = "session" | "local";
const store = (k: Kind): Storage => (k === "local" ? window.localStorage : window.sessionStorage);
function loadSaved(key: string, kind: Kind): { turns: Turn[]; conversationId: string | null } | null {
  try {
    const raw = store(kind).getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { turns?: unknown; conversationId?: unknown };
    if (!Array.isArray(v.turns)) return null;
    const turns = v.turns.filter(
      (t): t is Turn => !!t && typeof (t as Turn).id === "number" && typeof (t as Turn).question === "string" && !!(t as Turn).response,
    );
    return { turns, conversationId: typeof v.conversationId === "string" ? v.conversationId : null };
  } catch {
    return null;
  }
}

/**
 * Client-side only conversation (the backend has no history endpoint). Keeps the server's conversation_id
 * between turns, retries once with explain=false on 503 llm_unavailable, aborts in flight on unmount.
 */
export function useAskConversation(persistKey?: string, storage: Kind = "session") {
  const saved = useRef<ReturnType<typeof loadSaved> | undefined>(undefined);
  if (saved.current === undefined) saved.current = persistKey ? loadSaved(persistKey, storage) : null;
  const [turns, setTurns] = useState<Turn[]>(saved.current?.turns ?? []);
  const [conversationId, setConversationId] = useState<string | null>(saved.current?.conversationId ?? null);
  const [pending, setPending] = useState(false);
  const [explainAvailable, setExplainAvailable] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef((saved.current?.turns.at(-1)?.id ?? 0) + 1);
  const cidRef = useRef<string | null>(saved.current?.conversationId ?? null);

  // Optional tab-session persistence (sessionStorage: gone when the tab closes). Only answered turns are kept.
  useEffect(() => {
    if (!persistKey) return;
    try {
      const keep = turns.filter((t) => t.response).slice(-MAX_SAVED);
      store(storage).setItem(persistKey, JSON.stringify({ turns: keep, conversationId }));
    } catch {
      /* storage full or blocked: the conversation simply is not remembered */
    }
  }, [persistKey, storage, turns, conversationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async (values: Omit<AskFormValues, "conversationId">) => {
    const id = nextId.current++;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPending(true);
    setTurns((t) => [...t, { id, question: values.question.trim() }]);
    const patch = (p: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      let noteKey: string | undefined;
      let res: AskResponse;
      try {
        res = await ask(buildAskRequest({ ...values, conversationId: cidRef.current }), ctrl.signal);
      } catch (e) {
        if (isApiError(e) && e.code === "llm_unavailable" && values.explain) {
          setExplainAvailable(false);
          noteKey = "ask.explainUnavailable";
          res = await ask(
            buildAskRequest({ ...values, explain: false, conversationId: cidRef.current }),
            ctrl.signal,
          );
        } else throw e;
      }
      if (res.conversation_id) {
        cidRef.current = res.conversation_id;
        setConversationId(res.conversation_id);
      }
      patch({ response: res, noteKey });
    } catch (e) {
      if (!ctrl.signal.aborted) patch({ error: e });
    } finally {
      if (abortRef.current === ctrl) setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    cidRef.current = null;
    setConversationId(null);
    setTurns([]);
    setPending(false);
  }, []);

  return { turns, conversationId, pending, explainAvailable, send, reset };
}
