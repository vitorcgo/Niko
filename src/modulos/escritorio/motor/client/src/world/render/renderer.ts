// Desenho do mundo por frame: camada externa -> pisos -> paredes/itens de parede -> entidades
// ordenadas por profundidade -> luz/escuridão -> ícones. A passada em espaço de tela (texto
// nítido) fica em overlay.ts.
import { TILE, type ArtModule, type CharacterFrameRequest, type IconName, type ScreenMode, type Sprite } from '../../art/api';
import type { WorldOptions } from '../api';
import type { WorldAssets } from '../assets';
import type { Camera } from '../camera';
import { BUILDING_H, COL_W, CORE_COLS, CORRIDOR_Y } from '../constants';
import type { ExteriorLayout, SlotShell } from '../layout/exterior';
import { exteriorUrbano as layoutExterior, patioUrbano as slotShell } from '../../../../../cenarioUrbano';
import { slotAt } from '../layout/geometry';
import type { ExteriorProp } from '../layout/types';
import { screenModeFor } from '../sim/behavior';
import type { Character } from '../sim/character';
import type { RoomState } from '../sim/room-state';
import { cobwebScale, hourglassIcon, HOURGLASS_FLIP_MS, STORM_LIFT } from '../sim/shell';
import type { Sim } from '../sim/sim';
import { buildAnim, furnitureScale, NO_ANIM, sweepDelay, type BuildAnim } from './anim';
import { daylightModeOf, parseHourParam } from './daylight';
import { RoomFxRenderer } from './github-fx';
import { Lighting } from './lighting';
import { Particles } from './particles';
import { carSprite, propSprite, shadowSprite } from './props';
import { countBadge, fallbackIcon } from './shell-sprites';
import { buildAreaVis, furnitureSprites, opaqueBounds, paintShell, toWallVis, WALL_MARGIN, wallItemOrigin, wallSprites, type AreaVis, type FurnVis, type WallVis } from './scene';

const enum K {
  FurnBase,
  FurnFront,
  Char,
  Prop,
  Car,
}

interface Ent {
  k: K;
  y: number;
  ref: FurnVis | Character | ExteriorProp | Car | null;
  area: AreaVis | null;
  scale: number;
}

interface Car {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  variant: number;
}

