// Ciclo dia/noite (puro): fase do dia, nível de luz e as cores de multiplicação do exterior e dos
// interiores pela hora local, a hora efetiva (preferência, ?hora= da URL) e a leitura do parâmetro.
// O desenho (mapa de luz, halos) fica em lighting.ts.
import type { DaylightMode } from '../api';

export type { DaylightMode };
export type DayPhase = 'madrugada' | 'amanhecer' | 'dia' | 'entardecer' | 'noite';

export type Rgb = readonly [number, number, number];

export interface Ambient {
  hour: number;
  phase: DayPhase;
  /** 0 = dia pleno, 1 = noite fechada. */
  night: number;
  /** 0..1: força do tom quente do amanhecer/entardecer. */
  warm: number;
  /** Multiplicação sobre a área externa (gramado, rua, jardins). */
  outside: Rgb;
  /** Multiplicação sobre interiores acesos (salas com gente, corredor, recepção). */
  inside: Rgb;
  /** Multiplicação sobre áreas comuns vazias à noite (luz de vigia). */
  dim: Rgb;
}

/** Hora usada quando o ciclo está fixo em "sempre dia" / "sempre noite". */
export const FIXED_DAY_HOUR = 13.5;
export const FIXED_NIGHT_HOUR = 22.5;

export const WHITE: Rgb = [255, 255, 255];
/** Luz de lâmpada (interiores à noite). */
const LAMP: Rgb = [244, 220, 184];
/** Sol baixo entrando pelas janelas (amanhecer/entardecer). */
const SUN: Rgb = [255, 222, 184];
/** Área comum vazia à noite: penumbra azulada. */
const VIGIL: Rgb = [138, 144, 180];

/**
 * Chaves do céu ao longo do dia: [hora, noite, quente, cor do exterior]. Interpolação linear, com a
 * volta da meia-noite contínua (0 h e 24 h iguais). A madrugada é um pouco mais fechada que o
 * começo da noite; o amanhecer passa pelo violeta e pelo rosado, o entardecer pelo dourado e pelo
 * laranja até o roxo do crepúsculo.
 */
const KEYS: readonly (readonly [number, number, number, Rgb])[] = [
  [0, 1, 0, [70, 84, 140]],
  [4.5, 1, 0, [72, 86, 142]],
  [5.25, 0.86, 0.25, [104, 100, 156]],
  [5.9, 0.56, 0.8, [190, 146, 168]],
  [6.5, 0.2, 1, [255, 208, 174]],
  [7.25, 0, 0.35, [255, 238, 220]],
  [8, 0, 0, WHITE],
  [16.25, 0, 0, WHITE],
  [17.25, 0.04, 0.45, [255, 236, 206]],
  [18, 0.24, 1, [255, 202, 162]],
  [18.6, 0.55, 0.75, [194, 148, 164]],
  [19.25, 0.85, 0.3, [110, 108, 162]],
  [20, 1, 0, [80, 96, 150]],
  [24, 1, 0, [70, 84, 140]],
];

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Hora normalizada para [0, 24). */
export function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  return ((hour % 24) + 24) % 24;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp(t, 0, 1);
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

export function phaseOf(hour: number): DayPhase {
  const h = wrapHour(hour);
  if (h < 5) return 'madrugada';
  if (h < 7) return 'amanhecer';
  if (h < 17) return 'dia';
  if (h < 19) return 'entardecer';
  return 'noite';
}

/** Nível de luz e cores pela hora local fracionária (0–24). */
export function ambientAt(hour: number): Ambient {
  const h = wrapHour(hour);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [h0, n0, w0, c0] = KEYS[i];
  const [h1, n1, w1, c1] = KEYS[i + 1];
  const u = (h - h0) / Math.max(1e-6, h1 - h0);
  const night = n0 + (n1 - n0) * u;
  const warm = w0 + (w1 - w0) * u;
  const outside = mixRgb(c0, c1, u);
  // interiores acesos: lâmpada quente à noite; de dia, um sopro do sol baixo pelas janelas
  const inside = mixRgb(mixRgb(WHITE, LAMP, night), SUN, warm * (1 - night) * 0.55);
  const dim = mixRgb(WHITE, VIGIL, night);
  return { hour: h, phase: phaseOf(h), night, warm, outside, inside, dim };
}

