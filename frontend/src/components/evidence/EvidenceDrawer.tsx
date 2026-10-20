import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { getEvidence } from "@/api/endpoints/evidence";
import { shouldRetryQuery } from "@/api/errors";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/States";
import { pageInfo } from "@/lib/format";
import { ruleHref } from "@/lib/rule-number";
import { btnLink } from "@/lib/ui";
import { EvidenceCard } from "./EvidenceCard";
import { EvidenceDrawerContext } from "./EvidenceDrawerContext";

function DrawerBody({ evidenceId }: { evidenceId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["evidence", evidenceId],
    queryFn: ({ signal }) => getEvidence(evidenceId, signal),
    retry: shouldRetryQuery,
  });
  if (q.isPending) return <LoadingSkeleton lines={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data;
  const pg = pageInfo(e);
  return (
    <div className="space-y-4">
      <EvidenceCard evidence={e} />
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">{t("evidence.documentId")}</dt>
        <dd className="break-all font-mono text-xs">{e.source_document_id}</dd>
        <dt className="text-ink-soft">{t("evidence.versionId")}</dt>
        <dd className="break-all font-mono text-xs">{e.rule_version_id}</dd>
        <dt className="text-ink-soft">{t("evidence.pages")}</dt>
        <dd className="tabular">{pg.pages ?? "—"}</dd>
      </dl>
      <p className="text-sm text-ink-soft">
        {pg.pages ? t("evidence.openPdfAt", { pages: pg.pages }) : t("evidence.openPdf")}
      </p>
      <div className="flex flex-wrap gap-4">
        <Link className={btnLink} to={ruleHref(e.rule_number)}>
          {t("evidence.openRule")}
        </Link>
        <Link className={btnLink} to="/sources">
          {t("evidence.sourceDocuments")}
        </Link>
      </div>
    </div>
  );
}

/** Right drawer on desktop, bottom sheet on mobile. Always resolves via GET /evidence/{id}. */
export function EvidenceDrawerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const open = useCallback((id: string) => setEvidenceId(id), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <EvidenceDrawerContext.Provider value={api}>
      {children}
      <Dialog.Root open={evidenceId !== null} onOpenChange={(o) => !o && setEvidenceId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 print:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-lg bg-surface-page p-4 shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[520px] md:rounded-none print:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold">{t("evidence.drawerTitle")}</Dialog.Title>
              <Dialog.Close
                className="inline-flex min-h-tap min-w-tap items-center justify-center rounded hover:bg-surface-sunken"
                aria-label={t("common.close")}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </Dialog.Close>
            </div>
            {evidenceId ? <DrawerBody evidenceId={evidenceId} /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </EvidenceDrawerContext.Provider>
  );
}
