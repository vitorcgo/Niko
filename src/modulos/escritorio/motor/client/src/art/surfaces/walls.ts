// Texturas de parede (puras): cada função gera UMA coluna/tile em PixelBuf; o desenho por quadro
// (art/index.ts) só copia esses tiles já convertidos em canvas.
import { TILE, type WallPattern, type WallStyle } from '../api';
import { mix, ramp, shade } from '../core/color';
import { PixelBuf } from '../core/pixbuf';
import { rngOf } from '../furniture/kit';

function speckle(b: PixelBuf, seed: number, n: number, colors: readonly string[]): void {
  const r = rngOf(seed, 91);
  for (let i = 0; i < n; i++) {
    b.set(Math.floor(r() * TILE), Math.floor(r() * TILE * 2), colors[Math.floor(r() * colors.length)]);
  }
}

// ------------------------------------------------------------------ paredes

/** Altura da face da parede norte e da tampa escura no topo. */
export const WALL_FACE_H = TILE * 2;
export const WALL_CAP_H = 4;
export const BASEBOARD_H = 3;

/** Cor da tampa (topo da parede), levemente tingida pela cor da parede. */
export function capColor(style: WallStyle): string {
  return mix(style.exterior ? '#4a4f5c' : '#3d4356', style.base, 0.1);
}

