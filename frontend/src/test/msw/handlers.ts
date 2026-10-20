import { http, HttpResponse, type RequestHandler } from "msw";
import { askPending, assessmentOut, calc200, EV21, previewOut, reportOut } from "../fixtures";

export const BASE = "http://localhost:8000/api/v1";

// Default happy-path handlers; tests override with server.use(...).
export const handlers: RequestHandler[] = [
  http.get(`${BASE}/health`, () =>
    HttpResponse.json({ status: "ok", version: "0.1.0", time: "2026-10-14T00:00:00Z" }),
  ),
  http.get(`${BASE}/ready`, () =>
    HttpResponse.json({
      status: "ready",
      checks: { database: true, schema_current: true, rules_loaded: true },
      rules_loaded: 106,
      notes: [],
    }),
  ),
  http.get(`${BASE}/auth/config`, () => HttpResponse.json({ auth_mode: "api_key", registration_open: true, email_delivery: "console", password_min_length: 8 })),
  http.get(`${BASE}/auth/me`, () => HttpResponse.json({ code: "unauthorized", message: "not signed in", request_id: null, details: [] }, { status: 401 })),
  http.post(`${BASE}/ask`, () => HttpResponse.json(askPending)),
  http.get(`${BASE}/evidence/:id`, ({ params }) =>
    params.id === EV21.evidence_id
      ? HttpResponse.json({ ...EV21, retrieval_method: "evidence_lookup" })
      : HttpResponse.json(
          { code: "not_found", message: "no", request_id: null, details: [] },
          { status: 404 },
        ),
  ),
  http.post(`${BASE}/calculations/plot-area`, () => HttpResponse.json(calc200)),
  http.post(`${BASE}/calculations/assess`, () => HttpResponse.json({ ...assessmentOut, persisted: false })),
  http.post(`${BASE}/plots/preview`, () => HttpResponse.json(previewOut)),
  http.get(`${BASE}/projects`, () => HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 })),
  http.get(`${BASE}/feedback`, () => HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 })),
  http.get(`${BASE}/amendments`, () =>
    HttpResponse.json({
      items: [
        {
          amendment_id: "AMD-TEST-1",
          title: "Test amendment to Rule 2",
          verification_status: "pending_verification",
          publication_date: null,
          effective_date: null,
          stated_date: "2026-08-28",
          source_url: null,
          summary: "Recorded from a secondary source.",
          affects: [{ rule: "2", clause_path: "5/c", relationship: "amends", verification_status: "pending_verification" }],
        },
      ],
      note: "Only amendments present in the stored register are listed.",
    }),
  ),
  http.get(`${BASE}/channels/status`, () =>
    HttpResponse.json({
      demo_enabled: true,
      whatsapp: { name: "Rule Dost", configured: false, credentials: [], webhook_url: "http://localhost:8000/api/v1/channels/whatsapp/webhook", voice_notes: false },
      voice: { name: "Nirmaan Helpline", configured: false, credentials: [], incoming_url: "http://localhost:8000/api/v1/channels/voice/incoming" },
      stt: { provider: "none", model: null },
      recent_events: [],
      recent_tests: [],
      recent_errors: [],
    }),
  ),
  http.get(`${BASE}/assessments/:id`, () => HttpResponse.json(assessmentOut)),
  http.get(`${BASE}/assessments/:id/evidence`, () =>
    HttpResponse.json({ assessment_id: "asm-0001", items: reportOut.evidence }),
  ),
  http.get(`${BASE}/assessments/:id/report`, () => HttpResponse.json(reportOut)),
  http.post(`${BASE}/assessments/:id/report`, () => HttpResponse.json(reportOut, { status: 201 })),
];
