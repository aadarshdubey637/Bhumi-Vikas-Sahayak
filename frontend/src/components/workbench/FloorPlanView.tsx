import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { layoutFloor, roomArea } from "@/lib/floorplan";
import type { HouseModel } from "@/lib/house";
import { fmtNum } from "@/lib/workbench";

const W = 720;
const H = 460;
const FILL: Record<string, string> = { living: "#f2d9a8", dining: "#e9c9a0", kitchen: "#bfe0c8", bedroom: "#c8d8f4", toilet: "#b8e3ea", stair: "#d9d0e8", passage: "#ececec", lounge: "#f0cfd8", shop: "#f6d49a", store: "#d8d2c4", hall: "#ecd6ac", office: "#cfe0d4", workshop: "#d6d6d0", classroom: "#d4e4c4" };

/** Illustrative room layout of one floor of the generated building. Clearly labelled: it is not a design and sizes are not rule-checked. */
export function FloorPlanView({ model, floor }: { model: HouseModel; floor: number }) {
  const { t } = useTranslation();
  const { fp, wallT } = model;
  const iw = fp.w - 2 * wallT;
  const id = fp.d - 2 * wallT;
  const rooms = useMemo(() => layoutFloor(iw, id, floor, model.floors, model.archetype), [iw, id, floor, model.floors, model.archetype]);
  const ml = 60;
  const mt = 44;
  const mb = 40;
  const mr = 24;
  const s = Math.min((W - ml - mr) / fp.w, (H - mt - mb) / fp.d);
  const ox = ml + (W - ml - mr - fp.w * s) / 2;
  const oy = mt + (H - mt - mb - fp.d * s) / 2;
  const X = (x: number) => ox + x * s;
  const Yb = (y: number) => oy + (fp.d - y) * s;
  const ops = model.openings.filter((o) => o.floor === floor);
  const label = floor === 0 ? t("wb.floor.ground") : t("wb.floor.nth", { n: floor });
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("wb.fp.summary", { floor: label, w: fmtNum(fp.w), d: fmtNum(fp.d), n: rooms.length })} className="block h-auto w-full bg-gradient-to-b from-surface to-surface-sunken" style={{ maxHeight: "62vh" }}>
        <rect x={X(0)} y={Yb(fp.d)} width={fp.w * s} height={fp.d * s} fill="#fff" stroke="#1C1F26" strokeWidth={4} />
        {rooms.map((r) => {
          const rx = X(wallT + r.x);
          const ry = Yb(wallT + r.y + r.d);
          const rw = r.w * s;
          const rh = r.d * s;
          const big = rw > 62 && rh > 34;
          return (
            <g key={r.id}>
              <rect x={rx} y={ry} width={rw} height={rh} fill={FILL[r.kind] ?? "#ddd"} stroke="#1C1F26" strokeWidth={1.4} />
              {r.kind === "stair" ? Array.from({ length: Math.max(3, Math.floor(rh / 9)) }, (_, i) => <line key={i} x1={rx + 3} x2={rx + rw - 3} y1={ry + 5 + i * 9} y2={ry + 5 + i * 9} stroke="#6b5b95" strokeWidth={1} />) : null}
              {big ? (
                <text x={rx + rw / 2} y={ry + rh / 2 - 2} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0F1B2D" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                  {t(`wb.room.${r.kind}`)}
                  <tspan x={rx + rw / 2} dy={15} fontSize={11} fontWeight={500}>
                    {fmtNum(r.w, 1)} × {fmtNum(r.d, 1)} m
                  </tspan>
                </text>
              ) : (
                <title>{`${t(`wb.room.${r.kind}`)} ${fmtNum(r.w, 1)} × ${fmtNum(r.d, 1)} m (${fmtNum(roomArea(r), 1)} m²)`}</title>
              )}
            </g>
          );
        })}
        {ops.map((o) => {
          const horizontal = o.side === "front" || o.side === "rear";
          const at = o.at;
          const x = horizontal ? X(at) : o.side === "left" ? X(0) : X(fp.w);
          const y = horizontal ? (o.side === "front" ? Yb(0) : Yb(fp.d)) : Yb(at);
          const half = (o.w * s) / 2;
          const col = o.kind === "door" || o.kind === "balconyDoor" ? "#8B5A2B" : o.kind === "rollup" ? "#7a8794" : "#2a8fd0";
          return horizontal ? <line key={o.id} x1={x - half} x2={x + half} y1={y} y2={y} stroke={col} strokeWidth={6} strokeLinecap="butt" /> : <line key={o.id} x1={x} x2={x} y1={y - half} y2={y + half} stroke={col} strokeWidth={6} strokeLinecap="butt" />;
        })}
        {/* overall dimensions */}
        <g stroke="#3B4A5E" strokeWidth={1.2} fill="none">
          <line x1={X(0)} x2={X(fp.w)} y1={oy - 16} y2={oy - 16} />
          <line x1={X(0)} x2={X(0)} y1={oy - 21} y2={oy - 11} />
          <line x1={X(fp.w)} x2={X(fp.w)} y1={oy - 21} y2={oy - 11} />
          <line x1={X(0) - 18} x2={X(0) - 18} y1={Yb(fp.d)} y2={Yb(0)} />
          <line x1={X(0) - 23} x2={X(0) - 13} y1={Yb(fp.d)} y2={Yb(fp.d)} />
          <line x1={X(0) - 23} x2={X(0) - 13} y1={Yb(0)} y2={Yb(0)} />
        </g>
        <text x={X(fp.w / 2)} y={oy - 21} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0F1B2D" stroke="#fff" strokeWidth={3} paintOrder="stroke">
          {fmtNum(fp.w)} m
        </text>
        <text x={X(0) - 24} y={Yb(fp.d / 2)} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0F1B2D" stroke="#fff" strokeWidth={3} paintOrder="stroke" transform={`rotate(-90 ${X(0) - 24} ${Yb(fp.d / 2)})`}>
          {fmtNum(fp.d)} m
        </text>
        <text x={X(fp.w / 2)} y={Yb(0) + 26} textAnchor="middle" fontSize={12} fontWeight={600} fill="#3B4A5E">
          ▼ {t("wb.fp.road")}
        </text>
      </svg>
      <figcaption className="border-t border-line px-3 py-2 text-xs text-ink-soft">
        <strong className="font-semibold text-ink">{label}</strong> · {t("wb.fp.disclaimer")}
      </figcaption>
    </figure>
  );
}
