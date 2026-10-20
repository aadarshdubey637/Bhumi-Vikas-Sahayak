import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { createFeedback } from "@/api/endpoints/feedback";
import { isApiError, mapValidationErrors } from "@/api/errors";
import { buildFeedbackRequest, feedbackMessageSchema } from "@/api/schemas";
import { FEEDBACK_CATEGORIES, type FeedbackCategory, type FeedbackOut } from "@/api/types";
import { ErrorState } from "@/components/common/ErrorState";
import { FieldError } from "@/components/common/FieldError";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
import { btnPrimary, input, label as labelCls } from "@/lib/ui";

export interface FeedbackPrefill {
  category?: FeedbackCategory;
  evidenceId?: string;
  assessmentId?: string;
}

export function FeedbackForm({
  prefill,
  onDone,
}: {
  prefill?: FeedbackPrefill;
  onDone?: (f: FeedbackOut) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [category, setCategory] = useState<FeedbackCategory>(prefill?.category ?? "incorrect_answer");
  const [message, setMessage] = useState("");
  const [evidenceId, setEvidenceId] = useState(prefill?.evidenceId ?? "");
  const [assessmentId, setAssessmentId] = useState(prefill?.assessmentId ?? "");
  const [msgError, setMsgError] = useState<string | undefined>();
  const [done, setDone] = useState<FeedbackOut | null>(null);

  const m = useMutation({
    mutationFn: () =>
      createFeedback(
        buildFeedbackRequest({
          category,
          message,
          evidenceId: evidenceId.trim() || undefined,
          assessmentId: assessmentId.trim() || undefined,
        }),
      ),
    onSuccess: (f) => {
      setDone(f);
      void qc.invalidateQueries({ queryKey: ["feedback"] });
      onDone?.(f);
    },
  });
  const wait = useRateLimitCountdown(m.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = feedbackMessageSchema.safeParse(message);
    if (!r.success) {
      setMsgError(r.error.issues[0]?.message);
      return;
    }
    setMsgError(undefined);
    m.mutate();
  };

  if (done) {
    return (
      <p role="status" className="rounded border border-verified-line bg-verified-tint p-3 text-sm">
        {t("feedback.thanks", { id: done.id })}
      </p>
    );
  }

  const serverFields = m.isError ? mapValidationErrors(m.error).fields : {};
  const notFound = isApiError(m.error) && m.error.code === "not_found";

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div>
        <label htmlFor="fb-category" className={labelCls}>
          {t("feedback.category")}
        </label>
        <select
          id="fb-category"
          className={input}
          value={category}
          onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
        >
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`feedback.categories.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fb-message" className={labelCls}>
          {t("feedback.message")}
        </label>
        <textarea
          id="fb-message"
          className={input}
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby="fb-count"
          aria-invalid={!!msgError}
        />
        <p id="fb-count" className="mt-1 text-xs text-ink-faint tabular">
          {message.length}/2000
        </p>
        <FieldError message={msgError ?? serverFields.message} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fb-evidence" className={labelCls}>
            {t("feedback.evidenceId")}
          </label>
          <input
            id="fb-evidence"
            className={`${input} font-mono`}
            value={evidenceId}
            onChange={(e) => setEvidenceId(e.target.value)}
            maxLength={128}
          />
          <FieldError message={serverFields.evidence_id} />
        </div>
        <div>
          <label htmlFor="fb-assessment" className={labelCls}>
            {t("feedback.assessmentId")}
          </label>
          <input
            id="fb-assessment"
            className={`${input} font-mono`}
            value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
            maxLength={64}
          />
          <FieldError message={serverFields.assessment_id} />
        </div>
      </div>
      {notFound ? (
        <p role="alert" className="text-sm text-danger">
          {t("feedback.badId")}
        </p>
      ) : m.isError ? (
        <ErrorState error={m.error} />
      ) : null}
      <button type="submit" className={btnPrimary} disabled={m.isPending || wait > 0}>
        {wait > 0
          ? t("common.waitSeconds", { seconds: wait })
          : m.isPending
            ? t("common.sending")
            : t("feedback.submit")}
      </button>
    </form>
  );
}
