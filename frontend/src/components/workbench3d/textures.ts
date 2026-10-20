import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Procedural textures (no image files): plaster, concrete, roof tiles, asphalt, grass, brick. Created once per page.
function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function finish(c: HTMLCanvasElement, repeatX: number, repeatY: number): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(ctx: CanvasRenderingContext2D, size: number, base: string, amount: number, seed: number, dots = 2400): void {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = Math.floor((r() - 0.5) * amount);
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    ctx.fillRect(r() * size, r() * size, 1 + r() * 3, 1 + r() * 3);
  }
}

export interface Textures {
  plaster: CanvasTexture;
  concrete: CanvasTexture;
  tiles: CanvasTexture;
  asphalt: CanvasTexture;
  grass: CanvasTexture;
  earth: CanvasTexture;
  paving: CanvasTexture;
}

export function makeTextures(): Textures {
  const S = 256;
  let [c, x] = canvas(S);
  noise(x, S, "#efe6d6", 40, 1);
  const plaster = finish(c, 3, 3);

  [c, x] = canvas(S);
  noise(x, S, "#9a9da1", 70, 2, 4000);
  const concrete = finish(c, 4, 4);

  [c, x] = canvas(S);
  noise(x, S, "#b4573a", 30, 3, 900);
  x.strokeStyle = "rgba(60,20,10,0.35)";
  x.lineWidth = 2;
  for (let i = 0; i <= S; i += 16) {
    x.beginPath();
    x.moveTo(0, i);
    x.lineTo(S, i);
    x.stroke();
  }
  const tiles = finish(c, 6, 6);

  [c, x] = canvas(S);
  noise(x, S, "#383b40", 50, 4, 3000);
  const asphalt = finish(c, 12, 2);

  [c, x] = canvas(S);
  noise(x, S, "#6f9b57", 55, 5, 5000);
  const grass = finish(c, 24, 24);

  [c, x] = canvas(S);
  noise(x, S, "#a98f6d", 60, 6, 4500);
  const earth = finish(c, 6, 6);

  [c, x] = canvas(S);
  noise(x, S, "#b9b3a8", 30, 7, 1500);
  x.strokeStyle = "rgba(0,0,0,0.18)";
  x.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, S);
    x.moveTo(0, i);
    x.lineTo(S, i);
    x.stroke();
  }
  const paving = finish(c, 6, 6);
  return { plaster, concrete, tiles, asphalt, grass, earth, paving };
}
