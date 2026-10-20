import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { keyStore } from "@/auth/keyStore";
import { routes } from "@/router";
import { errBody, rule25 } from "@/test/fixtures";
import { BASE } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

afterEach(() => keyStore.clear());

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("routing", () => {
  it("deep link to a rule works and shows the shell with the disclaimer", async () => {
    server.use(http.get(`${BASE}/rules/:id`, () => HttpResponse.json(rule25)));
    mount("/rules/2");
    expect(await screen.findByText(/Rule 2 — Definitions/)).toBeInTheDocument();
    expect(screen.getAllByText(/not a compliance determination/i).length).toBeGreaterThan(0);
  });

  it("unknown routes render the 404 page", async () => {
    mount("/does-not-exist");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("a 401 sends the user to /access-key and keeps the return path in router state", async () => {
    server.use(
      http.get(`${BASE}/projects`, () => HttpResponse.json(errBody("unauthorized", "no"), { status: 401 })),
    );
    const router = mount("/projects");
    expect(await screen.findByText("Enter your access key")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/access-key");
    expect(router.state.location.state).toMatchObject({ from: "/projects" });
    expect(router.state.location.search).toBe("");
  });

  it("lazy routes (calculator) load", async () => {
    mount("/calculator");
    expect(await screen.findByRole("heading", { name: "Calculator" })).toBeInTheDocument();
  });
});
