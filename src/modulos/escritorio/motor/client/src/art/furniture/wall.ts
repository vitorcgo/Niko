// Itens montados na parede norte. Coordenadas de desenho: x = 0 na borda esquerda do trecho,
// y = 0 na linha do rodapé; a face da parede vai de y = -32 (topo, com a tampa até -28) a 0.
import { ramp, shade } from '../core/color';
import { rectAt, wallSheet, type BufFurniture } from '../core/sprite';
import { ACCENTS, M, book, foliage, glass, mug, pick, pot, rngOf, smallSucculent } from './kit';

/** Sombra suave projetada na parede (abaixo/direita do objeto). */
function wallShadow(b: import('../core/pixbuf').PixelBuf, x: number, y: number, w: number, h: number): void {
  for (let yy = y + 1; yy <= y + h; yy++) b.under(x + w, yy, 'rgba(30,34,52,0.16)');
  for (let xx = x + 1; xx <= x + w; xx++) b.under(xx, y + h, 'rgba(30,34,52,0.16)');
}

export function whiteboard(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const frame = ramp('#c3cad4', 0.06);
  const x = 2;
  const y = -27;
  const w = 44;
  const h = 19;
  b.rect(x, y, w, h, frame.base);
  b.hline(x, x + w - 1, y, frame.hi);
  b.vline(x, y, y + h - 1, frame.lt);
  b.vline(x + w - 1, y, y + h - 1, frame.dk);
  b.hline(x, x + w - 1, y + h - 1, frame.dk);
  b.rect(x + 1, y + 1, w - 2, h - 2, '#fbfcfd');
  // Reflexo sutil.
  b.line(x + 30, y + 1, x + 24, y + h - 2, 'rgba(210,225,240,0.5)');
  b.line(x + 33, y + 1, x + 27, y + h - 2, 'rgba(210,225,240,0.35)');
  // Bandeja com pincéis e apagador.
  b.rect(x + 3, y + h, w - 6, 2, frame.base);
  b.hline(x + 3, x + w - 4, y + h, frame.lt);
  for (const [i, c] of [[0, '#e05a5a'], [3, '#3f7fd8'], [6, '#2b2f3b'], [9, '#4cae6a']] as const) {
    b.rect(x + 8 + i, y + h - 1, 2, 1, c);
  }
  b.rect(x + w - 14, y + h - 2, 5, 2, '#3a3f4b');
  b.hline(x + w - 14, x + w - 10, y + h - 2, '#f2efe6');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 3);
  s.rects = { board: rectAt(s, x + 2, y + 2, w - 4, h - 4) };
  return { base: s };
}

export function windowItem(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const fr = ramp('#f4f4f1', 0.05);
  const x = 2;
  const y = -27;
  const w = 28;
  const h = 19;
  // Moldura (o vidro fica transparente: o mundo desenha o céu antes).
  b.rect(x, y, w, 2, fr.lt);
  b.rect(x, y + h - 2, w, 2, fr.base);
  b.rect(x, y, 2, h, fr.lt);
  b.rect(x + w - 2, y, 2, h, fr.base);
  b.hline(x, x + w - 1, y, fr.hi);
  b.vline(x + w - 1, y, y + h - 1, fr.dk);
  // Montantes.
  b.rect(x + 13, y + 2, 2, h - 4, fr.base);
  b.vline(x + 14, y + 2, y + h - 3, fr.dk);
  b.hline(x + 2, x + w - 3, y + 2, 'rgba(40,50,70,0.25)');
  // Vidro: só reflexos semitransparentes.
  const gx = x + 2;
  const gy = y + 2;
  const gw = w - 4;
  const gh = h - 4;
  for (const off of [3, 16]) {
    b.line(gx + off + 6, gy, gx + off, gy + gh - 1, 'rgba(255,255,255,0.28)');
    b.line(gx + off + 7, gy, gx + off + 1, gy + gh - 1, 'rgba(255,255,255,0.16)');
  }
  // Peitoril.
  b.rect(x - 1, y + h, w + 2, 2, fr.lt);
  b.hline(x - 1, x + w, y + h, fr.hi);
  b.hline(x - 1, x + w, y + h + 1, fr.dk);
  b.outline();
  wallShadow(b, x - 1, y, w + 2, h + 3);
  s.rects = { glass: rectAt(s, gx, gy, gw, gh) };
  return { base: s };
}

