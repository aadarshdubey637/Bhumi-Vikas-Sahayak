import { Edges, Grid, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { DoubleSide, MeshStandardMaterial, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { layoutFloor, type Room } from "@/lib/floorplan";
import { buildHouse, type HouseModel, type HouseParams } from "@/lib/house";

export type PresetName = "perspective" | "front" | "rear" | "left" | "right" | "top" | "inspect";
export interface SceneProps {
  plotW: number;
  plotD: number;
  roadW?: number;
  /** null until a footprint is known: only the site is drawn */
  house: HouseParams | null;
  /** "all" or the zero-based floor to inspect (floors above it are cut away) */
  floorView: "all" | number;
  show: { measures: boolean; zones: boolean };
  guides: { frontMin?: number; rearMin?: number; frontRule?: string; rearRule?: string };
  flags: { front: boolean; rear: boolean; outside: boolean };
  preset: { name: PresetName; nonce: number };
  tt: (key: string, params?: Record<string, string | number>) => string;
  /** draw the two neighbouring plots beside this one (same street, same depth), each with a modest house volume */
  neighbours?: boolean;
}

const fmt = (n: number): string => `${Number(n.toFixed(2))} m`;
const INK = "#0f172a";
const ROOM_COLOR: Record<string, string> = { living: "#f2d9a8", dining: "#e9c9a0", kitchen: "#bfe0c8", bedroom: "#c8d8f4", toilet: "#b8e3ea", stair: "#d9d0e8", passage: "#e6e6e6", lounge: "#f0cfd8", shop: "#f6d49a", store: "#d8d2c4", hall: "#ecd6ac", office: "#cfe0d4", workshop: "#d6d6d0", classroom: "#d4e4c4" };

type Tone = "plain" | "ok" | "bad" | "need";
const TONE: Record<Tone, string> = { plain: "border-slate-200 text-slate-900", ok: "border-blue-300 text-blue-700", bad: "border-rose-300 text-rose-600", need: "border-amber-300 text-amber-800" };
/** White pill label that floats in the scene (plot sides, street, setbacks, proposed building). */
function Pill({ position, children, tone = "plain" }: { position: [number, number, number]; children: ReactNode; tone?: Tone }) {
  return (
    <Html position={position} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
      <div className={`whitespace-nowrap rounded-lg border bg-white px-2.5 py-1 text-[0.8125rem] font-semibold leading-tight shadow-md ${TONE[tone]}`}>{children}</div>
    </Html>
  );
}

/** A flat coloured strip on the plot: the open space a rule asks for (blue = met, red = below the minimum, amber = not judged). */
function Strip({ x, z, w, d, tone }: { x: number; z: number; w: number; d: number; tone: Exclude<Tone, "plain"> }) {
  const fill = { ok: "#c5d4f4", bad: "#f4c3cd", need: "#f1e4ad" }[tone];
  const edge = { ok: "#3b6fe0", bad: "#d63a5a", need: "#c9a227" }[tone];
  const y = 0.1;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x + w / 2, y, z + d / 2]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={fill} transparent opacity={0.92} depthWrite={false} />
      </mesh>
      <Line points={[[x, y + 0.01, z], [x + w, y + 0.01, z], [x + w, y + 0.01, z + d], [x, y + 0.01, z + d], [x, y + 0.01, z]]} color={edge} lineWidth={1} />
    </group>
  );
}

