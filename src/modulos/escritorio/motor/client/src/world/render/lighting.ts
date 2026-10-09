// Iluminação do ciclo dia/noite: um mapa de luz em cache (exterior escurecido e azulado, interiores
// acesos, halos de postes e luminárias) multiplicado sobre a cena, e os brilhos por frame (monitores,
// TV, máquinas, faróis dos carros, vaga-lumes). As cores vêm de daylight.ts (puro).
//
// Custo: de dia nada é desenhado. Fora isso, o mapa (meia resolução do mundo) só é refeito quando
// a chave de luz muda (hora em passos de poucos segundos, luz das salas, ocupação das áreas comuns,
// montagem de salas); por frame, um drawImage em 'multiply' e alguns sprites de brilho em cache.
import { TILE, type ArtModule, type ScreenMode } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { BUILDING_H, COL_W, CORRIDOR_H, CORRIDOR_Y } from '../constants';
import type { ExteriorLayout, SlotShell } from '../layout/exterior';
import type { RoomState } from '../sim/room-state';
import type { Sim } from '../sim/sim';
import { buildAnim } from './anim';
import { ambientAt, ambientDistance, approachAmbient, effectiveHour, isNeutral, mixRgb, rgbCss, sunbeamAt, WHITE, type Ambient, type DaylightMode, type Rgb } from './daylight';
import { glowSprite } from './props';
import { furnitureSprites, wallItemOrigin, wallSprites, type AreaVis, type FurnVis, type WallVis } from './scene';

/** O nível de luz é recalculado no máximo a cada isto (ms). */
export const RECALC_MS = 4_000;
/** Pixels de mundo por pixel do mapa de luz. */
const MAP_SCALE = 2;
/** Duração (ms) da transição ao trocar a preferência ou a hora forçada. */
const FADE_MS = 1_200;
/** Ocupação das áreas comuns (luz por presença) reavaliada a cada isto (ms). */
const OCCUPANCY_MS = 250;
const LAMP_WARM: Rgb = [255, 236, 196];
const STREET_WARM: Rgb = [255, 214, 150];
const SCREEN_COOL: Rgb = [196, 222, 255];
const ARCADE_GLOW: Rgb = [236, 190, 255];
const FIREFLIES = 26;

/** O que a iluminação precisa do renderer (satisfeito pelo próprio Renderer). */
export interface LightScene {
  readonly areas: ReadonlyMap<string, AreaVis>;
  readonly exterior: ExteriorLayout;
  readonly shells: readonly SlotShell[];
  readonly shellWindows: readonly WallVis[];
  readonly cars: readonly { x: number; y: number; dir: 1 | -1 }[];
  roomInSlot(slot: number): RoomState | undefined;
  deskScreen(f: FurnVis, area: AreaVis): ScreenMode;
}

/** Retângulo visível (px de mundo). */
export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Firefly {
  x: number;
  y: number;
  ph: number;
  sx: number;
  sy: number;
  blink: number;
}

const halos = new Map<string, HTMLCanvasElement>();

/**
 * Halo para o mapa de luz: gradiente radial da cor `c` (opaca no centro) até transparente. Desenhado
 * com 'lighten', clareia o mapa até a cor da lâmpada sem nunca escurecer o que já está aceso.
 */
function haloSprite(c: Rgb, size: number): HTMLCanvasElement {
  const key = `${c.join(',')}:${size}`;
  let s = halos.get(key);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = size;
  s.height = size;
  const ctx = s.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = c;
  g.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  g.addColorStop(0.35, `rgba(${r},${gg},${b},0.8)`);
  g.addColorStop(0.7, `rgba(${r},${gg},${b},0.3)`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  halos.set(key, s);
  return s;
}

let vignette: HTMLCanvasElement | null = null;

/** Vinheta (multiplicação) das salas acesas à noite: centro neutro, cantos um pouco mais escuros e quentes. */
function vignetteSprite(): HTMLCanvasElement {
  if (vignette) return vignette;
  const size = 64;
  vignette = document.createElement('canvas');
  vignette.width = size;
  vignette.height = size;
  const ctx = vignette.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size * 0.45, 0, size / 2, size * 0.45, size * 0.62);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.5, 'rgb(252,248,242)');
  g.addColorStop(1, 'rgb(212,196,176)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return vignette;
}

