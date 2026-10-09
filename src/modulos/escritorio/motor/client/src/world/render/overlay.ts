// Passada em ESPAÇO DE TELA (texto nítido na resolução do dispositivo): etiquetas de nome com a
// conta, balões de atividade, nomes das salas, textos das placas e destaque da seleção.
//
// Organização: tudo o que flutua (placas, pílulas, balões, etiquetas) disputa espaço na tela.
// Os itens são POSICIONADOS em ordem decrescente de prioridade (quem chega depois desvia, vira
// só o ícone ou é descartado) e DESENHADOS em ordem crescente (o mais importante fica por cima).
import { TILE } from '../../art/api';
import type { WorldOptions } from '../api';
import type { Camera } from '../camera';
import { COL_W, CORRIDOR_Y, SOUTH_Y } from '../constants';
import type { Character } from '../sim/character';
import { shellAgeKey, shellBubbleAlpha, shellBubbleText, STORM_LIFT, unitHash } from '../sim/shell';
import type { Sim } from '../sim/sim';
import { buildAnim } from './anim';
import { drawFxBanner } from './github-fx';
import type { HeadInfo, Renderer } from './renderer';

// A Pixelify Sans tem o "C" maiúsculo quase fechado (lê-se "Oopa" em vez de "Copa") em qualquer
// peso/tamanho usado no canvas; os textos do mundo usam a fonte do sistema, sempre legível.
const UI_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const LABEL_FONT = `600 10.5px ${UI_FONT}`;
const BUBBLE_FONT = `500 11.5px ${UI_FONT}`;
const SAY_FONT = `500 10.5px ${UI_FONT}`;
const FLOAT_FONT = `800 12px ${UI_FONT}`;
const CHIP_FONT = `700 8px ${UI_FONT}`;
const BADGE_FONT = `700 8px ${UI_FONT}`;
const ROOM_FONT = `700 12px ${UI_FONT}`;
const CORE_FONT = `600 11px ${UI_FONT}`;
const CORE_FONT_SMALL = `600 9.5px ${UI_FONT}`;
const signFont = (size: number) => `700 ${size}px ${UI_FONT}`;

/** Largura máxima dos balões (o de alerta é maior: o motivo é a informação acionável). */
export const BUBBLE_MAX_W = 220;
export const ALERT_MAX_W = 340;
const BUBBLE_H = 20;
const LABEL_H = 15;
const RECENT_MS = 4000;
/** Altura mínima (px CSS) da placa na tela para escrever o nome nela. */
const SIGN_MIN_PX = 14;
/** Abaixo deste zoom (visão geral), os balões de atividade são racionados. */
export const OVERVIEW_ZOOM = 1.8;
/** Abaixo deste zoom (prédio inteiro numa tela pequena), só alertas/entregas, como ícone. */
export const TINY_ZOOM = 0.6;
/** Na visão geral: balões de atividade com texto por área (sala, núcleo, trecho do corredor) e no total. */
const OVERVIEW_PER_ROOM = 1;
const OVERVIEW_TOTAL = 4;

const CORE_NAMES: Record<string, string> = {
  'core:recepcao': 'Recepção',
  'core:banheiros': 'Banheiros',
  'core:copa': 'Copa',
  'core:lounge': 'Lounge',
};

/** 'shell' = espera de shell: balão escuro de terminal com texto verde. 'say' = fala das rodas (papo, torcida, apostas). */
type Tone = 'info' | 'alert' | 'deliver' | 'shell' | 'say';
/** Largura máxima da fala das rodas (menor que a do balão de atividade). */
export const SAY_MAX_W = 170;
const SAY_H = 17;
/** Ícone do balão de espera de shell. */
export const SHELL_BUBBLE_ICON = '⏳';

interface Bubble {
  type: 'bubble';
  ch: Character;
  head: HeadInfo;
  icon: string;
  text: string;
  tone: Tone;
  prio: number;
  alpha: number;
  /** Só o ícone (sem texto): visão geral, colisões e telas pequenas. */
  chip: boolean;
  /** Elevação extra (px CSS) quando a etiqueta do personagem fica acima da cabeça. */
  extraLift: number;
  /** Ordem de recência (atividade mais nova primeiro no racionamento). */
  changedAt: number;
  // geometria resolvida no posicionamento
  x: number;
  y: number;
  w: number;
  h: number;
  /** Texto já cortado para a largura. */
  fitted: string;
  /** Subiu um degrau para desviar: o rabicho desce até a cabeça. */
  lifted: boolean;
}

interface Label {
  type: 'label';
  ch: Character;
  head: HeadInfo;
  prio: number;
  /** Etiqueta acima da cabeça (quem senta de frente para a câmera atrás de uma mesa). */
  above: boolean;
  compact: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Item = Bubble | Label;

/** Luminância relativa de uma cor hex (0..1). */
/** Fundo do chip vazado das contas do Codex (o mesmo dos painéis). */
const CODEX_CHIP_BG = '#161b26';
/** Selo "CODEX" das etiquetas: discreto (vidro claro), sem a cor de ninguém. */
const CODEX_BADGE = 'CODEX';

/** Octógono "em degrau" (um quadrado de cantos cortados, como um pixel arredondado). */
function steppedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x + w - s, y);
  ctx.lineTo(x + w, y + s);
  ctx.lineTo(x + w, y + h - s);
  ctx.lineTo(x + w - s, y + h);
  ctx.lineTo(x + s, y + h);
  ctx.lineTo(x, y + h - s);
  ctx.lineTo(x, y + s);
  ctx.closePath();
}

