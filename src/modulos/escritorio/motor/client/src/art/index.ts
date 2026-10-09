// Tudo é desenhado em código: a geração acontece em PixelBuf (puro, testável em Node) e só no fim
// vira canvas, uma única vez por combinação de parâmetros (cache). As funções draw* chamadas a cada
// quadro (telas, quadro, janela, relógio, pisos, paredes) só fazem fillRect/drawImage de tiles prontos.
import { hash32 } from '../../../shared/hash';
import {
  TILE,
  type Appearance,
  type ArtModule,
  type CharacterFrameRequest,
  type Doorway,
  type FloorKind,
  type FurnitureKind,
  type FurnitureSprites,
  type IconName,
  type Pose,
  type RoomTheme,
  type Sprite,
  type WallStyle,
} from './api';
import { appearanceFromSeed as appearanceFromSeedPure, appearanceKey } from './character/appearance';
import { CHAR_H, CHAR_W, POSE_DURATION, POSE_FRAMES, isSeated, renderCharacter } from './character/render';
import { shade } from './core/color';
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';
import { drawBoard, drawClock, drawScreen, drawWindowView, footballLance } from './dynamic';
import { normalizeFurniture, renderFurniture } from './furniture/index';
import { renderIcon } from './icons';
import { CHUNK_PX, floorChunk } from './surfaces/floor';
import { WALL_CAP_H, WALL_FACE_H, capColor, southWallTile, wallFaceTile } from './surfaces/walls';
import { renderRug } from './surfaces/rug';
import { roomTheme as roomThemePure } from './theme';

export * from './api';
export { hash32 };
export { drawBoard, drawClock, drawScreen, drawWindowView, footballLance };

// ------------------------------------------------------------------ canvas e cache

function toCanvas(buf: PixelBuf): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, buf.w);
  c.height = Math.max(1, buf.h);
  const ctx = c.getContext('2d');
  if (ctx && buf.w > 0 && buf.h > 0) ctx.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
  return c;
}

function toSprite(s: BufSprite): Sprite {
  return { canvas: toCanvas(s.buf), ax: s.ax, ay: s.ay, rects: s.rects };
}

/** Cache com limite simples (descarta tudo ao estourar — evita crescer sem fim em sessões longas). */
class Cache<T> {
  private map = new Map<string, T>();
  constructor(private readonly limit: number) {}
  get(key: string, make: () => T): T {
    let v = this.map.get(key);
    if (v === undefined) {
      if (this.map.size >= this.limit) this.map.clear();
      v = make();
      this.map.set(key, v);
    }
    return v;
  }
}

const charCache = new Cache<Sprite>(30000);
const furnCache = new Cache<FurnitureSprites>(4000);
const tileCache = new Cache<HTMLCanvasElement>(2000);
const floorCache = new Cache<HTMLCanvasElement>(1500);
const iconCache = new Cache<Sprite>(64);
const avatarCache = new Cache<HTMLCanvasElement>(2000);
const rugCache = new Cache<HTMLCanvasElement>(512);

const appearanceKeys = new WeakMap<Appearance, string>();
function keyOf(a: Appearance): string {
  let k = appearanceKeys.get(a);
  if (!k) {
    k = appearanceKey(a);
    appearanceKeys.set(a, k);
  }
  return k;
}

// ------------------------------------------------------------------ personagens

export function appearanceFromSeed(seed: number, opts: { look?: 'f' | 'm'; sub?: boolean } = {}): Appearance {
  return appearanceFromSeedPure(seed, opts);
}

export function poseFrameCount(pose: Pose): number {
  return POSE_FRAMES[pose] ?? 1;
}

export function poseFrameDuration(pose: Pose): number {
  return POSE_DURATION[pose] ?? 500;
}

export function characterSprite(req: CharacterFrameRequest): Sprite {
  const n = poseFrameCount(req.pose);
  const frame = ((Math.floor(req.frame) % n) + n) % n;
  const seated = isSeated(req.pose, req.seated);
  const key = `${keyOf(req.appearance)}|${req.dir}|${req.pose}|${frame}|${req.held ?? 'none'}|${seated ? 1 : 0}`;
  return charCache.get(key, () => toSprite(renderCharacter({ ...req, frame, seated })));
}