/** Ambiente neutro (dia pleno): multiplicar por ele não muda nada. */
export function isNeutral(a: Ambient): boolean {
  return a.night < 0.005 && a.outside[0] >= 254 && a.outside[1] >= 254 && a.outside[2] >= 254 && a.inside[2] >= 254;
}

/** Aproxima `cur` de `target` (transição suave ao trocar a preferência ou a hora fixa). */
export function approachAmbient(cur: Ambient, target: Ambient, k: number): Ambient {
  const t = clamp(k, 0, 1);
  if (t >= 1) return target;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    hour: target.hour,
    phase: target.phase,
    night: lerp(cur.night, target.night),
    warm: lerp(cur.warm, target.warm),
    outside: mixRgb(cur.outside, target.outside, t),
    inside: mixRgb(cur.inside, target.inside, t),
    dim: mixRgb(cur.dim, target.dim, t),
  };
}

/** Distância entre dois ambientes (para saber se a transição terminou). */
export function ambientDistance(a: Ambient, b: Ambient): number {
  let d = Math.abs(a.night - b.night) * 255 + Math.abs(a.warm - b.warm) * 255;
  for (let i = 0; i < 3; i++) d += Math.abs(a.outside[i] - b.outside[i]) + Math.abs(a.inside[i] - b.inside[i]) + Math.abs(a.dim[i] - b.dim[i]);
  return d;
}

/**
 * Faixas de sol pelas janelas da parede norte: comprimento no piso (px de mundo), inclinação
 * horizontal por px descido (negativa de manhã: o sol vem do leste e a luz tomba para oeste) e
 * opacidade. null fora do horário de sol. As faixas crescem com o sol baixo e são mais fortes no
 * começo da manhã e no fim da tarde.
 */
export function sunbeamAt(hour: number): { len: number; skew: number; alpha: number } | null {
  const h = wrapHour(hour);
  if (h <= 6.1 || h >= 18.4) return null;
  // arco do sol: 0 no nascer (6 h) e no pôr (18 h), 1 ao meio-dia
  const p = clamp((h - 6) / 12, 0, 1);
  const elevation = Math.sin(p * Math.PI);
  const len = clamp(18 + (1 - elevation) * 70, 18, 88);
  const skew = clamp(-Math.cos(p * Math.PI) * 0.9, -0.9, 0.9);
  // aparece e some suave perto do nascer/pôr; pico de manhã cedo e no fim da tarde
  const edge = Math.min(clamp((h - 6.1) / 0.6, 0, 1), clamp((18.4 - h) / 0.6, 0, 1));
  const golden = Math.max(0, 1 - Math.abs(h - 7.2) / 1.6, 1 - Math.abs(h - 17.2) / 1.6);
  return { len: Math.round(len), skew, alpha: edge * (0.12 + 0.2 * golden) };
}

/**
 * Lê o parâmetro de hora da URL (`?hora=21:30`, `21h30`, `21h`, `21`, `6:05`). Devolve a hora
 * fracionária (0–24) ou null se ausente/inválido.
 */
export function parseHourParam(search: string | null | undefined): number | null {
  if (!search) return null;
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get('hora');
  } catch {
    return null;
  }
  if (raw === null) return null;
  const m = /^\s*(\d{1,2})(?:\s*[:h]\s*(\d{2})?)?\s*$/i.exec(raw);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = m[2] === undefined ? 0 : Number(m[2]);
  if (hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return null;
  return wrapHour(hh + mm / 60);
}

/** Hora efetiva do ciclo: a forçada (URL/depuração) vale sobre a preferência; senão a hora local. */
export function effectiveHour(mode: DaylightMode, override: number | null, date: Date): number {
  if (override !== null && Number.isFinite(override)) return wrapHour(override);
  if (mode === 'day') return FIXED_DAY_HOUR;
  if (mode === 'night') return FIXED_NIGHT_HOUR;
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** Modo do ciclo a partir das opções do mundo (`dayNight` é o interruptor antigo, ainda aceito). */
export function daylightModeOf(o: { daylight?: DaylightMode; dayNight: boolean }): DaylightMode {
  if (o.daylight === 'auto' || o.daylight === 'day' || o.daylight === 'night') return o.daylight;
  return o.dayNight ? 'auto' : 'day';
}

export function rgbCss(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