export function clock(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const cx = 8;
  const cy = -21.5;
  b.ellipse(cx, cy, 6.5, 6.5, '#3a3f4b');
  b.ellipse(cx, cy, 5.5, 5.5, '#fbfbf8');
  b.ellipse(cx - 1, cy - 1, 3, 3, '#ffffff');
  // Marcações das horas.
  for (const [dx, dy] of [[0, -5], [5, 0], [0, 4], [-5, 0]] as const) b.set(Math.floor(cx + dx), Math.floor(cy + dy), '#5a6070');
  b.outline();
  wallShadow(b, 1, -29, 14, 14);
  s.rects = { face: rectAt(s, 3, -27, 10, 10) };
  return { base: s };
}

export function poster(variant: string | undefined): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 12;
  const h = 16;
  b.rect(x, y, w, h, '#2f3440');
  const ix = x + 1;
  const iy = y + 1;
  const iw = w - 2;
  const ih = h - 2;
  switch (variant ?? 'code') {
    case 'coffee': {
      b.rect(ix, iy, iw, ih, '#f2d7b0');
      b.rect(ix, iy + ih - 4, iw, 4, '#c98a52');
      mug(b, ix + 3, iy + 5, '#e2604f');
      b.set(ix + 4, iy + 3, '#ffffff');
      b.set(ix + 5, iy + 2, '#ffffff');
      b.set(ix + 4, iy + 1, '#ffffff');
      b.hline(ix + 2, ix + 7, iy + ih - 2, '#f4efe2');
      break;
    }
    case 'rocket': {
      b.rect(ix, iy, iw, ih, '#24325a');
      for (const [px, py] of [[1, 2], [8, 1], [6, 5], [2, 9], [9, 8]] as const) b.set(ix + px, iy + py, '#f7e7a1');
      b.rect(ix + 4, iy + 3, 2, 6, '#f4f2ee');
      b.set(ix + 4, iy + 2, '#e05a5a');
      b.set(ix + 5, iy + 2, '#e05a5a');
      b.set(ix + 4, iy + 5, '#5bc0de');
      b.set(ix + 3, iy + 8, '#e05a5a');
      b.set(ix + 6, iy + 8, '#e05a5a');
      b.rect(ix + 4, iy + 9, 2, 2, '#f2a03d');
      b.set(ix + 4, iy + 11, '#f7d154');
      b.hline(ix, ix + iw - 1, iy + ih - 1, '#3b4a7a');
      break;
    }
    case 'cat': {
      b.rect(ix, iy, iw, ih, '#f7c9d4');
      const c = '#3a3f4b';
      b.set(ix + 2, iy + 4, c);
      b.set(ix + 7, iy + 4, c);
      b.rect(ix + 2, iy + 5, 6, 5, c);
      b.set(ix + 3, iy + 7, '#f7d154');
      b.set(ix + 6, iy + 7, '#f7d154');
      b.set(ix + 4, iy + 8, '#e47aa8');
      b.set(ix + 5, iy + 8, '#e47aa8');
      b.hline(ix + 1, ix + 8, iy + ih - 2, '#e47aa8');
      break;
    }
    case 'bug': {
      b.rect(ix, iy, iw, ih, '#f7d154');
      const c = '#3a3f4b';
      b.rect(ix + 3, iy + 5, 4, 5, '#4cae6a');
      b.vline(ix + 5, iy + 5, iy + 9, c);
      b.rect(ix + 4, iy + 3, 2, 2, c);
      for (const dy of [5, 7, 9]) {
        b.set(ix + 2, iy + dy, c);
        b.set(ix + 7, iy + dy, c);
      }
      b.line(ix + 1, iy + 1, ix + 8, iy + 12, '#e05a5a');
      break;
    }
    case 'ship_it': {
      b.rect(ix, iy, iw, ih, '#bfe3f2');
      b.rect(ix, iy + 9, iw, 5, '#3f7fd8');
      b.hline(ix, ix + iw - 1, iy + 9, '#8fc8f0');
      b.rect(ix + 2, iy + 7, 6, 2, '#e05a5a');
      b.hline(ix + 3, ix + 6, iy + 9, '#a83232');
      b.vline(ix + 5, iy + 1, iy + 6, '#6b4a32');
      b.rect(ix + 6, iy + 2, 3, 2, '#f4f2ee');
      b.set(ix + 1, iy + 2, '#f7d154');
      break;
    }
    default: {
      // code: editor escuro com linhas coloridas e "</>".
      b.rect(ix, iy, iw, ih, '#1f2433');
      const cols = ['#ff79c6', '#8be9fd', '#f1fa8c', '#50fa7b', '#bd93f9'];
      for (let i = 0; i < 6; i++) b.hline(ix + 1 + (i % 3), ix + 2 + ((i * 3) % 5) + 2, iy + 1 + i * 2, cols[i % cols.length]);
      break;
    }
  }
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  return { base: s };
}

