import { describe, expect, it } from "vitest";
import { resolveApiBase } from "./env";

describe("resolveApiBase", () => {
  it("reports a missing or blank value", () => {
    expect(resolveApiBase(undefined, false)).toEqual({ ok: false, reason: "missing" });
    expect(resolveApiBase("   ", true)).toEqual({ ok: false, reason: "missing" });
  });

  it("strips trailing slashes", () => {
    expect(resolveApiBase("https://api.example.test///", true)).toEqual({
      ok: true,
      url: "https://api.example.test",
    });
  });

  it("rejects values that are not http(s) URLs", () => {
    expect(resolveApiBase("not a url", false)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveApiBase("ftp://api.example.test", false)).toEqual({ ok: false, reason: "invalid" });
  });

  it("requires https in production except for local hosts", () => {
    expect(resolveApiBase("http://api.example.test", true)).toEqual({ ok: false, reason: "insecure" });
    expect(resolveApiBase("http://localhost:9000", true)).toEqual({ ok: true, url: "http://localhost:9000" });
    expect(resolveApiBase("http://127.0.0.1:9000", true)).toEqual({ ok: true, url: "http://127.0.0.1:9000" });
  });

  it("allows plain http for any host outside production", () => {
    expect(resolveApiBase("http://api.example.test", false)).toEqual({
      ok: true,
      url: "http://api.example.test",
    });
  });
});
