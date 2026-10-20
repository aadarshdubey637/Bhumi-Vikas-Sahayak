// Chat history for the assistant: the list of recent chats shown in the sidebar. The backend has no history endpoint, so chats are kept
// on THIS device only (localStorage) and can be deleted one by one or all at once. Nothing here is sent anywhere.
export interface ChatMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const INDEX_KEY = "ns.chats";
const MAX_CHATS = 30;
const listeners = new Set<() => void>();
let cache: ChatMeta[] | null = null;

const read = (): ChatMeta[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? "[]") as unknown;
    return Array.isArray(v)
      ? v.filter((c): c is ChatMeta => !!c && typeof (c as ChatMeta).id === "string" && typeof (c as ChatMeta).title === "string" && typeof (c as ChatMeta).updatedAt === "number")
      : [];
  } catch {
    return [];
  }
};
const write = (list: ChatMeta[]) => {
  cache = list;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the list lives for this page only */
  }
  listeners.forEach((l) => l());
};

export const chatStore = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  getSnapshot(): ChatMeta[] {
    if (cache === null) cache = read();
    return cache;
  },
  /** Add or refresh a chat; newest first. */
  upsert(id: string, title: string): void {
    const list = chatStore.getSnapshot();
    const t = title.trim().replace(/\s+/g, " ").slice(0, 80) || "…";
    const existing = list.find((c) => c.id === id);
    if (existing && existing.title === t && Date.now() - existing.updatedAt < 1000) return;
    const next = [{ id, title: existing?.title ?? t, updatedAt: Date.now() }, ...list.filter((c) => c.id !== id)].slice(0, MAX_CHATS);
    for (const gone of list.filter((c) => !next.some((n) => n.id === c.id))) removeData(gone.id);
    write(next);
  },
  remove(id: string): void {
    removeData(id);
    write(chatStore.getSnapshot().filter((c) => c.id !== id));
  },
  clear(): void {
    for (const c of chatStore.getSnapshot()) removeData(c.id);
    write([]);
  },
};

export const chatDataKey = (id: string): string => `ns.chat.${id}`;
export const chatGuideKey = (id: string): string => `ns.chat.${id}.guide`;
export const chatDetailsKey = (id: string): string => `ns.chat.${id}.details`;
function removeData(id: string): void {
  try {
    window.localStorage.removeItem(chatDataKey(id));
    window.localStorage.removeItem(chatGuideKey(id));
    window.localStorage.removeItem(chatDetailsKey(id));
  } catch {
    /* ignore */
  }
}

export const newChatId = (): string => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export type DayGroup = "today" | "yesterday" | "earlier";
export function groupByDay(list: ChatMeta[], now = new Date()): Array<{ group: DayGroup; items: ChatMeta[] }> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const g: Record<DayGroup, ChatMeta[]> = { today: [], yesterday: [], earlier: [] };
  for (const c of list) (c.updatedAt >= start ? g.today : c.updatedAt >= start - day ? g.yesterday : g.earlier).push(c);
  return (["today", "yesterday", "earlier"] as const).filter((k) => g[k].length).map((k) => ({ group: k, items: g[k] }));
}