export function painting(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const fr = ramp('#c89b5c', 0.07);
  const x = 3;
  const y = -27;
  const w = 26;
  const h = 17;
  b.rect(x, y, w, h, fr.base);
  b.hline(x, x + w - 1, y, fr.hi);
  b.vline(x, y, y + h - 1, fr.lt);
  b.vline(x + w - 1, y, y + h - 1, fr.dk);
  b.hline(x, x + w - 1, y + h - 1, fr.dk);
  const ax = x + 2;
  const ay = y + 2;
  const aw = w - 4;
  const ah = h - 4;
  // Paisagem padrão: céu, sol, montanhas e lago.
  const r = rngOf(seed, 41);
  const warm = r() < 0.5;
  for (let i = 0; i < ah; i++) b.hline(ax, ax + aw - 1, ay + i, shade(warm ? '#f6c48a' : '#9fd3f0', -i * 0.012));
  b.ellipse(ax + 15, ay + 3, 2, 2, warm ? '#fff2c2' : '#fffbe6');
  const mt = warm ? '#7a5a8a' : '#5a7fa8';
  for (let i = 0; i < aw; i++) {
    const hh = Math.round(3 + 2.5 * Math.sin(i * 0.55 + seed) + 1.5 * Math.sin(i * 1.3));
    b.vline(ax + i, ay + ah - 4 - hh, ay + ah - 4, mt);
    b.set(ax + i, ay + ah - 4 - hh, shade(mt, 0.15));
  }
  b.rect(ax, ay + ah - 4, aw, 4, warm ? '#4f8a6a' : '#3f7fb0');
  b.hline(ax + 3, ax + 9, ay + ah - 3, 'rgba(255,255,255,0.5)');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  s.rects = { art: rectAt(s, ax, ay, aw, ah) };
  return { base: s };
}

export function tv(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 1;
  const y = -27;
  const w = 30;
  const h = 18;
  b.rect(x, y, w, h, '#23262f');
  b.hline(x, x + w - 1, y, '#3a3f4b');
  b.hline(x, x + w - 1, y + h - 1, '#15171d');
  b.rect(x + 1, y + 1, w - 2, h - 3, '#151b26');
  b.line(x + 20, y + 1, x + 12, y + h - 3, 'rgba(255,255,255,0.08)');
  b.line(x + 22, y + 1, x + 14, y + h - 3, 'rgba(255,255,255,0.05)');
  b.set(x + w - 3, y + h - 2, '#e05a5a');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  s.rects = { tv: rectAt(s, x + 1, y + 1, w - 2, h - 3) };
  return { base: s };
}

export function lightSwitch(variant: string | undefined): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const on = (variant ?? 'on') === 'on';
  b.rect(6, -19, 5, 7, '#f6f6f3');
  b.hline(6, 10, -19, '#ffffff');
  b.vline(10, -19, -13, '#d3d6dc');
  b.hline(6, 10, -13, '#c9cdd4');
  b.rect(7, -17, 3, 3, on ? '#e9ebee' : '#d5d8de');
  b.hline(7, 9, on ? -17 : -15, on ? '#ffffff' : '#b9bec7');
  b.hline(7, 9, on ? -15 : -17, on ? '#c3c8d0' : '#f4f5f7');
  b.set(8, -18, on ? '#7be08a' : '#9aa1ad');
  b.outline();
  return { base: s };
}

