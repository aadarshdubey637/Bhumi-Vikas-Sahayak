import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createAssessment } from "@/api/endpoints/assessments";
import { getProject, listProjectAssessments, updateProject } from "@/api/endpoints/projects";
import { buildInputs, emptyPlotForm, formFromInputs, projectNameSchema } from "@/api/schemas";
import type { ProjectStatus } from "@/api/types";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState, InfoBox, LoadingSkeleton } from "@/components/common/States";
import { OverallStatusBadge } from "@/components/evidence/StatusBadges";
import { PlotInputsForm } from "@/components/forms/PlotInputsForm";
import { formatDateTime } from "@/lib/format";
import { isSafeId } from "@/lib/rule-number";
import { btn, btnLink, btnPrimary, card, input, label as labelCls } from "@/lib/ui";

const LIMIT = 10;

export default function ProjectDetail() {
  const { t, i18n } = useTranslation();
  const id = useParams().id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("draft");
  const [form, setForm] = useState(emptyPlotForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const safe = isSafeId(id);
  const pid = safe ? id : "";
  const project = useQuery({
    queryKey: ["project", pid],
    queryFn: ({ signal }) => getProject(pid, signal),
    enabled: safe,
  });
  const history = useQuery({
    queryKey: ["project-assessments", pid, offset],
    queryFn: ({ signal }) => listProjectAssessments(pid, { limit: LIMIT, offset }, signal),
    enabled: safe,
  });
  useEffect(() => {
    if (project.data) {
      setName(project.data.name);
      setStatus(project.data.status as ProjectStatus);
      setForm(formFromInputs(project.data.inputs));
    }
  }, [project.data]);
  const save = useMutation({
    mutationFn: (body: Parameters<typeof updateProject>[1]) => updateProject(pid, body),
    onSuccess: (p) => qc.setQueryData(["project", pid], p),
  });
  const run = useMutation({
    mutationFn: () => createAssessment({ project_id: pid }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ["project-assessments", pid] });
      navigate(`/assessments/${a.id}`);
    },
  });

  if (!safe) return <EmptyState title={t("projects.notFound")} />;
  if (project.isPending) return <LoadingSkeleton lines={4} />;
  if (project.isError)
    return project.error && (project.error as { status?: number }).status === 404 ? (
      <EmptyState title={t("projects.notFound")} />
    ) : (
      <ErrorState error={project.error} onRetry={() => void project.refetch()} />
    );
  const p = project.data;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nm = projectNameSchema.safeParse(name);
    const built = buildInputs(form);
    const errs = {
      ...built.errors,
      ...(nm.success ? {} : { name: nm.error.issues[0]?.message ?? "validation.required" }),
    };
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    save.mutate({ name: name.trim(), status, inputs: built.inputs });
  };

  return (
    <>
      <PageHeader title={p.name}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={run.isPending} onClick={() => run.mutate()}>
            {t("projects.runAssessment")}
          </button>
          <Link className={btn} to={`/ask?project=${encodeURIComponent(p.id)}`}>
            {t("projects.askAbout")}
          </Link>
        </div>
      </PageHeader>
      {run.isError ? <ErrorState error={run.error} /> : null}
      <form onSubmit={submit} className={`${card} space-y-3`} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pd-name" className={labelCls}>
              {t("projects.name")}
            </label>
            <input
              id="pd-name"
              className={input}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name ? <p className="mt-1 text-sm text-danger">{t(errors.name)}</p> : null}
          </div>
          <div>
            <label htmlFor="pd-status" className={labelCls}>
              {t("projects.statusLabel")}
            </label>
            <select
              id="pd-status"
              className={input}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              {(["draft", "active", "archived"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`projects.status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <InfoBox tone="muted">{t("projects.upsertNote")}</InfoBox>
        <PlotInputsForm
          idPrefix="pd"
          value={form}
          onChange={setForm}
          errors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, t(v)]))}
        />
        {save.isError ? <ErrorState error={save.error} /> : null}
        {save.isSuccess ? (
          <p role="status" className="text-sm text-verified">
            {t("projects.saved")}
          </p>
        ) : null}
        <button type="submit" className={btnPrimary} disabled={save.isPending}>
          {t("projects.save")}
        </button>
      </form>
      <section className="mt-4" aria-label={t("projects.inputDetails")}>
        <h2 className="mb-2 font-semibold">{t("projects.inputDetails")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-1">{t("facts.name")}</th>
                <th className="p-1">{t("facts.value")}</th>
                <th className="p-1">{t("facts.sourceCol")}</th>
                <th className="p-1">{t("facts.validation")}</th>
              </tr>
            </thead>
            <tbody>
              {p.input_details.map((d) => (
                <tr key={d.name} className="border-t border-line">
                  <td className="p-1">{d.name}</td>
                  <td className="p-1 tabular">
                    {d.value} {d.unit ?? ""}
                  </td>
                  <td className="p-1">{d.input_source}</td>
                  <td className="p-1">
                    {t(`status.verification.${d.verification_status}`, {
                      defaultValue: d.verification_status,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-4" aria-label={t("projects.history")}>
        <h2 className="mb-2 font-semibold">{t("projects.history")}</h2>
        {history.isPending ? <LoadingSkeleton lines={2} /> : null}
        {history.isError ? <ErrorState error={history.error} onRetry={() => void history.refetch()} /> : null}
        {history.data && history.data.items.length === 0 ? (
          <EmptyState title={t("projects.noAssessments")} />
        ) : null}
        <ul className="space-y-2">
          {history.data?.items.map((a) => (
            <li key={a.id} className={card}>
              <div className="flex flex-wrap items-center gap-2">
                <Link className={btnLink} to={`/assessments/${a.id}`}>
                  {formatDateTime(a.created_at, i18n.language)}
                </Link>
                <OverallStatusBadge status={a.overall_status} />
              </div>
              <p className="mt-1 text-sm">{a.summary}</p>
            </li>
          ))}
        </ul>
        {history.data ? (
          <Pagination
            total={history.data.total}
            limit={history.data.limit}
            offset={history.data.offset}
            onChange={setOffset}
          />
        ) : null}
      </section>
    </>
  );
}