const beams = new Map<string, HTMLCanvasElement>();

/** Faixa de sol (gradiente vertical: forte junto à janela, some no fim). */
function beamSprite(c: Rgb): HTMLCanvasElement {
  const key = c.join(',');
  let s = beams.get(key);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = 8;
  s.height = 64;
  const ctx = s.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.9)`);
  g.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
  g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  // bordas laterais suaves
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, 1, 64);
  ctx.fillRect(7, 0, 1, 64);
  beams.set(key, s);
  return s;
}

const prefersReducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export class Lighting {
  /** Ambiente aplicado (pode estar em transição até `target`). */
  ambient: Ambient = ambientAt(12);
  private target: Ambient = this.ambient;
  private calcAt = -1e9;
  private lastNow = 0;
  private mode: DaylightMode | null = null;
  private override: number | null = null;
  private map: HTMLCanvasElement | null = null;
  private mapCtx: CanvasRenderingContext2D | null = null;
  private mapKey = '';
  private mapX = 0;
  private mapY = 0;
  /** Luz por presença das áreas comuns (0 = penumbra, 1 = acesa), com transição. */
  private coreLevel = new Map<string, number>();
  private coreBusy = new Map<string, boolean>();
  private occAt = 0;
  private flies: Firefly[] = [];
  private fliesFor: ExteriorLayout | null = null;
  private reduced = prefersReducedMotion();
  private reducedAt = 0;

  constructor(
    private readonly art: ArtModule,
    private readonly sim: Sim,
  ) {}

  /**
   * Atualiza o ambiente (recalcula a luz no máximo a cada RECALC_MS, ou já ao trocar a preferência
   * ou a hora forçada) e devolve a hora efetiva, para o céu das janelas.
   */
  update(now: number, mode: DaylightMode, override: number | null, date: Date): number {
    const hour = effectiveHour(mode, override, date);
    const changed = mode !== this.mode || override !== this.override;
    if (now - this.reducedAt > 5_000) {
      this.reducedAt = now;
      this.reduced = prefersReducedMotion();
    }
    if (changed || now - this.calcAt >= RECALC_MS) {
      const first = this.mode === null;
      this.mode = mode;
      this.override = override;
      this.calcAt = now;
      this.target = ambientAt(hour);
      if (first || this.reduced) this.ambient = this.target;
    }
    const dt = Math.max(0, Math.min(250, now - this.lastNow));
    this.lastNow = now;
    if (this.ambient !== this.target) {
      // transição suave (com movimento reduzido, troca direto)
      this.ambient = this.reduced ? this.target : approachAmbient(this.ambient, this.target, (dt / FADE_MS) * 3);
      if (ambientDistance(this.ambient, this.target) < 3) this.ambient = this.target;
    }
    return hour;
  }

  get night(): number {
    return this.ambient.night;
  }

  // =================================================================== mapa de luz

  /** Multiplica o mapa de luz sobre o que está visível (nada de dia). */
  drawAmbient(ctx: CanvasRenderingContext2D, scene: LightScene, view: View, now: number, dt: number): void {
    const amb = this.ambient;
    this.updateOccupancy(scene, now, dt);
    if (isNeutral(amb)) return;
    const map = this.ensureMap(scene, now);
    if (!map) return;
    const mx0 = this.mapX;
    const my0 = this.mapY;
    const mx1 = mx0 + map.width * MAP_SCALE;
    const my1 = my0 + map.height * MAP_SCALE;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    // parte visível do mapa (em pixels inteiros do mapa)
    const sx = Math.max(0, Math.floor((view.x0 - mx0) / MAP_SCALE) - 1);
    const sy = Math.max(0, Math.floor((view.y0 - my0) / MAP_SCALE) - 1);
    const ex = Math.min(map.width, Math.ceil((view.x1 - mx0) / MAP_SCALE) + 1);
    const ey = Math.min(map.height, Math.ceil((view.y1 - my0) / MAP_SCALE) + 1);
    // sem suavização: pixels nítidos como o resto da arte (e bem mais barato de ampliar)
    if (ex > sx && ey > sy) ctx.drawImage(map, sx, sy, ex - sx, ey - sy, mx0 + sx * MAP_SCALE, my0 + sy * MAP_SCALE, (ex - sx) * MAP_SCALE, (ey - sy) * MAP_SCALE);
    // além do mapa: o mesmo tom do exterior
    ctx.fillStyle = rgbCss(amb.outside);
    const w = view.x1 - view.x0 + 4;
    if (view.y0 < my0) ctx.fillRect(view.x0 - 2, view.y0 - 2, w, my0 - view.y0 + 2);
    if (view.y1 > my1) ctx.fillRect(view.x0 - 2, my1, w, view.y1 - my1 + 2);
    const top = Math.max(view.y0 - 2, my0);
    const bottom = Math.min(view.y1 + 2, my1);
    if (bottom > top) {
      if (view.x0 < mx0) ctx.fillRect(view.x0 - 2, top, mx0 - view.x0 + 2, bottom - top);
      if (view.x1 > mx1) ctx.fillRect(mx1, top, view.x1 - mx1 + 2, bottom - top);
    }
    ctx.restore();
  }

  /** Áreas comuns acendem com gente dentro (banheiro com sensor de presença, copa, lounge). */
  private updateOccupancy(scene: LightScene, now: number, dt: number): void {
    if (now - this.occAt >= OCCUPANCY_MS) {
      this.occAt = now;
      for (const vis of scene.areas.values()) {
        if (vis.room || !this.presenceLit(vis)) continue;
        this.coreBusy.set(vis.id, this.someoneIn(vis.layout.rect));
      }
    }
    const k = this.reduced ? 1 : Math.min(1, dt * 3.5);
    for (const [id, busy] of this.coreBusy) {
      const cur = this.coreLevel.get(id) ?? (busy ? 1 : 0);
      const want = busy ? 1 : 0;
      this.coreLevel.set(id, Math.abs(want - cur) < 0.02 ? want : cur + (want - cur) * k);
    }
  }

  /** Copa, lounge e banheiros: luz por presença. Recepção e corredor ficam sempre acesos. */
  private presenceLit(vis: AreaVis): boolean {
    const kind = vis.layout.kind;
    return kind === 'cafe' || kind === 'lounge' || kind === 'restroom';
  }

  private someoneIn(r: { x: number; y: number; w: number; h: number }): boolean {
    for (const c of this.sim.chars.values()) {
      if (c.gone || c.inside) continue;
      if (c.tx >= r.x && c.ty >= r.y && c.tx < r.x + r.w && c.ty < r.y + r.h) return true;
    }
    return false;
  }

  /** Luz (0..1) e cobertura (montagem/desmontagem) de uma área. */
  private areaLight(vis: AreaVis, now: number): { lit: number; cover: number } {
    const room = vis.room;
    if (room) {
      const cover = room.phase === 'building' || room.phase === 'dismantling' ? buildAnim(room.phase, room.progress(now)).floor : 1;
      return { lit: room.light(now), cover };
    }
    if (this.presenceLit(vis)) return { lit: this.coreLevel.get(vis.id) ?? 0, cover: 1 };
    return { lit: 1, cover: 1 };
  }

  /** Cor de multiplicação de uma área no mapa. */
  private areaColor(vis: AreaVis, lit: number, cover: number): Rgb {
    const amb = this.ambient;
    let c: Rgb;
    if (vis.room) {
      // sala apagada fica neutra no mapa: o escurecimento dela é a sombra da sala (renderer)
      c = mixRgb(WHITE, amb.inside, lit);
    } else if (vis.layout.kind === 'corridor') {
      c = mixRgb(amb.inside, amb.dim, 0.18);
    } else {
      c = mixRgb(amb.dim, amb.inside, lit);
    }
    return cover >= 1 ? c : mixRgb(amb.outside, c, cover);
  }

  private ensureMap(scene: LightScene, now: number): HTMLCanvasElement | null {
    const b = scene.exterior.bounds;
    const w = Math.ceil((b.w * TILE) / MAP_SCALE);
    const h = Math.ceil((b.h * TILE) / MAP_SCALE);
    if (!this.map || this.map.width !== w || this.map.height !== h) {
      try {
        this.map = document.createElement('canvas');
        this.map.width = w;
        this.map.height = h;
        this.mapCtx = this.map.getContext('2d');
      } catch {
        this.map = null;
        this.mapCtx = null;
      }
      this.mapKey = '';
    }
    if (!this.map || !this.mapCtx) return null;
    this.mapX = b.x * TILE;
    this.mapY = b.y * TILE;
    const key = this.lightKey(scene, now);
    if (key !== this.mapKey) {
      this.mapKey = key;
      this.paintMap(this.mapCtx, scene, now);
    }
    return this.map;
  }

  /** Tudo o que muda o mapa, em passos discretos (evita refazê-lo a cada frame). */
  private lightKey(scene: LightScene, now: number): string {
    const a = this.ambient;
    let k = `${Math.round(a.night * 200)}|${a.outside.join(',')}|${a.inside.join(',')}|${a.dim.join(',')}|${this.sim.building.cols}`;
    for (const vis of scene.areas.values()) {
      const { lit, cover } = this.areaLight(vis, now);
      k += `|${vis.id}:${Math.round(lit * 24)}:${Math.round(cover * 20)}`;
    }
    for (const sh of scene.shells) if (scene.roomInSlot(sh.slot)) k += `|s${sh.slot}`;
    return k;
  }

  private paintMap(m: CanvasRenderingContext2D, scene: LightScene, now: number): void {
    const amb = this.ambient;
    const n = amb.night;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.fillStyle = rgbCss(amb.outside);
    m.fillRect(0, 0, this.map!.width, this.map!.height);
    // daqui em diante, coordenadas de mundo
    m.setTransform(1 / MAP_SCALE, 0, 0, 1 / MAP_SCALE, -this.mapX / MAP_SCALE, -this.mapY / MAP_SCALE);
    const corridorLit = rgbCss(mixRgb(amb.inside, amb.dim, 0.18));
    // fechamentos do corredor nos slots vazios (fachada com janelas ao norte, mureta ao sul)
    for (const sh of scene.shells) {
      if (scene.roomInSlot(sh.slot)) continue;
      const r = sh.rect;
      m.fillStyle = corridorLit;
      if (r.y === 0) m.fillRect(r.x * TILE, (r.y + r.h - 2) * TILE, r.w * TILE, 2 * TILE);
      else m.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, TILE);
    }
    const lit = new Map<AreaVis, number>();
    for (const vis of scene.areas.values()) {
      const l = this.areaLight(vis, now);
      if (l.cover <= 0.01) continue;
      // quanto de luz a área "irradia" (janelas): salas pela luz, áreas comuns vazias na penumbra
      lit.set(vis, vis.room ? l.lit * l.cover : this.presenceLit(vis) ? 0.4 + 0.6 * l.lit : 1);
      const p = vis.px;
      const shade = vis.room ? vis.layout.shade : undefined;
      if (shade && l.cover >= 1) {
        // a mureta das salas ao norte (fora da sombra) recebe a luz do corredor
        m.fillStyle = corridorLit;
        m.fillRect(p.x, p.y, p.w, p.h);
        m.fillStyle = rgbCss(this.areaColor(vis, l.lit, l.cover));
        m.fillRect(shade.x, shade.y, shade.w, shade.h);
      } else {
        m.fillStyle = rgbCss(this.areaColor(vis, l.lit, l.cover));
        m.fillRect(p.x, p.y, p.w, p.h);
      }
      // à noite, o centro das salas acesas fica mais claro que os cantos (luz do teto)
      const glow = (vis.room ? l.lit : this.presenceLit(vis) ? l.lit : vis.layout.kind === 'corridor' ? 0 : 1) * l.cover * n;
      if (glow > 0.05) {
        const r = shade ?? p;
        m.globalCompositeOperation = 'multiply';
        m.globalAlpha = Math.min(1, glow);
        m.drawImage(vignetteSprite(), r.x, r.y, r.w, r.h);
        m.globalAlpha = 1;
        m.globalCompositeOperation = 'source-over';
      }
    }
    if (n < 0.12) {
      m.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    // halos: luminárias acesas, máquinas, postes, a luz das janelas no gramado
    m.globalCompositeOperation = 'lighten';
    const lamp = haloSprite(LAMP_WARM, 64);
    const street = haloSprite(STREET_WARM, 64);
    const cool = haloSprite(SCREEN_COOL, 48);
    const arcade = haloSprite(ARCADE_GLOW, 48);
    const k = Math.min(1, (n - 0.12) / 0.5);
    const halo = (img: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, a: number) => {
      if (a <= 0.01) return;
      m.globalAlpha = Math.min(1, a);
      m.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    };
    for (const [vis, l] of lit) {
      // nas salas, só com a luz acesa; nas áreas comuns, abajures e máquinas ficam sempre ligados
      // (luz de vigia quando não há ninguém)
      const on = vis.room ? vis.room.lightOn && l >= 0.3 : true;
      if (!on) continue;
      const a = vis.room ? k * l : k;
      for (const f of vis.furniture) {
        if (f.kind === 'floor_lamp') halo(lamp, f.ax, f.ay - 6, 92, 66, a);
        else if (f.kind === 'vending_machine') halo(cool, f.ax, f.ay + 4, 52, 34, 0.9 * a);
        else if (f.kind === 'arcade') halo(arcade, f.ax, f.ay + 4, 44, 30, 0.8 * a);
      }
    }
    for (const prop of scene.exterior.props) {
      if (prop.kind === 'lamp') {
        halo(street, prop.x, prop.y + 6, 120, 84, k);
        halo(street, prop.x, prop.y - 30, 30, 24, 0.7 * k);
      } else if (prop.kind === 'totem') halo(cool, prop.x, prop.y - 4, 34, 22, 0.6 * k);
    }
    this.paintWindowSpill(scene, lit, k, halo, street);
    m.globalAlpha = 1;
    m.globalCompositeOperation = 'source-over';
    m.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** À noite, a luz das janelas e das fachadas de vidro se projeta no gramado e na calçada. */
  private paintWindowSpill(
    scene: LightScene,
    lit: Map<AreaVis, number>,
    k: number,
    halo: (img: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, a: number) => void,
    warm: HTMLCanvasElement,
  ): void {
    const bw = this.sim.building.cols * COL_W * TILE;
    const bh = BUILDING_H * TILE;
    for (const [vis, l] of lit) {
      if (l < 0.3) continue;
      const r = vis.layout.rect;
      if (r.y === 0) {
        // janelas da parede norte -> gramado ao norte do prédio
        for (const w of vis.wallItems) if (w.kind === 'window') halo(warm, w.cx, -12, 58, 30, 0.55 * k * l);
      } else if (vis.layout.kind !== 'corridor' && r.y + r.h >= BUILDING_H) {
        // salas ao sul: brilho suave sobre a cerca viva e a calçada
        for (const fx of [0.25, 0.75]) halo(warm, (r.x + r.w * fx) * TILE, bh + 16, 96, 30, 0.35 * k * l);
      }
    }
    // fachadas de vidro do corredor (entrada a oeste e ponta leste)
    const cy = (CORRIDOR_Y + CORRIDOR_H / 2) * TILE;
    halo(warm, -20, cy, 56, 92, 0.6 * k);
    halo(warm, bw + 20, cy, 56, 92, 0.45 * k);
    // janelas do corredor que dão para os pátios dos slots vazios
    for (const w of scene.shellWindows) {
      const slot = Number(w.areaId.slice(6));
      if (scene.roomInSlot(slot)) continue;
      halo(warm, w.cx, w.baseY - 2 * TILE - 14, 52, 28, 0.5 * k);
    }
  }

  // =================================================================== brilhos por frame

  /** Brilhos aditivos: monitores, TV, máquinas, bulbos dos postes, faróis e vaga-lumes. */
  drawGlows(ctx: CanvasRenderingContext2D, scene: LightScene, view: View, now: number): void {
    const n = this.ambient.night;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cool = glowSprite('#7fb8ff', 48);
    const warm = glowSprite('#ffcf7a', 64);
    const inView = (x: number, y: number, m: number) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    for (const vis of scene.areas.values()) {
      const p = vis.px;
      if (p.x > view.x1 + 40 || p.x + p.w < view.x0 - 40 || p.y > view.y1 + 40 || p.y + p.h < view.y0 - 40) continue;
      const room = vis.room;
      const dark = room ? 1 - room.light(now) : 0;
      const k = Math.max(n, dark);
      if (k < 0.2) continue;
      for (const f of vis.furniture) {
        if (!inView(f.ax, f.ay, 40)) continue;
        if (f.kind === 'desk' || f.kind === 'desk_back') {
          const mode = scene.deskScreen(f, vis);
          if (mode === 'off') continue;
          // quem trabalha à noite fica com o rosto iluminado pela tela
          ctx.globalAlpha = (mode === 'idle' ? 0.2 : 0.35) * k;
          ctx.drawImage(cool, Math.round(f.ax - 24), Math.round(f.ay - 34));
        } else if (f.kind === 'floor_lamp' && n > 0.2 && (!room || room.lightOn)) {
          // bulbo aceso (o halo no chão está no mapa de luz)
          const g = this.lampHead(f);
          ctx.globalAlpha = 0.5 * n;
          ctx.drawImage(warm, Math.round(g.x - 16), Math.round(g.y - 16), 32, 32);
        } else if (f.kind === 'vending_machine' || f.kind === 'arcade') {
          ctx.globalAlpha = 0.25 * k;
          ctx.drawImage(cool, Math.round(f.ax - 24), Math.round(f.ay - 36));
        }
      }
      // TV de parede ligada: luz azulada na frente da tela
      if (n > 0.2) {
        for (const w of vis.wallItems) {
          if (w.kind !== 'tv' || !inView(w.cx, w.baseY, 60)) continue;
          ctx.globalAlpha = 0.3 * n;
          ctx.drawImage(cool, Math.round(w.cx - 28), Math.round(w.baseY - 30), 56, 56);
        }
      }
    }
    this.drawSunbeams(ctx, scene, view);
    if (n > 0.2) {
      for (const prop of scene.exterior.props) {
        if (prop.kind !== 'lamp' || !inView(prop.x, prop.y, 64)) continue;
        ctx.globalAlpha = 0.6 * n;
        ctx.drawImage(warm, Math.round(prop.x - 14), Math.round(prop.y - 43), 28, 28);
      }
      this.drawHeadlights(ctx, scene, view, n);
      if (n > 0.6 && !this.reduced) this.drawFireflies(ctx, scene, view, now, (n - 0.6) / 0.4);
    }
    ctx.restore();
  }

  /**
   * Sol entrando pelas janelas da parede norte (o sol do Brasil passa ao norte): faixas de luz no
   * piso, curtas ao meio-dia e longas e alaranjadas de manhã cedo e no fim da tarde; de manhã
   * tombam para oeste, à tarde para leste.
   */
  private drawSunbeams(ctx: CanvasRenderingContext2D, scene: LightScene, view: View): void {
    const sun = sunbeamAt(this.ambient.hour);
    if (!sun) return;
    const img = beamSprite(mixRgb([255, 226, 160], [255, 150, 64], this.ambient.warm));
    ctx.globalCompositeOperation = 'lighter';
    /** Faixas das janelas `ws`, recortadas no piso `clip` (a luz não atravessa paredes). */
    const draw = (ws: readonly WallVis[], clip: { x: number; y: number; w: number; h: number }) => {
      if (clip.x > view.x1 || clip.x + clip.w < view.x0 || clip.y > view.y1 || clip.y + clip.h < view.y0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      ctx.globalAlpha = sun.alpha;
      for (const w of ws) {
        const r = this.windowGlass(w);
        if (!r) continue;
        // paralelogramo: começa na base da parede e escorrega em x conforme desce
        ctx.save();
        ctx.transform(1, 0, sun.skew, 1, r.x - sun.skew * w.baseY, 0);
        ctx.drawImage(img, 0, w.baseY, r.w, sun.len);
        ctx.restore();
      }
      ctx.restore();
    };
    for (const vis of scene.areas.values()) {
      if (vis.layout.rect.y !== 0) continue;
      if (vis.room && vis.room.phase !== 'ready') continue;
      const ws = vis.wallItems.filter((w) => w.kind === 'window');
      if (!ws.length) continue;
      const p = vis.px;
      draw(ws, { x: p.x, y: p.y + 2 * TILE, w: p.w, h: p.h - 3 * TILE });
    }
    for (const sh of scene.shells) {
      if (sh.rect.y !== 0 || scene.roomInSlot(sh.slot)) continue;
      const ws = scene.shellWindows.filter((w) => w.areaId === `shell:${sh.slot}`);
      draw(ws, { x: sh.rect.x * TILE, y: CORRIDOR_Y * TILE, w: sh.rect.w * TILE, h: CORRIDOR_H * TILE });
    }
  }

  /** Retângulo do vidro de uma janela (px de mundo, só x e largura importam). */
  private windowGlass(w: WallVis): { x: number; w: number } | null {
    const s = wallSprites(this.art, 'window', w.variant, 0, w.seed);
    if (!s) return null;
    const o = wallItemOrigin(w, s.base);
    const g = s.base.rects?.glass;
    return g ? { x: o.x + g.x, w: g.w } : { x: o.x + 3, w: s.base.canvas.width - 6 };
  }

  /** Centro do bulbo da luminária (rects.glow da arte, ou um palpite pela altura). */
  private lampHead(f: FurnVis): { x: number; y: number } {
    const s = furnitureSprites(this.art, f)?.base;
    const r = s?.rects?.glow;
    if (s && r) return { x: f.ax - s.ax + r.x + r.w / 2, y: f.ay - s.ay + r.y + r.h / 2 };
    return { x: f.ax, y: f.ay - 33 };
  }

  /** Faróis (facho amarelado à frente) e lanternas vermelhas dos carros. */
  private drawHeadlights(ctx: CanvasRenderingContext2D, scene: LightScene, view: View, n: number): void {
    if (!scene.cars.length) return;
    const beam = glowSprite('#fff1c4', 64);
    const tail = glowSprite('#ff4a3a', 16);
    for (const car of scene.cars) {
      if (car.x < view.x0 - 80 || car.x > view.x1 + 80 || car.y < view.y0 - 30 || car.y > view.y1 + 30) continue;
      const front = car.x + car.dir * 16;
      ctx.globalAlpha = 0.55 * n;
      ctx.drawImage(beam, Math.round(front + (car.dir > 0 ? 0 : -46)), Math.round(car.y - 15), 46, 16);
      ctx.globalAlpha = 0.8 * n;
      ctx.drawImage(tail, Math.round(car.x - car.dir * 16 - 4), Math.round(car.y - 11), 8, 8);
    }
  }

  /** Vaga-lumes piscando sobre o gramado e os jardins (só com a noite fechada). */
  private drawFireflies(ctx: CanvasRenderingContext2D, scene: LightScene, view: View, now: number, k: number): void {
    if (this.fliesFor !== scene.exterior) this.seedFireflies(scene.exterior);
    const dot = glowSprite('#d8ff7a', 12);
    const t = now / 1000;
    for (const f of this.flies) {
      const x = f.x + Math.sin(t * f.sx + f.ph) * 7;
      const y = f.y + Math.cos(t * f.sy + f.ph * 1.7) * 4;
      if (x < view.x0 - 8 || x > view.x1 + 8 || y < view.y0 - 8 || y > view.y1 + 8) continue;
      const on = Math.sin(t * f.blink + f.ph * 3);
      if (on <= 0.2) continue;
      const a = Math.pow((on - 0.2) / 0.8, 2) * k;
      ctx.globalAlpha = 0.9 * a;
      ctx.drawImage(dot, Math.round(x - 6), Math.round(y - 6));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f4ffc8';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  /** Vaga-lumes perto de arbustos, flores e árvores (posições fixas pela semente). */
  private seedFireflies(ext: ExteriorLayout): void {
    this.fliesFor = ext;
    this.flies = [];
    const rng = mulberry32(0xf1e5 + ext.bounds.w);
    const spots = ext.props.filter((p) => p.kind === 'bush' || p.kind === 'flowers' || p.kind === 'tree');
    if (!spots.length) return;
    for (let i = 0; i < FIREFLIES; i++) {
      const p = spots[Math.floor(rng() * spots.length)];
      this.flies.push({
        x: p.x + (rng() - 0.5) * 28,
        y: p.y - 6 - rng() * 14,
        ph: rng() * Math.PI * 2,
        sx: 0.25 + rng() * 0.35,
        sy: 0.3 + rng() * 0.4,
        blink: 0.6 + rng() * 0.9,
      });
    }
  }
}
