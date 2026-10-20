import { fmtNum, type Metrics } from "./workbench";

export interface Suggestion {
  key: string;
  params?: Record<string, string | number>;
}

/** Questions worth asking next, built from what the user has typed so far (so the chips change as the inputs change). */
export function suggestQuestions(m: Metrics): Suggestion[] {
  const out: Suggestion[] = [];
  const area = m.plotAreaSqm;
  if (m.floors && m.floors > 1 && m.plotW && m.plotD) out.push({ key: "wb.sg.floors", params: { floors: m.floors, w: fmtNum(m.plotW, 1), d: fmtNum(m.plotD, 1) } });
  if (m.roadW) out.push({ key: "wb.sg.front", params: { road: fmtNum(m.roadW, 1) } });
  if (area) {
    out.push({ key: "wb.sg.far", params: { area: fmtNum(area, 1) } });
    out.push({ key: "wb.sg.rear", params: { area: fmtNum(area, 1) } });
  }
  if (m.builtUpSqm) out.push({ key: "wb.sg.fee", params: { built: fmtNum(m.builtUpSqm, 1) } });
  return out.slice(0, 4);
}
