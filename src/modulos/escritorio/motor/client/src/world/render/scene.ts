// Representação visual das áreas: caches estáticos (piso, paredes, itens de parede fixos) e
// listas de móveis/itens dinâmicos prontos para o desenho por frame.
import { FURNITURE, TILE, type ArtModule, type FurnitureKind, type FurnitureSprites, type Sprite } from '../../art/api';
import { hash32 } from '../../../../shared/hash';
import type { AreaLayout, WallItemPlacement, WallSegment } from '../layout/types';
import type { RoomState } from '../sim/room-state';
import type { WallArtAsset, WorldAssets } from '../assets';

/** Margem acima da área no cache de paredes (itens que passam do topo da face). */
export const WALL_MARGIN = 16;

/** Itens de parede redesenhados a cada frame (o resto vai para o cache). */
const DYNAMIC_WALL: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>(['window', 'clock', 'whiteboard', 'tv', 'elevator', 'light_switch', 'sign', 'mirror']);

export interface FurnVis {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  seed: number;
  /** Âncora no mundo (centro inferior do footprint + deslocamento). */
  ax: number;
  ay: number;
  order: number;
  areaId: string;
  /** Mesa: spot do assento cuja atividade aparece na tela. */
  seatSpot?: string;
  /** Sprites por estado (resolvidos sob demanda). */
  states: (FurnitureSprites | null | undefined)[];
}

export interface WallVis {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  seed: number;
  cx: number;
  baseY: number;
  on: 'face' | 'south';
  order: number;
  areaId: string;
}

export interface AreaVis {
  id: string;
  layout: AreaLayout;
  room?: RoomState;
  px: { x: number; y: number; w: number; h: number };
  floor: HTMLCanvasElement;
  walls: HTMLCanvasElement;
  furniture: FurnVis[];
  wallItems: WallVis[];
  sign?: WallVis;
  version: number;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Sprites de um móvel com tolerância a falhas da arte (stub, variante desconhecida...). */
export function furnitureSprites(art: ArtModule, f: { kind: FurnitureKind; variant?: string; seed: number; states: (FurnitureSprites | null | undefined)[] }, state = 0): FurnitureSprites | null {
  const hit = f.states[state];
  if (hit !== undefined) return hit;
  let s: FurnitureSprites | null = null;
  try {
    s = art.furnitureSprites(f.kind, f.variant, state, { seed: f.seed }) ?? null;
    if (s && !s.base?.canvas) s = null;
  } catch {
    s = null;
  }
  f.states[state] = s;
  return s;
}

const opaqueCache = new WeakMap<HTMLCanvasElement, { x: number; y: number; w: number; h: number }>();

/** Caixa dos pixels opacos de um canvas (cache por canvas). */
export function opaqueBounds(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const hit = opaqueCache.get(c);
  if (hit) return hit;
  let box = { x: 0, y: 0, w: c.width, h: c.height };
  try {
    const ctx = c.getContext('2d');
    if (ctx && c.width > 0 && c.height > 0) {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width;
      let y0 = c.height;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] > 16) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  } catch {
    // canvas "tainted" ou indisponível: usa o tamanho inteiro
  }
  opaqueCache.set(c, box);
  return box;
}

/** Posição de desenho de um item de parede (canto superior esquerdo, px de mundo). */
export function wallItemOrigin(w: WallVis, s: Sprite): { x: number; y: number } {
  if (w.on === 'south') {
    // sobre a mureta: centraliza o conteúdo opaco pouco abaixo do topo da parede sul
    const b = opaqueBounds(s.canvas);
    const top = w.baseY - TILE;
    return { x: Math.round(w.cx - (b.x + b.w / 2)), y: Math.round(top + 9 - (b.y + b.h / 2)) };
  }
  return { x: Math.round(w.cx - s.ax), y: Math.round(w.baseY - s.ay) };
}

export function wallSprites(art: ArtModule, kind: FurnitureKind, variant: string | undefined, state: number, seed: number): FurnitureSprites | null {
  try {
    const s = art.furnitureSprites(kind, variant, state, { seed });
    return s && s.base?.canvas ? s : null;
  } catch {
    return null;
  }
}