export function avatarCanvas(seed: number, opts: { look?: 'f' | 'm'; sub?: boolean; scale?: number } = {}): HTMLCanvasElement {
  const scale = Math.max(1, Math.round(opts.scale ?? 3));
  const key = `${seed}|${opts.look ?? '-'}|${opts.sub ? 1 : 0}|${scale}`;
  return avatarCache.get(key, () => {
    const s = renderCharacter({ appearance: appearanceFromSeedPure(seed, opts), dir: 'down', pose: 'stand', frame: 0 });
    // Busto: cabeça + ombros (20x20 a partir do topo do cabelo).
    const crop = s.buf.crop(2, 2, CHAR_W - 4, 20);
    const out = new PixelBuf(crop.w * scale, crop.h * scale);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const si = (Math.floor(y / scale) * crop.w + Math.floor(x / scale)) * 4;
        const di = (y * out.w + x) * 4;
        out.data[di] = crop.data[si];
        out.data[di + 1] = crop.data[si + 1];
        out.data[di + 2] = crop.data[si + 2];
        out.data[di + 3] = crop.data[si + 3];
      }
    }
    return toCanvas(out);
  });
}


// ------------------------------------------------------------------ móveis e ícones

export function furnitureSprites(kind: FurnitureKind, variant?: string, state?: number, opts: { seed?: number } = {}): FurnitureSprites {
  // Chave normalizada: sementes/variantes equivalentes compartilham o mesmo canvas.
  const n = normalizeFurniture(kind, variant, state, opts.seed);
  const key = `${kind}|${n.variant ?? '-'}|${n.state}|${n.vseed}`;
  return furnCache.get(key, () => {
    const f = renderFurniture(kind, n.variant, n.state, n.vseed);
    return { base: toSprite(f.base), front: f.front ? toSprite(f.front) : undefined };
  });
}

export function iconSprite(name: IconName): Sprite {
  return iconCache.get(name, () => toSprite(renderIcon(name)));
}

export function roomTheme(seed: number): RoomTheme {
  return roomThemePure(seed);
}

// ------------------------------------------------------------------ pisos, tapetes e paredes

function tileHash(seed: number, tx: number, ty: number): number {
  let h = Math.imul(tx | 0, 0x9e3779b1) ^ Math.imul(ty | 0, 0x85ebca77) ^ Math.imul(seed | 0, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export function drawFloor(
  ctx: CanvasRenderingContext2D,
  kind: FloorKind,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { seed: number; tint?: string; tint2?: string },
): void {
  // Blocos de 8x8 tiles alinhados à grade do mundo, recortados à área pedida.
  const cx0 = Math.floor(x / CHUNK_PX);
  const cy0 = Math.floor(y / CHUNK_PX);
  const cx1 = Math.ceil((x + w) / CHUNK_PX);
  const cy1 = Math.ceil((y + h) / CHUNK_PX);
  for (let cy = cy0; cy < cy1; cy++) {
    for (let cx = cx0; cx < cx1; cx++) {
      const key = `f|${kind}|${opts.seed}|${opts.tint ?? ''}|${opts.tint2 ?? ''}|${cx}|${cy}`;
      const chunk = floorCache.get(key, () => toCanvas(floorChunk(kind, cx, cy, opts)));
      const px = cx * CHUNK_PX;
      const py = cy * CHUNK_PX;
      const sx = Math.max(0, x - px);
      const sy = Math.max(0, y - py);
      const ex = Math.min(CHUNK_PX, x + w - px);
      const ey = Math.min(CHUNK_PX, y + h - py);
      if (ex <= sx || ey <= sy) continue;
      ctx.drawImage(chunk, sx, sy, ex - sx, ey - sy, px + sx, py + sy, ex - sx, ey - sy);
    }
  }
}

export function drawRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, seed: number): void {
  const rw = Math.max(4, Math.round(w));
  const rh = Math.max(4, Math.round(h));
  const key = `${rw}|${rh}|${color}|${seed}`;
  const c = rugCache.get(key, () => toCanvas(renderRug(rw, rh, color, seed)));
  ctx.drawImage(c, Math.round(x), Math.round(y));
}

function styleKey(s: WallStyle): string {
  return `${s.base}|${s.trim ?? ''}|${s.pattern ?? 'plain'}|${s.exterior ? 1 : 0}`;
}

/** Trechos [x0, x1) da parede que não estão em passagens. */
function solidSegments(x: number, w: number, doorways: readonly Doorway[] | undefined): [number, number][] {
  let segs: [number, number][] = [[x, x + w]];
  for (const d of doorways ?? []) {
    const next: [number, number][] = [];
    for (const [a, b] of segs) {
      const da = d.x;
      const db = d.x + d.w;
      if (db <= a || da >= b) {
        next.push([a, b]);
        continue;
      }
      if (da > a) next.push([a, da]);
      if (db < b) next.push([db, b]);
    }
    segs = next;
  }
  return segs;
}

function drawTiled(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  h: number,
  tileFor: (tx: number) => HTMLCanvasElement,
): void {
  for (let tx = Math.floor(x0 / TILE); tx * TILE < x1; tx++) {
    const px = tx * TILE;
    const sx = Math.max(0, x0 - px);
    const ex = Math.min(TILE, x1 - px);
    if (ex <= sx) continue;
    ctx.drawImage(tileFor(tx), sx, 0, ex - sx, h, px + sx, y, ex - sx, h);
  }
}

export function drawWallFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts: { doorways?: Doorway[] } = {}): void {
  const sk = styleKey(style);
  const tileFor = (tx: number) => {
    const variant = tileHash(7, tx, 0) % 4;
    const col = tx & 1;
    return tileCache.get(`w|${sk}|${variant}|${col}`, () => toCanvas(wallFaceTile(style, variant, col)));
  };
  const segs = solidSegments(x, w, opts.doorways);
  const jamb = shade(style.base, -0.14);
  const jambLight = shade(style.base, 0.04);
  const cap = capColor(style);
  for (const [a, b] of segs) {
    drawTiled(ctx, a, b, y, WALL_FACE_H, tileFor);
    // Batentes sombreados nas bordas que encostam numa passagem.
    if (b < x + w) {
      ctx.fillStyle = jamb;
      ctx.fillRect(b - 2, y + WALL_CAP_H, 2, WALL_FACE_H - WALL_CAP_H);
      ctx.fillStyle = shade(cap, -0.08);
      ctx.fillRect(b - 1, y, 1, WALL_CAP_H);
    }
    if (a > x) {
      ctx.fillStyle = jambLight;
      ctx.fillRect(a, y + WALL_CAP_H, 1, WALL_FACE_H - WALL_CAP_H);
      ctx.fillStyle = jamb;
      ctx.fillRect(a + 1, y + WALL_CAP_H, 1, WALL_FACE_H - WALL_CAP_H);
      ctx.fillStyle = shade(cap, 0.06);
      ctx.fillRect(a, y, 1, WALL_CAP_H);
    }
  }
}

