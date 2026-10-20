import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@/components/common/Toast";
import { useToast } from "@/components/common/toastContext";
import i18n, { setUiLanguage, storedLanguage } from "@/i18n";
import { Breadcrumbs } from "./Breadcrumbs";
import { MobileNav } from "./MobileNav";

afterEach(async () => {
  cleanup();
  window.localStorage.clear();
  await i18n.changeLanguage("en");
  document.documentElement.lang = "en";
});

const wrap = (ui: React.ReactNode, route = "/") => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
  </QueryClientProvider>
);

describe("Breadcrumbs", () => {
  it("shows Home > section > Details for an id-like segment, and the current page last", () => {
    render(wrap(<Breadcrumbs />, "/projects/0123456789abcdef0123456789abcdef"));
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "NirmaanSetu" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
    expect(within(nav).getByText("Details")).toHaveAttribute("aria-current", "page");
  });

  it("shows a rule number as-is and decodes it", () => {
    render(wrap(<Breadcrumbs />, "/rules/12%20A"));
    expect(screen.getByText("12 A")).toHaveAttribute("aria-current", "page");
  });
});

describe("MobileNav drawer", () => {
  it("opens a labelled dialog with every nav link, and closes when a link is chosen", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <MobileNav />
          <Routes>
            <Route path="*" element={<p>page</p>} />
          </Routes>
        </>,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const dlg = await screen.findByRole("dialog", { name: "Main navigation" });
    // the simplified core workflow plus two secondary links; Feedback and Amendment Tracker are no longer in the main navigation
    expect(within(dlg).getAllByRole("link").slice(1).map((l) => l.textContent?.trim())).toEqual([
      "Home",
      "Workbench",
      "Plot Assessment",
      "Calculator",
      "Projects",
      "Rulebook & sources",
      "About",
      "WhatsApp & Phone",
    ]);
    await user.click(within(dlg).getByRole("link", { name: "Calculator" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Escape closes it", async () => {
    const user = userEvent.setup();
    render(wrap(<MobileNav />));
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("UI language persistence", () => {
  it("remembers only the language choice and syncs <html lang>", () => {
    expect(storedLanguage()).toBe("en");
    setUiLanguage("hi");
    expect(storedLanguage()).toBe("hi");
    expect(document.documentElement.lang).toBe("hi");
    expect(Object.keys(window.localStorage)).toEqual(["ns.ui-language"]);
  });

  it("ignores a garbage stored value", () => {
    window.localStorage.setItem("ns.ui-language", "<script>");
    expect(storedLanguage()).toBe("en");
  });
});

describe("Toast", () => {
  function Fire() {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.success("Saved it")}>
        fire
      </button>
    );
  }
  it("announces politely and can be dismissed", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "fire" }));
    expect(await screen.findByText("Saved it")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Saved it")).not.toBeInTheDocument();
  });
  it("useToast is a harmless no-op outside a provider", async () => {
    const user = userEvent.setup();
    render(<Fire />);
    await act(async () => user.click(screen.getByRole("button", { name: "fire" })));
    expect(screen.queryByText("Saved it")).not.toBeInTheDocument();
  });
});
