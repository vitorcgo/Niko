// Kit de desenho de móveis (puro): materiais, caixas 3/4, sombras de contato e pequenos objetos.
// Convenção 3/4: topo mais claro (lt) com aresta frontal brilhante (hi), face frontal em base/dk,
// luz vindo de cima/esquerda (lado direito mais escuro).
import { mulberry32 } from '../../../../shared/hash';
import { ramp, shade, type Ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';

export const M = {
  oak: ramp('#d9b88e', 0.06),
  oakDark: ramp('#b88c5e', 0.06),
  white: ramp('#e9e8e4', 0.045),
  walnut: ramp('#7a5a45', 0.065),
  steel: ramp('#b9c0ca', 0.06),
  steelDark: ramp('#6d7583', 0.07),
  graphite: ramp('#474d5c', 0.065),
  plastic: ramp('#e4e6ea', 0.045),
  stone: ramp('#e8e6e1', 0.04),
  terracotta: ramp('#c9714a', 0.07),
  ceramic: ramp('#eeebe4', 0.05),
  leaf: ramp('#4c9a55', 0.08),
  leafDark: ramp('#2f7044', 0.07),
  cardboard: ramp('#c99a5e', 0.06),
  blueFabric: ramp('#4f78b8', 0.07),
  orange: ramp('#ec8a3c', 0.07),
} as const;

/** Cores de acento saturadas (pastas, livros, objetos). */
export const ACCENTS = ['#3f7fd8', '#ec8a3c', '#4cae6a', '#e05a5a', '#f2c14e', '#8d66cf', '#36b0b0', '#e47aa8'] as const;

/** Fundo padrão da tela no sprite (igual ao modo 'off': azul-marinho fosco, nunca quase preto). */
export const SCREEN_BG = '#22324f';
export const SCREEN_GLOW = '#4aa3f0';

export type Rng = () => number;

export function rngOf(seed: number, salt = 0): Rng {
  return mulberry32(((seed * 2654435761) ^ (salt * 40503) ^ 0x5bd1e995) >>> 0);
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Face de cima (tampo): base clara, aresta de trás um pouco mais escura e aresta frontal brilhante. */
export function topFace(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp): void {
  b.rect(x, y, w, h, m.lt);
  if (h > 2) b.hline(x, x + w - 1, y, m.base);
  b.hline(x, x + w - 1, y + h - 1, m.hi);
}

/** Face frontal: base, com a última linha escura e bordas laterais sombreadas. */
export function frontFace(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp): void {
  b.rect(x, y, w, h, m.base);
  b.hline(x, x + w - 1, y + h - 1, m.dk);
  b.vline(x + w - 1, y, y + h - 1, m.dk);
  if (h > 1) b.hline(x, x + w - 1, y, m.base);
}

/** Textura sutil de veios de madeira num retângulo (linhas horizontais interrompidas). */
export function woodGrain(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, seed: number, vertical = false): void {
  const r = rngOf(seed, 7);
  if (vertical) {
    for (let xx = x + 2; xx < x + w - 1; xx += 3 + Math.floor(r() * 2)) {
      const y0 = y + Math.floor(r() * h);
      const len = 2 + Math.floor(r() * (h - 1));
      for (let yy = y0; yy < Math.min(y + h, y0 + len); yy++) b.set(xx, yy, m.base);
    }
    return;
  }
  for (let yy = y + 1; yy < y + h - 1; yy += 2 + Math.floor(r() * 2)) {
    const x0 = x + Math.floor(r() * w);
    const len = 3 + Math.floor(r() * (w / 2));
    for (let xx = x0; xx < Math.min(x + w, x0 + len); xx++) b.set(xx, yy, m.base);
  }
}

/** Sombra de contato retangular arredondada, composta por baixo. */
export function contact(b: PixelBuf, x: number, y: number, w: number, h: number, alpha = 0.2): void {
  const c = `rgba(28,32,52,${alpha})`;
  const c2 = `rgba(28,32,52,${alpha * 0.55})`;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const corner = (xx === x || xx === x + w - 1) && (yy === y || yy === y + h - 1);
      if (corner) continue;
      const edge = xx === x || xx === x + w - 1 || yy === y + h - 1;
      b.under(xx, yy, edge ? c2 : c);
    }
  }
}

