import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw/server";
import { BASE } from "@/test/msw/handlers";
import { keyStore } from "@/auth/keyStore";
import { ask } from "@/api/endpoints/ask";
import { getHealth, getReady } from "@/api/endpoints/health";
import { listProjects } from "@/api/endpoints/projects";
import { getRule } from "@/api/endpoints/rules";
import { setUnauthorizedHandler, rearmUnauthorized, buildUrl } from "./client";
import { ApiError, mapValidationErrors, shouldRetryQuery } from "./errors";

afterEach(() => {
  keyStore.clear();
  setUnauthorizedHandler(null);
  rearmUnauthorized();
});

describe("api client", () => {
  it("builds URLs from the single base and omits undefined query values", () => {
    expect(buildUrl("/projects", { limit: 5, offset: undefined })).toBe(
      "http://localhost:8000/api/v1/projects?limit=5",
    );
  });

  it("URL-encodes rule ids like '12 A' and '26-B'", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/rules/:id`, ({ request }) => {
        seen.push(new URL(request.url).pathname);
        return HttpResponse.json({});
      }),
    );
    await getRule("12 A");
    await getRule("26-B");
    expect(seen).toEqual(["/api/v1/rules/12%20A", "/api/v1/rules/26-B"]);
  });

  it("sends X-API-Key only on authenticated calls, never on /health and /ready; sends the session cookie", async () => {
    keyStore.setKey("secret-key", false);
    const hdr: Record<string, string | null> = {};
    let creds = "";
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        hdr.health = request.headers.get("x-api-key");
        return HttpResponse.json({ status: "ok", version: "1", time: "t" });
      }),
      http.get(`${BASE}/ready`, ({ request }) => {
        hdr.ready = request.headers.get("x-api-key");
        return HttpResponse.json({ status: "ready", checks: {}, rules_loaded: 1, notes: [] });
      }),
      http.get(`${BASE}/projects`, ({ request }) => {
        hdr.projects = request.headers.get("x-api-key");
        creds = request.credentials;
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    await getHealth();
    await getReady();
    await listProjects();
    expect(hdr).toEqual({ health: null, ready: null, projects: "secret-key" });
    expect(creds).toBe("include");
  });

  it("parses the error envelope and reads Retry-After", async () => {
    server.use(
      http.post(`${BASE}/ask`, () =>
        HttpResponse.json(
          { code: "rate_limited", message: "slow", request_id: "r1", details: [] },
          { status: 429, headers: { "Retry-After": "7" } },
        ),
      ),
    );
    const e = (await ask({ question: "q" }).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.requestId, e.retryAfter]).toEqual([429, "rate_limited", "r1", 7]);
  });

  it("synthesises an error for non-JSON (HTML) responses and network failures", async () => {
    server.use(
      http.get(
        `${BASE}/projects`,
        () =>
          new HttpResponse("<html>bad gateway</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    const e1 = (await listProjects().catch((x: unknown) => x)) as ApiError;
    expect(e1.code).toBe("bad_gateway");
    server.use(http.get(`${BASE}/projects`, () => HttpResponse.error()));
    const e2 = (await listProjects().catch((x: unknown) => x)) as ApiError;
    expect(e2.code).toBe("network_error");
  });

  it("/ready returns its body on 503 instead of throwing", async () => {
    server.use(
      http.get(`${BASE}/ready`, () =>
        HttpResponse.json(
          { status: "not_ready", checks: { database: false }, rules_loaded: 0, notes: ["db down"] },
          { status: 503 },
        ),
      ),
    );
    expect((await getReady()).status).toBe("not_ready");
  });

  it("never retries a POST", async () => {
    let n = 0;
    server.use(
      http.post(`${BASE}/ask`, () => {
        n++;
        return HttpResponse.json(
          { code: "service_unavailable", message: "x", request_id: null, details: [] },
          { status: 503 },
        );
      }),
    );
    await ask({ question: "q" }).catch(() => undefined);
    expect(n).toBe(1);
  });

  it("calls the 401 handler exactly once", async () => {
    const h = vi.fn();
    setUnauthorizedHandler(h);
    server.use(
      http.get(`${BASE}/projects`, () =>
        HttpResponse.json(
          { code: "unauthorized", message: "no", request_id: null, details: [] },
          { status: 401 },
        ),
      ),
    );
    await listProjects().catch(() => undefined);
    await listProjects().catch(() => undefined);
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("retry policy: GETs retry transient errors up to 2x, never 4xx", () => {
    const net = new ApiError({ status: 0, code: "network_error", message: "" });
    const nf = new ApiError({ status: 404, code: "not_found", message: "" });
    expect(shouldRetryQuery(0, net)).toBe(true);
    expect(shouldRetryQuery(2, net)).toBe(false);
    expect(shouldRetryQuery(0, nf)).toBe(false);
  });

  it("maps both 422 detail shapes to fields", () => {
    const a = new ApiError({
      status: 422,
      code: "validation_error",
      message: "m",
      details: [{ loc: ["body", "context", "plot_area", "value"], msg: "bad area", type: "value_error" }],
    });
    const b = new ApiError({
      status: 422,
      code: "validation_error",
      message: "m",
      details: [{ input: "road_width", code: "NEGATIVE_VALUE", msg: "negative" }, { msg: "general problem" }],
    });
    expect(mapValidationErrors(a).fields).toEqual({ plot_area: "bad area" });
    expect(mapValidationErrors(b)).toEqual({
      fields: { road_width: "negative" },
      general: ["general problem"],
    });
  });
});