function RoomsOverlay({ m, floor, tt }: { m: HouseModel; floor: number; tt: SceneProps["tt"] }) {
  const { fp, wallT: T } = m;
  const w = fp.w - 2 * T;
  const d = fp.d - 2 * T;
  const rooms = useMemo(() => layoutFloor(w, d, floor, m.floors, m.archetype), [w, d, floor, m.floors, m.archetype]);
  const y = m.floorBase[floor]! + 0.03;
  const ox = fp.x0 + T;
  const oz = fp.z0 + T;
  const edges = useMemo(() => {
    const seen = new Map<string, [number, number, number, number]>();
    const key = (a: number, b: number, c: number, e: number) => [a, b, c, e].map((v) => v.toFixed(2)).join("|");
    for (const r of rooms) {
      const segs: Array<[number, number, number, number]> = [
        [r.x, r.y, r.x + r.w, r.y],
        [r.x, r.y + r.d, r.x + r.w, r.y + r.d],
        [r.x, r.y, r.x, r.y + r.d],
        [r.x + r.w, r.y, r.x + r.w, r.y + r.d],
      ];
      for (const s of segs) {
        const onOuter = (s[0] <= 0.01 && s[2] <= 0.01) || (s[0] >= w - 0.01 && s[2] >= w - 0.01) || (s[1] <= 0.01 && s[3] <= 0.01) || (s[1] >= d - 0.01 && s[3] >= d - 0.01);
        if (!onOuter) seen.set(key(...s), s);
      }
    }
    return [...seen.values()];
  }, [rooms, w, d]);
  const mat = useMemo(() => new MeshStandardMaterial({ color: "#f8f4ea", roughness: 0.9 }), []);
  return (
    <group>
      {rooms.map((r: Room) => (
        <mesh key={r.id} rotation={[-Math.PI / 2, 0, 0]} position={[ox + r.x + r.w / 2, y, oz + r.y + r.d / 2]}>
          <planeGeometry args={[r.w - 0.04, r.d - 0.04]} />
          <meshStandardMaterial color={ROOM_COLOR[r.kind] ?? "#ddd"} roughness={0.85} />
        </mesh>
      ))}
      {edges.map((s, i) => {
        const horizontal = Math.abs(s[1] - s[3]) < 0.01;
        const len = horizontal ? s[2] - s[0] : s[3] - s[1];
        return (
          <mesh key={i} material={mat} position={[ox + (s[0] + s[2]) / 2, y + 1.1, oz + (s[1] + s[3]) / 2]}>
            <boxGeometry args={horizontal ? [len, 2.2, 0.1] : [0.1, 2.2, len]} />
          </mesh>
        );
      })}
      {rooms.map((r: Room) => (
        <Html key={`l${r.id}`} position={[ox + r.x + r.w / 2, y + 0.2, oz + r.y + r.d / 2]} center distanceFactor={11} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-white/85 px-1.5 py-0.5 text-center text-[0.75rem] font-semibold leading-tight text-slate-800 shadow">
            {tt(`wb.room.${r.kind}`)}
            <br />
            <span className="font-normal text-slate-600">
              {Number(r.w.toFixed(1))} × {Number(r.d.toFixed(1))} m
            </span>
          </div>
        </Html>
      ))}
    </group>
  );
}

const FOV = 38;
/** Camera distance that keeps a sphere of radius `r` fully in view for a canvas of the given aspect ratio. */
function fitDistance(r: number, aspect: number): number {
  const v = (FOV * Math.PI) / 180;
  const half = Math.min(v, 2 * Math.atan(Math.tan(v / 2) * aspect)) / 2;
  return (r / Math.sin(half)) * 1.08;
}

function CameraRig({ preset, cx, cz, R, h, fit, focus }: { preset: SceneProps["preset"]; cx: number; cz: number; R: number; h: number; fit: number; focus: { x: number; z: number; r: number } | null }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate, size } = useThree();
  const goal = useRef<{ pos: Vector3; tgt: Vector3 } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const tgt = new Vector3(cx, Math.max(h * 0.3, 0.5), cz);
    const d = R * 1.3;
    const pos: Record<string, Vector3> = {
      // fit the whole scene in view whatever the canvas shape: distance from the bounding sphere and the narrower of the two view angles
      perspective: tgt.clone().addScaledVector(new Vector3(-0.55, 0.7, -0.85).normalize(), fitDistance(fit, size.width / Math.max(size.height, 1))),
      front: new Vector3(cx, h * 0.5 + 2, cz - d * 1.5),
      rear: new Vector3(cx, h * 0.5 + 2, cz + d * 1.6),
      left: new Vector3(cx - d * 1.5, h * 0.5 + 2, cz),
      right: new Vector3(cx + d * 1.5, h * 0.5 + 2, cz),
      top: new Vector3(cx, d * 2.1 + h, cz + 0.01),
      inspect: focus ? new Vector3(focus.x - focus.r * 0.3, focus.r * 1.7, focus.z - focus.r * 1.0) : new Vector3(cx - d * 0.3, d * 1.0, cz - d * 0.6),
    };
    if (preset.name === "inspect" && focus) tgt.set(focus.x, 0.6, focus.z);
    const g = { pos: pos[preset.name]!, tgt };
    if (first.current) {
      first.current = false;
      camera.position.copy(g.pos);
      controls.current?.target.copy(g.tgt);
      controls.current?.update();
      invalidate();
    } else {
      goal.current = g;
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new preset is requested
  }, [preset.nonce]);
  useFrame((_, dt) => {
    const g = goal.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 7);
    camera.position.lerp(g.pos, k);
    controls.current?.target.lerp(g.tgt, k);
    controls.current?.update();
    if (camera.position.distanceTo(g.pos) < 0.02) goal.current = null;
    else invalidate();
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.09} maxPolarAngle={Math.PI / 2 - 0.015} minDistance={4} maxDistance={R * 7} screenSpacePanning />;
}

