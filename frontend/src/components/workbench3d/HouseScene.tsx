import { Html, Line, OrbitControls, Sky, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Path,
  ACESFilmicToneMapping,
  ClampToEdgeWrapping,
  SRGBColorSpace,
  Shape,
  Vector3,
  type Group,
  type Texture,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { AnimController } from "@/lib/anim";
import { layoutFloor, type Room } from "@/lib/floorplan";
import { buildHouse, phase, SLAB_T, type HouseModel, type HouseParams, type Opening } from "@/lib/house";
import { makeTextures } from "./textures";

export type PresetName = "perspective" | "front" | "rear" | "left" | "right" | "top" | "inspect";
export interface SceneProps {
  plotW: number;
  plotD: number;
  roadW?: number;
  /** null until a footprint is known: only the site is drawn */
  house: HouseParams | null;
  ctrl: AnimController;
  /** "all" or the zero-based floor to inspect (floors above it are cut away) */
  floorView: "all" | number;
  show: { measures: boolean; context: boolean; zones: boolean };
  guides: { frontMin?: number; rearMin?: number };
  flags: { front: boolean; rear: boolean; outside: boolean };
  preset: { name: PresetName; nonce: number };
  tt: (key: string, params?: Record<string, string | number>) => string;
}

const fmt = (n: number): string => `${Number(n.toFixed(2))} m`;
const WALL_TINT: Record<string, string> = { house_pitched: "#ffffff", house_flat: "#fff4e2", commercial: "#cfdcee", industrial: "#d9d9d0", institutional: "#f6cfae" };
const ROOM_COLOR: Record<string, string> = { living: "#f2d9a8", dining: "#e9c9a0", kitchen: "#bfe0c8", bedroom: "#c8d8f4", toilet: "#b8e3ea", stair: "#d9d0e8", passage: "#e6e6e6", lounge: "#f0cfd8", shop: "#f6d49a", store: "#d8d2c4", hall: "#ecd6ac", office: "#cfe0d4", workshop: "#d6d6d0", classroom: "#d4e4c4" };

/** Group whose scale / position follows the construction clock without re-rendering React. */
function Anim({ ctrl, start, end, mode = "rise", y = 0, drop = 6, children }: { ctrl: AnimController; start: number; end: number; mode?: "rise" | "pop" | "drop" | "fade"; y?: number; drop?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const apply = () => {
    const g = ref.current;
    if (!g) return;
    const p = phase(ctrl.progress, start, end);
    g.visible = p > 0.001;
    if (mode === "rise") g.scale.set(1, Math.max(p, 0.001), 1);
    else if (mode === "pop") g.scale.setScalar(Math.max(p, 0.001));
    else if (mode === "drop") g.position.y = y + (1 - p) * drop;
  };
  useFrame(apply);
  useLayoutEffect(apply);
  return (
    <group ref={ref} position={[0, y, 0]}>
      {children}
    </group>
  );
}

function rep(t: Texture, rx: number, ry: number): Texture {
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  return c;
}

// ---------------------------------------------------------------------------------------------------------------------------------
function wallGeometry(len: number, h: number, thick: number, ops: Opening[], local: (o: Opening) => number): ExtrudeGeometry {
  const sh = new Shape();
  const notches = ops.filter((o) => o.sill < 0.02).sort((a, b) => local(a) - local(b));
  sh.moveTo(0, 0);
  for (const o of notches) {
    const x0 = Math.max(0.05, local(o) - o.w / 2);
    const x1 = Math.min(len - 0.05, local(o) + o.w / 2);
    sh.lineTo(x0, 0);
    sh.lineTo(x0, Math.min(o.h, h - 0.2));
    sh.lineTo(x1, Math.min(o.h, h - 0.2));
    sh.lineTo(x1, 0);
  }
  sh.lineTo(len, 0);
  sh.lineTo(len, h);
  sh.lineTo(0, h);
  sh.closePath();
  for (const o of ops.filter((q) => q.sill >= 0.02)) {
    const x0 = Math.max(0.1, local(o) - o.w / 2);
    const x1 = Math.min(len - 0.1, local(o) + o.w / 2);
    const y0 = o.sill;
    const y1 = Math.min(h - 0.15, o.sill + o.h);
    if (x1 - x0 < 0.2 || y1 - y0 < 0.2) continue;
    const hole = new Path();
    hole.moveTo(x0, y0);
    hole.lineTo(x1, y0);
    hole.lineTo(x1, y1);
    hole.lineTo(x0, y1);
    hole.closePath();
    sh.holes.push(hole);
  }
  return new ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
}

function WallSet({ m, floor, mat }: { m: HouseModel; floor: number; mat: MeshStandardMaterial }) {
  const { fp, wallT: T } = m;
  const h = m.floorH - SLAB_T;
  const ops = m.openings.filter((o) => o.floor === floor);
  const sides = useMemo(() => {
    const by = (s: string) => ops.filter((o) => o.side === s);
    return {
      front: wallGeometry(fp.w, h, T, by("front"), (o) => o.at),
      rear: wallGeometry(fp.w, h, T, by("rear"), (o) => o.at),
      left: wallGeometry(fp.d - 2 * T, h, T, by("left"), (o) => o.at - T),
      right: wallGeometry(fp.d - 2 * T, h, T, by("right"), (o) => o.at - T),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry depends on the model values listed
  }, [fp.w, fp.d, h, T, m.openings, floor]);
  useEffect(() => () => Object.values(sides).forEach((g) => g.dispose()), [sides]);
  return (
    <>
      <mesh geometry={sides.front} material={mat} position={[fp.x0, 0, fp.z0]} castShadow receiveShadow />
      <mesh geometry={sides.rear} material={mat} position={[fp.x0, 0, fp.z0 + fp.d - T]} castShadow receiveShadow />
      <mesh geometry={sides.left} material={mat} position={[fp.x0 + T, 0, fp.z0 + T]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
      <mesh geometry={sides.right} material={mat} position={[fp.x0 + fp.w, 0, fp.z0 + T]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
    </>
  );
}

function openingPose(m: HouseModel, o: Opening): { pos: [number, number, number]; rotY: number } {
  const { fp, wallT: T } = m;
  const y = m.floorBase[o.floor]! + o.sill + o.h / 2;
  if (o.side === "front") return { pos: [fp.x0 + o.at, y, fp.z0 + T / 2], rotY: 0 };
  if (o.side === "rear") return { pos: [fp.x0 + o.at, y, fp.z0 + fp.d - T / 2], rotY: 0 };
  if (o.side === "left") return { pos: [fp.x0 + T / 2, y, fp.z0 + o.at], rotY: Math.PI / 2 };
  return { pos: [fp.x0 + fp.w - T / 2, y, fp.z0 + o.at], rotY: Math.PI / 2 };
}

function Openings({ m, ctrl, hiddenAbove, mats }: { m: HouseModel; ctrl: AnimController; hiddenAbove: number; mats: { glass: MeshStandardMaterial; frame: MeshStandardMaterial; door: MeshStandardMaterial; metal: MeshStandardMaterial } }) {
  const st = m.stage("openings");
  return (
    <>
      {m.openings
        .filter((o) => o.floor <= hiddenAbove)
        .map((o) => {
          const { pos, rotY } = openingPose(m, o);
          return (
            <group key={o.id} position={pos} rotation={[0, rotY, 0]}>
              <Anim ctrl={ctrl} start={st.start} end={st.end} mode="pop">
                {o.kind === "door" || o.kind === "balconyDoor" ? (
                  <>
                    <mesh material={mats.frame} position={[0, 0, 0]} castShadow>
                      <boxGeometry args={[o.w + 0.1, o.h + 0.05, 0.05]} />
                    </mesh>
                    <mesh material={o.kind === "door" ? mats.door : mats.glass} position={[0, 0, 0.04]}>
                      <boxGeometry args={[o.w - 0.08, o.h - 0.05, 0.05]} />
                    </mesh>
                  </>
                ) : o.kind === "rollup" ? (
                  <mesh material={mats.metal} castShadow>
                    <boxGeometry args={[o.w, o.h, 0.08]} />
                  </mesh>
                ) : (
                  <>
                    <mesh material={mats.frame} castShadow>
                      <boxGeometry args={[o.w + 0.1, o.h + 0.1, 0.05]} />
                    </mesh>
                    <mesh material={mats.glass} position={[0, 0, 0.03]}>
                      <boxGeometry args={[o.w - 0.04, o.h - 0.04, 0.03]} />
                    </mesh>
                    <mesh material={mats.frame} position={[0, 0, 0.055]}>
                      <boxGeometry args={[0.04, o.h - 0.04, 0.03]} />
                    </mesh>
                    <mesh material={mats.frame} position={[0, 0, 0.055]}>
                      <boxGeometry args={[o.w - 0.04, 0.04, 0.03]} />
                    </mesh>
                    <mesh material={mats.frame} position={[0, -o.h / 2 - 0.04, 0.08]}>
                      <boxGeometry args={[o.w + 0.24, 0.05, 0.2]} />
                    </mesh>
                  </>
                )}
              </Anim>
            </group>
          );
        })}
    </>
  );
}

function Roof({ m, ctrl, mats }: { m: HouseModel; ctrl: AnimController; mats: { roof: MeshStandardMaterial; plaster: MeshStandardMaterial; tank: MeshStandardMaterial } }) {
  const { fp, roof } = m;
  const top = m.slabTop[m.floors - 1]!;
  const st = m.stage("roof");
  const gable = useMemo(() => {
    if (roof.type === "flat") return null;
    const span = (roof.ridgeAlongX ? fp.d : fp.w) + roof.overhang * 2;
    const length = (roof.ridgeAlongX ? fp.w : fp.d) + roof.overhang * 2;
    const sh = new Shape();
    sh.moveTo(-span / 2, 0);
    sh.lineTo(span / 2, 0);
    sh.lineTo(0, roof.rise);
    sh.closePath();
    const g = new ExtrudeGeometry(sh, { depth: length, bevelEnabled: false });
    g.translate(0, 0, -length / 2);
    return g;
  }, [fp.w, fp.d, roof.type, roof.rise, roof.overhang, roof.ridgeAlongX]);
  useEffect(() => () => gable?.dispose(), [gable]);
  const cx = fp.x0 + fp.w / 2;
  const cz = fp.z0 + fp.d / 2;
  return (
    <Anim ctrl={ctrl} start={st.start} end={st.end} mode="drop" y={top} drop={7}>
      {gable ? (
        <mesh geometry={gable} material={mats.roof} position={[cx, 0, cz]} rotation={[0, roof.ridgeAlongX ? Math.PI / 2 : 0, 0]} castShadow receiveShadow />
      ) : (
        <>
          {/* parapet */}
          {[
            [cx, fp.z0 + 0.075, fp.w, 0.15],
            [cx, fp.z0 + fp.d - 0.075, fp.w, 0.15],
          ].map(([x, z, w, d], i) => (
            <mesh key={`p${i}`} material={mats.plaster} position={[x!, 0.45, z!]} castShadow>
              <boxGeometry args={[w!, 0.9, d!]} />
            </mesh>
          ))}
          {[fp.x0 + 0.075, fp.x0 + fp.w - 0.075].map((x, i) => (
            <mesh key={`q${i}`} material={mats.plaster} position={[x, 0.45, cz]} castShadow>
              <boxGeometry args={[0.15, 0.9, fp.d - 0.3]} />
            </mesh>
          ))}
          {m.rooftop ? (
            <>
              <mesh material={mats.plaster} position={[fp.x0 + fp.w - 1.7, 1.2, fp.z0 + fp.d - 1.9]} castShadow>
                <boxGeometry args={[2.6, 2.4, 3.0]} />
              </mesh>
              <mesh material={mats.tank} position={[fp.x0 + 1.3, 0.5, fp.z0 + fp.d - 1.3]} castShadow>
                <cylinderGeometry args={[0.55, 0.55, 1.0, 20]} />
              </mesh>
            </>
          ) : null}
        </>
      )}
    </Anim>
  );
}

function Balconies({ m, ctrl, hiddenAbove, mats }: { m: HouseModel; ctrl: AnimController; hiddenAbove: number; mats: { slab: MeshStandardMaterial; rail: MeshStandardMaterial; glass: MeshStandardMaterial } }) {
  const { fp } = m;
  const fin = m.stage("finish");
  return (
    <>
      {m.balconies
        .filter((b) => b.floor <= hiddenAbove)
        .map((b) => {
          const slabY = m.slabTop[b.floor - 1]!;
          const st = m.stage(`slab-${b.floor - 1}`);
          const zc = fp.z0 - b.depth / 2;
          const x = fp.x0 + b.x;
          return (
            <group key={b.id}>
              <Anim ctrl={ctrl} start={st.start} end={st.end} mode="rise" y={slabY - SLAB_T}>
                <mesh material={mats.slab} position={[x, SLAB_T / 2, zc]} castShadow receiveShadow>
                  <boxGeometry args={[b.w, SLAB_T, b.depth]} />
                </mesh>
              </Anim>
              <Anim ctrl={ctrl} start={fin.start} end={fin.end} mode="rise" y={slabY}>
                <mesh material={mats.glass} position={[x, 0.5, fp.z0 - b.depth + 0.03]}>
                  <boxGeometry args={[b.w, 1.0, 0.04]} />
                </mesh>
                {[-1, 1].map((s) => (
                  <mesh key={s} material={mats.glass} position={[x + (s * (b.w - 0.04)) / 2, 0.5, zc]}>
                    <boxGeometry args={[0.04, 1.0, b.depth]} />
                  </mesh>
                ))}
                <mesh material={mats.rail} position={[x, 1.02, fp.z0 - b.depth + 0.03]}>
                  <boxGeometry args={[b.w + 0.05, 0.05, 0.07]} />
                </mesh>
                {[-1, 1].map((s) => (
                  <mesh key={`r${s}`} material={mats.rail} position={[x + (s * (b.w - 0.04)) / 2, 1.02, zc]}>
                    <boxGeometry args={[0.07, 0.05, b.depth]} />
                  </mesh>
                ))}
              </Anim>
            </group>
          );
        })}
    </>
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
        <mesh key={r.id} rotation={[-Math.PI / 2, 0, 0]} position={[ox + r.x + r.w / 2, y, oz + r.y + r.d / 2]} receiveShadow>
          <planeGeometry args={[r.w - 0.04, r.d - 0.04]} />
          <meshStandardMaterial color={ROOM_COLOR[r.kind] ?? "#ddd"} roughness={0.85} />
        </mesh>
      ))}
      {edges.map((s, i) => {
        const horizontal = Math.abs(s[1] - s[3]) < 0.01;
        const len = horizontal ? s[2] - s[0] : s[3] - s[1];
        return (
          <mesh key={i} material={mat} position={[ox + (s[0] + s[2]) / 2, y + 1.1, oz + (s[1] + s[3]) / 2]} castShadow>
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

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 1.8, 8]} />
        <meshStandardMaterial color="#6d4c33" roughness={1} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <sphereGeometry args={[1.1, 14, 12]} />
        <meshStandardMaterial color="#3f7d3a" roughness={0.9} />
      </mesh>
      <mesh position={[0.45, 2.0, 0.2]} castShadow>
        <sphereGeometry args={[0.7, 12, 10]} />
        <meshStandardMaterial color="#4a8b43" roughness={0.9} />
      </mesh>
    </group>
  );
}

function DimLine({ a, b, color = "#0a2342", label }: { a: [number, number, number]; b: [number, number, number]; color?: string; label?: string }) {
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.25, (a[2] + b[2]) / 2];
  return (
    <>
      <Line points={[a, b]} color={color} lineWidth={2} />
      {label ? (
        <Html position={mid} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full border border-slate-300 bg-white/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-900 shadow" style={{ color }}>
            {label}
          </div>
        </Html>
      ) : null}
    </>
  );
}

function Lights({ plotW, plotD }: { plotW: number; plotD: number }) {
  const R = Math.max(plotW, plotD) * 1.4 + 12;
  return (
    <>
      <hemisphereLight args={["#dbe8ff", "#b9a98a", 0.75]} />
      <directionalLight position={[plotW / 2 + R * 0.6, R * 1.1, plotD / 2 - R * 0.9]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-near={1} shadow-camera-far={R * 4} shadow-camera-left={-R} shadow-camera-right={R} shadow-camera-top={R} shadow-camera-bottom={-R} target-position={[plotW / 2, 0, plotD / 2]} />
    </>
  );
}

function CameraRig({ preset, cx, cz, R, h, focus }: { preset: SceneProps["preset"]; cx: number; cz: number; R: number; h: number; focus: { x: number; z: number; r: number } | null }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const goal = useRef<{ pos: Vector3; tgt: Vector3 } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const tgt = new Vector3(cx, Math.max(h * 0.35, 1), cz);
    const d = R * 1.35;
    const pos: Record<string, Vector3> = {
      perspective: new Vector3(cx - d * 0.62, d * 0.62 + h * 0.4, cz - d * 0.95),
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

function Ticker({ ctrl }: { ctrl: AnimController }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => ctrl.subscribe(() => invalidate()), [ctrl, invalidate]);
  useFrame((_, dt) => {
    if (ctrl.tick(Math.min(dt, 0.1))) invalidate();
  });
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
function World(p: SceneProps) {
  const { plotW: W, plotD: D, ctrl, tt } = p;
  const tex = useMemo(makeTextures, []);
  const photos = useTexture(["/img/site.jpg", "/img/model.jpg"]) as [Texture, Texture];
  const [sitePhoto, boardPhoto] = photos;
  useMemo(() => {
    // a smooth, dozer-graded patch of the supplied earthworks photo (lower right), stretched over the plot
    sitePhoto.colorSpace = SRGBColorSpace;
    sitePhoto.wrapS = sitePhoto.wrapT = ClampToEdgeWrapping;
    sitePhoto.repeat.set(0.26, 0.26);
    sitePhoto.offset.set(0.66, 0.1);
    sitePhoto.anisotropy = 8;
    boardPhoto.colorSpace = SRGBColorSpace;
  }, [sitePhoto, boardPhoto]);
  useEffect(() => () => Object.values(tex).forEach((t: CanvasTexture) => t.dispose()), [tex]);
  const roadW = p.roadW ?? Math.max(D * 0.14, 6);
  const m = useMemo(() => (p.house ? buildHouse(p.house) : null), [p.house]);
  const mats = useMemo(() => {
    const wall = (map: Texture | null) => new MeshStandardMaterial({ map: map ?? undefined, color: "#9aa0a8", roughness: 0.92 });
    return {
      glass: new MeshStandardMaterial({ color: "#7fb4d8", roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55 }),
      frame: new MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.6 }),
      door: new MeshStandardMaterial({ color: "#6b4328", roughness: 0.7 }),
      metal: new MeshStandardMaterial({ color: "#8d98a4", roughness: 0.45, metalness: 0.6 }),
      slab: new MeshStandardMaterial({ map: tex.concrete, color: "#c3c6ca", roughness: 0.95 }),
      plinth: new MeshStandardMaterial({ map: tex.concrete, color: "#8b8f94", roughness: 1 }),
      footing: new MeshStandardMaterial({ map: tex.concrete, color: "#6f7378", roughness: 1 }),
      roofTile: new MeshStandardMaterial({ map: tex.tiles, roughness: 0.85 }),
      roofFlat: new MeshStandardMaterial({ map: tex.plaster, color: "#e9e4da", roughness: 0.95 }),
      roofMetal: new MeshStandardMaterial({ color: "#a9b2bb", roughness: 0.4, metalness: 0.7 }),
      tank: new MeshStandardMaterial({ color: "#26303b", roughness: 0.6 }),
      rail: new MeshStandardMaterial({ color: "#2b3440", roughness: 0.4, metalness: 0.6 }),
      railGlass: new MeshStandardMaterial({ color: "#a7cde6", transparent: true, opacity: 0.35, roughness: 0.1 }),
      wall,
      sign: new MeshStandardMaterial({ color: "#f5b301", roughness: 0.5 }),
    };
  }, [tex]);
  // one wall material per floor so a single floor can be cut away / made translucent
  const floorMats = useMemo(() => Array.from({ length: m?.floors ?? 0 }, () => mats.wall(tex.plaster)), [m?.floors, mats, tex]);
  useEffect(() => () => floorMats.forEach((x) => x.dispose()), [floorMats]);

  const cx = W / 2;
  const cz = D / 2;
  const H = m ? m.totalH + (m.roof.rise || 0) + (m.rooftop ? 2.4 : 0) : 4;
  const R = Math.max(W, D, H * 1.4);
  const view = p.floorView;
  const maxFloor = m ? (view === "all" ? m.floors - 1 : Math.min(view, m.floors - 1)) : 0;
  const bad = p.flags.front || p.flags.rear || p.flags.outside;

  // paint: raw concrete -> finished plaster during the finishing stage; selected floor goes translucent
  const paint = () => {
    if (!m) return;
    const fin = m.stage("finish");
    const t = phase(ctrl.progress, fin.start, fin.end);
    const tint = new Color(WALL_TINT[m.archetype] ?? "#ffffff");
    floorMats.forEach((mt, i) => {
      mt.color.set("#9aa0a8").lerp(tint, t);
      const cut = view !== "all" && i === view;
      mt.transparent = cut;
      mt.opacity = cut ? 0.22 : 1;
      mt.depthWrite = !cut;
    });
  };
  useFrame(paint);
  useLayoutEffect(paint);

  const ground = useMemo(() => ({ grass: rep(tex.grass, 90, 90), earth: rep(tex.earth, Math.max(2, W / 3), Math.max(2, D / 3)), road: rep(tex.asphalt, Math.max(4, W / 4), 1), paving: rep(tex.paving, Math.max(2, W / 2), 1), lawn: rep(tex.grass, Math.max(2, W / 3), Math.max(2, D / 3)) }), [tex, W, D]);
  const land = m ? m.stage("landscape") : { start: 0.96, end: 1 };
  const site = m ? m.stage("site") : { start: 0, end: 0.05 };
  const frontZ = -1.5;
  const roadZ = frontZ - roadW / 2;
  const reach = Math.max(W, 14) + 24;
  const dashes = Array.from({ length: Math.floor((W + 24) / 3) }, (_, i) => -12 + i * 3);
  const gateX = m ? m.fp.x0 + (m.openings.find((o) => o.id.startsWith("front-0") && (o.kind === "door" || o.kind === "rollup"))?.at ?? m.fp.w / 2) : W / 2;

  return (
    <>
      <color attach="background" args={["#bcd3ea"]} />
      <Sky distance={4000} sunPosition={[W / 2 + R * 0.6, R * 0.9, D / 2 - R * 0.9]} turbidity={3.2} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={["#c9dcee", R * 5, R * 13]} />
      <Lights plotW={W} plotD={D} />
      <Ticker ctrl={ctrl} />
      <CameraRig preset={p.preset} cx={cx} cz={cz} R={R} h={H} focus={m ? { x: m.fp.x0 + m.fp.w / 2, z: m.fp.z0 + m.fp.d / 2, r: Math.max(m.fp.w, m.fp.d) * 1.1 + 3 } : null} />

      {/* ground, road, footpath */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.03, cz]} receiveShadow>
        <planeGeometry args={[reach * 3, reach * 3]} />
        <meshStandardMaterial map={ground.grass} color="#9fc287" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.015, roadZ]} receiveShadow>
        <planeGeometry args={[reach * 3, roadW]} />
        <meshStandardMaterial map={ground.road} roughness={0.95} />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[cx + x - W / 2 + 1, -0.005, roadZ]}>
          <planeGeometry args={[1.6, 0.14]} />
          <meshBasicMaterial color="#f1f1e6" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, frontZ / 2]} receiveShadow>
        <planeGeometry args={[reach * 3, 1.5]} />
        <meshStandardMaterial map={ground.paving} roughness={0.9} />
      </mesh>
      {/* the plot: bare earth, then lawn when landscaping is done */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.002, cz]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={sitePhoto} color="#e9dcc6" roughness={1} />
      </mesh>
      <Anim ctrl={ctrl} start={land.start} end={land.end} mode="pop">
        <group position={[cx, 0, cz]} scale={1}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
            <planeGeometry args={[W - 0.3, D - 0.3]} />
            <meshStandardMaterial map={ground.lawn} color="#a9cc8f" roughness={1} />
          </mesh>
        </group>
      </Anim>
      <Anim ctrl={ctrl} start={site.start} end={Math.max(site.end, 0.01)} mode="fade">
        {[
          [cx, 0.03, 0, W + 0.12, 0.12],
          [cx, 0.03, D, W + 0.12, 0.12],
        ].map(([x, y, z, w, d], i) => (
          <mesh key={`b${i}`} position={[x!, y!, z!]}>
            <boxGeometry args={[w!, 0.05, d!]} />
            <meshBasicMaterial color="#0a2342" />
          </mesh>
        ))}
        {[0, W].map((x, i) => (
          <mesh key={`c${i}`} position={[x, 0.03, cz]}>
            <boxGeometry args={[0.12, 0.05, D]} />
            <meshBasicMaterial color="#0a2342" />
          </mesh>
        ))}
      </Anim>

      {/* rule-derived minimum open spaces (only after a compliance evaluation, and only what the rule text stated) */}
      {p.show.zones && p.guides.frontMin ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.045, p.guides.frontMin / 2]}>
          <planeGeometry args={[W, p.guides.frontMin]} />
          <meshBasicMaterial color="#f5b301" transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ) : null}
      {p.show.zones && p.guides.rearMin ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.045, D - p.guides.rearMin / 2]}>
          <planeGeometry args={[W, p.guides.rearMin]} />
          <meshBasicMaterial color="#f5b301" transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ) : null}

      {m ? (
        <group>
          {/* footing and plinth */}
          <Anim ctrl={ctrl} start={m.stage("foundation").start} end={m.stage("foundation").end} mode="rise" y={-0.4}>
            <mesh material={mats.footing} position={[m.fp.x0 + m.fp.w / 2, 0.225, m.fp.z0 + m.fp.d / 2]} castShadow receiveShadow>
              <boxGeometry args={[m.fp.w + 1.0, 0.45, m.fp.d + 1.0]} />
            </mesh>
          </Anim>
          <Anim ctrl={ctrl} start={m.stage("plinth").start} end={m.stage("plinth").end} mode="rise" y={0.05}>
            <mesh material={mats.plinth} position={[m.fp.x0 + m.fp.w / 2, (m.plinthH - 0.05) / 2, m.fp.z0 + m.fp.d / 2]} castShadow receiveShadow>
              <boxGeometry args={[m.fp.w + 0.2, m.plinthH - 0.05, m.fp.d + 0.2]} />
            </mesh>
          </Anim>
          {/* entrance steps */}
          {(() => {
            const door = m.openings.find((o) => o.id === "front-0-door");
            if (!door || m.fp.z0 < 0.4) return null;
            const sd = Math.min(0.3, m.fp.z0 / 3);
            const pl = m.stage("plinth");
            return (
              <Anim ctrl={ctrl} start={pl.start} end={pl.end} mode="rise">
                {[0, 1, 2].map((i) => (
                  <mesh key={i} material={mats.plinth} position={[m.fp.x0 + door.at, (0.15 * (3 - i)) / 2, m.fp.z0 - sd * i - sd / 2 - 0.1]} castShadow receiveShadow>
                    <boxGeometry args={[1.6, 0.15 * (3 - i), sd]} />
                  </mesh>
                ))}
              </Anim>
            );
          })()}
          {/* floors */}
          {Array.from({ length: m.floors }, (_, f) => (
            <group key={f} visible={f <= maxFloor}>
              <Anim ctrl={ctrl} start={m.stage(`walls-${f}`).start} end={m.stage(`walls-${f}`).end} mode="rise" y={m.floorBase[f]!}>
                <WallSet m={m} floor={f} mat={floorMats[f]!} />
              </Anim>
              <Anim ctrl={ctrl} start={m.stage(`slab-${f}`).start} end={m.stage(`slab-${f}`).end} mode="rise" y={m.slabTop[f]! - SLAB_T}>
                <mesh material={mats.slab} position={[m.fp.x0 + m.fp.w / 2, SLAB_T / 2, m.fp.z0 + m.fp.d / 2]} castShadow receiveShadow>
                  <boxGeometry args={[m.fp.w + 0.3, SLAB_T, m.fp.d + 0.3]} />
                </mesh>
              </Anim>
            </group>
          ))}
          <Openings m={m} ctrl={ctrl} hiddenAbove={maxFloor} mats={{ glass: mats.glass, frame: mats.frame, door: mats.door, metal: mats.metal }} />
          <Balconies m={m} ctrl={ctrl} hiddenAbove={maxFloor} mats={{ slab: mats.slab, rail: mats.rail, glass: mats.railGlass }} />
          <group visible={view === "all"}>
            <Roof m={m} ctrl={ctrl} mats={{ roof: m.roof.type === "gable" ? mats.roofTile : m.roof.type === "shed" ? mats.roofMetal : mats.roofFlat, plaster: mats.roofFlat, tank: mats.tank }} />
          </group>
          {m.archetype === "commercial" ? (
            <Anim ctrl={ctrl} start={m.stage("finish").start} end={m.stage("finish").end} mode="pop" y={0}>
              <mesh material={mats.sign} position={[m.fp.x0 + m.fp.w / 2, m.floorBase[0]! + m.floorH - 0.35, m.fp.z0 - 0.08]} castShadow>
                <boxGeometry args={[m.fp.w * 0.7, 0.5, 0.12]} />
              </mesh>
            </Anim>
          ) : null}
          {view !== "all" ? <RoomsOverlay m={m} floor={Math.min(view, m.floors - 1)} tt={tt} /> : null}
          {/* footprint outline on the ground: blue, red when a limit is broken or the building leaves the plot */}
          <Line
            points={[
              [m.fp.x0, 0.06, m.fp.z0],
              [m.fp.x0 + m.fp.w, 0.06, m.fp.z0],
              [m.fp.x0 + m.fp.w, 0.06, m.fp.z0 + m.fp.d],
              [m.fp.x0, 0.06, m.fp.z0 + m.fp.d],
              [m.fp.x0, 0.06, m.fp.z0],
            ]}
            color={bad ? "#d12a2a" : "#1d4ed8"}
            lineWidth={bad ? 4 : 2.5}
          />
        </group>
      ) : null}

      {m ? (
        <group position={[Math.max(0.8, m.fp.x0 * 0.5), 0, -0.5]}>
          <Anim ctrl={ctrl} start={0} end={0.04} mode="pop">
            <mesh position={[-0.55, 0.9, 0]} castShadow>
              <boxGeometry args={[0.07, 1.8, 0.07]} />
              <meshStandardMaterial color="#59616b" roughness={0.6} metalness={0.5} />
            </mesh>
            <mesh position={[0.55, 0.9, 0]} castShadow>
              <boxGeometry args={[0.07, 1.8, 0.07]} />
              <meshStandardMaterial color="#59616b" roughness={0.6} metalness={0.5} />
            </mesh>
            <mesh position={[0, 1.55, 0.02]} castShadow>
              <boxGeometry args={[1.4, 0.9, 0.05]} />
              <meshStandardMaterial color="#f5b301" roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.55, 0.06]}>
              <planeGeometry args={[1.3, 0.8]} />
              <meshStandardMaterial map={boardPhoto} roughness={0.7} />
            </mesh>
          </Anim>
        </group>
      ) : null}

      {/* surroundings */}
      {p.show.context ? (
        <group>
          {m ? (
            <Anim ctrl={ctrl} start={land.start} end={land.end} mode="rise">
              {[
                [cx, 0.6, D - 0.075, W, 0.15, 1.2],
                [0.075, 0.6, cz, 0.15, D, 1.2],
                [W - 0.075, 0.6, cz, 0.15, D, 1.2],
              ].map(([x, y, z, w, d, h], i) => (
                <mesh key={i} position={[x!, y!, z!]} castShadow receiveShadow material={mats.plinth}>
                  <boxGeometry args={i === 0 ? [w!, h!, d!] : [w!, h!, d!]} />
                </mesh>
              ))}
              {[
                [(gateX - 1.6) / 2, 0.6, 0.075, Math.max(0.5, gateX - 1.6), 0.15, 1.2],
                [(gateX + 1.6 + W) / 2, 0.6, 0.075, Math.max(0.5, W - gateX - 1.6), 0.15, 1.2],
              ].map(([x, y, z, w, d, h], i) => (
                <mesh key={`f${i}`} position={[x!, y!, z!]} castShadow receiveShadow material={mats.plinth}>
                  <boxGeometry args={[w!, h!, d!]} />
                </mesh>
              ))}
            </Anim>
          ) : null}
          {[-1, 1].map((s) => {
            const nw = Math.min(9, Math.max(5, W * 0.9));
            const nd = Math.min(D * 0.7, 13);
            const nx = s < 0 ? -1.8 - nw / 2 : W + 1.8 + nw / 2;
            return (
              <group key={s}>
                <mesh position={[nx, 3.2, 3 + nd / 2]} castShadow receiveShadow>
                  <boxGeometry args={[nw, 6.4, nd]} />
                  <meshStandardMaterial color="#c9d2de" roughness={0.95} />
                </mesh>
                <mesh position={[nx, 6.55, 3 + nd / 2]} castShadow>
                  <boxGeometry args={[nw + 0.2, 0.2, nd + 0.2]} />
                  <meshStandardMaterial color="#9ea8b6" roughness={0.9} />
                </mesh>
              </group>
            );
          })}
          {Array.from({ length: Math.max(3, Math.floor(W / 6) + 3) }, (_, i) => (
            <Tree key={i} x={-9 + i * 6.4} z={frontZ - roadW - 2} s={0.85 + (i % 3) * 0.12} />
          ))}
          <Tree x={W + 5} z={D + 2} s={1.15} />
          <Tree x={-5} z={D + 3} s={1.0} />
        </group>
      ) : null}

      {/* measurements */}
      {p.show.measures && p.floorView === "all" ? (
        <group>
          <DimLine a={[0, 0.1, -0.85]} b={[W, 0.1, -0.85]} label={tt("wb.cv.plotW", { v: fmt(W) })} />
          <DimLine a={[-0.8, 0.1, 0]} b={[-0.8, 0.1, D]} label={tt("wb.cv.plotD", { v: fmt(D) })} />
          <Html position={[cx, 0.3, roadZ]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded-full bg-slate-900/85 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">{p.roadW ? tt("wb.cv.road", { w: fmt(p.roadW) }) : tt("wb.cv.roadUnknown")}</div>
          </Html>
          {m ? (
            <>
              <DimLine a={[m.fp.x0 + m.fp.w / 2, 0.12, 0]} b={[m.fp.x0 + m.fp.w / 2, 0.12, m.fp.z0]} color={p.flags.front ? "#d12a2a" : "#0a2342"} label={tt("wb.cv.gapFront", { v: fmt(m.fp.z0) })} />
              <DimLine a={[m.fp.x0 + m.fp.w / 2, 0.12, m.fp.z0 + m.fp.d]} b={[m.fp.x0 + m.fp.w / 2, 0.12, D]} color={p.flags.rear ? "#d12a2a" : "#5b6b80"} label={tt("wb.cv.gapRear", { v: fmt(D - m.fp.z0 - m.fp.d) })} />
              <DimLine a={[m.fp.x0 - 0.35, 0, m.fp.z0 - 0.35]} b={[m.fp.x0 - 0.35, m.totalH, m.fp.z0 - 0.35]} label={tt("wb.cv.height", { v: fmt(m.totalH) })} />
              <Html position={[m.fp.x0 + m.fp.w / 2, m.totalH + (m.roof.rise || 0) + 1.2, m.fp.z0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap rounded-full bg-blue-700/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">{`${fmt(m.fp.w)} × ${fmt(m.fp.d)}`}</div>
              </Html>
              {p.guides.frontMin ? (
                <Html position={[W - 0.5, 0.2, p.guides.frontMin / 2]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
                  <div className="whitespace-nowrap rounded bg-amber-100/95 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-900">{tt("wb.cv.frontMin", { v: fmt(p.guides.frontMin) })}</div>
                </Html>
              ) : null}
              {p.guides.rearMin ? (
                <Html position={[W - 0.5, 0.2, D - p.guides.rearMin / 2]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
                  <div className="whitespace-nowrap rounded bg-amber-100/95 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-900">{tt("wb.cv.rearMin", { v: fmt(p.guides.rearMin) })}</div>
                </Html>
              ) : null}
            </>
          ) : null}
        </group>
      ) : null}
    </>
  );
}

export default function HouseScene(p: SceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.75]} frameloop="demand" gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }} camera={{ fov: 38, near: 0.1, far: 6000, position: [0, 20, -30] }} style={{ touchAction: "none" }}>
      <World {...p} />
    </Canvas>
  );
}
