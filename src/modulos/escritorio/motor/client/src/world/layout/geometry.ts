// Geometria do prédio: mapeamento de slots, colunas e retângulos. Puro e testável.
import { BUILDING_H, COL_W, CORE_COLS, CORRIDOR_H, CORRIDOR_Y, NORTH_Y, ROOM_H, SOUTH_Y, TILE } from '../constants';
import type { TileRect } from './types';

export type Side = 'north' | 'south';

/** Coluna do prédio (0 = núcleo A) ocupada por um slot de sala de projeto. */
export function slotColumn(slot: number): number {
  return CORE_COLS + Math.floor(Math.max(0, slot) / 2);
}

/** Slot par = norte do corredor; ímpar = sul. */
export function slotSide(slot: number): Side {
  return Math.max(0, slot) % 2 === 0 ? 'north' : 'south';
}

/** Retângulo (tiles) de uma sala em uma coluna/lado. */
export function cellRect(col: number, side: Side): TileRect {
  return { x: col * COL_W, y: side === 'north' ? NORTH_Y : SOUTH_Y, w: COL_W, h: ROOM_H };
}

export function slotRect(slot: number): TileRect {
  return cellRect(slotColumn(slot), slotSide(slot));
}

/** Slot correspondente a uma coluna/lado de projeto (inverso de slotColumn/slotSide). */
export function slotAt(col: number, side: Side): number {
  return (col - CORE_COLS) * 2 + (side === 'north' ? 0 : 1);
}

/** Total de colunas do prédio para um conjunto de slots em uso (mínimo: 1 coluna de projeto). */
export function columnsFor(slots: Iterable<number>): number {
  let maxCol = 0;
  for (const s of slots) maxCol = Math.max(maxCol, Math.floor(Math.max(0, s) / 2));
  return CORE_COLS + maxCol + 1;
}

export function corridorRect(cols: number): TileRect {
  return { x: 0, y: CORRIDOR_Y, w: cols * COL_W, h: CORRIDOR_H };
}

export function buildingRect(cols: number): TileRect {
  return { x: 0, y: 0, w: cols * COL_W, h: BUILDING_H };
}

export function rectPx(r: TileRect): { x: number; y: number; w: number; h: number } {
  return { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
}

export function inRect(r: TileRect, tx: number, ty: number): boolean {
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
}
