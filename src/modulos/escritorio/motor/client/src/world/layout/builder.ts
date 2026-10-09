// Construtor de áreas em coordenadas LOCAIS (tiles relativos ao canto da área).
// Converte tudo para coordenadas absolutas e registra spots de forma consistente.
import { FURNITURE, type Dir, type FloorKind, type FurnitureKind, type WallStyle } from '../../art/api';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import type { AreaKind, AreaLayout, Doorway, FurniturePlacement, SpotDef, SpotKind, TileRect } from './types';

/** Pés de quem está sentado: px acima da base do assento. */
export const SEAT_FOOT_DY = 3;
/** Profundidade extra de quem está sentado (logo depois do assento, antes do encosto). */
export const SEATED_SORT_BIAS = 0.25;

export interface SpotOpts {
  /** Deslocamento da posição final (px). */
  dx?: number;
  dy?: number;
  seated?: boolean;
  furnitureId?: string;
  sortY?: number;
  group?: string;
  deskId?: string;
  rank?: number;
  side?: 'S' | 'N';
  /** Posição final absoluta em px (substitui o cálculo pelo tile). */
  x?: number;
  y?: number;
}

export class AreaBuilder {
  readonly area: AreaLayout;
  private seq = 0;

  constructor(id: string, kind: AreaKind, rect: TileRect) {
    this.area = { id, kind, rect, floors: [], rugs: [], walls: [], wallItems: [], furniture: [], spots: [], walkable: [] };
  }

  get x0(): number {
    return this.area.rect.x;
  }

  get y0(): number {
    return this.area.rect.y;
  }

  /** px absoluto de uma coordenada local em tiles (aceita frações). */
  px(lx: number): number {
    return (this.x0 + lx) * TILE;
  }

  py(ly: number): number {
    return (this.y0 + ly) * TILE;
  }

  floor(kind: FloorKind, lx: number, ly: number, w: number, h: number, seed: number, tint?: string, tint2?: string): this {
    this.area.floors.push({ kind, x: this.px(lx), y: this.py(ly), w: w * TILE, h: h * TILE, seed, tint, tint2 });
    return this;
  }

  rug(lx: number, ly: number, w: number, h: number, color: string, seed: number): this {
    this.area.rugs.push({ x: Math.round(this.px(lx)), y: Math.round(this.py(ly)), w: Math.round(w * TILE), h: Math.round(h * TILE), color, seed });
    return this;
  }

  /** Face da parede norte (2 tiles) entre lx e lx+w (tiles locais, aceita frações). */
  face(lx: number, w: number, style: WallStyle, doorways: { lx: number; w: number }[] = [], ly = 0): this {
    this.area.walls.push({ kind: 'face', x: this.px(lx), y: this.py(ly), w: w * TILE, style, doorways: this.doors(doorways) });
    return this;
  }

  south(lx: number, w: number, ly: number, style: WallStyle, doorways: { lx: number; w: number }[] = []): this {
    this.area.walls.push({ kind: 'south', x: this.px(lx), y: this.py(ly), w: w * TILE, style, doorways: this.doors(doorways) });
    return this;
  }

  cap(lx: number, ly: number, w: number, h: number, style: WallStyle): this {
    this.area.walls.push({ kind: 'cap', x: this.px(lx), y: this.py(ly), w: w * TILE, h: h * TILE, style });
    return this;
  }

  private doors(list: { lx: number; w: number }[]): Doorway[] | undefined {
    return list.length ? list.map((d) => ({ x: this.px(d.lx), w: d.w * TILE })) : undefined;
  }

  /** Item de parede centrado em `lcx` (tiles locais). `ly` = linha local do rodapé (default 2 = base da face norte). */
  wall(kind: FurnitureKind, lcx: number, variant?: string, opts: { ly?: number; on?: 'face' | 'south'; order?: number } = {}): string {
    const id = `${this.area.id}#w${this.seq++}:${kind}`;
    this.area.wallItems.push({
      id,
      kind,
      variant,
      cx: Math.round(this.px(lcx)),
      baseY: this.py(opts.ly ?? 2),
      on: opts.on ?? 'face',
      order: opts.order ?? 0.5,
    });
    return id;
  }

  /** Móvel de chão com o canto superior esquerdo do footprint em (lx, ly). */
  furn(kind: FurnitureKind, lx: number, ly: number, variant?: string, opts: { dx?: number; dy?: number; order?: number; seat?: string } = {}): string {
    const id = `${this.area.id}#f${this.seq++}:${kind}`;
    const f: FurniturePlacement = {
      id,
      kind,
      variant,
      tx: this.x0 + lx,
      ty: this.y0 + ly,
      dx: opts.dx,
      dy: opts.dy,
      order: opts.order ?? 0.5,
      seat: opts.seat,
    };
    this.area.furniture.push(f);
    return id;
  }

  /** Spot com aproximação no tile local (lx, ly). Posição final padrão = pés no tile. */
  spot(kind: SpotKind, lx: number, ly: number, dir: Dir, opts: SpotOpts = {}): SpotDef {
    const tx = this.x0 + lx;
    const ty = this.y0 + ly;
    const s: SpotDef = {
      id: `${this.area.id}#s${this.seq++}:${kind}`,
      kind,
      areaId: this.area.id,
      tx,
      ty,
      x: opts.x ?? tx * TILE + FOOT_DX + (opts.dx ?? 0),
      y: opts.y ?? ty * TILE + FOOT_DY + (opts.dy ?? 0),
      dir,
      seated: opts.seated,
      furnitureId: opts.furnitureId,
      sortY: opts.sortY,
      group: opts.group,
      deskId: opts.deskId,
      rank: opts.rank,
      side: opts.side,
    };
    this.area.spots.push(s);
    return s;
  }

  /**
   * Assento (cadeira, banqueta, poltrona...) no tile local (lx, ly). O personagem se aproxima
   * pelo próprio tile do assento e encaixa na posição do assento (com `dx` opcional em px).
   */
  seat(kind: SpotKind, furnitureKind: FurnitureKind, lx: number, ly: number, dir: Dir, variant?: string, opts: SpotOpts & { order?: number; noFurniture?: boolean } = {}): SpotDef {
    const furnitureId = opts.noFurniture ? opts.furnitureId : this.furn(furnitureKind, lx, ly, variant, { dx: opts.dx, order: opts.order });
    const base = this.py(ly + 1);
    return this.spot(kind, lx, ly, dir, {
      ...opts,
      furnitureId,
      seated: true,
      x: this.px(lx) + TILE / 2 + (opts.dx ?? 0),
      y: base - SEAT_FOOT_DY + (opts.dy ?? 0),
      sortY: base + SEATED_SORT_BIAS,
    });
  }

  walk(lx: number, ly: number, w: number, h: number): this {
    this.area.walkable.push({ x: this.x0 + lx, y: this.y0 + ly, w, h });
    return this;
  }

  block(lx: number, ly: number, w: number, h: number): this {
    (this.area.blocked ??= []).push({ x: this.x0 + lx, y: this.y0 + ly, w, h });
    return this;
  }

  build(): AreaLayout {
    return this.area;
  }
}

/** Tiles bloqueados por um móvel de chão. */
export function furnitureBlocks(kind: FurnitureKind): boolean {
  const def = FURNITURE[kind];
  return def.mount === 'floor' && def.blocks;
}

/** Tiles de assento (caminháveis, mas evitados pelo A*). */
export function furnitureIsSeat(kind: FurnitureKind): boolean {
  const def = FURNITURE[kind];
  return def.mount === 'floor' && !!def.seat;
}
