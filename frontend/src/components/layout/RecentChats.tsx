import { MessageSquare, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router-dom";
import { useHomePath } from "@/hooks/useHomePath";
import { chatStore, groupByDay } from "@/lib/chatStore";

/** The sidebar's "Recent chats": grouped by day, each opens that conversation. Stored on this device only. */
export function RecentChats({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const chats = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
  const { openChat, home, newChat } = useHomePath();
  const [params] = useSearchParams();
  const active = params.get("c");
  const onHome = useLocation().pathname === home;
  const groups = groupByDay(chats);

  return (
    <section aria-label={t("as.recent")} className="mt-2 border-t border-line pt-3">
      {groups.length === 0 ? (
        <p className="px-3 text-xs leading-relaxed text-ink-faint">{t("as.noChats")}</p>
      ) : (
        groups.map((g) => (
          <div key={g.group} className="mb-3">
            <h3 className="px-3 pb-1 text-xs font-semibold text-ink-faint">{t(`as.group.${g.group}`)}</h3>
            <ul>
              {g.items.map((c) => (
                <li key={c.id} className="group/chat relative">
                  <button
                    type="button"
                    title={c.title}
                    aria-current={onHome && active === c.id ? "page" : undefined}
                    onClick={() => {
                      openChat(c.id);
                      onNavigate?.();
                    }}
                    className={`flex min-h-tap w-full items-center gap-2 rounded-xl px-3 pr-9 text-left text-sm transition-colors hover:bg-white/6 hover:text-white ${onHome && active === c.id ? "bg-white/10 text-white" : "text-ink-soft"}`}
                  >
                    <MessageSquare aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("as.deleteChat", { title: c.title })}
                    onClick={() => {
                      const wasActive = active === c.id;
                      chatStore.remove(c.id);
                      if (wasActive) newChat();
                    }}
                    className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint opacity-0 transition-opacity hover:bg-white/10 hover:text-danger focus-visible:opacity-100 group-hover/chat:opacity-100"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {chats.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            chatStore.clear();
            newChat();
          }}
          className="mx-3 mb-2 text-xs font-semibold text-ink-faint underline-offset-2 hover:text-ink hover:underline"
        >
          {t("as.clearAll")}
        </button>
      ) : null}
    </section>
  );
}
