// Utilitários de cor (puros): parse, mistura e rampas de sombreado com deslocamento de matiz.
// Sombras puxam para o azul (frio) e brilhos para o amarelo (quente), como em pixel art tradicional.

export type RGBA = readonly [number, number, number, number];

const parseCache = new Map<string, RGBA>();
const MAGENTA: RGBA = [255, 0, 255, 255];

/** Converte '#rgb', '#rrggbb', '#rrggbbaa', 'rgb()/rgba()' e 'hsl()/hsla()' em RGBA (0–255). */
export function parseColor(c: string): RGBA {
  let v = parseCache.get(c);
  if (!v) {
    v = parseUncached(c);
    parseCache.set(c, v);
  }
  return v;
}

function parseUncached(c: string): RGBA {
  const s = c.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const n = [...hex].map((ch) => parseInt(ch + ch, 16));
      return [n[0], n[1], n[2], hex.length === 4 ? n[3] : 255];
    }
    if (hex.length === 6 || hex.length === 8) {
      const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      return [n(0), n(2), n(4), hex.length === 8 ? n(6) : 255];
    }
    return MAGENTA;
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!fn) return MAGENTA;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  const num = (p: string | undefined, scale: number) => {
    if (p === undefined) return 1;
    return p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p);
  };
  const alphaOf = (p: string | undefined) => {
    if (p === undefined) return 255;
    const a = p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p);
    return Math.round(clamp01(a) * 255);
  };
  if (fn[1].startsWith('rgb')) {
    return [
      Math.round(num(parts[0], 255)),
      Math.round(num(parts[1], 255)),
      Math.round(num(parts[2], 255)),
      alphaOf(parts[3]),
    ];
  }
  const h = parseFloat(parts[0] ?? '0');
  const sat = num(parts[1], 1);
  const lig = num(parts[2], 1);
  const [r, g, b] = hslToRgb(h, sat, lig);
  return [r, g, b, alphaOf(parts[3])];
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function toHex(r: number, g: number, b: number, a = 255): string {
  return a >= 255 ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(ch(hh + 1 / 3) * 255), Math.round(ch(hh) * 255), Math.round(ch(hh - 1 / 3) * 255)];
}

/** Move a matiz `h` em direção a `target` por até `deg` graus (caminho mais curto). */
function towardHue(h: number, target: number, deg: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < deg) return target;
  d = Math.sign(d) * deg;
  return (h + d + 360) % 360;
}

const shadeCache = new Map<string, string>();

/**
 * Clareia (k > 0) ou escurece (k < 0) uma cor em `k` de luminosidade HSL, com deslocamento de matiz:
 * sombras vão para o azul-violeta e luzes para o amarelo. Mantém o alfa.
 */
export function shade(c: string, k: number): string {
  if (k === 0) return c;
  const key = `${c}|${k}`;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const [r, g, b, a] = parseColor(c);
  let [h, s, l] = rgbToHsl(r, g, b);
  const amt = Math.abs(k);
  if (k < 0) {
    h = towardHue(h, 235, amt * 55 * Math.min(1, s * 2 + 0.2));
    s = clamp01(s + amt * 0.12);
  } else {
    h = towardHue(h, 48, amt * 35 * Math.min(1, s * 2 + 0.2));
    s = clamp01(s - amt * 0.05);
  }
  l = clamp01(l + k);
  const [nr, ng, nb] = hslToRgb(h, s, l);
  const out = toHex(nr, ng, nb, a);
  shadeCache.set(key, out);
  return out;
}

/** Mistura linear entre duas cores (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const u = clamp01(t);
  return toHex(
    ca[0] + (cb[0] - ca[0]) * u,
    ca[1] + (cb[1] - ca[1]) * u,
    ca[2] + (cb[2] - ca[2]) * u,
    ca[3] + (cb[3] - ca[3]) * u,
  );
}

/** Mesma cor com outro alfa (0–1). */
export function withAlpha(c: string, a: number): string {
  const [r, g, b] = parseColor(c);
  return toHex(r, g, b, Math.round(clamp01(a) * 255));
}

/** Luminância relativa aproximada (0–1). */
export function luminance(c: string): number {
  const [r, g, b] = parseColor(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Saturação/luminosidade ajustadas diretamente (sem deslocamento de matiz). */
export function tone(c: string, opts: { s?: number; l?: number; h?: number }): string {
  const [r, g, b, a] = parseColor(c);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h + (opts.h ?? 0), clamp01(s + (opts.s ?? 0)), clamp01(l + (opts.l ?? 0)));
  return toHex(nr, ng, nb, a);
}

/** Rampa de 5 tons de um material: brilho, claro, base, sombra, sombra profunda. */
export interface Ramp {
  hi: string;
  lt: string;
  base: string;
  dk: string;
  dd: string;
}

const rampCache = new Map<string, Ramp>();

export function ramp(base: string, step = 0.08): Ramp {
  const key = `${base}|${step}`;
  let r = rampCache.get(key);
  if (!r) {
    r = {
      hi: shade(base, step * 2),
      lt: shade(base, step),
      base,
      dk: shade(base, -step),
      dd: shade(base, -step * 2),
    };
    rampCache.set(key, r);
  }
  return r;
}

/** Cor de contorno: versão bem escura da cor vizinha, puxada para o cinza-azulado padrão. */
export const OUTLINE = '#272b3b';
const outlineCache = new Map<number, string>();

export function outlineFor(r: number, g: number, b: number): string {
  const key = (r << 16) | (g << 8) | b;
  let v = outlineCache.get(key);
  if (!v) {
    v = mix(shade(toHex(r, g, b), -0.45), OUTLINE, 0.7);
    outlineCache.set(key, v);
  }
  return v;
}