/** Coluna de 16x32 da face da parede norte (tampa + padrão + rodapé). */
export function wallFaceTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const base = style.base;
  const pattern: WallPattern = style.pattern ?? 'plain';
  const trim = style.trim ?? shade(base, -0.16);
  const cap = capColor(style);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const r = rngOf(variant * 31 + col, 43);
  // Face: gradiente sutil (mais claro em cima) e sombra logo abaixo da tampa.
  for (let y = 0; y < fh; y++) b.hline(0, TILE - 1, fy + y, shade(base, 0.02 - (y / fh) * 0.035));
  switch (pattern) {
    case 'stripes': {
      const s = shade(base, -0.035);
      for (let x = 0; x < TILE; x += 4) b.rect(x, fy, 2, fh, s);
      for (let x = 1; x < TILE; x += 4) b.vline(x, fy, fy + fh - 1, shade(base, -0.02));
      break;
    }
    case 'tiles': {
      const grout = shade(base, -0.09);
      for (let y = fy; y < fy + fh; y++) {
        const ry = y - fy;
        if (ry % 6 === 5) b.hline(0, TILE - 1, y, grout);
      }
      for (let ry = 0; ry < fh; ry += 6) {
        const off = (Math.floor(ry / 6) % 2) * 4;
        for (let x = off; x < TILE + 8; x += 8) b.vline((x + 7) % 16, fy + ry, Math.min(fy + fh - 1, fy + ry + 4), grout);
        b.hline(0, TILE - 1, fy + ry, shade(base, 0.035));
      }
      break;
    }
    case 'wood_panel': {
      // Lambri de madeira na metade de baixo com friso; metade de cima lisa.
      const w = ramp(mix('#b98a5e', base, 0.15), 0.04);
      const top = fy + Math.floor(fh * 0.45);
      b.rect(0, top, TILE, fy + fh - top, w.base);
      for (let x = 0; x < TILE; x += 4) {
        b.vline(x, top, fy + fh - 1, w.dk);
        b.vline(x + 1, top + 1, fy + fh - 1, w.lt);
      }
      b.hline(0, TILE - 1, top - 1, w.hi);
      b.hline(0, TILE - 1, top, w.lt);
      b.hline(0, TILE - 1, top + 1, w.dk);
      break;
    }
    case 'brick': {
      // Tijolos 8x4 (com argamassa) em fileiras desencontradas; tom por tijolo, aresta de cima clara.
      const brick = ramp(base, 0.035);
      const mortar = mix(base, '#e9e4dc', 0.5);
      for (let row = 0; row * 4 < fh; row++) {
        const y = fy + row * 4;
        const off = row % 2 ? 4 : 0;
        for (let bx = -8; bx < TILE; bx += 8) {
          const x0 = bx + off;
          const tone = [brick.lt, brick.base, brick.base, brick.dk][Math.floor(r() * 4)];
          for (let x = Math.max(0, x0); x < Math.min(TILE, x0 + 7); x++) {
            for (let yy = y; yy < Math.min(fy + fh, y + 3); yy++) b.set(x, yy, yy === y ? shade(tone, 0.03) : tone);
          }
          if (x0 + 7 >= 0 && x0 + 7 < TILE) b.vline(x0 + 7, y, Math.min(fy + fh - 1, y + 2), mortar);
        }
        if (y + 3 < fy + fh) b.hline(0, TILE - 1, y + 3, mortar);
      }
      break;
    }
    case 'glass': {
      // Parede de vidro: face translúcida com montantes; o mundo vê através.
      b.clearRect(0, fy, TILE, fh);
      b.rect(0, fy, TILE, fh, 'rgba(175,215,238,0.38)');
      b.vline(0, fy, fy + fh - 1, 'rgba(195,202,212,0.95)');
      b.hline(0, TILE - 1, fy, 'rgba(255,255,255,0.45)');
      for (let i = 0; i < fh; i++) {
        const x = (col * 5 + 11 - i) & 15;
        b.set(x, fy + i, 'rgba(255,255,255,0.35)');
        b.set((x + 1) & 15, fy + i, 'rgba(255,255,255,0.18)');
      }
      break;
    }
    case 'marble': {
      // Frontão de mármore cinza (copa): placas com veios.
      const m = mix('#c9cdd3', base, 0.25);
      b.rect(0, fy, TILE, fh, m);
      for (let v = 0; v < 2; v++) {
        let x = r() * TILE;
        for (let y = 0; y < fh; y++) {
          b.set(Math.floor(x) & 15, fy + y, v ? 'rgba(120,126,138,0.4)' : 'rgba(250,250,252,0.55)');
          x += (r() - 0.35) * 1.4;
        }
      }
      for (let i = 0; i < 8; i++) b.set(Math.floor(r() * TILE), fy + Math.floor(r() * fh), r() < 0.5 ? '#d8dbe0' : '#b8bdc6');
      b.hline(0, TILE - 1, fy + Math.floor(fh / 2), 'rgba(120,126,138,0.35)');
      if (col % 2 === 1) b.vline(TILE - 1, fy, fy + fh - 1, 'rgba(120,126,138,0.35)');
      break;
    }
    case 'plain':
      if (style.exterior) speckle(b, variant * 13 + col, 5, [shade(base, -0.03), shade(base, 0.03)]);
      break;
  }
  // Sombra projetada pela tampa.
  if (pattern !== 'glass') b.hline(0, TILE - 1, fy, shade(base, -0.06));
  // Tampa escura com brilho na aresta.
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.08));
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.06));
  // Rodapé.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, trim);
  b.hline(0, TILE - 1, by, shade(trim, 0.08));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, shade(trim, -0.08));
  return b;
}

/** Tile de 16x16 da parede sul (tampa + mureta). */
export function southWallTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const cap = capColor(style);
  const capH = 6;
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.08));
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.05));
  const face = shade(style.base, -0.05);
  b.rect(0, capH, TILE, TILE - capH, face);
  b.hline(0, TILE - 1, capH, shade(face, -0.06));
  const trim = style.trim ?? shade(style.base, -0.16);
  b.rect(0, TILE - 2, TILE, 2, trim);
  b.hline(0, TILE - 1, TILE - 2, shade(trim, 0.06));
  if (style.pattern === 'brick' || style.exterior) {
    for (let y = capH + 2; y < TILE - 2; y += 3) b.hline(0, TILE - 1, y, shade(face, -0.035));
  }
  if (col % 4 === 3) b.set(TILE - 1, capH + 1, shade(face, -0.03));
  return b;
}