/**
 * Bolinha de uma conta (placas e pílulas das salas): cheia no Claude Code; vazada (anel na cor da conta) no Codex,
 * como o chip dos painéis.
 */
function accountDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, acc: { color: string; provider?: string }): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (acc.provider === 'codex') {
    ctx.fillStyle = CODEX_CHIP_BG;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, r * 0.55);
    ctx.strokeStyle = acc.color;
    ctx.beginPath();
    ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = acc.color;
  ctx.fill();
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** Altura (px de mundo) ocupada pelos ícones sobre a cabeça: balões e etiquetas sobem para não cobri-los. */
export function headIconLift(ch: Pick<Character, 'mode' | 'icon'>): number {
  if (ch.icon === 'storm') return 13 + STORM_LIFT;
  return ch.mode === 'wait' || ch.mode === 'shell' || ch.icon ? 13 : 0;
}

/** Texto do balão de espera: só o motivo (o amarelo e o ✋ já dizem "precisa de você"). */
export function waitBubbleText(waitingFor: string | undefined): string {
  const why = (waitingFor ?? '').trim().replace(/^precisa de você:?\s*/i, '');
  return why ? why.charAt(0).toUpperCase() + why.slice(1) : 'Responder no terminal';
}

/**
 * Racionamento dos balões de atividade na visão geral: mantém o texto dos `perRoom` mais
 * recentes de cada sala (até `total` na tela); os demais viram só o ícone. Retorna os índices
 * (na lista recebida) que continuam com texto. Puro (testável).
 */
export function rationBubbles(items: readonly { room: string; prio: number; changedAt: number }[], perRoom: number, total: number): Set<number> {
  const order = items.map((_, i) => i).sort((a, b) => items[b].prio - items[a].prio || items[b].changedAt - items[a].changedAt);
  const keep = new Set<number>();
  const byRoom = new Map<string, number>();
  for (const i of order) {
    if (keep.size >= total) break;
    const n = byRoom.get(items[i].room) ?? 0;
    if (n >= perRoom) continue;
    byRoom.set(items[i].room, n + 1);
    keep.add(i);
  }
  return keep;
}

