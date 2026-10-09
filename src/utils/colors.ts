function channelLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexValid(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hexValid(hex) ? hex.slice(1) : "3b6fe0";
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function textSobre(hex: string): string {
  return contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111";
}

export function withAlpha(hex: string, alfa: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

export function mix(a: string, b: string, weightA: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${ca.map((v, i) => Math.round(v * weightA + cb[i] * (1 - weightA)).toString(16).padStart(2, "0")).join("")}`;
}

export const BACKGROUND_ACCENT = "destaque";
const INK_LIGHT = "255, 255, 255";
const INK_DARK = "17, 17, 17";

export interface AppearanceBorder {
  fundo: string;
  fundoSolido: string;
  fundoElevado: string;
  claro: boolean;
  rgbDaTinta: string;
}

export function appearanceBorder(background: string, opacity: number, accent: string): AppearanceBorder {
  const base = background === BACKGROUND_ACCENT ? mix(accent, "#000000", 0.82) : hexValid(background) ? background : "#000000";
  const light = textSobre(base) !== "#ffffff";
  const alfa = Math.max(0.3, Math.min(1, opacity));
  return {
    fundo: withAlpha(base, alfa),
    fundoSolido: base,
    fundoElevado: mix(base, light ? "#000000" : "#ffffff", light ? 0.97 : 0.94),
    claro: light,
    rgbDaTinta: light ? INK_DARK : INK_LIGHT,
  };
}
