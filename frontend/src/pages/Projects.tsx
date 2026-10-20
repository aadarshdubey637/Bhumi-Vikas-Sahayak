import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, FolderKanban, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { createProject, listProjects } from "@/api/endpoints/projects";
import { buildInputs, emptyPlotForm, projectNameSchema } from "@/api/schemas";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { LoadingSkeleton } from "@/components/common/States";
import { useToast } from "@/components/common/toastContext";
import { PlotInputsForm } from "@/components/forms/PlotInputsForm";
import { MiniPlot } from "@/components/brand/Illustrations";
import { formatDateTime, formatValue } from "@/lib/format";
import { btn, btnPrimary, card, input, label as labelCls } from "@/lib/ui";

const LIMIT = 20;
const STATUS_TONE: Record<string, string> = {
  active: "border-info-line bg-info-tint text-info",
  draft: "border-pending-line bg-pending-tint text-pending",
  archived: "border-muted-line bg-muted-tint text-muted",
};

export default function Projects() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [form, setForm] = useState(emptyPlotForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ["projects", { limit: LIMIT, offset }],
    queryFn: ({ signal }) => listProjects({ limit: LIMIT, offset }, signal),
  });
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("toast.projectCreated"));
      navigate(`/projects/${p.id}`);
    },
  });
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
    const use = typeof built.inputs.building_use === "string" ? built.inputs.building_use : undefined;
    create.mutate({ name: name.trim(), building_use: use, inputs: built.inputs });
  };
  const items = (list.data?.items ?? []).filter((p) => showArchived || p.status !== "archived");

  return (
    <>
      <PageHeader title={t("projects.title")} description={t("projx.description")} icon={FolderKanban}>
        <button type="button" className={btnPrimary} aria-expanded={creating} onClick={() => setCreating((c) => !c)}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("projects.new")}
        </button>
      </PageHeader>

      {creating ? (
        <form onSubmit={submit} className={`${card} mb-5 space-y-4 motion-safe:animate-fade-up`} noValidate aria-label={t("projects.new")}>
          <div>
            <label htmlFor="pj-name" className={labelCls}>
              {t("projects.name")}
            </label>
            <input
              id="pj-name"
              className={input}
              value={name}
              maxLength={200}
              placeholder={t("projx.namePlaceholder")}
              aria-invalid={!!errors.name}
              aria-describedby="pj-name-hint"
              onChange={(e) => setName(e.target.value)}
            />
            <p id="pj-name-hint" className="mt-1.5 text-xs text-ink-faint">
              {t("projx.nameHint")}
            </p>
            {errors.name ? <p className="mt-1 text-sm text-danger">{t(errors.name)}</p> : null}
          </div>
          <PlotInputsForm
            idPrefix="pj"
            value={form}
            onChange={setForm}
            errors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, t(v)]))}
          />
          {create.isError ? <ErrorState error={create.error} /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={create.isPending}>
              {create.isPending ? t("common.sending") : t("projects.create")}
            </button>
            <button type="button" className={btn} onClick={() => setCreating(false)}>
              {t("common.close")}
            </button>
          </div>
        </form>
      ) : null}

      <label className="glass mb-4 inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-full px-4 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-brand" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        {t("projects.showArchived")}
      </label>

      {list.isPending ? <LoadingSkeleton lines={4} /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data && items.length === 0 ? (
        <div className={`${card} flex flex-col items-center gap-3 py-12 text-center`}>
          <MiniPlot className="h-24 w-40" />
          <p className="text-lg font-semibold">{t("projects.empty")}</p>
          <p className="max-w-md text-sm text-ink-soft">{t("projx.emptyBody")}</p>
          <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("projects.new")}
          </button>
        </div>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => {
          const facts = Object.entries(p.inputs).slice(0, 4);
          return (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="glass group flex h-full flex-col rounded-2xl p-4 motion-safe:transition-[box-shadow,transform] hover:shadow-lift motion-safe:hover:-translate-y-0.5"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-base font-semibold text-ink group-hover:text-brand">{p.name}</span>
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint group-hover:text-brand" />
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[p.status] ?? STATUS_TONE.active}`}>
                    {t(`projects.status.${p.status}`, { defaultValue: p.status })}
                  </span>
                  {p.building_use ? <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs capitalize">{p.building_use}</span> : null}
                </span>
                {facts.length > 0 ? (
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {facts.map(([k, v]) => (
                      <span key={k} className="rounded-lg bg-white/70 px-2 py-1 text-xs tabular text-ink-soft ring-1 ring-line">
                        {`${k}: ${formatValue(v)}`}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="mt-auto pt-3 text-xs text-ink-faint tabular">{formatDateTime(p.updated_at, i18n.language)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.data ? <Pagination total={list.data.total} limit={list.data.limit} offset={list.data.offset} onChange={setOffset} /> : null}
    </>
  );
}