function drawWallSegment(art: ArtModule, ctx: CanvasRenderingContext2D, w: WallSegment): void {
  try {
    if (w.kind === 'face') art.drawWallFace(ctx, w.x, w.y, w.w, w.style, w.doorways ? { doorways: w.doorways } : undefined);
    else if (w.kind === 'south') art.drawSouthWall(ctx, w.x, w.y, w.w, w.style, w.doorways ? { doorways: w.doorways } : undefined);
    else art.drawWallTop(ctx, w.x, w.y, w.w, w.h, w.style);
  } catch {
    ctx.fillStyle = w.style.base;
    ctx.fillRect(w.x, w.y, w.w, w.kind === 'face' ? 2 * TILE : w.kind === 'south' ? TILE : w.h);
  }
}

/** Topo (px acima do rodapé) de quadros e pôsteres na face da parede (logo abaixo da tampa). */
const WALL_ART_TOP = 28;

/**
 * Arte gerada por IA para um quadro/pôster: só do tamanho do lugar (quadros de 2 tiles nunca
 * recebem as pinturas largas); pôsteres preferem a mesma variante do procedural. Puro.
 */
export function pickWallArt(assets: WorldAssets | null, kind: 'painting' | 'poster', tiles: number, variant: string | undefined, seed: number): WallArtAsset | null {
  if (!assets) return null;
  let pool = assets.wallArt.filter((a) => a.kind === kind && a.tiles === tiles);
  if (kind === 'poster' && variant) {
    const same = pool.filter((a) => a.variant === variant);
    if (same.length) pool = same;
  }
  if (!pool.length) return null;
  return pool[(seed >>> 0) % pool.length];
}

/**
 * Desenha a arte pronta (com moldura/contorno próprios) no lugar do item procedural, em tamanho
 * nativo e pixels inteiros. Retorna false se o asset não tem versão pronta (pintura sem moldura).
 */
function drawWallArtAsset(ctx: CanvasRenderingContext2D, item: WallVis, a: WallArtAsset): boolean {
  const img = a.framed ?? (a.kind === 'poster' ? a : null);
  if (!img) return false;
  const x = Math.round(item.cx - img.w / 2);
  const y = item.baseY - WALL_ART_TOP;
  // sombra suave na parede (direita e embaixo), como nos itens procedurais
  ctx.fillStyle = 'rgba(30,34,52,0.16)';
  ctx.fillRect(x + img.w, y + 1, 1, img.h);
  ctx.fillRect(x + 1, y + img.h, img.w, 1);
  ctx.drawImage(img.img, x, y);
  return true;
}

/** Pintura sem moldura pronta: recorte central em tamanho nativo dentro da moldura procedural. */
function drawRawPainting(ctx: CanvasRenderingContext2D, s: Sprite, ox: number, oy: number, a: WallArtAsset): void {
  let r = s.rects?.art;
  if (!r) {
    const b = opaqueBounds(s.canvas);
    r = { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 };
  }
  if (r.w <= 2 || r.h <= 2) return;
  const sw = Math.min(a.w, r.w);
  const sh = Math.min(a.h, r.h);
  const sx = Math.floor((a.w - sw) / 2);
  const sy = Math.floor((a.h - sh) / 2);
  ctx.drawImage(a.img, sx, sy, sw, sh, ox + r.x + Math.floor((r.w - sw) / 2), oy + r.y + Math.floor((r.h - sh) / 2), sw, sh);
}

/** Tom leve da sala sobre o piso (multiplicação: mantém veios e rejunte). */
function tintFloor(ctx: CanvasRenderingContext2D, px: { x: number; y: number; w: number; h: number }, color: string): void {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return;
  const n = parseInt(m[1], 16);
  // mistura 10% da cor com branco: só um sopro de cor
  const k = 0.1;
  const ch = (v: number) => Math.round(255 + (v - 255) * k);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  ctx.fillRect(px.x, px.y, px.w, px.h);
  ctx.restore();
}