/** Retângulo composto por baixo do que já existe (sombras em áreas vazadas). */
export function underRect(b: PixelBuf, x: number, y: number, w: number, h: number, c: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) b.under(xx, yy, c);
}

/** Vidro translúcido azulado com reflexos diagonais. */
export function glass(
  b: PixelBuf,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { alpha?: number; streaks?: boolean; period?: number; offset?: number } = {},
): void {
  const a = opts.alpha ?? 0.42;
  b.rect(x, y, w, h, `rgba(168,212,238,${a})`);
  if (opts.streaks === false) return;
  // Reflexos: faixas diagonais (de baixo/esquerda para cima/direita).
  const period = opts.period ?? 9;
  for (let k = -h + (opts.offset ?? 0); k < w; k += period) {
    for (let i = 0; i < h; i++) {
      const xx = x + k + (h - 1 - i);
      const yy = y + i;
      if (xx >= x && xx < x + w) b.set(xx, yy, 'rgba(255,255,255,0.42)');
      if (xx + 1 >= x && xx + 1 < x + w) b.set(xx + 1, yy, 'rgba(255,255,255,0.22)');
    }
  }
  b.hline(x, x + w - 1, y, 'rgba(255,255,255,0.35)');
}

// ------------------------------------------------------------------ objetos pequenos

/** Sombra suave de objeto pousado numa superfície (1px, à direita/abaixo). */
const SURFACE_SHADOW = 'rgba(60,40,40,0.2)';
/** Sombra de contato mais firme para objetos sobre tampo branco (senão eles "somem" no branco). */
const SURFACE_SHADOW_LIGHT = 'rgba(40,46,70,0.3)';

/**
 * Tom dos objetos de mesa: 'light' (padrão, sobre madeira), 'onLight' (um degrau mais escuro e com
 * sombra mais firme, para tampo branco) ou 'dark'.
 */
export type DeskItemTone = 'light' | 'onLight' | 'dark';

export function mug(b: PixelBuf, x: number, y: number, color: string): void {
  // 4x4: borda, café, corpo colorido e alça; sombra na superfície.
  b.hline(x + 1, x + 3, y + 3, SURFACE_SHADOW);
  b.hline(x, x + 2, y, '#f4f2ee');
  b.set(x + 1, y, '#6b4226');
  b.rect(x, y + 1, 3, 2, color);
  b.set(x, y + 1, shade(color, 0.12));
  b.set(x + 2, y + 2, shade(color, -0.12));
  b.set(x + 3, y + 1, shade(color, -0.08));
  b.set(x + 3, y + 2, shade(color, -0.15));
}

export function papers(b: PixelBuf, x: number, y: number, w = 6, h = 4, tone: DeskItemTone = 'light'): void {
  const on = tone === 'onLight';
  b.hline(x + 1, x + w, y + h, on ? SURFACE_SHADOW_LIGHT : SURFACE_SHADOW);
  if (on) b.vline(x + w, y, y + h - 1, SURFACE_SHADOW_LIGHT);
  // Folha de baixo deslocada (aparece como borda) + folha de cima com linhas de texto.
  b.rect(x + 1, y - 1, w, h, on ? '#c4bfb2' : '#dedad0');
  b.rect(x, y, w, h, on ? '#fbfaf6' : '#f8f7f3');
  b.hline(x, x + w - 1, y + h - 1, on ? '#b9b3a6' : '#d6d2c8');
  if (on) b.vline(x + w - 1, y, y + h - 1, '#cfcabd');
  for (let i = 1; i < h - 1; i++) b.hline(x + 1, x + 1 + Math.max(1, w - 3 - (i % 2)), y + i, on ? '#93a0b4' : '#b9c2d0');
}

export function keyboard(b: PixelBuf, x: number, y: number, w = 10, tone: DeskItemTone = 'light'): void {
  const pal =
    tone === 'dark'
      ? { base: '#3d4250', key: '#5a6070', edge: '#2a2e38', sh: SURFACE_SHADOW }
      : tone === 'onLight'
        ? { base: '#b9c0cc', key: '#e4e8ee', edge: '#7d8696', sh: SURFACE_SHADOW_LIGHT }
        : { base: '#d9dce2', key: '#f4f5f7', edge: '#a9aeb8', sh: SURFACE_SHADOW };
  b.hline(x + 1, x + w, y + 3, pal.sh);
  b.rect(x, y, w, 3, pal.base);
  for (let i = 0; i < w - 1; i += 2) {
    b.set(x + 1 + i, y, pal.key);
    b.set(x + i, y + 1, pal.key);
  }
  b.hline(x, x + w - 1, y + 2, pal.edge);
  if (tone === 'onLight') {
    b.vline(x, y, y + 2, '#a3abb8');
    b.vline(x + w - 1, y, y + 2, pal.edge);
  }
}

