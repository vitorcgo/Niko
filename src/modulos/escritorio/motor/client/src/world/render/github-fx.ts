// GitHub no escritório, lado do desenho: festa (confete caindo na sala) e alarme (giroflex vermelho
// nos cantos da sala, luz girando pelo chão, tom vermelho pulsando no piso e balão "!" sobre quem viu
// o CI falhar), além da faixa curta ("PR #12 mergeado!") desenhada pelo overlay em espaço de tela.
// Com prefers-reduced-motion: nada pisca nem gira (luz parada, tom fixo, sem chuva de confete).
// Desempenho: só percorre as salas com efeito (quase sempre nenhuma); sprites em cache; o confete
// usa o pool fixo de partículas, com taxa limitada por sala.
import { TILE } from '../../art/api';
import type { HeadInfo } from './renderer';
import type { Particles } from './particles';
import type { RoomFx } from '../sim/github';
import type { Sim } from '../sim/sim';

const UI_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const BANNER_FONT = `800 11.5px ${UI_FONT}`;
const BANNER_H = 22;

/** Voltas do giroflex (ms por volta). */
const SPIN_MS = 900;
/** Confetes por segundo em cada sala em festa (~160 no ar por sala; o pool tem 600). */
const CONFETTI_RATE = 42;

let reducedMq: MediaQueryList | null | undefined;

/** prefers-reduced-motion (a MediaQueryList acompanha a mudança sozinha). */
export function reducedMotion(): boolean {
  if (reducedMq === undefined) reducedMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  return !!reducedMq?.matches;
}

/** Entrada (fade de 300 ms) e saída (600 ms) de um efeito: 0..1. */
export function fxFade(fx: Pick<RoomFx, 'start' | 'end'>, now: number): number {
  return Math.max(0, Math.min(1, (now - fx.start) / 300, (fx.end - now) / 600));
}

// ------------------------------------------------------------------ sprites (gerados uma vez)

type Rows = readonly string[];

