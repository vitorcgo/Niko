// Câmera 2D: centro (px de mundo) + zoom (px CSS por px de mundo), com transições suaves,
// níveis de zoom "nítidos" (zoom × devicePixelRatio inteiro) e deslocamento alinhado ao pixel.
import { TILE, ZOOM_MAX, ZOOM_MIN } from './constants';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Margens (px CSS) da visão geral: pílulas flutuantes acima das salas, meio-fio abaixo, laterais. */
export const OVERVIEW_MARGIN = { top: 34, bottom: 10, side: 16 } as const;

/**
 * Enquadramento da visão geral: o prédio de 1,5 tile acima da parede norte (placas e itens altos)
 * até o meio-fio sul (cerca viva e calçada), dentro da área livre (fora dos painéis da UI).
 * Retorna o zoom que cabe, o ponto do mundo a centralizar e quanto (px CSS) esse ponto fica abaixo
 * do centro da área livre (as margens de cima e de baixo são diferentes). Puro.
 */
export function overviewFrame(
  building: Bounds,
  viewW: number,
  viewH: number,
  insets: { top: number; right: number; bottom: number; left: number },
): { zoom: number; cx: number; cy: number; dy: number } {
  const m = OVERVIEW_MARGIN;
  const r = { x: building.x - TILE / 2, y: building.y - 1.5 * TILE, w: building.w + TILE, h: building.h + 3.5 * TILE };
  const freeW = Math.max(80, viewW - insets.left - insets.right - 2 * m.side);
  const freeH = Math.max(80, viewH - insets.top - insets.bottom - m.top - m.bottom);
  return { zoom: Math.min(freeW / r.w, freeH / r.h), cx: r.x + r.w / 2, cy: r.y + r.h / 2, dy: (m.top - m.bottom) / 2 };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Camera {
  x = 0;
  y = 0;
  zoom = 2;
  viewW = 800;
  viewH = 600;
  dpr = 1;
  /** Zoom mínimo dinâmico (permite enquadrar prédios grandes abaixo de 1×). */
  minZoom = ZOOM_MIN;
  bounds: Bounds = { x: 0, y: 0, w: 800, h: 600 };
  follow: string | null = null;
  /** Margens cobertas pela UI (px CSS): enquadramentos usam só a área livre. */
  insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private anim: { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t0: number; dur: number } | null = null;
  /** Zoom contínuo em andamento (pinça); ao terminar, encaixa num nível nítido. */
  private freeZoom = false;

  setView(w: number, h: number, dpr: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.dpr = dpr || 1;
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  /** Níveis de zoom nítidos: zoom × dpr inteiro (e meio-inteiro acima de 2× no dpr 1). */
  levels(): number[] {
    const min = Math.min(this.minZoom, ZOOM_MIN);
    const set = new Set<number>();
    // inteiros em pixels de dispositivo (nitidez perfeita)
    for (let k = 1; k <= ZOOM_MAX * this.dpr; k++) set.add(Math.round((k / this.dpr) * 1000) / 1000);
    // meio-níveis a partir de 2× (a irregularidade de 1px fica imperceptível)
    for (let h = 4; h <= ZOOM_MAX * 2; h++) set.add(h / 2);
    const out = [...set].filter((z) => z >= min - 1e-6 && z <= ZOOM_MAX + 1e-6).sort((a, b) => a - b);
    if (!out.length || out[0] > min + 1e-6) out.unshift(min);
    return out;
  }

  snapZoom(z: number, dir: 'nearest' | 'down' | 'up' = 'nearest'): number {
    const lv = this.levels();
    if (dir === 'down') {
      let best = lv[0];
      for (const l of lv) if (l <= z + 1e-6) best = l;
      return best;
    }
    if (dir === 'up') {
      for (const l of lv) if (l >= z - 1e-6) return l;
      return lv[lv.length - 1];
    }
    let best = lv[0];
    for (const l of lv) if (Math.abs(l - z) < Math.abs(best - z)) best = l;
    return best;
  }

  /** Próximo nível acima/abaixo do zoom atual. */
  stepZoom(steps: number): number {
    const lv = this.levels();
    const cur = this.anim ? this.anim.tz : this.zoom;
    if (!steps || !Number.isFinite(steps)) return cur;
    const i = steps > 0 ? lv.findIndex((z) => z > cur + 1e-6) : lv.findLastIndex((z) => z < cur - 1e-6);
    if (i < 0) return steps > 0 ? lv.at(-1)! : lv[0];
    const destino = i + (steps > 0 ? Math.floor(steps) - 1 : Math.ceil(steps) + 1);
    return lv[Math.max(0, Math.min(lv.length - 1, destino))];
  }

  animateTo(x: number, y: number, zoom: number, now: number, dur = 400): void {
    const tz = Math.max(Math.min(this.minZoom, ZOOM_MIN), Math.min(ZOOM_MAX, zoom));
    this.anim = { fx: this.x, fy: this.y, fz: this.zoom, tx: x, ty: y, tz, t0: now, dur };
  }

  stop(): void {
    this.anim = null;
  }

  /** Arrastar: desloca pelo equivalente em px CSS. */
  panBy(dx: number, dy: number): void {
    this.anim = null;
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  /** Zoom ancorado num ponto da tela (CSS px). */
  zoomAt(newZoom: number, sx: number, sy: number, now: number, animate = true): void {
    const z = Math.max(Math.min(this.minZoom, ZOOM_MIN), Math.min(ZOOM_MAX, newZoom));
    const wx = this.x + (sx - this.viewW / 2) / this.zoom;
    const wy = this.y + (sy - this.viewH / 2) / this.zoom;
    const nx = wx - (sx - this.viewW / 2) / z;
    const ny = wy - (sy - this.viewH / 2) / z;
    if (animate) this.animateTo(nx, ny, z, now, 160);
    else {
      this.anim = null;
      this.x = nx;
      this.y = ny;
      this.zoom = z;
      this.freeZoom = true;
      this.clamp();
    }
  }

  /** Encaixa o zoom contínuo (pinça) no nível nítido mais próximo. */
  settle(now: number): void {
    if (!this.freeZoom) return;
    this.freeZoom = false;
    this.zoomAt(this.snapZoom(this.zoom), this.viewW / 2, this.viewH / 2, now, true);
  }

  update(now: number, followTarget: { x: number; y: number } | null, dt: number): void {
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.t0) / a.dur);
      const k = ease(t);
      this.zoom = a.fz + (a.tz - a.fz) * k;
      this.x = a.fx + (a.tx - a.fx) * k;
      this.y = a.fy + (a.ty - a.fy) * k;
      if (t >= 1) this.anim = null;
    } else if (followTarget) {
      const k = 1 - Math.exp(-dt * 6);
      this.x += (followTarget.x - this.x) * k;
      this.y += (followTarget.y - this.y) * k;
    }
    this.clamp();
  }

  /** Mantém a área livre (fora dos painéis da UI) dentro dos limites; se couber inteira, centraliza. */
  clamp(): void {
    const b = this.bounds;
    const z = this.zoom;
    const ins = this.insets;
    const l = (-this.viewW / 2 + ins.left) / z;
    const r = (this.viewW / 2 - ins.right) / z;
    const t = (-this.viewH / 2 + ins.top) / z;
    const btm = (this.viewH / 2 - ins.bottom) / z;
    if (b.w <= r - l) this.x = b.x + b.w / 2 - (l + r) / 2;
    else this.x = Math.max(b.x - l, Math.min(b.x + b.w - r, this.x));
    if (b.h <= btm - t) this.y = b.y + b.h / 2 - (t + btm) / 2;
    else this.y = Math.max(b.y - t, Math.min(b.y + b.h - btm, this.y));
  }

  /** Transformação para o contexto em px de dispositivo, com deslocamento inteiro (sem tremido). */
  transform(): { scale: number; ox: number; oy: number } {
    const scale = this.zoom * this.dpr;
    const ox = Math.round((this.viewW * this.dpr) / 2 - this.x * scale);
    const oy = Math.round((this.viewH * this.dpr) / 2 - this.y * scale);
    return { scale, ox, oy };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const { scale, ox, oy } = this.transform();
    return { x: (wx * scale + ox) / this.dpr, y: (wy * scale + oy) / this.dpr };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { scale, ox, oy } = this.transform();
    return { x: (sx * this.dpr - ox) / scale, y: (sy * this.dpr - oy) / scale };
  }

  /** Zoom que enquadra um retângulo do mundo com margem (CSS px), dentro da área livre. */
  fitZoom(r: Bounds, margin = 24): number {
    const w = Math.max(80, this.viewW - this.insets.left - this.insets.right);
    const h = Math.max(80, this.viewH - this.insets.top - this.insets.bottom);
    return Math.min((w - margin * 2) / r.w, (h - margin * 2) / r.h);
  }

  /** Centro de câmera que põe o ponto (wx, wy) no meio da área livre, para um dado zoom. */
  centerFor(wx: number, wy: number, zoom: number): { x: number; y: number } {
    return { x: wx - (this.insets.left - this.insets.right) / 2 / zoom, y: wy - (this.insets.top - this.insets.bottom) / 2 / zoom };
  }
}