export function mouse(b: PixelBuf, x: number, y: number, tone: DeskItemTone = 'light'): void {
  const on = tone === 'onLight';
  const dark = tone === 'dark';
  b.hline(x + 1, x + 2, y + 2, on ? SURFACE_SHADOW_LIGHT : SURFACE_SHADOW);
  if (on) b.set(x + 2, y + 1, SURFACE_SHADOW_LIGHT);
  b.rect(x, y, 2, 2, dark ? '#3d4250' : on ? '#c3c9d3' : '#eceef1');
  b.set(x + 1, y + 1, dark ? '#2a2e38' : on ? '#7d8696' : '#b4b9c2');
  if (on) b.set(x, y, '#e4e8ee');
}

/** Monitor visto de frente: moldura, tela (retângulo retornado), pescoço e base. */
export function monitorFront(b: PixelBuf, x: number, y: number, w = 16, h = 11): { x: number; y: number; w: number; h: number } {
  const body = '#2c313d';
  // Sombra do monitor no tampo (luz de cima/esquerda).
  b.hline(x + 3, x + w - 2, y + h + 3, SURFACE_SHADOW);
  b.rect(x, y, w, h, body);
  b.hline(x, x + w - 1, y, '#3e4554');
  b.vline(x, y, y + h - 1, '#363c4a');
  b.hline(x, x + w - 1, y + h - 1, '#232732');
  const sx = x + 1;
  const sy = y + 1;
  const sw = w - 2;
  const sh = h - 2;
  // Fundo padrão = tela desligada (o mundo desenha o conteúdo animado por cima).
  b.rect(sx, sy, sw, sh, SCREEN_BG);
  b.rect(sx, sy, sw, 1, '#2a3d5f');
  for (let i = 0; i < sh; i++) b.set(sx + sw - 3 - i, sy + i, '#2f4569');
  b.set(x + w - 2, y + h - 1, '#5fd07a');
  // Pescoço e base.
  const cx = x + Math.floor(w / 2) - 1;
  b.rect(cx, y + h, 2, 2, '#4a5060');
  b.rect(cx - 2, y + h + 2, 6, 1, '#5b6272');
  b.set(cx - 2, y + h + 2, '#6b7282');
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Conteúdo estático de uma tela secundária (2º monitor / notebook). */
export type StaticScreen = 'sheet' | 'ide' | 'chart';

/**
 * Tela secundária "ligada" com conteúdo fixo um pouco escurecido (~60–75% do brilho da principal):
 * planilha, editor ou painel com gráfico. Quebra o bloco escuro das ilhas de mesas sem competir
 * com a tela animada principal.
 */
export function staticScreen(b: PixelBuf, r: { x: number; y: number; w: number; h: number }, kind: StaticScreen, seed: number): void {
  const { x, y, w, h } = r;
  const rnd = rngOf(seed, 41);
  if (kind === 'sheet') {
    // Planilha: cabeçalho azul, coluna de rótulos, grade e algumas células destacadas.
    b.rect(x, y, w, h, '#b4c0d2');
    b.hline(x, x + w - 1, y, '#5f86c4');
    b.vline(x, y + 1, y + h - 1, '#9aa8bd');
    for (let yy = y + 2; yy < y + h; yy += 2) b.hline(x + 1, x + w - 1, yy, '#a2afc3');
    for (let xx = x + 4; xx < x + w; xx += 4) b.vline(xx, y + 1, y + h - 1, '#a2afc3');
    for (let k = 0; k < 3; k++) {
      const cx = x + 1 + 4 * Math.floor(rnd() * Math.max(1, Math.floor((w - 1) / 4)));
      const cy = y + 1 + 2 * Math.floor(rnd() * Math.max(1, Math.floor((h - 1) / 2)));
      b.rect(cx, cy, Math.min(3, x + w - cx), 1, pick(rnd, ['#6fa784', '#d29b58', '#7d9ad0']));
    }
    return;
  }
  if (kind === 'chart') {
    // Painel: título, barras subindo e linha de base.
    b.rect(x, y, w, h, '#22304a');
    b.hline(x + 1, x + Math.max(1, Math.floor(w / 2)), y + 1, '#6d7f9e');
    const base = y + h - 1;
    b.hline(x, x + w - 1, base, '#3d4f70');
    const cols = ['#4a86c8', '#4fae7a', '#d09a4a'];
    for (let xx = x + 1, i = 0; xx < x + w - 1; xx += 2, i++) {
      const bh = Math.max(1, Math.min(h - 3, 1 + Math.floor(rnd() * (h - 3)) + Math.floor(i / 2)));
      b.vline(xx, base - bh, base - 1, cols[i % cols.length]);
    }
    return;
  }
  // Editor escuro com linhas de código em cores dessaturadas.
  const syn = ['#a0628e', '#4f8fa6', '#a8a35f', '#4f9c68', '#8a72b0', '#b08156'];
  b.rect(x, y, w, h, '#232a3d');
  b.vline(x, y, y + h - 1, '#2c3449');
  for (let yy = y + 1; yy < y + h; yy += 2) {
    let cx = x + 2 + Math.floor(rnd() * 3);
    const tokens = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < tokens && cx < x + w - 1; k++) {
      const tw = Math.min(1 + Math.floor(rnd() * 4), x + w - 1 - cx);
      b.hline(cx, cx + tw - 1, yy, pick(rnd, syn));
      cx += tw + 1;
    }
  }
}