export function drawWallTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: WallStyle): void {
  const cap = capColor(style);
  ctx.fillStyle = cap;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(cap, 0.08);
  ctx.fillRect(x, y, w, 1);
  if (w > 2) ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = shade(cap, -0.06);
  if (h > 2) ctx.fillRect(x, y + h - 1, w, 1);
  if (w > 2) ctx.fillRect(x + w - 1, y, 1, h);
}

export function drawSouthWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts: { doorways?: Doorway[] } = {}): void {
  const sk = styleKey(style);
  const tileFor = (tx: number) => {
    const col = tx & 3;
    return tileCache.get(`s|${sk}|${col}`, () => toCanvas(southWallTile(style, col)));
  };
  const cap = capColor(style);
  for (const [a, b] of solidSegments(x, w, opts.doorways)) {
    drawTiled(ctx, a, b, y, TILE, tileFor);
    if (b < x + w) {
      ctx.fillStyle = shade(cap, -0.08);
      ctx.fillRect(b - 1, y, 1, TILE);
    }
    if (a > x) {
      ctx.fillStyle = shade(cap, 0.08);
      ctx.fillRect(a, y, 1, TILE);
    }
  }
}

// ------------------------------------------------------------------ telas e afins (por quadro)
// drawScreen, drawBoard, drawWindowView e drawClock vêm de ./dynamic (reexportados acima).

/** Para depuração/prévia: tamanho e âncora padrão dos personagens. */
export const CHARACTER_SHEET = { w: CHAR_W, h: CHAR_H } as const;

// Garantia em tempo de compilação de que este módulo cumpre o contrato ArtModule.
const _contract: ArtModule = {
  appearanceFromSeed,
  characterSprite,
  poseFrameCount,
  poseFrameDuration,
  furnitureSprites,
  drawFloor,
  drawRug,
  drawWallFace,
  drawWallTop,
  drawSouthWall,
  drawScreen,
  drawBoard,
  drawWindowView,
  drawClock,
  roomTheme,
  iconSprite,
  avatarCanvas,
};
void _contract;