/** Posição da cabeça (px de mundo) de cada personagem desenhado neste frame. */
export interface HeadInfo {
  x: number;
  y: number;
  feetY: number;
  visible: boolean;
  /** Retângulo do sprite (px de mundo) para hit-test. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  depth: number;
}

const TV_MODES: ScreenMode[] = ['browser', 'idle', 'chat', 'code'];
/**
 * Boca do balde de pipoca (px relativos aos pés) na pose 'wait' sentada, por direção — segue o rig
 * da arte: abraçado no peito de frente, ao lado do quadril de costas, no colo de perfil.
 */
const POPCORN_DX: Readonly<Record<string, number>> = { down: 0, up: -9, left: -5, right: 5 };
const POPCORN_DY: Readonly<Record<string, number>> = { down: 11, up: 8, left: 9, right: 9 };
/** Teia ao lado de um vizinho: no máximo isto (px) para fora do corpo. */
const WEB_MAX_OUT = 9;
/** Tom das bordas da área externa (vinheta) e do gramado além dela. */
const VIGNETTE_ALPHA = 0.2;
const VIGNETTE_EDGE = `rgba(18,40,26,${VIGNETTE_ALPHA})`;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly areas = new Map<string, AreaVis>();
  readonly heads = new Map<string, HeadInfo>();
  exterior: ExteriorLayout;
  shells: SlotShell[] = [];
  shellWindows: WallVis[] = [];
  private base: HTMLCanvasElement | null = null;
  private baseX = 0;
  private baseY = 0;
  private baseCols = -1;
  private layoutVersion = -1;
  private assetsVersion = 0;
  private builtAssetsVersion = 0;
  cars: Car[] = [];
  private nextCarAt = 0;
  private ents: Ent[] = [];
  private pool: Ent[] = [];
  private date = new Date();
  private icons: { x: number; y: number; name: IconName; bounce: number; alpha: number; badge: number }[] = [];
  /** Pipoca, confete e chuva (pool fixo). */
  readonly particles = new Particles();
  /** Festa e alarme das salas (eventos do GitHub). */
  private readonly roomFx = new RoomFxRenderer();
  /** dt do frame atual (s), para as partículas emitidas durante o desenho. */
  private dt = 0;
  private iconCount = 0;
  private elevatorVis: WallVis[] = [];
  private occupiedSlots = new Set<number>();
  /** Hora forçada (?hora=21:30 na URL ou depuração) ou null para a hora local. */
  hourOverride: number | null = parseHourParam(typeof location === 'undefined' ? '' : location.search);
  /** Relógio da hora do dia (céu, iluminação, relógio de parede); o timelapse troca pelo instante reproduzido. */
  clock: () => number = () => Date.now();
  /** Ciclo dia/noite: mapa de luz e brilhos. */
  readonly lighting: Lighting;
  assets: WorldAssets | null = null;
  /** Último fator noturno aplicado (usado pelo overlay). */
  night = 0;
  private clearColor = '#7fae62';
  private grass: CanvasPattern | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly art: ArtModule,
    private readonly sim: Sim,
    private readonly camera: Camera,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.exterior = layoutExterior(sim.building.cols);
    this.lighting = new Lighting(art, sim);
  }

  setAssets(a: WorldAssets | null): void {
    this.assets = a;
    this.assetsVersion++;
  }

  // =================================================================== sincronização com a simulação

  /** Mantém caches e visuais coerentes com o prédio atual. */
  sync(): void {
    const sim = this.sim;
    const assetsChanged = this.builtAssetsVersion !== this.assetsVersion;
    if (this.baseCols !== sim.building.cols || assetsChanged) this.buildBase();
    if (this.layoutVersion !== sim.layoutVersion || assetsChanged) {
      this.layoutVersion = sim.layoutVersion;
      const want = new Set<string>();
      for (const a of [...sim.building.core, sim.building.corridor]) {
        want.add(a.id);
        const cur = this.areas.get(a.id);
        if (!cur || cur.layout !== a || assetsChanged) this.areas.set(a.id, buildAreaVis(this.art, a, undefined, this.assets));
      }
      for (const room of sim.rooms.values()) {
        if (!room.present) continue;
        want.add(room.id);
      }
      for (const id of [...this.areas.keys()]) if (!want.has(id)) this.areas.delete(id);
      this.elevatorVis = this.areas.get('core:recepcao')?.wallItems.filter((w) => w.kind === 'elevator') ?? [];
    }
    // salas: (re)constrói quando surgem, mudam de layout ou de versão (nome/tema)
    this.occupiedSlots.clear();
    for (const room of sim.rooms.values()) {
      if (!room.present) continue;
      this.occupiedSlots.add(room.slot);
      const cur = this.areas.get(room.id);
      if (!cur || cur.layout !== room.layout || cur.version !== room.version || assetsChanged) {
        this.areas.set(room.id, buildAreaVis(this.art, room.layout, room, this.assets));
      } else cur.room = room;
    }
    for (const [id, vis] of this.areas) if (vis.room && !vis.room.present) this.areas.delete(id);
    this.builtAssetsVersion = this.assetsVersion;
  }

  /** Camada base: área externa, pátios dos slots e fechamentos do corredor. */
  private buildBase(): void {
    const cols = this.sim.building.cols;
    this.baseCols = cols;
    this.exterior = layoutExterior(cols);
    const b = this.exterior.bounds;
    this.baseX = b.x * TILE;
    this.baseY = b.y * TILE;
    const c = document.createElement('canvas');
    c.width = b.w * TILE;
    c.height = b.h * TILE;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-this.baseX, -this.baseY);
    paintShell(this.art, ctx, this.exterior.floors, []);
    // faixas da rua
    const ly = this.exterior.streetY + Math.round(this.exterior.streetH / 2) - 1;
    ctx.fillStyle = 'rgba(255,236,170,0.75)';
    for (let x = this.baseX + 4; x < this.baseX + c.width; x += 24) ctx.fillRect(x, ly, 12, 2);
    this.shells = [];
    this.shellWindows = [];
    for (let col = CORE_COLS; col < cols; col++) {
      for (const side of ['north', 'south'] as const) {
        const sh = slotShell(slotAt(col, side), col === cols - 1);
        this.shells.push(sh);
        paintShell(this.art, ctx, sh.floors, sh.walls);
        for (const w of sh.windows) this.shellWindows.push(toWallVis(w, `shell:${sh.slot}`));
      }
    }
    this.desaturate(ctx);
    // fundo além da área desenhada: a própria grama (amostra espelhada 2x2, sem emendas), já no
    // tom da borda da vinheta
    const s = 4 * TILE;
    try {
      const tile = document.createElement('canvas');
      tile.width = 2 * s;
      tile.height = 2 * s;
      const tctx = tile.getContext('2d')!;
      tctx.imageSmoothingEnabled = false;
      for (const [mx, my] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        tctx.setTransform(mx ? -1 : 1, 0, 0, my ? -1 : 1, mx ? 2 * s : 0, my ? 2 * s : 0);
        tctx.drawImage(c, 0, 0, s, s, 0, 0, s, s);
      }
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      // média da amostra: suaviza as manchas grandes (que viram faixas ao repetir), mantém o capim
      const d = tctx.getImageData(0, 0, 2 * s, 2 * s).data;
      let r = 0;
      let g = 0;
      let bl = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        bl += d[i + 2];
      }
      const n = d.length / 4;
      const avg = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(bl / n)})`;
      tctx.globalAlpha = 0.6;
      tctx.fillStyle = avg;
      tctx.fillRect(0, 0, 2 * s, 2 * s);
      tctx.globalAlpha = 1;
      tctx.fillStyle = VIGNETTE_EDGE;
      tctx.fillRect(0, 0, 2 * s, 2 * s);
      this.grass = this.ctx.createPattern(tile, 'repeat');
      // cor de fundo (antes do padrão carregar): a média já com o tom da vinheta
      const k = VIGNETTE_ALPHA;
      this.clearColor = `rgb(${Math.round((r / n) * (1 - k) + 18 * k)},${Math.round((g / n) * (1 - k) + 40 * k)},${Math.round((bl / n) * (1 - k) + 26 * k)})`;
    } catch {
      this.grass = null;
      this.clearColor = '#6f9a5a';
    }
    this.finishBase(ctx, cols);
    this.base = c;
  }

  /** Grama ~15% menos saturada: o gramado não compete com o escritório. */
  private desaturate(ctx: CanvasRenderingContext2D): void {
    const b = this.exterior.bounds;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,0.16)';
      ctx.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE);
    } catch {
      // navegador sem o modo de mistura: segue sem dessaturar
    }
    ctx.restore();
  }

  /** Acabamento da camada externa: bordas levemente mais escuras (vinheta) e o capacho da entrada. */
  private finishBase(ctx: CanvasRenderingContext2D, cols: number): void {
    const b = this.exterior.bounds;
    const x0 = b.x * TILE;
    const y0 = b.y * TILE;
    const w = b.w * TILE;
    const h = b.h * TILE;
    ctx.save();
    // vinheta: escurece com a distância ao prédio e chega ao tom da grama "de fora" exatamente na
    // borda da área desenhada (máscara de 1 px por tile, ampliada com suavização)
    const bwT = cols * COL_W;
    const smooth = (a: number, z: number, v: number) => {
      const t = Math.max(0, Math.min(1, (v - a) / Math.max(1e-6, z - a)));
      return t * t * (3 - 2 * t);
    };
    try {
      const m = document.createElement('canvas');
      m.width = b.w;
      m.height = b.h;
      const mctx = m.getContext('2d')!;
      const img = mctx.createImageData(b.w, b.h);
      for (let ty = 0; ty < b.h; ty++) {
        for (let tx = 0; tx < b.w; tx++) {
          const wx = b.x + tx + 0.5;
          const wy = b.y + ty + 0.5;
          const fx = wx < 0 ? smooth(6, -b.x, -wx) : wx > bwT ? smooth(6, b.x + b.w - bwT, wx - bwT) : 0;
          const fy = wy < 0 ? smooth(5, -b.y, -wy) : wy > BUILDING_H ? smooth(12, b.y + b.h - BUILDING_H, wy - BUILDING_H) : 0;
          const i = (ty * b.w + tx) * 4;
          img.data[i] = 18;
          img.data[i + 1] = 40;
          img.data[i + 2] = 26;
          img.data[i + 3] = Math.round(Math.max(fx, fy) * VIGNETTE_ALPHA * 255);
        }
      }
      mctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m, x0, y0, w, h);
      ctx.imageSmoothingEnabled = false;
    } catch {
      // sem vinheta
    }
    // capacho diante da fachada de vidro da entrada (oeste do corredor)
    const my = (CORRIDOR_Y + 1.25) * TILE;
    ctx.fillStyle = '#3f4652';
    ctx.fillRect(-1.75 * TILE, my, 1.5 * TILE, 2.5 * TILE);
    ctx.fillStyle = '#596170';
    ctx.fillRect(-1.75 * TILE + 2, my + 2, 1.5 * TILE - 4, 2.5 * TILE - 4);
    ctx.fillStyle = '#4b525f';
    for (let y = my + 4; y < my + 2.5 * TILE - 4; y += 3) ctx.fillRect(-1.75 * TILE + 3, y, 1.5 * TILE - 6, 1);
    ctx.restore();
  }

  // =================================================================== frame

  frame(now: number, dt: number, opts: WorldOptions, sel: { agent: string | null; room: string | null; hover: string | null }): void {
    const { ctx, camera } = this;
    this.date.setTime(this.clock());
    this.dt = dt;
    this.updateCars(now, dt);
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.clearColor;
    ctx.fillRect(0, 0, W, H);
    const { scale, ox, oy } = camera.transform();
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    const vx0 = -ox / scale;
    const vy0 = -oy / scale;
    const vx1 = vx0 + W / scale;
    const vy1 = vy0 + H / scale;
    if (this.grass && this.base) {
      const bx1 = this.baseX + this.base.width;
      const by1 = this.baseY + this.base.height;
      if (vx0 < this.baseX || vy0 < this.baseY || vx1 > bx1 || vy1 > by1) {
        // padrão ancorado na origem do mundo (múltiplo do tile), alinhado à camada base
        ctx.fillStyle = this.grass;
        ctx.save();
        ctx.translate(this.baseX, this.baseY);
        ctx.fillRect(vx0 - this.baseX - 1, vy0 - this.baseY - 1, vx1 - vx0 + 2, vy1 - vy0 + 2);
        ctx.restore();
      }
    }
    const visible = (x: number, y: number, w: number, h: number) => x < vx1 && x + w > vx0 && y < vy1 && y + h > vy0;

    // ---- camada base (só a parte visível)
    if (this.base) {
      const sx = Math.max(0, Math.floor(vx0 - this.baseX) - 1);
      const sy = Math.max(0, Math.floor(vy0 - this.baseY) - 1);
      const sw = Math.min(this.base.width - sx, Math.ceil(vx1 - vx0) + 3);
      const sh = Math.min(this.base.height - sy, Math.ceil(vy1 - vy0) + 3);
      if (sw > 0 && sh > 0) ctx.drawImage(this.base, sx, sy, sw, sh, this.baseX + sx, this.baseY + sy, sw, sh);
    }
    // hora do ciclo dia/noite (preferência ou hora forçada; o relógio de parede acompanha a forçada)
    if (this.hourOverride !== null) {
      const min = Math.round(this.hourOverride * 60);
      this.date.setHours(Math.floor(min / 60) % 24, min % 60);
    }
    const hour = this.lighting.update(now, daylightModeOf(opts), this.hourOverride, this.date);
    const t = now;

    // janelas da fachada nos slots vazios
    for (const w of this.shellWindows) {
      const slot = Number(w.areaId.slice(6));
      const room = this.roomInSlot(slot);
      if (room && room.phase === 'ready') continue;
      if (!visible(w.cx - 24, w.baseY - 40, 48, 44)) continue;
      this.drawWindow(w, hour, t, 1);
    }

    // ---- áreas: piso, paredes e itens de parede
    for (const vis of this.areas.values()) {
      const p = vis.px;
      if (!visible(p.x, p.y - WALL_MARGIN, p.w, p.h + WALL_MARGIN)) continue;
      const anim = vis.room ? buildAnim(vis.room.phase, vis.room.progress(now)) : NO_ANIM;
      this.drawFloor(vis, anim);
    }
    for (const vis of this.areas.values()) {
      const p = vis.px;
      if (!visible(p.x, p.y - WALL_MARGIN, p.w, p.h + WALL_MARGIN)) continue;
      const anim = vis.room ? buildAnim(vis.room.phase, vis.room.progress(now)) : NO_ANIM;
      this.drawWalls(vis, anim, now, hour);
    }
    const view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
    // alarme de CI: tom vermelho no piso (por baixo dos móveis e personagens)
    this.roomFx.drawFloor(ctx, this.sim, now, view);

    // ---- entidades ordenadas por profundidade
    const ents = this.ents;
    ents.length = 0;
    let used = 0;
    const push = (k: K, y: number, ref: Ent['ref'], area: AreaVis | null, scale: number) => {
      let e = this.pool[used];
      if (!e) this.pool[used] = e = { k, y, ref, area, scale };
      else {
        e.k = k;
        e.y = y;
        e.ref = ref;
        e.area = area;
        e.scale = scale;
      }
      used++;
      ents.push(e);
    };
    for (const vis of this.areas.values()) {
      const p = vis.px;
      if (!visible(p.x - TILE, p.y - 3 * TILE, p.w + 2 * TILE, p.h + 4 * TILE)) continue;
      const anim = vis.room ? buildAnim(vis.room.phase, vis.room.progress(now)) : NO_ANIM;
      for (const f of vis.furniture) {
        const s = anim.mode === 'none' ? 1 : furnitureScale(anim, f.order);
        if (s <= 0.01) continue;
        if (!visible(f.ax - 3 * TILE, f.ay - 4 * TILE, 6 * TILE, 4 * TILE + 4)) continue;
        push(K.FurnBase, f.ay, f, vis, s);
        const fs = furnitureSprites(this.art, f, this.furnState(f, now));
        if (fs?.front) push(K.FurnFront, f.ay + 0.5, f, vis, s);
      }
    }
    for (const ch of this.sim.chars.values()) {
      const head = this.headOf(ch);
      head.visible = false;
      if (ch.inside || ch.alpha <= 0.01 || now < ch.hiddenUntil) continue;
      if (!visible(ch.x - 24, ch.y - 48, 48, 56)) {
        head.x = ch.x;
        head.y = ch.y - 26;
        head.feetY = ch.y;
        continue;
      }
      push(K.Char, ch.depth(), ch, null, 1);
    }
    for (const prop of this.exterior.props) {
      if (!visible(prop.x - 60, prop.y - 104, 120, 108)) continue;
      let alpha = 1;
      if (prop.whenRoom !== undefined) {
        // ex.: cerca viva diante do caminho do jardim — surge junto com a sala
        const room = this.roomInSlot(prop.whenRoom);
        if (!room) continue;
        if (room.phase === 'building' || room.phase === 'dismantling') {
          const pr = room.progress(now);
          alpha = room.phase === 'building' ? Math.min(1, pr * 3) : 1 - Math.min(1, Math.max(0, (pr - 0.75) * 4));
          if (alpha <= 0.02) continue;
        }
      }
      push(K.Prop, prop.y, prop, null, alpha);
    }
    for (const sh of this.shells) {
      const room = this.roomInSlot(sh.slot);
      let alpha = 1;
      if (room) {
        if (room.phase !== 'building' && room.phase !== 'dismantling') continue;
        const pr = room.progress(now);
        alpha = room.phase === 'building' ? 1 - Math.min(1, pr * 3) : Math.min(1, Math.max(0, (pr - 0.75) * 4));
        if (alpha <= 0.02) continue;
      }
      for (const prop of sh.props) {
        if (!visible(prop.x - 24, prop.y - 56, 48, 60)) continue;
        push(K.Prop, prop.y, prop, null, alpha);
      }
    }
    for (const car of this.cars) if (visible(car.x - 24, car.y - 24, 48, 28)) push(K.Car, car.y, car, null, 1);
    ents.sort((a, b) => a.y - b.y || a.k - b.k);

    this.iconCount = 0;
    for (const e of ents) {
      switch (e.k) {
        case K.FurnBase:
          this.drawFurniture(e.ref as FurnVis, e.area!, e.scale, false, now);
          break;
        case K.FurnFront:
          this.drawFurniture(e.ref as FurnVis, e.area!, e.scale, true, now);
          break;
        case K.Char:
          this.drawCharacter(e.ref as Character, now, sel);
          break;
        case K.Prop:
          this.drawProp(e.ref as ExteriorProp, e.scale);
          break;
        case K.Car:
          this.drawCar(e.ref as Car);
          break;
      }
    }
    this.drawPingPong(now);
    // ---- espera de shell: teias de aranha, confete/pipoca/chuva (por cima das entidades)
    this.drawCobwebs(now);
    this.drainEffects(now);
    this.roomFx.emit(this.particles, this.sim, now, dt, view);
    this.particles.update(dt);
    this.particles.draw(ctx, vx0, vy0, vx1, vy1, now);

    // ---- luz: noite, salas apagadas, brilhos
    this.night = this.lighting.night;
    this.drawLighting(now, vx0, vy0, vx1, vy1);
    // giroflex e balão "!" do alarme de CI (brilham também no escuro)
    this.roomFx.drawLights(ctx, this.sim, this.heads, now, view);

    // ---- ícones sobre as cabeças (por cima da escuridão)
    for (let i = 0; i < this.iconCount; i++) {
      const ic = this.icons[i];
      const s = this.icon(ic.name);
      if (!s) continue;
      ctx.globalAlpha = ic.alpha;
      const ix = Math.round(ic.x - s.ax);
      const iy = Math.round(ic.y - s.ay - ic.bounce);
      ctx.drawImage(s.canvas, ix, iy);
      if (ic.badge > 1) {
        // "×N": mais de um shell rodando
        const b = countBadge(ic.badge);
        ctx.drawImage(b.canvas, ix + s.canvas.width - 1, iy + s.canvas.height - b.ay + 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private headOf(ch: Character): HeadInfo {
    let h = this.heads.get(ch.id);
    if (!h) this.heads.set(ch.id, (h = { x: 0, y: 0, feetY: 0, visible: false, bx: 0, by: 0, bw: 0, bh: 0, depth: 0 }));
    return h;
  }

  /** Remove entradas de personagens que já saíram. */
  pruneHeads(): void {
    for (const id of this.heads.keys()) if (!this.sim.chars.has(id)) this.heads.delete(id);
  }

  roomInSlot(slot: number): RoomState | undefined {
    if (!this.occupiedSlots.has(slot)) return undefined;
    for (const r of this.sim.rooms.values()) if (r.slot === slot && r.present) return r;
    return undefined;
  }

  // =================================================================== áreas

  private drawFloor(vis: AreaVis, anim: BuildAnim): void {
    const { ctx } = this;
    const p = vis.px;
    if (anim.floor >= 1) {
      ctx.drawImage(vis.floor, p.x, p.y);
      return;
    }
    if (anim.floor <= 0) return;
    // varredura: tiles surgem em diagonal (e somem na ordem inversa na desmontagem)
    const w = vis.layout.rect.w;
    const h = vis.layout.rect.h;
    const k = anim.floor * 1.06;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (sweepDelay(i, j, w, h) > k) continue;
        ctx.drawImage(vis.floor, i * TILE, j * TILE, TILE, TILE, p.x + i * TILE, p.y + j * TILE, TILE, TILE);
      }
    }
  }

  private drawWalls(vis: AreaVis, anim: BuildAnim, now: number, hour: number): void {
    const { ctx } = this;
    const p = vis.px;
    if (anim.walls <= 0) return;
    const rise = Math.round((1 - anim.walls) * 10);
    if (anim.walls < 1) ctx.globalAlpha = anim.walls;
    ctx.drawImage(vis.walls, p.x, p.y - WALL_MARGIN + rise);
    // itens de parede dinâmicos
    for (const w of vis.wallItems) this.drawWallItem(vis, w, now, hour, rise);
    ctx.globalAlpha = 1;
    if (vis.sign && anim.sign > 0) {
      const slide = Math.round((1 - anim.sign) * -18);
      ctx.globalAlpha = anim.sign;
      this.drawSign(vis, vis.sign, slide);
      ctx.globalAlpha = 1;
    }
  }

  private drawWallItem(vis: AreaVis, w: WallVis, now: number, hour: number, rise: number): void {
    const { ctx } = this;
    switch (w.kind) {
      case 'window':
        this.drawWindow(w, hour, now, 1, rise);
        return;
      case 'elevator': {
        const idx = this.elevatorVis.indexOf(w);
        const state = this.sim.elevators[idx]?.state ?? 0;
        const s = wallSprites(this.art, 'elevator', w.variant, state, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        return;
      }
      case 'light_switch': {
        const on = vis.room ? vis.room.lightOn : true;
        const s = wallSprites(this.art, 'light_switch', on ? 'on' : 'off', 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        return;
      }
      case 'clock': {
        const s = wallSprites(this.art, 'clock', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.face;
        if (r) this.safe(() => this.art.drawClock(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, this.date));
        return;
      }
      case 'whiteboard': {
        const s = wallSprites(this.art, 'whiteboard', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.board;
        if (r) this.safe(() => this.art.drawBoard(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, vis.room?.board ?? [], now));
        return;
      }
      case 'tv': {
        const s = wallSprites(this.art, 'tv', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.tv;
        // roda na TV do lounge: o programa escolhido (futebol, novela, desenho) ou o videogame
        const live = this.sim.social.tvScreen();
        const mode = live ? live.mode : TV_MODES[Math.floor(now / 9000) % TV_MODES.length];
        const seed = live ? live.seed : w.seed;
        if (r) this.safe(() => this.art.drawScreen(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, mode, now, seed));
        return;
      }
      case 'mirror': {
        const s = wallSprites(this.art, 'mirror', w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
        const r = s.base.rects?.glass;
        if (r) this.drawReflection(w, o.x + r.x, o.y + rise + r.y, r.w, r.h);
        return;
      }
      default: {
        const s = wallSprites(this.art, w.kind, w.variant, 0, w.seed);
        if (!s) return;
        const o = wallItemOrigin(w, s.base);
        ctx.drawImage(s.base.canvas, o.x, o.y + rise);
      }
    }
  }

  private drawWindow(w: WallVis, hour: number, now: number, alpha: number, rise = 0): void {
    const { ctx } = this;
    const s = wallSprites(this.art, 'window', w.variant, 0, w.seed);
    if (!s) return;
    const o = wallItemOrigin(w, s.base);
    let r = s.base.rects?.glass;
    if (!r) {
      const b = opaqueBounds(s.base.canvas);
      r = { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 };
    }
    ctx.globalAlpha *= alpha;
    this.safe(() => this.art.drawWindowView(ctx, { x: o.x + r.x, y: o.y + rise + r.y, w: r.w, h: r.h }, hour, now, w.seed));
    ctx.drawImage(s.base.canvas, o.x, o.y + rise);
  }

  /** Placa com o nome (o texto nítido é escrito pelo overlay em espaço de tela). */
  private drawSign(vis: AreaVis, w: WallVis, slide: number): void {
    const { ctx } = this;
    if (!vis.room && this.assets?.signage && vis.id === 'core:recepcao') {
      const a = this.assets.signage;
      const maxW = 5 * TILE;
      const maxH = 24;
      // escala inteira (pixels nítidos) sempre que couber
      const fit = Math.min(maxW / a.w, maxH / a.h);
      const k = fit >= 1 ? Math.floor(fit) : fit;
      const dw = Math.round(a.w * k);
      const dh = Math.round(a.h * k);
      ctx.save();
      ctx.imageSmoothingEnabled = k < 1;
      ctx.drawImage(a.img, Math.round(w.cx - dw / 2), Math.round(w.baseY - 8 - dh) + slide, dw, dh);
      ctx.restore();
      return;
    }
    const s = wallSprites(this.art, 'sign', w.variant, 0, w.seed);
    if (!s) return;
    const o = wallItemOrigin(w, s.base);
    ctx.drawImage(s.base.canvas, o.x, o.y + slide);
  }

  /** Retângulo (px de mundo) da área de texto da placa de uma área, se houver. */
  signRect(vis: AreaVis): { x: number; y: number; w: number; h: number } | null {
    if (!vis.sign) return null;
    if (!vis.room && this.assets?.signage && vis.id === 'core:recepcao') return null;
    const s = wallSprites(this.art, 'sign', vis.sign.variant, 0, vis.sign.seed);
    if (!s) return null;
    const o = wallItemOrigin(vis.sign, s.base);
    const r = s.base.rects?.sign ?? (() => {
      const b = opaqueBounds(s.base.canvas);
      return { x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6 };
    })();
    return { x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h };
  }

  /** Luminância média da área de texto da placa (para escolher a cor do texto). */
  signIsDark(vis: AreaVis): boolean {
    const s = vis.sign ? wallSprites(this.art, 'sign', vis.sign.variant, 0, vis.sign.seed) : null;
    if (!s) return false;
    const c = s.base.canvas as HTMLCanvasElement & { __dark?: boolean };
    if (c.__dark !== undefined) return c.__dark;
    let dark = false;
    try {
      const r = s.base.rects?.sign ?? { x: 2, y: 2, w: c.width - 4, h: c.height - 4 };
      const d = c.getContext('2d')!.getImageData(r.x, r.y, Math.max(1, r.w), Math.max(1, r.h)).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n++;
      }
      dark = n > 0 && sum / n < 120;
    } catch {
      dark = false;
    }
    c.__dark = dark;
    return dark;
  }

  // =================================================================== entidades

  private furnState(f: FurnVis, now: number): number {
    if (f.kind === 'coffee_machine') return (this.sim.machineUntil.get(f.id) ?? 0) > now ? 1 : 0;
    if (f.kind === 'toilet_stall') return this.sim.stallBusy.has(f.id) ? 1 : 0;
    return 0;
  }

  private drawFurniture(f: FurnVis, area: AreaVis, scale: number, front: boolean, now: number): void {
    const { ctx } = this;
    const state = this.furnState(f, now);
    const fs = furnitureSprites(this.art, f, state);
    if (!fs) return;
    const s = front ? fs.front : fs.base;
    if (!s) return;
    const dx = Math.round(f.ax - s.ax);
    const dy = Math.round(f.ay - s.ay);
    const scaled = scale !== 1;
    if (scaled) {
      ctx.save();
      ctx.translate(f.ax, f.ay);
      ctx.scale(scale, scale);
      ctx.translate(-f.ax, -f.ay);
    }
    ctx.drawImage(s.canvas, dx, dy);
    if (!front) {
      if (f.kind === 'desk' && s.rects?.screen) {
        const r = s.rects.screen;
        const mode = this.deskScreen(f, area);
        this.safe(() => this.art.drawScreen(ctx, { x: dx + r.x, y: dy + r.y, w: r.w, h: r.h }, mode, now, f.seed));
      } else if (f.kind === 'coffee_machine' && state === 1) {
        this.drawSteam(f.ax, dy + 2, now, f.seed);
      } else if (f.kind === 'arcade' && s.rects?.screen) {
        // duelo no fliperama: as duas máquinas mostram a partida
        const seed = this.sim.social.arcadeSeed();
        const r = s.rects.screen;
        if (seed !== null) this.safe(() => this.art.drawScreen(ctx, { x: dx + r.x, y: dy + r.y, w: r.w, h: r.h }, 'game', now, seed));
      }
    }
    if (scaled) ctx.restore();
  }

  /** Tela do monitor: segue a atividade de quem senta ali. */
  deskScreen(f: FurnVis, area: AreaVis): ScreenMode {
    const room = area.room;
    if (room && room.light(this.sim.now) < 0.3) return 'off';
    const owner = f.seatSpot ? this.sim.spots.ownerOf(f.seatSpot) : undefined;
    const ch = owner ? this.sim.chars.get(owner) : undefined;
    if (!ch || ch.leaving) return 'off';
    const seated = ch.atSpot === f.seatSpot;
    if (ch.mode === 'wait') return 'alert';
    if (!seated) return 'idle';
    if (ch.mode === 'work') return screenModeFor(ch.info.activity?.kind);
    // esperando um shell: terminal com a barra de progresso andando (o "filme" da pipoca)
    if (ch.mode === 'shell') return 'progress';
    return 'idle';
  }

  private drawSteam(x: number, y: number, now: number, seed: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const ph = ((now / 900 + i / 3 + (seed % 7) / 7) % 1 + 1) % 1;
      ctx.globalAlpha = 0.75 * (1 - ph);
      const sx = Math.round(x - 1 + Math.sin(ph * 6 + i * 2) * 1.5 + (i - 1));
      const sy = Math.round(y - ph * 9);
      ctx.fillRect(sx, sy, 1, 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawCharacter(ch: Character, now: number, sel: { agent: string | null; hover: string | null }): void {
    const { ctx } = this;
    const head = this.headOf(ch);
    // faixa lateral de quem anda (dois no mesmo caminho não viram um boneco de duas cabeças)
    const x = Math.round(ch.x + ch.offX);
    const y = Math.round(ch.y + ch.offY);
    ctx.globalAlpha = ch.alpha;
    // anéis no chão (seleção, hover, alerta)
    if (ch.mode === 'wait') this.drawAlertRing(x, y, now);
    if (sel.agent === ch.id) this.drawRing(x, y, '#7fe3ff', now, true);
    else if (sel.hover === ch.id) this.drawRing(x, y, '#ffffff', now, false);
    if (!ch.seated) {
      const sh = shadowSprite();
      ctx.drawImage(sh.canvas, x - sh.ax, y - sh.ay);
    }
    let sprite: Sprite | null = null;
    const req: CharacterFrameRequest = this.req;
    req.appearance = ch.appearance;
    req.dir = ch.dir;
    req.pose = ch.pose;
    req.held = ch.held;
    req.seated = ch.seated;
    try {
      sprite = this.charSprite(req, ch.animT);
    } catch {
      sprite = null;
    }
    if (!sprite && (req.pose === 'wait' || req.held === 'popcorn')) {
      // arte ainda sem a pose de espera/pipoca: sentado parado
      req.pose = req.pose === 'wait' ? 'sit' : req.pose;
      req.held = 'none';
      try {
        sprite = this.charSprite(req, ch.animT);
      } catch {
        sprite = null;
      }
    }
    if (sprite) {
      const sx = x - sprite.ax;
      const sy = y - sprite.ay;
      ctx.drawImage(sprite.canvas, sx, sy);
      const b = opaqueBounds(sprite.canvas);
      head.bx = sx + b.x;
      head.by = sy + b.y;
      head.bw = b.w;
      head.bh = b.h;
      head.y = sy + b.y;
    } else {
      head.bx = x - 7;
      head.by = y - 26;
      head.bw = 14;
      head.bh = 26;
      head.y = y - 26;
    }
    ctx.globalAlpha = 1;
    head.x = x;
    head.feetY = y;
    head.visible = true;
    head.depth = ch.depth();
    // ícone sobre a cabeça (desenhado depois da luz)
    let name: IconName | null = ch.mode === 'wait' ? 'alert' : ch.icon;
    const shell = ch.mode === 'shell' && ch.shellSince > 0 && !ch.leaving;
    let badge = 0;
    if (shell && (!name || name === 'zzz')) {
      // ampulheta virando (com "×N" quando há mais de um shell)
      name = hourglassIcon(now);
      badge = ch.shellCount;
    }
    if (name) {
      const bounce =
        name === 'alert'
          ? Math.round(Math.abs(Math.sin(now / 180)) * 4)
          : name === 'zzz'
            ? Math.round(Math.sin(now / 500) * 1.5)
            : name === 'hourglass' || name === 'hourglass_flip'
              ? now % HOURGLASS_FLIP_MS < 110 ? 1 : 0
              : Math.round(Math.max(0, 1 - (now - ch.iconAt) / 250) * 4);
      const lift = name === 'storm' ? STORM_LIFT : 0;
      this.pushIcon(x, head.y - 2 - lift, name, bounce, ch.alpha, badge);
      // chuva: pingos caem da nuvem até a cabeça
      if (name === 'storm' && Math.random() < this.dt * 24) this.particles.rain(x - 3 + Math.floor(Math.random() * 7), head.y - 3 - lift, lift + 1);
    }
    if (shell && ch.shellStage === 'nap' && ch.pose === 'sleep') {
      // cochilando: "zzz" flutuando acima e à direita da ampulheta (o selo "×N" fica embaixo)
      this.pushIcon(x + 10, head.y - 13, 'zzz', Math.round(Math.sin(now / 500) * 1.5), ch.alpha, 0);
    }
    // pipoca pulando do balde de vez em quando
    if (shell && ch.pose === 'wait' && ch.held === 'popcorn' && sprite && now >= ch.popcornAt) {
      ch.popcornAt = now + 450 + Math.random() * 1200;
      const px = x - 1 + (POPCORN_DX[ch.dir] ?? 0);
      const py = y - 1 - (POPCORN_DY[ch.dir] ?? 10);
      this.particles.popcorn(px, py);
      if (Math.random() < 0.3) this.particles.popcorn(px, py);
    }
  }

  private pushIcon(x: number, y: number, name: IconName, bounce: number, alpha: number, badge: number): void {
    if (this.iconCount >= 256) return;
    let ic = this.icons[this.iconCount];
    if (!ic) this.icons[this.iconCount] = ic = { x: 0, y: 0, name, bounce: 0, alpha: 1, badge: 0 };
    ic.x = x;
    ic.y = y;
    ic.name = name;
    ic.bounce = bounce;
    ic.alpha = alpha;
    ic.badge = badge;
    this.iconCount++;
  }

  /** Sprite do personagem no frame da animação (tolera arte sem a pose: contagem/duração inválidas). */
  private charSprite(req: CharacterFrameRequest, animT: number): Sprite {
    const { art } = this;
    const count = Math.max(1, art.poseFrameCount(req.pose) || 1);
    const dur = Math.max(30, art.poseFrameDuration(req.pose) || 500);
    req.frame = Math.floor(animT / dur) % count;
    return art.characterSprite(req);
  }

  /**
   * Teia de aranha no canto do personagem que espera um shell há mais de 10 min (escala inteira:
   * 1x, depois 2x com 20 min). Cochilando, fica coberto: uma teia de cada lado. A teia vai para o
   * lado sem vizinho; com vizinhos dos dois lados, cobre mais o próprio personagem (não invade a
   * mesa ao lado).
   */
  private drawCobwebs(now: number): void {
    const { ctx } = this;
    for (const ch of this.sim.chars.values()) {
      if (ch.mode !== 'shell' || !ch.shellSince || ch.leaving || !ch.seated || ch.atSpot !== ch.homeSpot) continue;
      const scale = cobwebScale(now - ch.shellSince);
      if (!scale) continue;
      const head = this.heads.get(ch.id);
      if (!head || !head.visible) continue;
      const web = this.icon('cobweb');
      if (!web) return;
      let left = (ch.info.seed & 1) === 0;
      const busyL = this.neighborAt(head, -1);
      const busyR = this.neighborAt(head, 1);
      if (left ? busyL && !busyR : busyR && !busyL) left = !left;
      ctx.globalAlpha = ch.alpha;
      this.drawWeb(web, head, left, scale, left ? busyL : busyR);
      if (ch.shellStage === 'nap') this.drawWeb(web, head, !left, 1, left ? busyR : busyL);
    }
    ctx.globalAlpha = 1;
  }

  /** Alguém visível logo ao lado (mesma fileira, até ~2 mesas) no lado `side` (-1 esquerda, 1 direita)? */
  private neighborAt(head: HeadInfo, side: -1 | 1): boolean {
    for (const h of this.heads.values()) {
      if (h === head || !h.visible || Math.abs(h.feetY - head.feetY) > 10) continue;
      const dx = (h.x - head.x) * side;
      if (dx > 0 && dx < 2.2 * TILE) return true;
    }
    return false;
  }

  /**
   * Uma teia presa no ombro (o canto da teia, em cima, fica para fora do corpo; espelhada do lado
   * direito). Com vizinho do lado, no máximo WEB_MAX_OUT px para fora: o resto cobre o personagem.
   */
  private drawWeb(web: Sprite, head: HeadInfo, left: boolean, scale: number, crowded: boolean): void {
    const { ctx } = this;
    const w = web.canvas.width * scale;
    const h = web.canvas.height * scale;
    const out = crowded ? Math.min(w - 3 * scale, WEB_MAX_OUT) : w - 3 * scale;
    const y = Math.round(head.by + 2);
    if (left) {
      ctx.drawImage(web.canvas, Math.round(head.bx - out), y, w, h);
      return;
    }
    const x = Math.round(head.bx + head.bw + out - w);
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(web.canvas, 0, 0, w, h);
    ctx.restore();
  }

  /**
   * Efeitos pedidos pela simulação: confete (shell concluído) sobre quem comemora, moedinhas voando de
   * quem perdeu a aposta para quem ganhou e o brilho de quem se arrumou no espelho.
   */
  private drainEffects(now: number): void {
    const fx = this.sim.effects;
    for (let i = 0; i < fx.length; i++) {
      const e = fx[i];
      const head = this.heads.get(e.charId);
      if (!head || !head.visible || now - e.at > 1500) continue;
      if (e.kind === 'confetti') this.particles.confetti(head.x, head.y - 4);
      else if (e.kind === 'sparkle') this.particles.sparkle(head.x, head.y + 4);
      else if (e.kind === 'coins') {
        const to = this.heads.get(e.toId);
        if (to && to.visible) this.particles.coins(head.x, head.y + 2, to.x, to.y + 2);
      }
    }
    fx.length = 0;
  }

  private reflectReq: CharacterFrameRequest = {
    appearance: undefined as unknown as CharacterFrameRequest['appearance'],
    dir: 'down',
    pose: 'stand',
    frame: 0,
    held: 'none',
    seated: false,
  };

  /**
   * Reflexo no espelho do banheiro: quem está em pé diante da pia, virado para o espelho, aparece de
   * frente no vidro (rosto centrado, meio transparente, com o véu azulado do vidro por cima).
   */
  private drawReflection(w: WallVis, gx: number, gy: number, gw: number, gh: number): void {
    const { ctx } = this;
    for (const ch of this.sim.chars.values()) {
      if (ch.inside || ch.alpha < 0.5 || ch.dir !== 'up' || ch.seated) continue;
      if (Math.abs(ch.x - w.cx) > 5) continue;
      const dy = ch.y - w.baseY;
      if (dy < 14 || dy > 30) continue;
      const req = this.reflectReq;
      req.appearance = ch.appearance;
      req.pose = ch.pose === 'groom' ? 'groom' : 'stand';
      req.held = ch.pose === 'groom' ? ch.held : 'none';
      req.seated = false;
      let s: Sprite;
      try {
        s = this.charSprite(req, ch.animT);
      } catch {
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.clip();
      ctx.globalAlpha = 0.8 * ch.alpha;
      ctx.drawImage(s.canvas, Math.round(gx + gw / 2 - s.ax), Math.round(gy - 6));
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#cfe6f2';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();
      return;
    }
  }

  private req: CharacterFrameRequest = {
    appearance: undefined as unknown as CharacterFrameRequest['appearance'],
    dir: 'down',
    pose: 'stand',
    frame: 0,
    held: 'none',
    seated: false,
  };

  private drawRing(x: number, y: number, color: string, now: number, pulse: boolean): void {
    const { ctx } = this;
    const k = pulse ? 1 + Math.sin(now / 220) * 0.08 : 1;
    ctx.save();
    ctx.globalAlpha *= pulse ? 0.95 : 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, 8 * k, 3.5 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawAlertRing(x: number, y: number, now: number): void {
    const { ctx } = this;
    const ph = (now % 1100) / 1100;
    ctx.save();
    ctx.strokeStyle = '#ffb11f';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha *= 0.9 * (1 - ph);
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + ph * 12, 2.5 + ph * 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawProp(prop: ExteriorProp, alpha: number): void {
    if (prop.kind === 'paving') {
      const c = this.pavingCanvas(prop);
      if (alpha < 1) this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(c, prop.x, prop.y);
      this.ctx.globalAlpha = 1;
      return;
    }
    const s = propSprite(prop);
    if (alpha < 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(s.canvas, Math.round(prop.x - s.ax), Math.round(prop.y - s.ay));
    this.ctx.globalAlpha = 1;
  }

  private pavings = new Map<string, HTMLCanvasElement>();

  /** Trecho de calçada (2x2 tiles) com o mesmo desenho da calçada vizinha (coordenadas de mundo). */
  private pavingCanvas(prop: ExteriorProp): HTMLCanvasElement {
    const key = `${prop.x},${prop.y}`;
    let c = this.pavings.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 2 * TILE;
    c.height = 2 * TILE;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-prop.x, -prop.y);
    this.safe(() => this.art.drawFloor(ctx, 'sidewalk', prop.x, prop.y, 2 * TILE, 2 * TILE, { seed: prop.seed }));
    this.pavings.set(key, c);
    return c;
  }

  private drawCar(car: Car): void {
    const s = carSprite(car.variant, car.dir < 0);
    this.ctx.drawImage(s.canvas, Math.round(car.x - s.ax), Math.round(car.y - s.ay));
  }

  private updateCars(now: number, dt: number): void {
    const b = this.exterior.bounds;
    const x0 = b.x * TILE - 40;
    const x1 = (b.x + b.w) * TILE + 40;
    if (now >= this.nextCarAt) {
      this.nextCarAt = now + 4000 + Math.random() * 9000;
      const lane = this.exterior.lanes[Math.floor(Math.random() * this.exterior.lanes.length)];
      if (lane) this.cars.push({ x: lane.dir > 0 ? x0 : x1, y: lane.y, dir: lane.dir, speed: 38 + Math.random() * 30, variant: Math.floor(Math.random() * 6) });
    }
    for (const c of this.cars) c.x += c.dir * c.speed * Math.min(dt, 0.1);
    if (this.cars.length) this.cars = this.cars.filter((c) => c.x >= x0 - 10 && c.x <= x1 + 10);
  }

  private drawPingPong(now: number): void {
    const { ctx } = this;
    for (const g of this.sim.social.gatherings) {
      if (g.kind !== 'pingpong' || g.phase !== 'run') continue;
      let a: Character | undefined;
      let b: Character | undefined;
      for (const m of g.members) {
        if (m.role !== 'player' || m.left) continue;
        if (!a) a = this.sim.chars.get(m.id);
        else b = this.sim.chars.get(m.id);
      }
      if (!a || !b) continue;
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const period = 1100;
      const ph = ((now - g.startAt) % (period * 2)) / period;
      const u = ph < 1 ? ph : 2 - ph;
      const x = left.x + 9 + (right.x - left.x - 18) * u;
      const baseY = (left.y + right.y) / 2 - 9;
      const arc = Math.sin(Math.PI * ((u * 2) % 1)) * 6;
      ctx.fillStyle = 'rgba(30,40,60,0.35)';
      ctx.fillRect(Math.round(x) - 1, Math.round(baseY) + 1, 2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x) - 1, Math.round(baseY - arc) - 1, 2, 2);
    }
  }

  private icon(name: IconName): Sprite | null {
    try {
      const s = this.art.iconSprite(name);
      if (s && s.canvas.width > 0) return s;
    } catch {
      // arte ainda sem este ícone
    }
    return fallbackIcon(name);
  }

  // =================================================================== luz

  /**
   * Luz: o mapa do ciclo dia/noite (exterior, interiores e halos; nada de dia), a sombra das salas
   * com a luz apagada (e a transição de acender/apagar) e os brilhos por cima.
   */
  private drawLighting(now: number, vx0: number, vy0: number, vx1: number, vy1: number): void {
    const { ctx } = this;
    const view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
    this.lighting.drawAmbient(ctx, this, view, now, this.dt);
    const n = this.night;
    // salas com a luz apagada (e a transição de acender/apagar)
    for (const vis of this.areas.values()) {
      const room = vis.room;
      if (!room || !vis.layout.shade) continue;
      const light = room.light(now);
      const strength = (room.phase === 'building' ? 0.5 : 0.74) + 0.1 * n;
      // durante a montagem/desmontagem, a escuridão acompanha o piso visível (o pátio não escurece)
      const cover = room.phase === 'building' || room.phase === 'dismantling' ? buildAnim(room.phase, room.progress(now)).floor : 1;
      const dark = (1 - light) * strength * cover;
      if (dark <= 0.01) continue;
      const s = vis.layout.shade;
      ctx.fillStyle = `rgba(8,12,36,${dark})`;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    this.lighting.drawGlows(ctx, this, view, now);
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      // arte incompleta (stub) não pode derrubar o mundo
    }
  }


}