function sprite(rows: Rows, pal: Readonly<Record<string, string>>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

// Giroflex: cúpula vermelha sobre uma base de metal. Quadros de uma volta: lâmpada de frente (brilho
// no meio), indo para a direita, de costas (cúpula escura) e voltando pela esquerda.
const BEACON_ROWS: Rows[] = [
  ['..kkkkk..', '.kRbwbrk.', 'kRRbwbRrk', 'kRRbwbRrk', 'kRRRRRRrk', 'kmmmmmmmk', 'kMMMMMMMk', '.kkkkkkk.'],
  ['..kkkkk..', '.kRRRwbk.', 'kRRRRRwbk', 'kRRRRRwbk', 'kRRRRRRrk', 'kmmmmmmmk', 'kMMMMMMMk', '.kkkkkkk.'],
  ['..kkkkk..', '.kddddek.', 'kdddddddk', 'kdddddddk', 'kdddddeek', 'kmmmmmmmk', 'kMMMMMMMk', '.kkkkkkk.'],
  ['..kkkkk..', '.kbwRRrk.', 'kbwRRRRrk', 'kbwRRRRrk', 'kRRRRRRrk', 'kmmmmmmmk', 'kMMMMMMMk', '.kkkkkkk.'],
];
const BEACON_PAL = { k: '#3a1012', R: '#ff3b3b', r: '#c4161f', b: '#ff9a9a', w: '#fff4f4', d: '#9b161d', e: '#6d0d12', m: '#8d96a6', M: '#5c6372' };

// Balão "!" (vermelho, com rabicho) sobre quem viu o CI falhar.
const BANG_ROWS: Rows = ['.kkkkkkk.', 'krrrrrrrk', 'krrrwrrrk', 'krrrwrrrk', 'krrrwrrrk', 'krrrrrrrk', 'krrrwrrrk', 'krrrrrrrk', '.kkkkkkk.', '...krk...', '....k....'];
const BANG_PAL = { k: '#4a0d10', r: '#e5383b', w: '#ffffff' };

let beacons: HTMLCanvasElement[] | null = null;
let bang: HTMLCanvasElement | null = null;

function beaconFrames(): HTMLCanvasElement[] {
  return (beacons ??= BEACON_ROWS.map((rows) => sprite(rows, BEACON_PAL)));
}

function bangSprite(): HTMLCanvasElement {
  return (bang ??= sprite(BANG_ROWS, BANG_PAL));
}

/** Quadro do giroflex na fase `ph` da volta (0 = de frente): de frente, à direita, de costas, à esquerda. */
export function beaconFrame(ph: number): number {
  return Math.min(3, Math.floor(((((ph + 0.125) % 1) + 1) % 1) * 4));
}

/** Quanto a lâmpada está virada para quem olha na fase `ph` (1 = de frente, 0 = de lado ou de costas). */
export function beaconFacing(ph: number): number {
  return Math.max(0, Math.cos(ph * Math.PI * 2));
}

const glows = new Map<number, HTMLCanvasElement>();

/**
 * Halo vermelho (gradiente radial, desenhado por cima com opacidade): tinge de vermelho tanto a parede
 * clara quanto o escuro — com 'lighter', o vermelho some sobre o branco.
 */
function redGlow(size: number): HTMLCanvasElement {
  let c = glows.get(size);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,36,48,0.75)');
  g.addColorStop(0.45, 'rgba(255,36,48,0.3)');
  g.addColorStop(1, 'rgba(255,36,48,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glows.set(size, c);
  return c;
}

// ------------------------------------------------------------------ mundo

interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Retângulos (px de mundo) de uma sala: a sala inteira e o piso (sem as paredes). */
function roomRects(r: { x: number; y: number; w: number; h: number }) {
  return {
    room: { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE },
    floor: { x: (r.x + 0.5) * TILE, y: (r.y + 2) * TILE, w: (r.w - 1) * TILE, h: (r.h - 3) * TILE },
  };
}

export class RoomFxRenderer {
  /** Acumulador da taxa de confete por sala. */
  private acc = new Map<string, number>();

  private visibleRoom(sim: Sim, fx: RoomFx, v: View) {
    const room = sim.rooms.get(fx.roomId);
    if (!room || !room.present || room.phase === 'dismantling') return null;
    const rects = roomRects(room.layout.rect);
    const p = rects.room;
    if (p.x > v.x1 || p.x + p.w < v.x0 || p.y - 8 > v.y1 || p.y + p.h < v.y0) return null;
    return rects;
  }

  /** Tom vermelho pulsando no piso das salas em alarme (antes dos móveis e personagens). */
  drawFloor(ctx: CanvasRenderingContext2D, sim: Sim, now: number, v: View): void {
    if (!sim.roomFx.active.size) return;
    const still = reducedMotion();
    for (const fx of sim.roomFx.active.values()) {
      if (fx.kind !== 'alarm' || now >= fx.end) continue;
      const rects = this.visibleRoom(sim, fx, v);
      if (!rects) continue;
      const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(((now - fx.start) / 1100) * Math.PI * 2);
      const f = rects.floor;
      ctx.globalAlpha = fxFade(fx, now) * (0.08 + 0.09 * pulse);
      ctx.fillStyle = '#ff2a36';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    ctx.globalAlpha = 1;
  }

  /** Confete caindo nas salas em festa (antes de as partículas andarem). */
  emit(particles: Particles, sim: Sim, now: number, dt: number, v: View): void {
    if (!sim.roomFx.active.size) {
      if (this.acc.size) this.acc.clear();
      return;
    }
    const still = reducedMotion();
    for (const [id, fx] of sim.roomFx.active) {
      if (fx.kind !== 'party' || now >= fx.end || still) {
        this.acc.delete(id);
        continue;
      }
      const rects = this.visibleRoom(sim, fx, v);
      if (!rects) continue;
      // começa forte e rareia nos últimos 2 s
      const k = Math.min(1, (fx.end - now) / 2000) * (now - fx.start < 1500 ? 1.6 : 1);
      let a = (this.acc.get(id) ?? 0) + Math.min(0.1, dt) * CONFETTI_RATE * k;
      const f = rects.floor;
      const top = rects.room.y + 4;
      while (a >= 1) {
        a -= 1;
        const y = top + Math.random() * 6;
        particles.confettiFall(f.x + 2 + Math.random() * (f.w - 4), y, f.y + f.h - 4 - y);
      }
      this.acc.set(id, a);
    }
    for (const id of this.acc.keys()) if (!sim.roomFx.active.has(id)) this.acc.delete(id);
  }

  /**
   * Giroflex nos dois cantos de cima da sala em alarme, com a luz girando pelo chão, e o balão "!" do
   * responsável. Desenhado por cima da luz/escuridão (brilha também à noite e com a sala apagada).
   */
  drawLights(ctx: CanvasRenderingContext2D, sim: Sim, heads: ReadonlyMap<string, HeadInfo>, now: number, v: View): void {
    if (!sim.roomFx.active.size) return;
    const still = reducedMotion();
    for (const fx of sim.roomFx.active.values()) {
      if (fx.kind !== 'alarm' || now >= fx.end) continue;
      const fade = fxFade(fx, now);
      const rects = this.visibleRoom(sim, fx, v);
      if (rects) this.drawBeacons(ctx, rects, now - fx.start, fade, still);
      // balão "!" sobre o responsável (onde ele estiver), à direita do ícone da cabeça; o overlay
      // sobe o balão de atividade para não cobri-lo
      const head = fx.agentId ? heads.get(fx.agentId) : undefined;
      if (head?.visible) {
        const s = bangSprite();
        const bob = still ? 0 : Math.round(Math.abs(Math.sin((now - fx.start) / 260)) * 2);
        ctx.globalAlpha = fade;
        ctx.drawImage(s, Math.round(head.x + 4), Math.round(head.y - s.height - 1 - bob));
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawBeacons(ctx: CanvasRenderingContext2D, rects: ReturnType<typeof roomRects>, t: number, fade: number, still: boolean): void {
    const frames = beaconFrames();
    const r = rects.room;
    const f = rects.floor;
    const spots = [r.x + 4, r.x + r.w - 4];
    // parado (prefers-reduced-motion): lâmpadas de frente, acesas, sem girar
    const ph = still ? 0 : t / SPIN_MS;
    /** Quanto a lâmpada `i` está virada para quem olha (0..1); a da direita está meia volta adiantada. */
    const facing = (i: number) => (still ? 0.6 : beaconFacing(ph + i * 0.5));
    // luz girando: um facho de cada lâmpada varrendo o chão da sala (em lados opostos)
    if (!still) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      const sweep = redGlow(128);
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      for (let i = 0; i < 2; i++) {
        const a = ph * Math.PI * 2 + i * Math.PI;
        ctx.globalAlpha = 0.3 * fade;
        ctx.drawImage(sweep, Math.round(cx + Math.cos(a) * f.w * 0.3 - 64), Math.round(cy + Math.sin(a) * f.h * 0.3 - 64));
      }
      ctx.restore();
    }
    // halo de cada lâmpada (vaza um pouco para fora da sala, como luz de verdade)
    const glow = redGlow(48);
    for (const [i, x] of spots.entries()) {
      ctx.globalAlpha = (0.25 + 0.75 * facing(i)) * fade;
      ctx.drawImage(glow, Math.round(x - 24), Math.round(r.y + 3 - 24));
    }
    ctx.globalAlpha = fade;
    for (const [i, x] of spots.entries()) {
      const s = frames[still ? 0 : beaconFrame(ph + i * 0.5)];
      const sx = Math.round(x - s.width / 2);
      const sy = Math.round(r.y + 7 - s.height);
      ctx.drawImage(s, sx, sy);
      // de frente para quem olha: raios curtos saindo da cúpula
      if (!still && facing(i) > 0.75) {
        ctx.fillStyle = '#ff6b6b';
        const cy = sy + 2;
        ctx.fillRect(sx - 4, cy, 3, 1);
        ctx.fillRect(sx + s.width + 1, cy, 3, 1);
        ctx.fillRect(sx - 2, cy - 3, 1, 1);
        ctx.fillRect(sx - 3, cy - 4, 1, 1);
        ctx.fillRect(sx + s.width + 1, cy - 3, 1, 1);
        ctx.fillRect(sx + s.width + 2, cy - 4, 1, 1);
        ctx.fillRect(sx + Math.floor(s.width / 2), sy - 3, 1, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ faixa (espaço de tela)

/** Retângulo ocupado na tela (px CSS). */
export interface BannerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Faixa curta da festa ("🎉 PR #12 mergeado!", dourada com as pontas recortadas) ou do alarme
 * ("🚨 CI falhou (main)", vermelha) centrada em `cx`, com o topo em `top` (px CSS). Entra descendo,
 * sai sumindo; a festa balança de leve e o alarme pulsa — parados com prefers-reduced-motion. Sem
 * espaço para o texto, vira só o emoji. Devolve o retângulo ocupado (para os balões desviarem).
 */
export function drawFxBanner(
  ctx: CanvasRenderingContext2D,
  fx: RoomFx,
  cx: number,
  top: number,
  maxW: number,
  now: number,
  fit: (font: string, text: string, maxW: number) => string,
  measure: (font: string, text: string) => number,
): BannerRect | null {
  const fade = fxFade(fx, now);
  if (fade <= 0) return null;
  const still = reducedMotion();
  const party = fx.kind === 'party';
  const emoji = party ? '🎉' : '🚨';
  const enter = still ? 0 : Math.max(0, 1 - (now - fx.start) / 260);
  const wave = !still && party ? Math.sin((now - fx.start) / 320) * 1.5 : 0;
  const y = Math.round(top - enter * 10 + wave);
  const notch = 6;
  const text = maxW >= 70 ? fit(BANNER_FONT, `${emoji} ${fx.text}`, maxW - 24 - 2 * notch) : '';
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.font = BANNER_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const pulse = still ? 0 : 0.5 + 0.5 * Math.sin(((now - fx.start) / 700) * Math.PI * 2);
  const body = party ? '#ffcf3a' : pulse > 0.5 ? '#ef3340' : '#c8202e';
  const edge = party ? '#c98a12' : '#7a0d16';
  const ink = party ? '#3a2606' : '#ffffff';
  if (!text || text === '…') {
    // só o emoji, num círculo
    const r = 11;
    ctx.fillStyle = 'rgba(16,20,32,0.25)';
    ctx.beginPath();
    ctx.arc(cx, y + r + 1.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, y + r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `13px ${UI_FONT}`;
    ctx.fillText(emoji, cx, y + r + 1);
    ctx.restore();
    return { x: cx - r, y, w: 2 * r, h: 2 * r };
  }
  const tw = measure(BANNER_FONT, text);
  const w = Math.round(tw + 24 + 2 * notch);
  const x = Math.round(cx - w / 2);
  const h = BANNER_H;
  const ribbon = (dy: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy);
    ctx.lineTo(x + w, y + dy);
    ctx.lineTo(x + w - notch, y + dy + h / 2);
    ctx.lineTo(x + w, y + dy + h);
    ctx.lineTo(x, y + dy + h);
    ctx.lineTo(x + notch, y + dy + h / 2);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(16,20,32,0.28)';
  ribbon(2);
  ctx.fill();
  ctx.fillStyle = edge;
  ribbon(1);
  ctx.fill();
  ctx.fillStyle = body;
  ribbon(0);
  ctx.fill();
  if (party) {
    // bandeirinhas coloridas na borda de cima
    const colors = ['#ff4d6d', '#3fa7ff', '#3ddc84', '#b06bff'];
    for (let i = 0, px = x + notch + 6; px < x + w - notch - 6; i++, px += 9) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(px - 3, y);
      ctx.lineTo(px + 3, y);
      ctx.lineTo(px, y + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = ink;
  ctx.fillText(text, Math.round(cx), y + h / 2 + 1);
  ctx.restore();
  return { x, y, w, h };
}
