import { beforeEach, describe, expect, it } from "vitest";
import { chatDataKey, chatGuideKey, chatStore, groupByDay, newChatId } from "./chatStore";

beforeEach(() => {
  window.localStorage.clear();
  chatStore.clear();
});

describe("chat history", () => {
  it("adds chats newest first, keeps the first question as the title, and persists them on this device", () => {
    chatStore.upsert("a", "What front open space applies?");
    chatStore.upsert("b", "How do I use the workbench?");
    chatStore.upsert("a", "a later question in chat a");
    const list = chatStore.getSnapshot();
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
    expect(list[0]!.title).toBe("What front open space applies?");
    expect(JSON.parse(window.localStorage.getItem("ns.chats")!)).toHaveLength(2);
  });
  it("notifies subscribers and deletes a chat together with its saved messages", () => {
    let n = 0;
    const off = chatStore.subscribe(() => n++);
    window.localStorage.setItem(chatDataKey("a"), "{}");
    window.localStorage.setItem(chatGuideKey("a"), "[]");
    chatStore.upsert("a", "hello");
    chatStore.remove("a");
    expect(n).toBe(2);
    expect(chatStore.getSnapshot()).toEqual([]);
    expect(window.localStorage.getItem(chatDataKey("a"))).toBeNull();
    expect(window.localStorage.getItem(chatGuideKey("a"))).toBeNull();
    off();
  });
  it("clears everything and caps the list", () => {
    for (let i = 0; i < 40; i++) chatStore.upsert(`c${i}`, `q${i}`);
    expect(chatStore.getSnapshot()).toHaveLength(30);
    expect(window.localStorage.getItem(chatDataKey("c0"))).toBeNull();
    chatStore.clear();
    expect(chatStore.getSnapshot()).toEqual([]);
  });
  it("groups by Today / Yesterday / Earlier", () => {
    const now = new Date(2026, 9, 20, 15, 0, 0);
    const at = (d: Date) => d.getTime();
    const list = [
      { id: "1", title: "t", updatedAt: at(new Date(2026, 9, 20, 9, 0)) },
      { id: "2", title: "y", updatedAt: at(new Date(2026, 9, 19, 22, 0)) },
      { id: "3", title: "e", updatedAt: at(new Date(2026, 9, 1, 12, 0)) },
    ];
    expect(groupByDay(list, now).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([["today", ["1"]], ["yesterday", ["2"]], ["earlier", ["3"]]]);
    expect(groupByDay([], now)).toEqual([]);
  });
  it("makes distinct, url-safe ids", () => {
    const ids = new Set(Array.from({ length: 50 }, newChatId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
  });
});
