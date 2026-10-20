import { createContext, useContext } from "react";

export interface EvidenceDrawerApi {
  open: (evidenceId: string) => void;
}
export const EvidenceDrawerContext = createContext<EvidenceDrawerApi>({ open: () => undefined });
export const useEvidenceDrawer = (): EvidenceDrawerApi => useContext(EvidenceDrawerContext);