/**
 * Traseira de monitor (para desk_back): carcaça de plástico (clara por padrão, cinza média em
 * mesas escuras) com 3 tons + contorno próprio, faixa de ventilação, ressalto do suporte VESA com
 * logo, pé visível e cabo. Nunca escura como uma tela — o verso tem que ler como verso.
 */
export function monitorBack(b: PixelBuf, x: number, y: number, w = 16, h = 10, tone: 'light' | 'mid' = 'light'): void {
  const p =
    tone === 'mid'
      ? { hi: '#b4bcc8', lt: '#a3abb8', base: '#8f98a6', dk: '#747d8c', line: '#454c5a', stand: '#6b7383', foot: '#596170' }
      : { hi: '#e6eaf0', lt: '#d8dee6', base: '#c9d0da', dk: '#aab3c0', line: '#5b6577', stand: '#9aa3b0', foot: '#7d8696' };
  const cx = x + Math.floor(w / 2);
  // Sombra do monitor no tampo.
  b.hline(x + 2, x + w - 1, y + h + 3, SURFACE_SHADOW_LIGHT);
  // Pé (base + pescoço) desenhado antes da carcaça, aparecendo embaixo dela.
  b.rect(cx - 4, y + h + 1, 8, 2, p.foot);
  b.hline(cx - 4, cx + 3, y + h + 1, p.stand);
  b.set(cx - 4, y + h + 2, p.line);
  b.set(cx + 3, y + h + 2, p.line);
  b.rect(cx - 1, y + h - 1, 2, 3, p.stand);
  b.vline(cx, y + h - 1, y + h + 1, p.dk);
  // Carcaça: topo brilhante, lateral esquerda clara, direita/base sombreadas, contorno próprio
  // (as laterais ficam sobre o tampo, onde o contorno automático não chega).
  b.rect(x, y, w, h, p.base);
  b.hline(x + 1, x + w - 2, y + 1, p.lt);
  b.vline(x + 1, y + 1, y + h - 2, p.lt);
  b.vline(x + w - 2, y + 1, y + h - 2, p.dk);
  b.hline(x + 1, x + w - 2, y + h - 2, p.dk);
  b.hline(x, x + w - 1, y, p.hi);
  b.vline(x, y + 1, y + h - 1, p.line);
  b.vline(x + w - 1, y + 1, y + h - 1, p.line);
  b.hline(x, x + w - 1, y + h - 1, p.line);
  b.set(x, y, p.lt);
  b.set(x + w - 1, y, p.dk);
  // Faixa de ventilação (fendas alternadas) perto do topo.
  for (let xx = x + 3; xx <= x + w - 4; xx += 2) b.set(xx, y + 2, p.dk);
  // Ressalto do suporte VESA com logo discreto.
  b.rect(cx - 3, y + 4, 6, Math.max(2, h - 6), p.lt);
  b.hline(cx - 3, cx + 2, y + 4, p.hi);
  b.hline(cx - 3, cx + 2, y + 4 + Math.max(2, h - 6) - 1, p.dk);
  b.vline(cx + 2, y + 5, y + 4 + Math.max(2, h - 6) - 1, p.dk);
  b.set(cx - 1, y + 5, tone === 'mid' ? '#cfd5de' : '#f6f8fb');
  b.set(cx, y + 5, tone === 'mid' ? '#cfd5de' : '#f6f8fb');
  // Cabo descendo pela lateral do pé.
  b.vline(cx + 2, y + h, y + h + 2, p.line);
}