export function buildAreaVis(art: ArtModule, layout: AreaLayout, room: RoomState | undefined, assets: WorldAssets | null): AreaVis {
  const r = layout.rect;
  const px = { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };

  // ---- piso + tapetes
  const [floor, fctx] = makeCanvas(px.w, px.h);
  fctx.translate(-px.x, -px.y);
  for (const f of layout.floors) {
    try {
      art.drawFloor(fctx, f.kind, f.x, f.y, f.w, f.h, { seed: f.seed, tint: f.tint, tint2: f.tint2 });
    } catch {
      fctx.fillStyle = '#d9dde2';
      fctx.fillRect(f.x, f.y, f.w, f.h);
    }
  }
  if (layout.floorTint) tintFloor(fctx, px, layout.floorTint);
  for (const rug of layout.rugs) {
    try {
      art.drawRug(fctx, rug.x, rug.y, rug.w, rug.h, rug.color, rug.seed);
    } catch {
      fctx.fillStyle = rug.color;
      fctx.fillRect(rug.x, rug.y, rug.w, rug.h);
    }
  }

  // ---- paredes + itens de parede fixos
  const [walls, wctx] = makeCanvas(px.w, px.h + WALL_MARGIN);
  wctx.translate(-px.x, -px.y + WALL_MARGIN);
  const order = { face: 0, south: 1, cap: 2 } as const;
  for (const w of [...layout.walls].sort((a, b) => order[a.kind] - order[b.kind])) drawWallSegment(art, wctx, w);

  const wallItems: WallVis[] = [];
  let sign: WallVis | undefined;
  for (const it of layout.wallItems) {
    const vis = toWallVis(it, layout.id);
    if (DYNAMIC_WALL.has(it.kind)) {
      if (it.kind === 'sign') sign = vis;
      else wallItems.push(vis);
      continue;
    }
    // quadros e pôsteres: arte de IA pronta (quando houver) no lugar do procedural
    const ai = it.kind === 'painting' || it.kind === 'poster' ? pickWallArt(assets, it.kind, it.kind === 'poster' ? 1 : it.variant === 'wide' ? 4 : 2, it.variant, vis.seed) : null;
    if (ai && vis.on === 'face' && drawWallArtAsset(wctx, vis, ai)) continue;
    const s = wallSprites(art, it.kind, it.variant === 'wide' ? undefined : it.variant, 0, vis.seed);
    if (!s) continue;
    const o = wallItemOrigin(vis, s.base);
    wctx.drawImage(s.base.canvas, o.x, o.y);
    if (ai && it.kind === 'painting') drawRawPainting(wctx, s.base, o.x, o.y, ai);
  }

  // ---- móveis
  const furniture: FurnVis[] = layout.furniture.map((f) => {
    const def = FURNITURE[f.kind];
    const ax = (f.tx + def.footprint.w / 2) * TILE + (f.dx ?? 0);
    const ay = (f.ty + def.footprint.h) * TILE + (f.dy ?? 0);
    return {
      id: f.id,
      kind: f.kind,
      variant: f.variant,
      seed: hash32(f.id),
      ax,
      ay,
      order: f.order,
      areaId: layout.id,
      seatSpot: layout.spots.find((s) => s.deskId === f.id)?.id,
      states: [],
    };
  });

  return { id: layout.id, layout, room, px, floor, walls, furniture, wallItems, sign, version: room?.version ?? 0 };
}

export function toWallVis(it: WallItemPlacement, areaId: string): WallVis {
  return { id: it.id, kind: it.kind, variant: it.variant, seed: hash32(it.id), cx: it.cx, baseY: it.baseY, on: it.on, order: it.order, areaId };
}

/** Desenha paredes e piso de um conjunto de segmentos/pisos num contexto já transformado (camada base). */
export function paintShell(art: ArtModule, ctx: CanvasRenderingContext2D, floors: AreaLayout['floors'], walls: WallSegment[]): void {
  for (const f of floors) {
    try {
      art.drawFloor(ctx, f.kind, f.x, f.y, f.w, f.h, { seed: f.seed, tint: f.tint, tint2: f.tint2 });
    } catch {
      ctx.fillStyle = '#9fc77f';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
  }
  for (const w of walls) drawWallSegment(art, ctx, w);
}