export function elevator(state: number): BufFurniture {
  const s = wallSheet(2, 2);
  const b = s.buf;
  const st = Math.max(0, Math.min(4, Math.round(state)));
  const frame = ramp('#aeb6c2', 0.06);
  const door = ramp('#c9d0d9', 0.05);
  // Moldura de aço escovado.
  b.rect(0, -28, 32, 28, frame.base);
  b.hline(0, 31, -28, frame.hi);
  b.vline(0, -28, -1, frame.lt);
  b.vline(31, -28, -1, frame.dk);
  // Painel indicador.
  b.rect(10, -27, 12, 3, '#22262f');
  const lit = st > 0;
  b.set(13, -26, lit ? '#5fd07a' : '#3b4a3f');
  b.set(12, -25, lit ? '#5fd07a' : '#3b4a3f');
  b.set(14, -25, lit ? '#5fd07a' : '#3b4a3f');
  b.rect(16, -26, 4, 1, lit ? '#f2c14e' : '#4a4535');
  // Vão interno (cabine): luz quente, parede de fundo e corrimão.
  const ix = 3;
  const iy = -23;
  const iw = 26;
  const ih = 23;
  b.rect(ix, iy, iw, ih, '#f3e2bf');
  b.rect(ix, iy, iw, 3, '#fff3d6');
  b.rect(ix + 2, iy + 3, iw - 4, ih - 7, '#e4caa0');
  b.hline(ix + 2, ix + iw - 3, iy + 12, '#b9c0ca');
  b.rect(ix, iy + ih - 4, iw, 4, '#b89a72');
  b.hline(ix, ix + iw - 1, iy + ih - 4, '#a5865f');
  // Portas deslizantes: cada folha recua 3px por estado.
  const leaf = 13;
  const open = st * 3;
  const drawLeaf = (x0: number, w: number) => {
    if (w <= 0) return;
    b.rect(x0, iy, w, ih, door.base);
    b.hline(x0, x0 + w - 1, iy, door.hi);
    b.vline(x0, iy, iy + ih - 1, door.lt);
    b.vline(x0 + w - 1, iy, iy + ih - 1, door.dk);
    for (let k = 2; k < w - 1; k += 4) b.vline(x0 + k, iy + 2, iy + ih - 3, 'rgba(255,255,255,0.18)');
  };
  drawLeaf(ix, leaf - open);
  drawLeaf(ix + leaf + open, leaf - open);
  if (st === 0) b.vline(ix + leaf, iy, iy + ih - 1, door.dd);
  // Botoeira lateral.
  b.rect(29, -15, 2, 4, '#22262f');
  b.set(29, -14, lit ? '#f2c14e' : '#6b7282');
  b.set(29, -12, '#6b7282');
  b.outline();
  return { base: s };
}

export function doorFrame(): BufFurniture {
  const s = wallSheet(2, 3);
  const b = s.buf;
  const tr = ramp('#f2f1ed', 0.05);
  // Batentes laterais e verga.
  b.rect(-2, -27, 3, 27, tr.base);
  b.vline(-2, -27, -1, tr.hi);
  b.vline(0, -26, -1, tr.dk);
  b.rect(31, -27, 3, 27, tr.base);
  b.vline(31, -26, -1, tr.dk);
  b.vline(33, -27, -1, tr.dd);
  b.rect(-2, -30, 36, 3, tr.lt);
  b.hline(-2, 33, -30, tr.hi);
  b.hline(1, 30, -27, 'rgba(30,34,52,0.35)');
  b.outline();
  return { base: s };
}