export class Overlay {
  private widths = new Map<string, number>();
  private fitted = new Map<string, string>();
  private placed: number[] = [];
  private items: Item[] = [];
  /** Objetos reaproveitados entre frames (sem alocação no caminho quente). */
  private bubblePool: Bubble[] = [];
  private labelPool: Label[] = [];
  private nb = 0;
  private nl = 0;
  private rationIn: { room: string; prio: number; changedAt: number }[] = [];
  private rationIdx: Bubble[] = [];
  /** Transformação mundo -> tela (px CSS) do frame atual. */
  private k = 1;
  private ox = 0;
  private oy = 0;
  private zoom = 1;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly sim: Sim,
    private readonly renderer: Renderer,
    private readonly camera: Camera,
  ) {}

  /** Descarta medições (ex.: depois que uma fonte carregou). */
  resetCaches(): void {
    this.widths.clear();
    this.fitted.clear();
  }

  private measure(font: string, text: string): number {
    const key = `${font}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      if (this.widths.size > 4000) this.widths.clear();
      this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      this.widths.set(key, w);
    }
    return w;
  }

  /** Corta o texto com reticências para caber em `maxW` px. */
  private fit(font: string, text: string, maxW: number): string {
    const key = `${font}|${maxW}|${text}`;
    const hit = this.fitted.get(key);
    if (hit !== undefined) return hit;
    if (this.fitted.size > 2000) this.fitted.clear();
    let out = text;
    if (this.measure(font, text) > maxW) {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.measure(font, `${text.slice(0, mid).trimEnd()}…`) <= maxW) lo = mid;
        else hi = mid - 1;
      }
      out = lo > 0 ? `${text.slice(0, lo).trimEnd()}…` : '';
    }
    this.fitted.set(key, out);
    return out;
  }

  /** x/y de tela (px CSS) de um ponto do mundo, pela transformação do frame. */
  private sx(wx: number): number {
    return wx * this.k + this.ox;
  }

  private sy(wy: number): number {
    return wy * this.k + this.oy;
  }

  private overlaps(x: number, y: number, w: number, h: number): boolean {
    const p = this.placed;
    for (let i = 0; i < p.length; i += 4) {
      if (x < p[i] + p[i + 2] && x + w > p[i] && y < p[i + 1] + p[i + 3] && y + h > p[i + 1]) return true;
    }
    return false;
  }

  private place(x: number, y: number, w: number, h: number): void {
    this.placed.push(x, y, w, h);
  }

  draw(now: number, opts: WorldOptions, sel: { agent: string | null; room: string | null; hover: string | null }): void {
    const { ctx, camera } = this;
    const dpr = camera.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'middle';
    this.placed.length = 0;
    const t = camera.transform();
    this.k = t.scale / dpr;
    this.ox = t.ox / dpr;
    this.oy = t.oy / dpr;
    this.nb = 0;
    this.nl = 0;
    const zoom = (this.zoom = camera.zoom);
    const vw = camera.viewW;
    const vh = camera.viewH;

    // ---- seleção de sala
    if (sel.room) {
      const room = this.sim.rooms.get(sel.room);
      if (room && room.present) {
        const r = room.layout.rect;
        const ax = this.sx(r.x * TILE);
        const ay = this.sy(r.y * TILE);
        const bx = this.sx((r.x + r.w) * TILE);
        const by = this.sy((r.y + r.h) * TILE);
        ctx.save();
        ctx.strokeStyle = room.theme.accent;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.85 + Math.sin(now / 300) * 0.15;
        ctx.beginPath();
        ctx.roundRect(ax - 2, ay - 2, bx - ax + 4, by - ay + 4, 6);
        ctx.stroke();
        ctx.restore();
      }
    }

    // placas e pílulas primeiro: são fixas e grandes; balões e etiquetas desviam delas
    this.drawRoomTexts(now, zoom);
    this.drawFxBanners(now, zoom);

    // ---- coleta balões e etiquetas dos personagens visíveis
    const items = this.items;
    items.length = 0;
    const heads = this.renderer.heads;
    const showAll = opts.showNames && zoom >= 0.99;
    for (const ch of this.sim.chars.values()) {
      const head = heads.get(ch.id);
      if (!head || !head.visible) continue;
      const hx = this.sx(head.x);
      const hy = this.sy(head.y);
      if (hx < -120 || hx > vw + 120 || hy < -60 || hy > vh + 80) continue;
      const selected = sel.agent === ch.id;
      const hovered = sel.hover === ch.id;
      const labeled = selected || hovered || ch.mode === 'wait' || showAll;
      const above = labeled && this.labelAbove(ch);
      const b = this.bubbleFor(ch, head, now, opts, selected, hovered);
      if (b) {
        b.extraLift = above ? LABEL_H + 3 : 0;
        items.push(b);
      }
      if (labeled) {
        const prio = selected ? 100 : hovered ? 95 : ch.mode === 'wait' ? 90 : ch.info.kind === 'main' ? 50 : 40;
        let l = this.labelPool[this.nl];
        if (!l) this.labelPool[this.nl] = l = { type: 'label', ch, head, prio, above, compact: false, x: 0, y: 0, w: 0, h: 0 };
        else {
          l.ch = ch;
          l.head = head;
          l.prio = prio;
          l.above = above;
        }
        l.compact = zoom < 2.5 && !selected && !hovered;
        this.nl++;
        items.push(l);
      }
    }

    this.ration(zoom);

    // ---- posiciona (prioridade decrescente) e desenha (crescente: o mais importante por cima)
    items.sort((a, b) => b.prio - a.prio || (a.type === b.type ? a.head.feetY - b.head.feetY : a.type === 'bubble' ? -1 : 1));
    let n = 0;
    for (const it of items) {
      const ok = it.type === 'bubble' ? this.placeBubble(it) : this.placeLabel(it);
      if (ok) items[n++] = it;
    }
    items.length = n;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.type === 'bubble') this.drawBubble(it, now);
      else this.drawLabel(it, sel);
    }
    this.drawChats(now);
    this.drawFloaters(now);
    ctx.textBaseline = 'alphabetic';
  }

  /** Quem senta virado para a câmera atrás de uma mesa: a etiqueta nos pés cobriria a tela do colega. */
  private labelAbove(ch: Character): boolean {
    if (!ch.seated || ch.dir !== 'down' || !ch.atSpot) return false;
    const spot = this.sim.spots.get(ch.atSpot);
    return !!spot && spot.kind === 'desk';
  }

  /** Racionamento por zoom: visão geral com poucos textos; telas minúsculas só com ícones críticos. */
  private ration(zoom: number): void {
    const items = this.items;
    if (zoom < TINY_ZOOM) {
      let n = 0;
      for (const it of items) {
        if (it.type === 'bubble') {
          // atividade comum e falas somem; alerta, entrega, espera de shell e o selecionado viram só o ícone
          if ((it.tone === 'info' && it.prio < 75) || it.tone === 'say') continue;
          it.chip = true;
        }
        items[n++] = it;
      }
      items.length = n;
      return;
    }
    if (zoom >= OVERVIEW_ZOOM) return;
    const rin = this.rationIn;
    const idx = this.rationIdx;
    rin.length = 0;
    idx.length = 0;
    for (const it of items) {
      if (it.type !== 'bubble' || (it.tone !== 'info' && it.tone !== 'shell' && it.tone !== 'say') || it.prio >= 75) continue;
      // por área FÍSICA (onde o personagem está agora), que é o que polui a tela
      const ch = it.ch;
      rin.push({ room: `${Math.floor(ch.tx / COL_W)}:${ch.ty < CORRIDOR_Y ? 'n' : ch.ty < SOUTH_Y ? 'c' : 's'}`, prio: it.prio, changedAt: it.changedAt });
      idx.push(it);
    }
    if (!idx.length) return;
    const keep = rationBubbles(rin, OVERVIEW_PER_ROOM, OVERVIEW_TOTAL);
    for (let i = 0; i < idx.length; i++) if (!keep.has(i)) idx[i].chip = true;
  }

  // =================================================================== salas

  private drawRoomTexts(now: number, zoom: number): void {
    const { camera } = this;
    const vw = camera.viewW;
    const vh = camera.viewH;
    // largura de uma coluna na tela: as pílulas não podem invadir a vizinha
    const colW = COL_W * TILE * zoom;
    for (const vis of this.renderer.areas.values()) {
      const room = vis.room;
      const r = vis.layout.rect;
      const anim = room ? buildAnim(room.phase, room.progress(now)) : null;
      // texto da placa quando ela fica grande o bastante para ler; senão, o nome flutuante
      const rect = this.renderer.signRect(vis);
      const text = room ? room.info.name : vis.id === 'core:recepcao' ? 'Niko' : null;
      const readable = !!rect && rect.h * zoom >= SIGN_MIN_PX;
      if (readable && rect && text && (!anim || anim.sign >= 1)) {
        const ax = this.sx(rect.x);
        const ay = this.sy(rect.y);
        const w = rect.w * zoom;
        const h = rect.h * zoom;
        if (ax + w > 0 && ax < vw && ay + h > 0 && ay < vh) {
          this.drawSignText(text, ax, ay, w, h, this.renderer.signIsDark(vis), room?.accounts ?? []);
          this.place(ax, ay, w, h);
        }
      }
      if (room ? readable : zoom >= 1.4) continue;
      const cx = this.sx((r.x + r.w / 2) * TILE);
      const cy = this.sy(r.y * TILE + 6);
      if (cx < -200 || cx > vw + 200 || cy < -40 || cy > vh + 40) continue;
      if (room) {
        // endereço antigo de uma mudança: o nome já está na sala nova
        if (!room.present || room.ghost || (anim && anim.walls < 0.6)) continue;
        this.drawRoomPill(room.info.name, cx, cy, colW - 8, room.accounts, this.countIn(room.id), room.theme.accent, room.lightOn);
      } else if (CORE_NAMES[vis.id]) {
        this.drawCorePill(CORE_NAMES[vis.id], cx, cy, colW - 8);
      }
    }
  }

  /** Altura dos ícones sobre a cabeça, contando o balão "!" de quem viu o CI falhar (render/github-fx.ts). */
  private iconLift(ch: Character): number {
    const lift = headIconLift(ch);
    return this.sim.roomFx.active.size && this.sim.roomFx.alarmOwner(ch.id, this.sim.now) ? Math.max(lift, 13) : lift;
  }

  /** Faixa da festa/alarme (eventos do GitHub) no alto do piso de cada sala com efeito. */
  private drawFxBanners(now: number, zoom: number): void {
    const fxs = this.sim.roomFx.active;
    if (!fxs.size) return;
    const { camera } = this;
    for (const fx of fxs.values()) {
      const room = this.sim.rooms.get(fx.roomId);
      if (!room || !room.present || now >= fx.end) continue;
      const r = room.layout.rect;
      const cx = this.sx((r.x + r.w / 2) * TILE);
      const top = this.sy((r.y + 2) * TILE) + 4;
      if (cx < -200 || cx > camera.viewW + 200 || top < -40 || top > camera.viewH + 40) continue;
      const b = drawFxBanner(this.ctx, fx, cx, top, r.w * TILE * zoom - 12, now, (f, t, w) => this.fit(f, t, w), (f, t) => this.measure(f, t));
      if (b) this.place(b.x, b.y, b.w, b.h);
    }
  }

  private countIn(roomId: string): number {
    let n = 0;
    for (const c of this.sim.chars.values()) if (c.roomId === roomId && !c.leaving) n++;
    return n;
  }

  private drawSignText(text: string, x: number, y: number, w: number, h: number, dark: boolean, accounts: string[]): void {
    const { ctx } = this;
    // encolhe a fonte até 7px; abaixo disso, corta com reticências
    let size = Math.min(18, Math.max(7, Math.floor(h * 0.72)));
    let font = signFont(size);
    while (size > 7 && this.measure(font, text) > w - 4) {
      size--;
      font = signFont(size);
    }
    const t = this.fit(font, text, w - 4);
    ctx.font = font;
    ctx.textAlign = 'center';
    const cx = Math.round(x + w / 2);
    const cy = Math.round(y + h / 2) + 0.5;
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)';
    ctx.fillText(t, cx, cy + 1);
    ctx.fillStyle = dark ? '#f5f1e6' : '#26303e';
    ctx.fillText(t, cx, cy);
    ctx.textAlign = 'left';
    // contas presentes: bolinhas na cor da conta, no canto da placa
    const r = Math.max(2.5, Math.min(4, h * 0.22));
    let dx = x + w + r + 3;
    for (const id of accounts) {
      const acc = this.sim.accounts.get(id);
      if (!acc) continue;
      accountDot(ctx, dx, y + h / 2, r, acc);
      ctx.beginPath();
      ctx.arc(dx, y + h / 2, r, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(20,24,36,0.65)';
      ctx.stroke();
      dx += r * 2 + 2;
    }
  }

  private drawRoomPill(name: string, cx: number, cy: number, maxW: number, accounts: string[], count: number, accent: string, lit: boolean): void {
    const { ctx } = this;
    let dots = accounts.filter((a) => this.sim.accounts.has(a));
    let countText = count > 0 ? String(count) : '';
    let cw = countText ? this.measure(LABEL_FONT, countText) + 14 : 0;
    // nome cortado para caber na largura da coluna; com pouco espaço, o nome vale mais que a
    // contagem e as bolinhas; sem espaço nem para 3 letras, pílula compacta (só contagem)
    let text = this.fit(ROOM_FONT, name, Math.min(180, maxW - (18 + dots.length * 10 + cw)));
    if (text.length < Math.min(7, name.length)) {
      const alone = this.fit(ROOM_FONT, name, maxW - 18);
      if (alone.length >= 4) {
        text = alone;
        dots = [];
        countText = '';
        cw = 0;
      }
    }
    const extras = 18 + dots.length * 10 + cw;
    // Só vira pílula compacta quando o nome precisou ser cortado (nomes curtos como "app" cabem inteiros).
    const compact = text !== name && text.length < 4;
    const tw = compact ? 0 : this.measure(ROOM_FONT, text);
    const w = Math.round(compact ? Math.max(12, 10 + cw + dots.length * 10) : tw + extras);
    const h = 22;
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h - 4);
    ctx.save();
    ctx.globalAlpha = lit ? 1 : 0.8;
    ctx.fillStyle = 'rgba(16,20,32,0.28)';
    ctx.beginPath();
    ctx.roundRect(x, y + 2, w, h, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(22,27,40,0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(x, y, 4, h, [7, 0, 0, 7]);
    ctx.fill();
    let dx = x + 10;
    if (!compact) {
      ctx.font = ROOM_FONT;
      ctx.fillStyle = '#f3f5fa';
      ctx.fillText(text, x + 10, y + h / 2 + 1);
      dx = x + 10 + tw + 8;
    }
    for (const id of dots) {
      accountDot(ctx, dx + 3, y + h / 2, 3.5, this.sim.accounts.get(id)!);
      dx += 10;
    }
    if (countText) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(dx + 2, y + 4, cw - 4, h - 8, 5);
      ctx.fill();
      ctx.font = LABEL_FONT;
      ctx.fillStyle = '#dfe5f2';
      ctx.fillText(countText, dx + 7, y + h / 2 + 0.5);
    }
    ctx.restore();
    this.place(x, y, w, h);
  }

  private drawCorePill(name: string, cx: number, cy: number, maxW: number): void {
    const { ctx } = this;
    // fonte um pouco menor antes de cortar o nome
    const font = this.measure(CORE_FONT, name) <= maxW - 14 ? CORE_FONT : CORE_FONT_SMALL;
    const text = this.fit(font, name, maxW - 14);
    if (text.length < 3) return;
    const tw = this.measure(font, text);
    const w = Math.round(tw + 14);
    const h = 18;
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h - 4);
    ctx.fillStyle = 'rgba(22,27,40,0.62)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = '#e8ecf5';
    ctx.fillText(text, x + 7, y + h / 2 + 1);
    this.place(x, y, w, h);
  }

  // =================================================================== balões

  private takeBubble(ch: Character, head: HeadInfo, icon: string, text: string, tone: Tone, prio: number, alpha: number, changedAt: number): Bubble {
    let b = this.bubblePool[this.nb];
    if (!b) {
      b = { type: 'bubble', ch, head, icon, text, tone, prio, alpha, chip: false, extraLift: 0, changedAt, x: 0, y: 0, w: 0, h: 0, fitted: '', lifted: false };
      this.bubblePool[this.nb] = b;
    } else {
      b.ch = ch;
      b.head = head;
      b.icon = icon;
      b.text = text;
      b.tone = tone;
      b.prio = prio;
      b.alpha = alpha;
      b.chip = false;
      b.extraLift = 0;
      b.changedAt = changedAt;
      b.lifted = false;
    }
    this.nb++;
    return b;
  }

  private bubbleFor(ch: Character, head: HeadInfo, now: number, opts: WorldOptions, selected: boolean, hovered: boolean): Bubble | null {
    if (opts.bubbles === 'none') return null;
    if (ch.mode === 'wait') return this.takeBubble(ch, head, '✋', waitBubbleText(ch.info.waitingFor), 'alert', 100, 1, now);
    if (ch.bubbleText && now < ch.bubbleUntil) {
      const a = Math.min(1, (now - ch.bubbleAt) / 150, (ch.bubbleUntil - now) / 400);
      return this.takeBubble(ch, head, ch.bubbleIcon, ch.bubbleText, 'deliver', 90, a, ch.bubbleAt);
    }
    // fala das rodas (convite, papo, torcida, aposta): curta e por cima da atividade recente
    if (ch.sayText && now < ch.sayUntil && !ch.leaving) {
      const a = Math.min(1, (now - ch.sayAt) / 120, (ch.sayUntil - now) / 300);
      return this.takeBubble(ch, head, sayIcon(ch.sayText), ch.sayText, 'say', 55, a, ch.sayAt);
    }
    const act = ch.info.activity;
    if (ch.mode === 'shell' && ch.shellSince > 0 && !ch.leaving) {
      const sb = this.shellBubble(ch, head, now, opts, selected, hovered);
      if (sb) return sb;
    }
    if (!act || ch.leaving) return null;
    const age = now - ch.activityChangedAt;
    if (selected) return this.takeBubble(ch, head, act.icon, act.text, 'info', 80, 1, ch.activityChangedAt);
    if (hovered) return this.takeBubble(ch, head, act.icon, act.text, 'info', 75, 1, ch.activityChangedAt);
    if (opts.bubbles === 'all' && ch.mode === 'work') return this.takeBubble(ch, head, act.icon, act.text, 'info', age < RECENT_MS ? 50 : 30, 1, ch.activityChangedAt);
    if (age < RECENT_MS && ch.activityChangedAt > 0) {
      const a = Math.min(1, age / 150, (RECENT_MS - age) / 500);
      return this.takeBubble(ch, head, act.icon, act.text, 'info', 50, a, ch.activityChangedAt);
    }
    return null;
  }

  /**
   * Balão "⏳ <rótulo> · <tempo>" de quem espera um shell. Modo 'all': sempre; 'important': ao entrar
   * no estado e depois por 4 s a cada ~30 s; selecionado/hover: sempre. Uma atividade nova (ex.: o
   * fim de um dos shells) tem a vez enquanto é recente.
   */
  private shellBubble(ch: Character, head: HeadInfo, now: number, opts: WorldOptions, selected: boolean, hovered: boolean): Bubble | null {
    const recent = now - ch.activityChangedAt < RECENT_MS && ch.activityChangedAt > ch.shellEnteredAt + 500;
    if (recent && !selected && !hovered) return null;
    const text = this.shellText(ch, now);
    if (selected) return this.takeBubble(ch, head, SHELL_BUBBLE_ICON, text, 'shell', 80, 1, ch.shellEnteredAt);
    if (hovered) return this.takeBubble(ch, head, SHELL_BUBBLE_ICON, text, 'shell', 75, 1, ch.shellEnteredAt);
    if (opts.bubbles === 'all') return this.takeBubble(ch, head, SHELL_BUBBLE_ICON, text, 'shell', 45, 1, ch.shellEnteredAt);
    // cada personagem no seu ritmo (os balões da sala não piscam juntos)
    const a = shellBubbleAlpha(now - ch.shellEnteredAt, unitHash(ch.info.seed, 0, 3) * 9000);
    return a > 0.01 ? this.takeBubble(ch, head, SHELL_BUBBLE_ICON, text, 'shell', 50, a, ch.shellEnteredAt) : null;
  }

  /** Texto do balão de shell, refeito só quando o tempo exibido muda (não a cada frame). */
  private shellText(ch: Character, now: number): string {
    const age = now - ch.shellSince;
    const key = shellAgeKey(age);
    if (key !== ch.shellTextKey || !ch.shellText) {
      ch.shellTextKey = key;
      ch.shellText = shellBubbleText(ch.shellLabel, age);
    }
    return ch.shellText;
  }

  /** Calcula o retângulo do balão (completo ou só o ícone) na posição base sobre a cabeça. */
  private layoutBubble(b: Bubble): void {
    const { camera } = this;
    // acima do ícone da cabeça (quando houver), que é desenhado em espaço de mundo
    const lift = Math.max(1, this.iconLift(b.ch)) * this.zoom + b.extraLift;
    const headX = this.sx(b.head.x);
    const headY = this.sy(b.head.y);
    const say = b.tone === 'say';
    const iconW = b.icon && !say ? this.measure(BUBBLE_FONT, b.icon) + 4 : 0;
    if (b.chip || !b.text) {
      b.fitted = '';
      b.w = Math.round(Math.max(20, (say ? this.measure(BUBBLE_FONT, b.icon) + 4 : iconW) + 10));
    } else if (say) {
      b.fitted = this.fit(SAY_FONT, b.text, SAY_MAX_W - 14);
      b.w = Math.round(Math.min(SAY_MAX_W, this.measure(SAY_FONT, b.fitted) + 14));
    } else {
      const maxW = b.tone === 'alert' ? ALERT_MAX_W : BUBBLE_MAX_W;
      b.fitted = this.fit(BUBBLE_FONT, b.text, maxW - 16 - iconW);
      b.w = Math.round(Math.min(maxW, this.measure(BUBBLE_FONT, b.fitted) + iconW + 14));
    }
    b.h = say && !b.chip ? SAY_H : BUBBLE_H;
    b.x = Math.max(4, Math.min(camera.viewW - b.w - 4, Math.round(headX - b.w / 2)));
    b.y = Math.round(headY - lift - b.h - 6);
  }

  /** Posiciona o balão sem cobrir o que já está na tela. Retorna false se ele deve sumir. */
  private placeBubble(b: Bubble): boolean {
    this.layoutBubble(b);
    if (!this.overlaps(b.x, b.y, b.w, b.h)) {
      this.place(b.x, b.y, b.w, b.h);
      return true;
    }
    if (b.tone === 'alert') {
      // o alerta nunca some: sobe um degrau (rabicho longo até a cabeça) ou fica por cima
      const up = b.y - b.h - 6;
      if (!this.overlaps(b.x, up, b.w, b.h)) {
        b.y = up;
        b.lifted = true;
      }
      this.place(b.x, b.y, b.w, b.h);
      return true;
    }
    if (!b.chip) {
      // não cabe com texto: tenta só o ícone, no mesmo lugar
      b.chip = true;
      this.layoutBubble(b);
      if (!this.overlaps(b.x, b.y, b.w, b.h)) {
        this.place(b.x, b.y, b.w, b.h);
        return true;
      }
    }
    return false;
  }

  private drawBubble(b: Bubble, now: number): void {
    const { ctx } = this;
    const { x, y, w, h } = b;
    const headX = this.sx(b.head.x);
    const tone = b.tone;
    const bg = tone === 'alert' ? '#ffcf4a' : tone === 'deliver' ? '#e2f0ff' : tone === 'shell' ? '#1d2433' : tone === 'say' ? '#ffffff' : '#fffdf8';
    const border = tone === 'alert' ? '#c58f10' : tone === 'deliver' ? '#7aa7d9' : tone === 'shell' ? '#4b5d7e' : tone === 'say' ? 'rgba(40,48,66,0.38)' : 'rgba(40,48,66,0.22)';
    const fg = tone === 'alert' ? '#3b2a00' : tone === 'deliver' ? '#17324f' : tone === 'shell' ? '#b9f6b4' : tone === 'say' ? '#1d2330' : '#232a36';
    const pulse = tone === 'alert' ? 1 + Math.sin(now / 160) * 0.035 : 1;
    ctx.save();
    ctx.globalAlpha = b.alpha;
    if (b.lifted) {
      // conector até a posição normal do rabicho (o balão subiu para desviar de outro)
      const tx = Math.max(x + 8, Math.min(x + w - 8, Math.round(headX)));
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx + 0.5, y + h);
      ctx.lineTo(tx + 0.5, y + 2 * h + 11);
      ctx.stroke();
    }
    if (pulse !== 1) {
      ctx.translate(headX, y + h);
      ctx.scale(pulse, pulse);
      ctx.translate(-headX, -(y + h));
    }
    const tailX = Math.max(x + 8, Math.min(x + w - 8, Math.round(headX)));
    // sombra
    ctx.fillStyle = 'rgba(16,20,32,0.22)';
    ctx.beginPath();
    ctx.roundRect(x, y + 2, w, h, 7);
    ctx.fill();
    // corpo + rabicho
    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tailX - 4.5, y + h - 1);
    ctx.lineTo(tailX, y + h + 5);
    ctx.lineTo(tailX + 4.5, y + h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tailX - 4.5, y + h - 0.5);
    ctx.lineTo(tailX, y + h + 5);
    ctx.lineTo(tailX + 4.5, y + h - 0.5);
    ctx.stroke();
    ctx.fillStyle = bg;
    ctx.fillRect(tailX - 4, y + h - 2, 8, 2);
    // conteúdo
    ctx.font = tone === 'say' && !b.chip ? SAY_FONT : BUBBLE_FONT;
    ctx.fillStyle = fg;
    if (tone === 'say' && !b.chip && b.fitted) {
      ctx.textAlign = 'center';
      ctx.fillText(b.fitted, x + w / 2, y + h / 2 + 1);
      ctx.textAlign = 'left';
    } else if (b.chip || !b.fitted) {
      ctx.textAlign = 'center';
      ctx.fillText(b.icon || '…', x + w / 2, y + h / 2 + 1);
      ctx.textAlign = 'left';
    } else {
      let tx = x + 7;
      if (b.icon) {
        ctx.fillText(b.icon, tx, y + h / 2 + 1);
        tx += this.measure(BUBBLE_FONT, b.icon) + 4;
      }
      ctx.fillText(b.fitted, tx, y + h / 2 + 1);
    }
    ctx.restore();
  }

  /** Mini-balões das conversas (só emoji). */
  private drawChats(now: number): void {
    const { ctx } = this;
    for (const ch of this.sim.chars.values()) {
      if (!ch.chatEmoji || now > ch.chatUntil) continue;
      const head = this.renderer.heads.get(ch.id);
      if (!head || !head.visible) continue;
      const px = this.sx(head.x);
      const py = this.sy(head.y);
      const k = Math.min(1, (ch.chatUntil - now) / 300, 1 - (ch.chatUntil - now - 1000) / 200);
      const r = 12;
      const side = ch.dir === 'left' ? -1 : 1;
      const x = Math.round(px + side * 12);
      const y = Math.round(py - 16 - (1 - Math.min(1, k)) * 4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, k));
      ctx.fillStyle = 'rgba(16,20,32,0.2)';
      ctx.beginPath();
      ctx.arc(x, y + 1.5, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - side * 4, y + r - 2);
      ctx.lineTo(x - side * 9, y + r + 4);
      ctx.lineTo(x - side * 1, y + r - 1);
      ctx.fill();
      ctx.font = `14px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(ch.chatEmoji, x, y + 1);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  /** "+🪙10" subindo e sumindo sobre quem ganhou (ou "−🪙10" sobre quem perdeu). */
  private drawFloaters(now: number): void {
    const fl = this.sim.social.floaters;
    if (!fl.length || this.zoom < TINY_ZOOM) return;
    const { ctx } = this;
    ctx.save();
    ctx.font = FLOAT_FONT;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const f of fl) {
      const head = this.renderer.heads.get(f.charId);
      if (!head || !head.visible || now < f.at) continue;
      const t = Math.min(1, (now - f.at) / (f.until - f.at));
      // ao lado da cabeça (o balão da fala fica em cima), subindo
      const x = Math.round(this.sx(head.x) + 10 * this.zoom + 12);
      const y = Math.round(this.sy(head.y) + 4 * this.zoom - t * 24);
      ctx.globalAlpha = t < 0.12 ? t / 0.12 : Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,24,36,0.85)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.restore();
  }

  // =================================================================== etiquetas

  /** Larguras das partes da etiqueta. O selo "CODEX" (como o "SUB") só aparece fora do modo compacto. */
  private labelWidth(l: Label): { nameW: number; chipW: number; badgeW: number; codexW: number } {
    const ch = l.ch;
    const acc = this.sim.accounts.get(ch.info.account);
    const nameW = this.measure(LABEL_FONT, ch.info.name);
    const chipW = acc ? 13 : 0;
    const badgeW = ch.info.kind === 'sub' && !l.compact ? this.measure(BADGE_FONT, 'SUB') + 7 : 0;
    const codexW = ch.info.provider === 'codex' && !l.compact ? this.measure(BADGE_FONT, CODEX_BADGE) + 7 : 0;
    return { nameW, chipW, badgeW, codexW };
  }

  /** Posiciona a etiqueta: nos pés (ou acima da cabeça); se colidir, tenta o outro lado. */
  private placeLabel(l: Label): boolean {
    const { nameW, chipW, badgeW, codexW } = this.labelWidth(l);
    const w = Math.round(nameW + 10 + chipW + (badgeW ? badgeW + 3 : 0) + (codexW ? codexW + 3 : 0));
    const h = LABEL_H;
    const x = Math.round(this.sx(l.head.x) - w / 2);
    const below = Math.round(this.sy(l.head.feetY) + 3);
    const iconLift = this.iconLift(l.ch) * this.zoom;
    const over = Math.round(this.sy(l.head.y) - iconLift - h - 3);
    const first = l.above ? over : below;
    const second = l.above ? below : over;
    l.w = w;
    l.h = h;
    l.x = x;
    if (!this.overlaps(x, first, w, h)) l.y = first;
    else if (!this.overlaps(x, second, w, h)) l.y = second;
    else if (l.prio >= 90) l.y = first;
    else return false;
    this.place(l.x, l.y, w, h);
    return true;
  }

  private drawLabel(l: Label, sel: { agent: string | null; hover: string | null }): void {
    const { ctx } = this;
    const ch = l.ch;
    const acc = this.sim.accounts.get(ch.info.account);
    const sub = ch.info.kind === 'sub';
    const codex = ch.info.provider === 'codex' || acc?.provider === 'codex';
    const { nameW, chipW, badgeW, codexW } = this.labelWidth(l);
    const { x, y, w, h } = l;
    const selected = sel.agent === ch.id;
    ctx.fillStyle = selected ? 'rgba(18,96,140,0.95)' : ch.mode === 'wait' ? 'rgba(120,78,0,0.92)' : 'rgba(22,26,38,0.82)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7.5);
    ctx.fill();
    let cx = x + 4;
    if (acc && codex) {
      // Codex: chip vazado de cantos em degrau (fundo escuro, borda e letra na cor da conta), como nos painéis.
      steppedRect(ctx, cx, y + h / 2 - 5, 10, 10, 2);
      ctx.fillStyle = CODEX_CHIP_BG;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = acc.color;
      steppedRect(ctx, cx + 0.75, y + h / 2 - 4.25, 8.5, 8.5, 1.6);
      ctx.stroke();
      ctx.font = CHIP_FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = acc.color;
      ctx.fillText(acc.short.slice(0, 1), cx + 5, y + h / 2 + 0.5);
      ctx.textAlign = 'left';
      cx += chipW;
    } else if (acc) {
      ctx.beginPath();
      ctx.arc(cx + 5, y + h / 2, 5, 0, Math.PI * 2);
      ctx.fillStyle = acc.color;
      ctx.fill();
      ctx.font = CHIP_FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = luminance(acc.color) > 0.62 ? '#1d2330' : '#ffffff';
      ctx.fillText(acc.short.slice(0, 1), cx + 5, y + h / 2 + 0.5);
      ctx.textAlign = 'left';
      cx += chipW;
    }
    ctx.font = LABEL_FONT;
    ctx.fillStyle = '#f5f7fb';
    ctx.fillText(ch.info.name, cx + 1, y + h / 2 + 0.5);
    cx += nameW + 4;
    if (badgeW) {
      ctx.fillStyle = ch.appearance.lanyard ?? '#f2b33d';
      ctx.beginPath();
      ctx.roundRect(cx, y + 3, badgeW, h - 6, 4);
      ctx.fill();
      ctx.font = BADGE_FONT;
      ctx.fillStyle = '#2a2000';
      ctx.fillText('SUB', cx + 3.5, y + h / 2 + 0.5);
      cx += badgeW + 3;
    } else if (sub) {
      // selo compacto: pontinho na cor do crachá
      ctx.fillStyle = ch.appearance.lanyard ?? '#f2b33d';
      ctx.beginPath();
      ctx.arc(x + w - 3, y + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (codexW) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.roundRect(cx, y + 3, codexW, h - 6, 3);
      ctx.fill();
      ctx.font = BADGE_FONT;
      ctx.fillStyle = '#e8ecf5';
      ctx.fillText(CODEX_BADGE, cx + 3.5, y + h / 2 + 0.5);
    }
  }
}

/** Ícone da fala quando ela vira só um chip (visão geral): o primeiro emoji da frase, ou 💬. */
export function sayIcon(text: string): string {
  const m = /\p{Extended_Pictographic}(?:\uFE0F)?/u.exec(text);
  return m ? m[0] : '💬';
}