export function pencilCup(b: PixelBuf, x: number, y: number): void {
  b.set(x, y - 2, '#e05a5a');
  b.set(x + 1, y - 3, '#3f7fd8');
  b.set(x + 2, y - 2, '#f2c14e');
  b.rect(x, y - 1, 3, 3, '#5b6272');
  b.set(x, y - 1, '#7a8292');
}

export function smallSucculent(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 4, 3, '#e3e1db');
  b.set(x + 3, y + 1, '#c2bfb7');
  b.set(x + 3, y + 2, '#c2bfb7');
  b.set(x + 1, y - 1, '#6fbf6a');
  b.set(x + 2, y - 1, '#4c9a55');
  b.set(x, y - 2, '#6fbf6a');
  b.set(x + 3, y - 2, '#4c9a55');
  b.set(x + 1, y - 3, '#8fd68a');
  b.set(x + 2, y - 2, '#3e8a4c');
}

export function photoFrame(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 4, 4, '#3a3f4b');
  b.rect(x + 1, y + 1, 2, 2, '#8fc8f0');
  b.set(x + 1, y + 2, '#6fbf6a');
}

export function book(b: PixelBuf, x: number, y: number, w: number, h: number, color: string): void {
  b.rect(x, y, w, h, color);
  b.vline(x, y, y + h - 1, shade(color, 0.1));
  b.vline(x + w - 1, y, y + h - 1, shade(color, -0.12));
  if (h > 4) b.hline(x, x + w - 1, y + 1, shade(color, 0.22));
  if (h > 6 && w > 1) b.hline(x, x + w - 1, y + h - 3, shade(color, 0.22));
}

/**
 * Copa/folhagem em "bolhas" (estilo tileset): massa escura de fundo e bolhas de folhas desenhadas
 * de cima para baixo, cada uma com aro claro no alto/esquerda e sombra embaixo/direita. As bolhas
 * de baixo ficam mais escuras, dando volume.
 */
export function foliage(b: PixelBuf, cx: number, cy: number, rx: number, ry: number, m: Ramp, seed: number): void {
  const r = rngOf(seed, 3);
  b.ellipse(cx, cy + 0.5, rx, ry, m.dd);
  const bubbles: [number, number, number][] = [];
  const br = Math.max(1.6, Math.min(rx, ry) * 0.55);
  for (let gy = -ry + br * 0.6; gy <= ry - br * 0.4; gy += br * 1.05) {
    for (let gx = -rx + br * 0.6; gx <= rx - br * 0.4; gx += br * 1.15) {
      const jx = gx + (r() - 0.5) * br * 0.7;
      const jy = gy + (r() - 0.5) * br * 0.6;
      if ((jx / rx) ** 2 + (jy / ry) ** 2 > 0.82) continue;
      bubbles.push([cx + jx, cy + jy, br * (0.85 + r() * 0.35)]);
    }
  }
  bubbles.sort((a, c) => a[1] - c[1]);
  for (const [bx, by, rad] of bubbles) {
    const low = (by - cy) / ry; // -1 topo .. 1 base
    const left = (cx - bx) / rx;
    const body = low > 0.35 ? m.dk : low > -0.2 || left < -0.4 ? m.base : m.lt;
    for (let y = Math.floor(by - rad); y <= Math.ceil(by + rad); y++) {
      for (let x = Math.floor(bx - rad); x <= Math.ceil(bx + rad); x++) {
        const dx = (x + 0.5 - bx) / rad;
        const dy = (y + 0.5 - by) / (rad * 0.9);
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        let c = body;
        if (d > 0.4 && dx + dy * 1.3 < -0.75) c = body === m.lt ? m.hi : body === m.base ? m.lt : m.base;
        else if (d > 0.5 && dx * 0.4 + dy > 0.7) c = body === m.lt ? m.base : m.dd;
        b.set(x, y, c);
      }
    }
  }
}

