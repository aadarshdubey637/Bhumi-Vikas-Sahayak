import { useMutation } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { assessInputs, previewPlot } from "@/api/endpoints/calculations";
import { createAssessment } from "@/api/endpoints/assessments";
import { createProject } from "@/api/endpoints/projects";
import { isApiError, mapValidationErrors } from "@/api/errors";
import { buildInputs, emptyPlotForm } from "@/api/schemas";
import { AssessmentSummary } from "@/components/assessment/AssessmentSummary";
import { ErrorState } from "@/components/common/ErrorState";
import { InlineDisclaimer } from "@/components/common/Disclaimer";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoBox } from "@/components/common/States";
import { PlotInputsForm } from "@/components/forms/PlotInputsForm";
import { PlotPreviewSvg } from "@/components/plot/PlotPreviewSvg";
import { PlotSketch } from "@/components/plot/PlotSketch";
import { btn, btnPrimary, input, label as labelCls } from "@/lib/ui";

export default function PlotCheck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyPlotForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const run = useMutation({
    mutationFn: (inputs: ReturnType<typeof buildInputs>["inputs"]) =>
      Promise.all([assessInputs({ inputs }), previewPlot({ inputs })]),
  });
  const save = useMutation({
    mutationFn: async () => {
      const { inputs } = buildInputs(form);
      const project = await createProject({
        name: name.trim(),
        building_use: typeof inputs.building_use === "string" ? inputs.building_use : undefined,
        inputs,
      });
      return createAssessment({ project_id: project.id });
    },
    onSuccess: (a) => navigate(`/assessments/${a.id}`),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const built = buildInputs(form);
    setErrors(built.errors);
    if (Object.keys(built.errors).length === 0) run.mutate(built.inputs);
  };
  const server =
    run.isError && isApiError(run.error) && run.error.status === 422 ? mapValidationErrors(run.error) : null;
  const fieldErrors = Object.fromEntries([
    ...Object.entries(errors).map(([k, v]) => [k, t(v)]),
    ...Object.entries(server?.fields ?? {}),
  ]);
  const [assessment, preview] = run.data ?? [];

  return (
    <>
      <PageHeader title={t("plotCheck.title")} description={t("plotx.description")} icon={Ruler} />
      <InlineDisclaimer />
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3" aria-label={t("plotx.stepsLabel")}>
        {(["step1", "step2", "step3"] as const).map((k, i) => (
          <li key={k} className="glass flex items-start gap-3 rounded-2xl px-3.5 py-3">
            <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span className="text-ink-soft">{t(`plotx.${k}`)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <form onSubmit={submit} className="glass space-y-4 rounded-2xl p-4 sm:p-5" noValidate>
          <PlotInputsForm idPrefix="pc" value={form} onChange={setForm} errors={fieldErrors} />
          <button type="submit" className={btnPrimary} disabled={run.isPending}>
            {run.isPending ? t("common.sending") : t("plotCheck.run")}
          </button>
        </form>
        <div className="lg:sticky lg:top-20">
          <PlotSketch form={form} />
        </div>
      </div>
      <div className="mt-4 space-y-4" aria-live="polite">
        {server?.general.map((g) => (
          <InfoBox key={g} tone="danger">
            {g}
          </InfoBox>
        ))}
        {run.isError && !server ? <ErrorState error={run.error} /> : null}
        {assessment && preview ? (
          <>
            <h2 className="text-lg font-semibold">{t("plotCheck.results")}</h2>
            <InfoBox tone="muted">{t("plotCheck.notSaved")}</InfoBox>
            <div className="grid gap-4 lg:grid-cols-2">
              <PlotPreviewSvg preview={preview} />
              <AssessmentSummary data={assessment} />
            </div>
            <section className="glass rounded-xl p-4">
              <h2 className="font-semibold">{t("plotCheck.saveAsProject")}</h2>
              <label htmlFor="pc-name" className={`${labelCls} mt-2`}>
                {t("projects.name")}
              </label>
              <input
                id="pc-name"
                className={input}
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className={`${btn} mt-2`}
                disabled={name.trim() === "" || save.isPending}
                onClick={() => save.mutate()}
              >
                {t("plotCheck.saveAsProject")}
              </button>
              {save.isError ? <ErrorState className="mt-2" error={save.error} /> : null}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
