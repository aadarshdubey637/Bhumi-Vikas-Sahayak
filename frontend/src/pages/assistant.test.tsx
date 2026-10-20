import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { chatStore } from "@/lib/chatStore";
import { askNotEstablished, askPending } from "@/test/fixtures";
import { BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { renderPage } from "@/test/utils";
import Assistant from "./Assistant";

beforeEach(() => {
  window.localStorage.clear();
  chatStore.clear();
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("en");
});

const open = () => renderPage(<Assistant />, { path: "/assistant", route: "/assistant?c=t1" });
const ask = async (user: ReturnType<typeof userEvent.setup>, q: string) => {
  await user.type(screen.getByRole("textbox", { name: "Your question" }), q);
  await user.keyboard("{Enter}");
};

describe("Assistant home", () => {
  it("shows the headline, six category pills and a message box on a new chat", () => {
    open();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Got a plot in mind?");
    const pills = within(screen.getByRole("list", { name: "Try asking" })).getAllByRole("button");
    expect(pills.map((b) => b.textContent)).toEqual(["Ask about a rule", "Check my plot", "Floor area & FAR", "Plan a 3-storey house", "How it works", "Ask in Hindi"]);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("answers a product question from the guide without calling the rules backend", async () => {
    let calls = 0;
    server.use(http.post(`${BASE}/ask`, () => ((calls += 1), HttpResponse.json(askPending))));
    const user = userEvent.setup();
    open();
    await ask(user, "How do I use the 3D workbench?");
    expect(await screen.findByText("Using the 3D Workbench")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Workbench/ })).toHaveAttribute("href", "/workbench");
    expect(calls).toBe(0);
  });

  it("greets back like a person for small talk, without calling the rules backend", async () => {
    let calls = 0;
    server.use(http.post(`${BASE}/ask`, () => ((calls += 1), HttpResponse.json(askNotEstablished))));
    const user = userEvent.setup();
    open();
    await ask(user, "hy");
    expect(await screen.findByText("Hello! I'm your NirmaanSetu assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What front open space applies on a 9 m road?" })).toBeInTheDocument();
    expect(screen.queryByText(/I won't guess/)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "thank you");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("You're welcome")).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it("for a question it cannot answer (like a general-knowledge one) it says so kindly and offers questions to try", async () => {
    let asked = 0;
    server.use(http.post(`${BASE}/ask`, () => ((asked += 1), HttpResponse.json(askNotEstablished))));
    const user = userEvent.setup();
    open();
    await ask(user, "who is modi");
    expect(await screen.findByText(/I can only help with building rules and planning your plot/)).toBeInTheDocument();
    expect(screen.getByText("Outside what I can help with")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "What front open space applies on a 9 m road?" }));
    await waitFor(() => expect(asked).toBe(2)); // the example was sent as a new question
  });

  it("sends a rules question to the backend and shows its answer", async () => {
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(askPending)));
    const user = userEvent.setup();
    open();
    await ask(user, "fee for residential house");
    expect(await screen.findByRole("article", { name: "Answer" })).toBeInTheDocument();
  });

  it("says so plainly when the rules do not answer, and never guesses", async () => {
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(askNotEstablished)));
    const user = userEvent.setup();
    open();
    await ask(user, "capital of France");
    expect(await screen.findByText(/so I won't guess/)).toBeInTheDocument();
  });

  it("saves the chat on this device with the first question as its title, and restores it", async () => {
    server.use(http.post(`${BASE}/ask`, () => HttpResponse.json(askPending)));
    const user = userEvent.setup();
    const first = open();
    await ask(user, "fee for residential house");
    await screen.findByRole("article", { name: "Answer" });
    await waitFor(() => expect(chatStore.getSnapshot().map((c) => [c.id, c.title])).toEqual([["t1", "fee for residential house"]]));
    first.unmount();
    open();
    expect(await screen.findByRole("article", { name: "Answer" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /Got a plot/ })).not.toBeInTheDocument();
  });

  it("answers in Hindi when the question is in Devanagari", async () => {
    const user = userEvent.setup();
    open();
    await ask(user, "मैं हिंदी में कैसे पूछूँ?");
    expect(await screen.findByText("हिंदी और अंग्रेज़ी")).toBeInTheDocument();
  });
});
