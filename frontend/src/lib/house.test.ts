import { describe, expect, it } from "vitest";
import { AnimController } from "./anim";
import { layoutFloor, roomArea } from "./floorplan";
import { archetypeFor, buildHouse, phase, type HouseParams } from "./house";

const base: HouseParams = { plotW: 9.144, plotD: 12.192, roadW: 9, x0: 1.5, z0: 3.2, w: 6, d: 7, floors: 3, height: 9.5, use: "residential" };

describe("house model from user inputs", () => {
  it("keeps the floors and height the user gave and places slabs at floor tops", () => {
    const m = buildHouse(base);
    expect(m.floors).toBe(3);
    expect(m.totalH).toBeCloseTo(9.5, 5);
    expect(m.floorBase[0]).toBeCloseTo(0.45);
    expect(m.slabTop[2]).toBeCloseTo(m.totalH);
    expect(m.fp).toEqual({ x0: 1.5, z0: 3.2, w: 6, d: 7 });
    expect(m.archetype).toBe("house_flat");
  });
  it("states every assumption it had to make", () => {
    expect(buildHouse({ ...base, height: undefined }).assumptions.map((a) => a.key)).toContain("wb.h.floorHeightAssumed");
    expect(buildHouse({ ...base, floors: undefined, height: 7.5 }).assumptions.map((a) => a.key)).toContain("wb.h.floorsAssumed");
    expect(buildHouse({ ...base, floors: undefined, height: undefined }).floors).toBe(1);
    expect(buildHouse({ ...base, floors: 3, height: 40 }).assumptions.map((a) => a.key)).toContain("wb.h.heightAdjusted");
  });
  it("generates openings and balconies from the footprint, and a door only on the ground floor front", () => {
    const m = buildHouse(base);
    expect(m.openings.filter((o) => o.kind === "door" && o.floor === 0 && o.side === "front")).toHaveLength(1);
    expect(m.openings.filter((o) => o.kind === "door")).toHaveLength(1);
    expect(m.balconies.map((b) => b.floor)).toEqual([1, 2]);
    expect(m.balconies[0]!.depth).toBeLessThanOrEqual(1.2);
    for (const o of m.openings) expect(o.at - o.w / 2).toBeGreaterThanOrEqual(-1e-9);
    const narrow = buildHouse({ ...base, w: 3, d: 5 });
    expect(narrow.balconies).toHaveLength(0);
  });
  it("changing the footprint changes the generated model", () => {
    const small = buildHouse({ ...base, w: 4, d: 5 });
    const big = buildHouse({ ...base, w: 9, d: 12 });
    expect(big.openings.length).toBeGreaterThan(small.openings.length);
  });
  it("chooses the building archetype and roof from use and floors", () => {
    expect(archetypeFor("residential", 2)).toBe("house_pitched");
    expect(archetypeFor("residential", 3)).toBe("house_flat");
    expect(archetypeFor("commercial", 1)).toBe("commercial");
    expect(archetypeFor("industrial", 1)).toBe("industrial");
    expect(buildHouse({ ...base, floors: 2, height: 6.5 }).roof.type).toBe("gable");
    expect(buildHouse(base).rooftop).toBe(true);
  });
  it("builds a contiguous construction timeline from foundation to landscaping", () => {
    const m = buildHouse(base);
    expect(m.stages[0]!.start).toBe(0);
    expect(m.stages.at(-1)!.end).toBe(1);
    for (let i = 1; i < m.stages.length; i++) expect(m.stages[i]!.start).toBeCloseTo(m.stages[i - 1]!.end, 9);
    expect(m.stages.map((s) => s.id)).toEqual(["site", "foundation", "plinth", "walls-0", "slab-0", "walls-1", "slab-1", "walls-2", "slab-2", "roof", "openings", "finish", "landscape"]);
    expect(m.stageAt(0).id).toBe("site");
    expect(m.stageAt(0.99).id).toBe("landscape");
    expect(m.stageAt(1).id).toBe("landscape");
  });
  it("eases phase between 0 and 1", () => {
    expect(phase(0, 0.2, 0.4)).toBe(0);
    expect(phase(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(phase(0.9, 0.2, 0.4)).toBe(1);
  });
});

describe("illustrative floor layout", () => {
  it("fills the footprint with rooms that stay inside it and do not overlap", () => {
    for (const arch of ["house_flat", "house_pitched", "commercial", "industrial", "institutional"] as const) {
      for (const floor of [0, 1]) {
        const rooms = layoutFloor(5.5, 6.5, floor, 2, arch);
        expect(rooms.length).toBeGreaterThan(1);
        for (const r of rooms) {
          expect(r.x).toBeGreaterThanOrEqual(-1e-9);
          expect(r.y).toBeGreaterThanOrEqual(-1e-9);
          expect(r.x + r.w).toBeLessThanOrEqual(5.5 + 1e-6);
          expect(r.y + r.d).toBeLessThanOrEqual(6.5 + 1e-6);
        }
        for (const a of rooms) for (const b of rooms) if (a !== b) expect(a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.d - 1e-6 && b.y < a.y + a.d - 1e-6).toBe(false);
        const total = rooms.reduce((s, r) => s + roomArea(r), 0);
        expect(total).toBeLessThanOrEqual(5.5 * 6.5 + 1e-6);
      }
    }
  });
  it("adds a stair only when there is more than one floor, and one room for a tiny footprint", () => {
    expect(layoutFloor(6, 8, 0, 1, "house_flat").some((r) => r.kind === "stair")).toBe(false);
    expect(layoutFloor(6, 8, 0, 3, "house_flat").some((r) => r.kind === "stair")).toBe(true);
    expect(layoutFloor(3, 4, 0, 1, "house_flat")).toHaveLength(1);
  });
});

describe("construction clock", () => {
  it("plays, pauses, replays, resets and finishes", () => {
    const c = new AnimController(1, 10);
    expect(c.progress).toBe(1);
    c.play(); // from the end it restarts
    expect(c.progress).toBe(0);
    expect(c.playing).toBe(true);
    expect(c.tick(5)).toBe(true);
    expect(c.progress).toBeCloseTo(0.5);
    c.pause();
    expect(c.tick(5)).toBe(false);
    expect(c.progress).toBeCloseTo(0.5);
    c.setSpeed(2);
    c.play();
    c.tick(2);
    expect(c.progress).toBeCloseTo(0.9);
    c.tick(5);
    expect(c.progress).toBe(1);
    expect(c.playing).toBe(false);
    c.replay();
    expect(c.progress).toBe(0);
    expect(c.playing).toBe(true);
    c.reset();
    expect(c.playing).toBe(false);
    expect(c.progress).toBe(0);
    c.seek(2);
    expect(c.progress).toBe(1);
    c.finish();
    expect(c.getSnapshot()).toMatchObject({ progress: 1, playing: false });
  });
});
