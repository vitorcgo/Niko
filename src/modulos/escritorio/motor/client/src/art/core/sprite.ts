// Sprites em buffer (puros) e folhas de desenho com origem no footprint do móvel.
import { TILE, type Rect, type SpriteRectName } from '../api';
import { PixelBuf } from './pixbuf';

export type Rects = Partial<Record<SpriteRectName, Rect>>;

/** Equivalente puro de Sprite: buffer + âncora + regiões dinâmicas. */
export interface BufSprite {
  buf: PixelBuf;
  ax: number;
  ay: number;
  rects?: Rects;
}

export interface BufFurniture {
  base: BufSprite;
  front?: BufSprite;
}

/**
 * Folha para móveis de chão: o desenho usa coordenadas do footprint — (0, 0) é o canto superior
 * esquerdo do footprint e (w*TILE, h*TILE) o inferior direito. A âncora é o centro inferior.
 */
export function floorSheet(wTiles: number, hTiles: number, up: number, side = 4, down = 3): BufSprite {
  const buf = new PixelBuf(wTiles * TILE + side * 2, up + hTiles * TILE + down);
  buf.ox = side;
  buf.oy = up;
  return { buf, ax: side + (wTiles * TILE) / 2, ay: up + hTiles * TILE };
}

/**
 * Folha para itens de parede: x = 0 é a borda esquerda do trecho de parede e y = 0 é a linha do
 * rodapé (a face da parede vai de y = -2*TILE até 0). A âncora é o centro inferior do trecho.
 */
export function wallSheet(wTiles: number, side = 2): BufSprite {
  const up = TILE * 2 + 4;
  const buf = new PixelBuf(wTiles * TILE + side * 2, up + 2);
  buf.ox = side;
  buf.oy = up;
  return { buf, ax: side + (wTiles * TILE) / 2, ay: up };
}

/** Converte um retângulo em coordenadas de desenho (com origem) para px do sprite. */
export function rectAt(s: BufSprite, x: number, y: number, w: number, h: number): Rect {
  return { x: x + s.buf.ox, y: y + s.buf.oy, w, h };
}

/** Recorta o sprite ao conteúdo visível, preservando âncora e regiões. */
export function trim(s: BufSprite): BufSprite {
  const b = s.buf.bounds();
  if (!b) return s;
  const buf = s.buf.crop(b.x, b.y, b.w, b.h);
  let rects: Rects | undefined;
  if (s.rects) {
    rects = {};
    for (const [k, r] of Object.entries(s.rects) as [SpriteRectName, Rect][]) {
      rects[k] = { x: r.x - b.x, y: r.y - b.y, w: r.w, h: r.h };
    }
  }
  return { buf, ax: s.ax - b.x, ay: s.ay - b.y, rects };
}