/**
 * Folha grande de (x0,y0) até a ponta (x1,y1). Antes do preenchimento desenha um anel escuro
 * (borda) para separar folhas sobrepostas. `cuts`: 'monstera' (3 recortes largos) ou 'pinnate'
 * (folíolos: recortes alternados ao longo de toda a lâmina, como fronde de palmeira).
 */
export function bigLeaf(
  b: PixelBuf,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  m: Ramp,
  cuts: 'monstera' | 'pinnate' | 'none' = 'monstera',
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const nx = -uy;
  const ny = ux;
  const steps = Math.ceil(len * 3);
  const shapeW = (t: number) => (width / 2) * Math.sin(Math.PI * Math.pow(Math.min(1, t), 0.7));
  const paint = (grow: number, color: (k: number) => string) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const w = shapeW(t) + grow;
      for (let k = -w; k <= w; k += 0.4) {
        b.set(Math.round(x0 + ux * len * t + nx * k), Math.round(y0 + uy * len * t + ny * k), color(k));
      }
    }
    if (grow > 0) b.set(Math.round(x1 + ux * grow), Math.round(y1 + uy * grow), m.dd);
  };
  paint(0.9, () => m.dd);
  paint(0, (k) => (nx * k + ny * k < 0 ? m.lt : m.base));
  b.line(Math.round(x0), Math.round(y0), Math.round(x0 + ux * len * 0.92), Math.round(y0 + uy * len * 0.92), m.dk);
  b.set(Math.round(x0 + ux * len * 0.3 + nx * -shapeW(0.3) * 0.5), Math.round(y0 + uy * len * 0.3 + ny * -shapeW(0.3) * 0.5), m.hi);
  if (cuts === 'none') return;
  const cutList: [number, number][] =
    cuts === 'monstera'
      ? [[0.42, 1], [0.6, -1], [0.76, 1]]
      : Array.from({ length: Math.floor(len / 1.2) }, (_, i) => [0.18 + (i * 1.2) / len, i % 2 ? 1 : -1] as [number, number]).filter(([t]) => t < 0.95);
  for (const [t, side] of cutList) {
    const w = shapeW(t);
    for (let k = w * 0.35; k <= w + 0.5; k += 0.4) {
      const x = Math.round(x0 + ux * len * (t + 0.04) + nx * k * side);
      const y = Math.round(y0 + uy * len * (t + 0.04) + ny * k * side);
      if (cuts === 'pinnate') b.clear(x, y);
      else b.set(x, y, m.dd);
    }
  }
}

/** Folha alongada (lâmina) de (x0,y0) até a ponta (x1,y1), com nervura central. */
export function leafBlade(b: PixelBuf, x0: number, y0: number, x1: number, y1: number, width: number, m: Ramp, light: boolean): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len * 2);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.5;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    for (let k = -w; k <= w; k += 0.5) b.set(Math.round(px + nx * k), Math.round(py + ny * k), k < 0 === light ? m.lt : m.base);
  }
  b.line(x0, y0, Math.round(x0 + (x1 - x0) * 0.85), Math.round(y0 + (y1 - y0) * 0.85), m.dk);
}

/** Vaso de cerâmica/terracota (topo com aro, corpo afunilado) — (x, y) = canto superior esquerdo. */
export function pot(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp = M.terracotta): void {
  b.rect(x, y, w, 2, m.lt);
  b.hline(x, x + w - 1, y, m.hi);
  b.hline(x + 1, x + w - 2, y + 1, shade(m.dd, -0.1));
  for (let i = 2; i < h; i++) {
    const inset = i >= h - 2 ? 1 : 0;
    b.hline(x + inset, x + w - 1 - inset, y + i, m.base);
    b.set(x + inset, y + i, m.lt);
    b.set(x + w - 1 - inset, y + i, m.dk);
    if (i === h - 1) b.hline(x + inset, x + w - 1 - inset, y + i, m.dk);
  }
}