export function sign(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const x = 3;
  const y = -28;
  const w = 42;
  const h = 11;
  const fr = ramp('#3a4256', 0.07);
  b.rect(x, y, w, h, fr.base);
  b.hline(x, x + w - 1, y, fr.lt);
  b.hline(x, x + w - 1, y + h - 1, fr.dd);
  b.rect(x + 1, y + 1, w - 2, h - 2, '#f7f3e8');
  b.hline(x + 1, x + w - 2, y + 1, '#ffffff');
  b.hline(x + 1, x + w - 2, y + h - 2, '#e6e0cf');
  // Parafusos.
  b.set(x + 2, y + 2, '#b9c0ca');
  b.set(x + w - 3, y + 2, '#b9c0ca');
  b.set(x + 2, y + h - 3, '#b9c0ca');
  b.set(x + w - 3, y + h - 3, '#b9c0ca');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  s.rects = { sign: rectAt(s, x + 4, y + 2, w - 8, h - 4) };
  return { base: s };
}

export function mirror(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 12;
  const h = 14;
  const fr = ramp('#c3cad4', 0.06);
  b.rect(x, y, w, h, fr.base);
  b.hline(x, x + w - 1, y, fr.hi);
  b.vline(x + w - 1, y, y + h - 1, fr.dk);
  b.rect(x + 1, y + 1, w - 2, h - 2, '#cfe6f2');
  glass(b, x + 1, y + 1, w - 2, h - 2, { alpha: 0.5 });
  b.line(x + 8, y + 1, x + 3, y + h - 2, 'rgba(255,255,255,0.75)');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  // Vidro (sem a moldura): o mundo pode desenhar ali o reflexo de quem está diante da pia.
  s.rects = { glass: rectAt(s, x + 1, y + 1, w - 2, h - 2) };
  return { base: s };
}

export function shelfWall(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const r = rngOf(seed, 51);
  const w = M.oak;
  const plank = (y: number) => {
    b.rect(1, y, 30, 2, w.lt);
    b.hline(1, 30, y, w.hi);
    b.hline(1, 30, y + 1, w.dk);
    for (const x of [4, 26]) b.rect(x, y + 2, 2, 2, '#5a6070');
  };
  // Prateleira de cima: livros + planta; de baixo: caixas, troféu, caneca.
  plank(-19);
  plank(-9);
  let x = 3;
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const bw = 1 + Math.floor(r() * 2);
    const bh = 5 + Math.floor(r() * 3);
    book(b, x, -19 - bh, bw, bh, pick(r, ACCENTS));
    x += bw;
  }
  b.line(x, -20, x + 3, -25, pick(r, ACCENTS));
  b.line(x + 1, -20, x + 4, -25, pick(r, ACCENTS));
  pot(b, 21, -23, 5, 4, M.ceramic);
  foliage(b, 23.5, -25, 3, 2.2, M.leaf, seed + 2);
  b.line(22, -23, 20, -20, M.leaf.dk);
  b.line(25, -23, 27, -19, M.leaf.base);
  // Prateleira de baixo.
  const v = seed % 3;
  if (v === 0) {
    b.rect(3, -14, 6, 5, '#e9e4d6');
    b.hline(3, 8, -14, '#f7f3e8');
    b.rect(4, -12, 4, 1, '#c9bfa6');
    b.rect(11, -13, 3, 2, '#f2c14e');
    b.set(10, -13, '#d9a42e');
    b.set(14, -13, '#d9a42e');
    b.set(12, -11, '#d9a42e');
    b.rect(11, -10, 3, 1, '#6b4a32');
    mug(b, 18, -13, '#3f7fd8');
    smallSucculent(b, 24, -12);
  } else if (v === 1) {
    for (let i = 0; i < 4; i++) book(b, 4 + i * 2, -16, 2, 7, pick(r, ACCENTS));
    b.rect(14, -13, 7, 4, '#c99a5e');
    b.hline(14, 20, -13, '#dcb27a');
    b.rect(23, -15, 4, 6, '#3a3f4b');
    b.rect(24, -14, 2, 2, '#8fc8f0');
  } else {
    smallSucculent(b, 4, -12);
    b.rect(10, -15, 5, 6, '#f4f2ee');
    b.rect(11, -14, 3, 3, '#e47aa8');
    for (let i = 0; i < 3; i++) book(b, 18 + i * 2, -15 + (i % 2), 2, 6 - (i % 2), pick(r, ACCENTS));
  }
  b.outline();
  return { base: s };
}
