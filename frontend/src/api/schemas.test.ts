import { describe, expect, it } from "vitest";
import {
  asOfSchema,
  buildAskRequest,
  buildInputs,
  emptyPlotForm,
  floorsSchema,
  lengthMeasurement,
  questionSchema,
  textInputSchema,
} from "./schemas";

const ok = (v: string) => lengthMeasurement.safeParse({ value: v, unit: "m" }).success;

describe("zod schemas", () => {
  it("accepts plain positive decimals, rejects the rest", () => {
    expect(ok("20")).toBe(true);
    expect(ok("0.5")).toBe(true);
    for (const bad of ["1,5", "1e3", "-1", "0", "abc", "1".repeat(33), "", "2000000000"])
      expect(ok(bad)).toBe(false);
  });
  it("floors: whole numbers only", () => {
    expect(floorsSchema.safeParse("3").success).toBe(true);
    expect(floorsSchema.safeParse("2.5").success).toBe(false);
    expect(floorsSchema.safeParse("0").success).toBe(false);
  });
  it("text inputs reject angle brackets, control characters and >64 chars", () => {
    expect(textInputSchema.safeParse("residential").success).toBe(true);
    for (const bad of ["<b>", "a>b", "a\u0007b", "x".repeat(65)])
      expect(textInputSchema.safeParse(bad).success).toBe(false);
  });
  it("question and date limits", () => {
    expect(questionSchema.safeParse("  ").success).toBe(false);
    expect(questionSchema.safeParse("x".repeat(1001)).success).toBe(false);
    expect(questionSchema.safeParse("x".repeat(1000)).success).toBe(true);
    expect(asOfSchema.safeParse("2025-03-06").success).toBe(true);
    expect(asOfSchema.safeParse("06/03/2025").success).toBe(false);
  });
  it("buildInputs emits only filled fields with canonical units, never empty strings", () => {
    const f = emptyPlotForm();
    f.measurements.plot_length = { value: "20", unit: "m" };
    f.floors = "3";
    f.building_use = "residential";
    const { inputs, errors } = buildInputs(f);
    expect(errors).toEqual({});
    expect(inputs).toEqual({
      plot_length: { value: "20", unit: "m" },
      floors: { value: "3", unit: "count" },
      building_use: "residential",
    });
  });
  it("buildAskRequest strips empty optionals and bad conversation ids", () => {
    expect(
      buildAskRequest({ question: " hi ", conversationId: "bad", context: {}, asOf: "", explain: false }),
    ).toEqual({ question: "hi" });
    expect(
      buildAskRequest({ question: "q", conversationId: "conv-abcdef12", language: "hi", explain: true }),
    ).toEqual({ question: "q", conversation_id: "conv-abcdef12", language: "hi", explain: true });
  });
});