// ---------------------------------------------------------------------------------------------------------------------------------
/** Clean "rule-to-geometry" scene: white grid floor, light plot slab, dark street, and a see-through glass volume for the building. */
function World(p: SceneProps) {
  const { plotW: W, plotD: D, tt } = p;
  const roadW = p.roadW ?? Math.max(D * 0.14, 6);
  const m = useMemo(() => (p.house ? buildHouse(p.house) : null), [p.house]);
  const cx = W / 2;
  const cz = D / 2;
  const view = p.floorView;
  const maxFloor = m ? (view === "all" ? m.floors - 1 : Math.min(view, m.floors - 1)) : 0;
  const boxH = m ? (view === "all" ? m.totalH : m.slabTop[maxFloor]!) : 0;
  const H = m ? m.totalH : 4;
  const R = Math.max(p.neighbours ? W * 3 + 1.6 : W, D, H * 1.4); // frame the neighbouring plots too when they are drawn
  const bad = p.flags.front || p.flags.rear || p.flags.outside;
  const roadZ = -roadW / 2 - 0.6;
  const roadLen = W + 60;
  const dashes = Array.from({ length: Math.floor(roadLen / 3.2) }, (_, i) => cx - roadLen / 2 + 1.6 + i * 3.2);
  const slab = 0.08;
  const outline: Array<[number, number, number]> = [
    [0, slab + 0.01, 0],
    [W, slab + 0.01, 0],
    [W, slab + 0.01, D],
    [0, slab + 0.01, D],
    [0, slab + 0.01, 0],
  ];

  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[cx + R, R * 1.4, cz - R]} intensity={1.1} />
      <CameraRig preset={p.preset} cx={cx} cz={cz} R={R} h={H} fit={0.5 * Math.sqrt((p.neighbours ? W * 3 + 1.6 : W) ** 2 + D * D + H * H)} focus={m ? { x: m.fp.x0 + m.fp.w / 2, z: m.fp.z0 + m.fp.d / 2, r: Math.max(m.fp.w, m.fp.d) * 1.1 + 3 } : null} />

      <Grid position={[cx, -0.02, cz]} args={[10, 10]} cellSize={2} cellThickness={0.7} cellColor="#d7dce3" sectionSize={10} sectionThickness={1} sectionColor="#c6ccd6" fadeDistance={R * 6} fadeStrength={1.6} infiniteGrid />

      {/* street */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, roadZ]}>
        <planeGeometry args={[roadLen, roadW]} />
        <meshBasicMaterial color="#141a2e" />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, roadZ]}>
          <planeGeometry args={[1.8, 0.14]} />
          <meshBasicMaterial color="#e8ebf2" />
        </mesh>
      ))}

      {/* plot slab with a black boundary, heavier on the road side and the left side */}
      <mesh position={[cx, slab / 2, cz]}>
        <boxGeometry args={[W, slab, D]} />
        <meshStandardMaterial color="#e6e8ec" roughness={1} />
      </mesh>
      <Line points={outline} color={INK} lineWidth={1.4} />
      <Line points={[[0, slab + 0.02, D], [0, slab + 0.02, 0], [W, slab + 0.02, 0]]} color={INK} lineWidth={3.2} />

      {/* neighbouring plots: same street frontage and depth, each with a modest house volume set back like the main plot */}
      {p.neighbours
        ? [-1, 1].map((side) => {
            const x0 = side < 0 ? -W - 0.8 : W + 0.8;
            const nx = x0 + W / 2;
            const bw = W * 0.64;
            const bd = D * 0.5;
            const bh = Math.max(H * 0.85, 3.2);
            const bz = D * 0.27 + bd / 2;
            return (
              <group key={side}>
                <mesh position={[nx, slab / 2, cz]}>
                  <boxGeometry args={[W, slab, D]} />
                  <meshStandardMaterial color="#eef0f3" roughness={1} />
                </mesh>
                <Line points={[[x0, slab + 0.01, 0], [x0 + W, slab + 0.01, 0], [x0 + W, slab + 0.01, D], [x0, slab + 0.01, D], [x0, slab + 0.01, 0]]} color="#94a3b8" lineWidth={1.2} />
                <mesh position={[nx, slab + bh / 2, bz]}>
                  <boxGeometry args={[bw, bh, bd]} />
                  <meshStandardMaterial color="#e7ebf1" transparent opacity={0.45} side={DoubleSide} depthWrite={false} roughness={0.3} />
                  <Edges color="#94a3b8" lineWidth={1} />
                </mesh>
              </group>
            );
          })
        : null}

      {/* rule-derived open spaces (only after a compliance evaluation, and only what the rule text stated) */}
      {p.show.zones && p.guides.frontMin ? <Strip x={0} z={0} w={W} d={p.guides.frontMin} tone={p.flags.front ? "bad" : "ok"} /> : null}
      {p.show.zones && p.guides.rearMin ? <Strip x={0} z={D - p.guides.rearMin} w={W} d={p.guides.rearMin} tone={p.flags.rear ? "bad" : "ok"} /> : null}
      {p.show.zones && m && (p.guides.frontMin || p.guides.rearMin) ? (
        <>
          {m.fp.x0 > 0.05 ? <Strip x={0} z={m.fp.z0} w={m.fp.x0} d={m.fp.d} tone="need" /> : null}
          {W - m.fp.x0 - m.fp.w > 0.05 ? <Strip x={m.fp.x0 + m.fp.w} z={m.fp.z0} w={W - m.fp.x0 - m.fp.w} d={m.fp.d} tone="need" /> : null}
        </>
      ) : null}

      {/* the building: a see-through glass volume with a floor line per storey */}
      {m ? (
        <group>
          <mesh position={[m.fp.x0 + m.fp.w / 2, slab + boxH / 2, m.fp.z0 + m.fp.d / 2]}>
            <boxGeometry args={[m.fp.w, boxH, m.fp.d]} />
            <meshStandardMaterial color="#dfe5ee" transparent opacity={0.22} side={DoubleSide} depthWrite={false} roughness={0.2} />
            <Edges color={bad ? "#d12a2a" : "#475569"} lineWidth={1.4} />
          </mesh>
          {Array.from({ length: Math.max(0, maxFloor) }, (_, f) => {
            const y = slab + m.slabTop[f]!;
            return (
              <Line
                key={f}
                points={[
                  [m.fp.x0, y, m.fp.z0],
                  [m.fp.x0 + m.fp.w, y, m.fp.z0],
                  [m.fp.x0 + m.fp.w, y, m.fp.z0 + m.fp.d],
                  [m.fp.x0, y, m.fp.z0 + m.fp.d],
                  [m.fp.x0, y, m.fp.z0],
                ]}
                color="#94a3b8"
                lineWidth={1}
              />
            );
          })}
          {view !== "all" ? (
            <group position={[0, slab, 0]}>
              <RoomsOverlay m={m} floor={Math.min(view, m.floors - 1)} tt={tt} />
            </group>
          ) : null}
          {p.show.measures && view === "all" ? <Pill position={[m.fp.x0 + m.fp.w / 2, slab + boxH + 0.9, m.fp.z0 + m.fp.d / 2]}>{tt("wb.cv.proposed", { h: fmt(m.totalH) })}</Pill> : null}
        </group>
      ) : null}

      {/* measurements */}
      {p.show.measures ? (
        <group>
          <Pill position={[cx, 0.35, 0]}>{fmt(W)}</Pill>
          <Pill position={[0, 0.35, cz]}>{fmt(D)}</Pill>
          <Pill position={[cx - W * 0.35, 0.4, roadZ]}>{p.roadW ? tt("wb.cv.street", { w: fmt(p.roadW) }) : tt("wb.cv.roadUnknown")}</Pill>
          {m && p.guides.frontMin ? (
            <Pill position={[cx + W * 0.2, 0.5, p.guides.frontMin / 2]} tone={p.flags.front ? "bad" : "ok"}>
              {fmt(p.guides.frontMin)}{p.guides.frontRule ? ` · R${p.guides.frontRule}` : ""}
            </Pill>
          ) : null}
          {m && p.guides.rearMin ? (
            <Pill position={[cx - W * 0.2, 0.5, D - p.guides.rearMin / 2]} tone={p.flags.rear ? "bad" : "ok"}>
              {fmt(p.guides.rearMin)}{p.guides.rearRule ? ` · R${p.guides.rearRule}` : ""}
            </Pill>
          ) : null}
          {m && p.show.zones && (p.guides.frontMin || p.guides.rearMin) && m.fp.x0 > 0.05 ? (
            <Pill position={[m.fp.x0 / 2, 0.5, m.fp.z0 + m.fp.d / 2]} tone="need">
              {fmt(m.fp.x0)} · R56(3)
            </Pill>
          ) : null}
          {m && p.show.zones && (p.guides.frontMin || p.guides.rearMin) && W - m.fp.x0 - m.fp.w > 0.05 ? (
            <Pill position={[m.fp.x0 + m.fp.w + (W - m.fp.x0 - m.fp.w) / 2, 0.5, m.fp.z0 + m.fp.d / 2]} tone="need">
              {fmt(W - m.fp.x0 - m.fp.w)} · R56(3)
            </Pill>
          ) : null}
        </group>
      ) : null}
    </>
  );
}

export default function HouseScene(p: SceneProps) {
  return (
    <Canvas dpr={[1, 1.75]} frameloop="demand" gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ fov: FOV, near: 0.1, far: 6000, position: [0, 20, -30] }} style={{ touchAction: "none", background: "#ffffff" }}>
      <World {...p} />
    </Canvas>
  );
}
