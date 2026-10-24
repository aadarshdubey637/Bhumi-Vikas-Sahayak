// Client-side mirror of the backend request constraints. The server stays authoritative.
// Zod issue messages are i18n keys (see src/i18n), so the UI translates them with t().
import { z } from "zod";
import type { AskRequest, Attachment, ChatMessage, FeedbackCreate, InputMap, Language, Measurement } from "./types";
import {
  AREA_UNITS,
  FLOORS_FIELD,
  FLOORS_UNIT,
  LENGTH_UNITS,
  MEASUREMENT_FIELDS,
  TEXT_FIELDS,
  unitsFor,
} from "@/lib/units";

export const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
export const MAX_MEASUREMENT = 1e9;
export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const AS_OF_RE = /^\d{4}-\d{2}-\d{2}$/;
const hasControlChars = (s: string): boolean =>
  [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);

/** Positive decimal string, as the UI requires (server additionally accepts negatives syntactically then rejects them). */
export const positiveDecimal = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .superRefine((s, ctx) => {
    if (s === "") return ctx.addIssue({ code: "custom", message: "validation.required" });
    if (s.includes(",")) return ctx.addIssue({ code: "custom", message: "validation.useDot" });
    if (s.length > 32 || !DECIMAL_RE.test(s))
      return ctx.addIssue({ code: "custom", message: "validation.decimal" });
    const n = Number(s);
    if (!(n > 0)) return ctx.addIssue({ code: "custom", message: "validation.positive" });
    if (n > MAX_MEASUREMENT) return ctx.addIssue({ code: "custom", message: "validation.tooLarge" });
  });

export const lengthMeasurement = z.object({ value: positiveDecimal, unit: z.enum(LENGTH_UNITS) });
export const areaMeasurement = z.object({ value: positiveDecimal, unit: z.enum(AREA_UNITS) });

export const floorsSchema = z
  .string()
  .transform((s) => s.trim())
  .superRefine((s, ctx) => {
    if (!/^\d+$/.test(s) || Number(s) < 1 || Number(s) > MAX_MEASUREMENT)
      ctx.addIssue({ code: "custom", message: "validation.floors" });
  });

export const textInputSchema = z
  .string()
  .transform((s) => s.trim())
  .superRefine((s, ctx) => {
    if (s.length < 1 || s.length > 64 || /[<>]/.test(s) || hasControlChars(s))
      ctx.addIssue({ code: "custom", message: "validation.text" });
  });

export const questionSchema = z
  .string()
  .max(1000, "validation.questionTooLong")
  .refine((s) => s.trim().length > 0, "validation.required");
export const feedbackMessageSchema = z
  .string()
  .refine((s) => s.trim().length >= 1, "validation.required")
  .refine((s) => s.length <= 2000, "validation.messageTooLong");
export const projectNameSchema = z
  .string()
  .refine((s) => s.trim().length >= 1, "validation.required")
  .refine((s) => s.length <= 200, "validation.nameTooLong");
export const asOfSchema = z.string().regex(AS_OF_RE, "validation.date");

// ---- plot-input form model -> request body ----
export interface PlotFormValues {
  measurements: Record<string, { value: string; unit: string }>;
  floors: string;
  building_use: string;
  location: string;
}

export function emptyPlotForm(): PlotFormValues {
  const measurements: PlotFormValues["measurements"] = {};
  for (const f of MEASUREMENT_FIELDS) measurements[f.name] = { value: "", unit: unitsFor(f.dim)[0] ?? "" };
  // area default sqm, length default m are the first entries of the canonical lists
  return { measurements, floors: "", building_use: "", location: "" };
}

export interface BuiltInputs {
  inputs: InputMap;
  /** field name -> i18n key */
  errors: Record<string, string>;
}

const firstMessage = (r: { error: z.ZodError }): string => r.error.issues[0]?.message ?? "validation.decimal";

/** Validates the form and builds a typed body. Empty fields are omitted (never "" or null). */
export function buildInputs(form: PlotFormValues): BuiltInputs {
  const inputs: InputMap = {};
  const errors: Record<string, string> = {};
  for (const f of MEASUREMENT_FIELDS) {
    const cell = form.measurements[f.name];
    if (!cell || cell.value.trim() === "") continue;
    const schema = f.dim === "area" ? areaMeasurement : lengthMeasurement;
    const r = schema.safeParse(cell);
    if (r.success) inputs[f.name] = { value: r.data.value, unit: r.data.unit } satisfies Measurement;
    else errors[f.name] = firstMessage(r);
  }
  if (form.floors.trim() !== "") {
    const r = floorsSchema.safeParse(form.floors);
    if (r.success) inputs[FLOORS_FIELD] = { value: r.data, unit: FLOORS_UNIT };
    else errors[FLOORS_FIELD] = firstMessage(r);
  }
  for (const name of TEXT_FIELDS) {
    const raw = form[name];
    if (raw.trim() === "") continue;
    const r = textInputSchema.safeParse(raw);
    if (r.success) inputs[name] = r.data;
    else errors[name] = firstMessage(r);
  }
  return { inputs, errors };
}

/** Inverse of buildInputs, used to prefill the form from a project's stored inputs. */
export function formFromInputs(inputs: InputMap): PlotFormValues {
  const form = emptyPlotForm();
  for (const [name, v] of Object.entries(inputs)) {
    if (typeof v === "string") {
      if (name === "building_use" || name === "location") form[name] = v;
    } else if (name === FLOORS_FIELD) form.floors = v.value;
    else if (name in form.measurements) form.measurements[name] = { value: v.value, unit: v.unit };
  }
  return form;
}

// ---- request builders: only known keys, no empty strings ----
export interface AskFormValues {
  question: string;
  language?: Language;
  conversationId?: string | null;
  projectId?: string;
  context?: InputMap;
  asOf?: string;
  explain?: boolean;
  history?: ChatMessage[];
  attachments?: Attachment[];
}

export function buildAskRequest(v: AskFormValues): AskRequest {
  const body: AskRequest = { question: v.question.trim() };
  if (v.language) body.language = v.language;
  if (v.conversationId && CONVERSATION_ID_RE.test(v.conversationId)) body.conversation_id = v.conversationId;
  if (v.projectId) body.project_id = v.projectId;
  if (v.context && Object.keys(v.context).length > 0) body.context = v.context;
  if (v.asOf && AS_OF_RE.test(v.asOf)) body.as_of = v.asOf;
  if (v.explain) body.explain = true;
  if (v.history && v.history.length > 0) body.history = v.history;
  if (v.attachments && v.attachments.length > 0) body.attachments = v.attachments;
  return body;
}

export function buildFeedbackRequest(v: {
  category: FeedbackCreate["category"];
  message: string;
  assessmentId?: string;
  evidenceId?: string;
}): FeedbackCreate {
  const body: FeedbackCreate = { category: v.category, message: v.message.trim() };
  if (v.assessmentId) body.assessment_id = v.assessmentId;
  if (v.evidenceId) body.evidence_id = v.evidenceId;
  return body;
}
