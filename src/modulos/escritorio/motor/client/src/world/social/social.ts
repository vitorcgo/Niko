// Vida social do escritório: quando dois ou mais agentes estão à toa (ociosos, ou esperando um
// shell há um tempo), eles se juntam em rodas — TV, videogame, fliperama, ping-pong, papo na copa,
// conversa, jokenpô valendo moedinhas e o espelho do banheiro. Este "diretor" escolhe a roda e os
// parceiros pela personalidade, leva cada um ao seu lugar (passos da fila) e conduz o roteiro
// (falas, comemorações, placar, apostas). A simulação chama update() a cada quadro.
import type { AgentInfo } from '../../../../shared/types';
import type { Dir, HeldItem, Pose } from '../../art/api';
import type { AgentSocial, SocialEvent } from '../api';
import { mulberry32 } from '../../../../shared/hash';
import { TILE } from '../constants';
import { CAFE_ID, LOUNGE_ID, RECEPTION_ID, RESTROOM_ID } from '../layout/core';
import type { SpotDef } from '../layout/types';
import { FREE } from '../path/grid';
import { isLongIdle } from '../sim/behavior';
import { facing, type Character } from '../sim/character';
import type { Sim } from '../sim/sim';
import type { Step } from '../sim/steps';
import {
  active,
  betFor,
  GESTURE_ICON,
  KINDS,
  ownerTag,
  partnerScore,
  pickGesture,
  pickKind,
  pickProgram,
  players,
  PROGRAM_SEED,
  rpsResult,
  TARGET,
  winChance,
  type Gathering,
  type GatherKind,
  type Member,
  type Role,
} from './gathering';
import * as L from './lines';
import { bondBetween, hasTrait, personaFor, TRAITS, type Persona, type TraitId } from './persona';
import { DELIVERY_REWARD, TURN_REWARD, Wallets, type StorageLike } from './wallet';

/** Texto flutuante sobre a cabeça ("+🪙10"), desenhado pelo overlay. */
export interface Floater {
  charId: string;
  text: string;
  color: string;
  at: number;
  until: number;
}

export type { SocialEvent } from '../api';

/** Quem espera um shell só sai da mesa depois disto (antes, pipoca na mesa). */
export const SHELL_SOCIAL_MIN_MS = 40_000;
/** Quem não chega ao lugar da roda em tanto tempo desiste (a roda acontece sem ele ou não acontece). */
const GATHER_TIMEOUT_MS = 35_000;
const SAY_MS = 2_600;
const FLOATER_MS = 1_900;
const MAX_FLOATERS = 24;
const MAX_EVENTS = 40;
const COIN_COLOR = '#ffd34d';
const LOSS_COLOR = '#ff8a8a';

const KIND_LIST = Object.keys(KINDS) as GatherKind[];
const PLACES: Readonly<Record<string, string>> = { [LOUNGE_ID]: 'Lounge', [CAFE_ID]: 'Copa', [RECEPTION_ID]: 'Recepção', [RESTROOM_ID]: 'Banheiros' };
/** O que se perde/ganha em cada jogo (texto do extrato: "Perdeu no jokenpô para Rafaela"). */
const MATCH_WHAT: Partial<Record<GatherKind, string>> = {
  rps: 'no jokenpô',
  pingpong: 'no pingue-pongue',
  videogame: 'no videogame',
  arcade: 'no fliperama',
};

function between(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}

/** Plano de lugares de uma roda: um spot por participante inicial + extras para quem chegar depois. */
interface SeatPlan {
  seats: SpotDef[];
  /** Todos os spots que a roda reserva (inclui `seats`). */
  pool: SpotDef[];
}

export class Social {
  readonly gatherings = new Set<Gathering>();
  readonly wallets: Wallets;
  readonly floaters: Floater[] = [];
  readonly events: SocialEvent[] = [];
  private seq = 1;
  private eventSeq = 0;
  private nextSaveAt = 0;

  constructor(
    private readonly sim: Sim,
    storage: StorageLike | null,
  ) {
    this.wallets = new Wallets(storage);
  }

  // =================================================================== disponibilidade

  /**
   * Pode entrar numa roda agora: ocioso (ou esperando um shell há SHELL_SOCIAL_MIN_MS), sentado na
   * própria mesa, sem nada planejado. Quem cochila de tão ocioso pode ser acordado por um convite.
   */
  canJoin(c: Character, now: number): boolean {
    if (c.gone || c.leaving || c.arriving || c.inside || c.gathering) return false;
    if (c.mode !== 'idle' && c.mode !== 'shell') return false;
    if (c.step || c.queue.length) return false;
    if (!c.homeSpot || c.atSpot !== c.homeSpot) return false;
    if (now < c.reactUntil) return false;
    if (c.mode === 'shell' && (!c.shellSince || now - c.shellSince < SHELL_SOCIAL_MIN_MS)) return false;
    return true;
  }

  private candidates(ch: Character, now: number): Character[] {
    const out: Character[] = [];
    for (const c of this.sim.chars.values()) if (c !== ch && this.canJoin(c, now)) out.push(c);
    return out;
  }

  /** Há alguém livre para uma roda com `ch`? */
  hasCompany(ch: Character, now: number): boolean {
    for (const c of this.sim.chars.values()) if (c !== ch && this.canJoin(c, now)) return true;
    return [...this.gatherings].some((g) => this.openSpotFor(g, ch) !== undefined);
  }

  // =================================================================== começar / entrar

  /**
   * `ch` quer companhia: entra numa roda em andamento (TV, torcida, papo) ou começa uma nova com
   * colegas livres. `groupOnly` (esperando shell): nada de atividade sozinho.
   */
  tryInitiate(ch: Character, now: number, groupOnly: boolean): boolean {
    if (!this.canJoin(ch, now)) return false;
    const p = personaFor(ch.info.seed);
    const open = this.joinable(ch, p);
    if (open && ch.rng() < 0.4) return this.join(open, ch, now);
    const cands = this.candidates(ch, now);
    const avail: Partial<Record<GatherKind, boolean>> = {};
    for (const k of KIND_LIST) {
      const need = k === 'mirror' ? (groupOnly ? 1 : 0) : KINDS[k].min - 1;
      if (cands.length < need) continue;
      if (k === 'mirror' && !groupOnly) {
        avail[k] = !!this.plan(k, 1, ch);
        continue;
      }
      if (KINDS[k].solo && need === 0) continue;
      avail[k] = !!this.plan(k, need + 1, ch);
    }
    const kind = pickKind(ch.rng, p, avail);
    if (kind && this.start(kind, ch, cands, now, groupOnly)) return true;
    return open ? this.join(open, ch, now) : false;
  }

  /** Atividade sozinho que usa o roteiro das rodas (o espelho). */
  startSolo(kind: 'mirror', ch: Character, now: number): boolean {
    if (!this.canJoin(ch, now)) return false;
    return this.start(kind, ch, [], now, false, 0);
  }

  /** Força uma roda (depuração). Usa `ids` (se vierem) como participantes. */
  force(kind: GatherKind, now: number, ids?: string[]): string[] | null {
    const pool = ids?.length ? ids.map((id) => this.sim.chars.get(id)).filter((c): c is Character => !!c) : [...this.sim.chars.values()];
    for (const c of pool) {
      if (c.gathering) this.sim.clearPlan(c);
      // depuração: levanta quem estiver passeando e põe na mesa na hora
      if ((c.mode === 'idle' || c.mode === 'shell') && !c.leaving && (c.step || c.queue.length)) this.sim.clearPlan(c);
    }
    const free = pool.filter((c) => !c.leaving && !c.gone && (c.mode === 'idle' || c.mode === 'shell') && c.homeSpot && c.atSpot === c.homeSpot && !c.step && !c.queue.length);
    if (!free.length) return null;
    const [host, ...rest] = free;
    const extra = kind === 'mirror' ? Math.min(1, rest.length) : Math.min(rest.length, KINDS[kind].max - 1);
    const ok = this.start(kind, host, rest, now, false, Math.max(KINDS[kind].min - 1, Math.min(extra, kind === 'tv' || kind === 'kitchen' ? 3 : 1)), true);
    if (!ok) return null;
    const g = host.gathering;
    return g ? g.members.map((m) => this.sim.chars.get(m.id)?.info.name ?? m.id) : null;
  }

  private start(kind: GatherKind, host: Character, cands: Character[], now: number, groupOnly: boolean, wantOverride?: number, forced = false): boolean {
    const info = KINDS[kind];
    const rng = host.rng;
    const hp = personaFor(host.info.seed);
    let want: number;
    if (wantOverride !== undefined) want = wantOverride;
    else if (kind === 'tv') want = 1 + Math.floor(rng() * 3);
    else if (kind === 'kitchen') want = 1 + Math.floor(rng() * 2.4);
    else if (kind === 'mirror') want = groupOnly ? 1 : cands.some((c) => hasTrait(personaFor(c.info.seed), 'vaidade')) && rng() < 0.5 ? 1 : 0;
    else want = info.min - 1;
    // torcida já na largada, às vezes
    if (wantOverride === undefined && (kind === 'pingpong' || kind === 'videogame' || kind === 'rps') && rng() < 0.3) want++;
    want = Math.max(0, Math.min(want, cands.length, info.max - 1));
    const ranked = cands
      .map((c) => {
        const cp = personaFor(c.info.seed);
        let s = partnerScore(kind, cp, bondBetween(host.info.seed, c.info.seed), rng);
        if (isLongIdle(c.info.status, c.info.statusSince, now)) s -= 1.5;
        if (kind === 'mirror' && !hasTrait(cp, 'vaidade')) s -= 2;
        return { c, s };
      })
      .sort((a, b) => b.s - a.s);
    let chosen = ranked.slice(0, want).map((x) => x.c);
    // dorminhocos (ociosos há muito tempo) às vezes nem acordam com o convite
    if (!forced) chosen = chosen.filter((c, i) => i < info.min - 1 || !isLongIdle(c.info.status, c.info.statusSince, now) || rng() < 0.35);
    if (chosen.length + 1 < (kind === 'mirror' ? (groupOnly ? 2 : 1) : info.min)) return false;
    const plan = this.plan(kind, chosen.length + 1, host);
    if (!plan) return false;

    const id = this.seq++;
    const g: Gathering = {
      id,
      kind,
      host: host.id,
      members: [],
      phase: 'gather',
      createdAt: now,
      startAt: 0,
      until: 0,
      nextAt: 0,
      step: 0,
      seed: (host.info.seed ^ Math.imul(id, 0x9e3779b1)) >>> 0,
      rng: mulberry32((host.info.seed ^ Math.imul(id, 0x85ebca6b)) >>> 0),
      program: kind === 'tv' ? pickProgram(rng, hp) : null,
      bet: 0,
      score: [0, 0],
      gestures: null,
      ties: 0,
      rematches: 0,
      winner: null,
      loser: null,
      pool: [],
      lastLine: null,
      lastSpeaker: null,
      pending: [],
    };
    const tag = ownerTag(g);
    for (const s of plan.pool) if (this.sim.spots.reserve(s.id, tag)) g.pool.push(s.id);
    const everyone = [host, ...chosen];
    const nPlayers = info.match ? 2 : everyone.length;
    everyone.forEach((c, i) => {
      const role: Role = info.match ? (i < nPlayers ? 'player' : 'watcher') : kind === 'kitchen' || kind === 'talk' ? 'talker' : 'player';
      const spot = plan.seats[i] ?? null;
      const m = this.member(c, role, spot);
      if (!spot && role === 'watcher') m.tile = this.standNear(g, c) ?? undefined;
      g.members.push(m);
    });
    // aposta entre os dois jogadores
    if (info.match) {
      const [a, b] = everyone;
      g.bet = betFor(kind, hp, personaFor(b.info.seed), this.wallets.coins(a.id), this.wallets.coins(b.id), bondBetween(a.info.seed, b.info.seed), g.rng);
    }
    this.gatherings.add(g);
    for (const m of g.members) this.dispatch(g, m, this.sim.chars.get(m.id)!, now);
    this.invite(g, host, chosen, now);
    return true;
  }

  private member(c: Character, role: Role, spot: SpotDef | null): Member {
    return { id: c.id, role, spot: spot?.id ?? null, arrived: false, left: false, pose: 'stand', held: 'none', actPose: null, actHeld: 'none', actUntil: 0, carry: 'none' };
  }

  /** Convite (quem chamou) e o "bora!" de cada convidado, um pouco depois. */
  private invite(g: Gathering, host: Character, guests: Character[], now: number): void {
    const rng = g.rng;
    const hp = personaFor(host.info.seed);
    const first = guests[0];
    const vars = { nome: first?.info.name, v: g.bet };
    let pool: L.Pool = L.ACCEPT;
    let text: string | null = null;
    switch (g.kind) {
      case 'tv':
        text = L.pick(rng() < 0.5 ? L.INVITE.tv : L.INVITE[g.program ?? 'futebol'], rng, vars);
        break;
      case 'pingpong':
        text = L.pick(first && bondBetween(host.info.seed, first.info.seed) === 'rivalidade' ? L.INVITE.pingpongRival : L.INVITE.pingpong, rng, vars);
        break;
      case 'kitchen':
        text = L.pick(hasTrait(hp, 'fofoca') ? L.INVITE.kitchenGossip : L.INVITE.kitchen, rng, vars);
        break;
      case 'rps':
        text = L.pick(g.bet ? L.INVITE.rps : L.INVITE.rpsHonor, rng, vars);
        pool = g.bet ? (first && hasTrait(personaFor(first.info.seed), 'economia') ? L.ACCEPT_STINGY : L.ACCEPT_BET) : L.ACCEPT_BROKE;
        break;
      case 'mirror':
        text = guests.length ? L.pick(L.INVITE.mirror, rng, vars) : null;
        break;
      default:
        text = L.pick(L.INVITE[g.kind], rng, vars);
    }
    if (text) this.say(host, text, now);
    guests.forEach((c, i) => {
      const sleepy = isLongIdle(c.info.status, c.info.statusSince, now);
      const p = sleepy ? L.ACCEPT_SLEEPY : c.mode === 'shell' && g.kind !== 'rps' ? L.ACCEPT_SHELL : pool;
      g.pending.push({ id: c.id, at: now + 900 + i * 650, text: L.pick(p, rng) });
    });
  }

  /** Coloca o personagem a caminho do seu lugar na roda (e de volta à mesa no fim). */
  private dispatch(g: Gathering, m: Member, ch: Character, now: number): void {
    const sim = this.sim;
    ch.gathering = g;
    ch.nextSocialAt = 0;
    if (ch.icon === 'zzz') ch.setIcon(null, 0, now);
    const steps: Step[] = [];
    if (ch.atSpot) steps.push({ t: 'exit' });
    let held: HeldItem = 'none';
    if (g.kind === 'kitchen') {
      // passa na cafeteira (ou no bebedouro) antes de sentar para o papo
      const kind = hasTrait(personaFor(ch.info.seed), 'cafeina') || ch.rng() < 0.65 ? 'coffee' : 'water';
      const stop = sim.spots.findFree(kind, { by: ch.id, rng: ch.rng }) ?? sim.spots.findFree(kind === 'coffee' ? 'water' : 'coffee', { by: ch.id, rng: ch.rng });
      if (stop && ch.rng() < 0.8 && sim.reserveTemp(ch, stop)) {
        const coffee = stop.kind === 'coffee';
        steps.push(
          { t: 'go', tx: stop.tx, ty: stop.ty, fx: stop.x, fy: stop.y, dir: stop.dir },
          { t: 'act', pose: 'use', ms: coffee ? 1500 : 900, machine: coffee ? stop.furnitureId : undefined, icon: coffee ? 'coffee' : undefined },
          { t: 'do', fn: () => sim.spots.release(stop.id, ch.id) },
        );
        held = m.carry = coffee ? 'coffee' : 'water';
      }
    }
    const spot = m.spot ? sim.spots.get(m.spot) : undefined;
    if (spot?.seated) steps.push({ t: 'go', tx: spot.tx, ty: spot.ty, held }, { t: 'enter', spot: spot.id });
    else if (spot) steps.push({ t: 'go', tx: spot.tx, ty: spot.ty, fx: spot.x, fy: spot.y, dir: spot.dir, held });
    else if (m.tile) steps.push({ t: 'go', tx: m.tile.x, ty: m.tile.y, dir: m.tile.dir, held });
    steps.push({ t: 'gather', g }, { t: 'exit' }, { t: 'do', fn: () => ch.gathering === g && (ch.gathering = null) });
    ch.queue.push(...steps);
    sim.pushHome(ch, m.carry);
    void now;
  }

  // =================================================================== rodas em andamento

  /** Roda em andamento que aceita mais um (TV, torcida do jogo, papo na copa), pelo gosto de `ch`. */
  private joinable(ch: Character, p: Persona): Gathering | null {
    let best: Gathering | null = null;
    let bestScore = 0;
    for (const g of this.gatherings) {
      if (g.phase !== 'run' && g.phase !== 'gather') continue;
      if (g.kind === 'talk' || g.kind === 'arcade' || g.kind === 'mirror') continue;
      if (active(g).length >= KINDS[g.kind].max) continue;
      if (this.openSpotFor(g, ch) === undefined) continue;
      let s = KINDS[g.kind].match ? 0.8 : 1;
      s *= g.kind === 'tv' ? (hasTrait(p, 'series') ? 3 : 1.4) : g.kind === 'kitchen' ? (hasTrait(p, 'fofoca') || hasTrait(p, 'cafeina') ? 2.5 : 1) : hasTrait(p, 'competicao') || hasTrait(p, 'esporte') || hasTrait(p, 'games') ? 2 : 1;
      for (const m of active(g)) {
        const o = this.sim.chars.get(m.id);
        const b = o ? bondBetween(ch.info.seed, o.info.seed) : null;
        if (b === 'amizade') s += 0.8;
      }
      s *= 0.6 + ch.rng() * 0.8;
      if (s > bestScore) {
        bestScore = s;
        best = g;
      }
    }
    return best;
  }

  /** Lugar livre para mais um na roda: spot do pool (TV, torcida, copa) ou tile em pé (jokenpô). undefined = não cabe. */
  private openSpotFor(g: Gathering, ch: Character): SpotDef | null | undefined {
    if (g.phase === 'final' || g.phase === 'ended') return undefined;
    if (g.kind === 'talk' || g.kind === 'arcade' || g.kind === 'mirror') return undefined;
    if (active(g).length >= KINDS[g.kind].max) return undefined;
    const used = new Set(active(g).map((m) => m.spot));
    for (const id of g.pool) if (!used.has(id)) return this.sim.spots.get(id) ?? undefined;
    if (g.kind === 'rps') return this.standNear(g, ch) ? null : undefined;
    return undefined;
  }

  private join(g: Gathering, ch: Character, now: number): boolean {
    const spot = this.openSpotFor(g, ch);
    if (spot === undefined) return false;
    const role: Role = g.kind === 'kitchen' ? 'talker' : KINDS[g.kind].match ? 'watcher' : 'player';
    const m = this.member(ch, role, spot);
    m.late = true;
    if (!spot) {
      const t = this.standNear(g, ch);
      if (!t) return false;
      m.tile = t;
    }
    // chegando com a roda já rolando: pose da roda desde já
    if (g.phase === 'run') this.basePose(g, m, now);
    g.members.push(m);
    this.dispatch(g, m, ch, now);
    const line = g.kind === 'tv' ? 'Posso ver junto? 📺' : g.kind === 'kitchen' ? 'Tem lugar pra mais um? ☕' : 'Quem tá ganhando?';
    this.say(ch, line, now);
    return true;
  }

  /** Tile livre em pé perto dos jogadores (torcida do jokenpô), virado para eles. */
  private standNear(g: Gathering, ch: Character): { x: number; y: number; dir: Dir } | null {
    const ps = g.members.filter((m) => m.role === 'player' && !m.left);
    const spots = ps.map((m) => (m.spot ? this.sim.spots.get(m.spot) : undefined)).filter((s): s is SpotDef => !!s);
    if (!spots.length) return null;
    const cx = spots.reduce((a, s) => a + s.tx, 0) / spots.length;
    const cy = spots.reduce((a, s) => a + s.ty, 0) / spots.length;
    const grid = this.sim.building.grid;
    const busy = this.sim.busyTiles(ch.id);
    const taken = new Set(g.members.filter((m) => m.tile && !m.left).map((m) => m.tile!.y * grid.w + m.tile!.x));
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    // de preferência na fileira de trás (rosto para a câmera, olhando a partida); depois dos lados
    const rowCost = (dy: number) => (dy === -1 ? 0 : dy === -2 ? 1.2 : dy === 1 ? 2.5 : dy === 0 ? 2 : 4);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        const k = y * grid.w + x;
        if (grid.get(x, y) !== FREE || busy.has(k) || taken.has(k)) continue;
        if (spots.some((s) => s.tx === x && s.ty === y)) continue;
        // bem atrás de um jogador, some atrás dele
        const hidden = spots.some((s) => s.tx === x && s.ty === y + 1);
        const d = Math.abs(x + 0.5 - cx) + rowCost(dy) + (hidden ? 3 : 0);
        if (d >= bestD) continue;
        bestD = d;
        best = { x, y };
      }
    }
    if (!best) return null;
    return { ...best, dir: facing(best.x * TILE, best.y * TILE, cx * TILE, cy * TILE) };
  }

  // =================================================================== lugares de cada roda

  /** Lugares para `n` participantes da roda (null = não há lugar livre agora). */
  plan(kind: GatherKind, n: number, ch: Character): SeatPlan | null {
    const spots = this.sim.spots;
    const free = (s: SpotDef) => spots.isFree(s.id, ch.id) && !this.inPool(s.id);
    switch (kind) {
      case 'tv':
      case 'videogame': {
        if (this.tvBusy()) return null;
        const seats = [...spots.ofKind('sofa'), ...spots.ofKind('armchair')].filter((s) => s.areaId === LOUNGE_ID && free(s));
        const sofa = seats.filter((s) => s.kind === 'sofa').sort((a, b) => a.tx - b.tx);
        const chairs = seats.filter((s) => s.kind !== 'sofa');
        if (kind === 'videogame') {
          // os dois jogadores lado a lado no sofá, de frente para a TV
          for (let i = 0; i + 1 < sofa.length; i++) {
            if (sofa[i + 1].tx !== sofa[i].tx + 1) continue;
            const pair = [sofa[i], sofa[i + 1]];
            const rest = [...sofa.filter((s) => !pair.includes(s)), ...chairs];
            if (n > 2 + rest.length) return null;
            return { seats: [...pair, ...rest.slice(0, n - 2)], pool: [...pair, ...rest] };
          }
          return null;
        }
        const order = [...sofa, ...chairs];
        if (order.length < n) return null;
        return { seats: order.slice(0, n), pool: order };
      }
      case 'arcade': {
        const a = spots.ofKind('arcade').filter(free);
        return a.length >= 2 && n <= 2 ? { seats: a.slice(0, 2), pool: a.slice(0, 2) } : null;
      }
      case 'pingpong': {
        const g = spots.findFreeGroup('pingpong', { filter: (grp) => grp.every(free) });
        if (!g) return null;
        const watch = spots.ofKind('watch').filter(free);
        if (n > 2 + watch.length) return null;
        return { seats: [...g, ...watch].slice(0, n), pool: [...g, ...watch] };
      }
      case 'talk':
      case 'rps': {
        const g = spots.findFreeGroup('talk', { rng: ch.rng, filter: (grp) => grp.every(free) });
        if (!g) return null;
        return { seats: [...g], pool: [...g] };
      }
      case 'kitchen':
        return this.kitchenSeats(n, free, ch.rng);
      case 'mirror': {
        const sinks = spots.ofKind('sink').filter((s) => s.areaId === RESTROOM_ID && free(s)).sort((a, b) => a.tx - b.tx);
        if (n === 1) return sinks.length ? { seats: [sinks[Math.floor(ch.rng() * sinks.length)]], pool: [] } : null;
        for (let i = 0; i + 1 < sinks.length; i++) if (sinks[i + 1].tx === sinks[i].tx + 1) return { seats: [sinks[i], sinks[i + 1]], pool: [] };
        return null;
      }
    }
  }

  /**
   * Mesa da copa: pares de cadeiras frente a frente (mesa comprida: norte/sul; mesinhas: oeste/leste).
   * Para 3–4, dois pares vizinhos da mesa comprida.
   */
  private kitchenSeats(n: number, free: (s: SpotDef) => boolean, rng: () => number): SeatPlan | null {
    const seats = this.sim.spots.ofKind('cafe_seat').filter((s) => s.areaId === CAFE_ID);
    const at = (x: number, y: number, dir: Dir) => seats.find((s) => s.tx === x && s.ty === y && s.dir === dir);
    const pairs: SpotDef[][] = [];
    for (const s of seats) {
      if (s.dir === 'down') {
        const o = at(s.tx, s.ty + 3, 'up');
        if (o) pairs.push([s, o]);
      } else if (s.dir === 'right') {
        const o = at(s.tx + 2, s.ty, 'left');
        if (o) pairs.push([s, o]);
      }
    }
    const freePairs = pairs.filter((p) => p.every(free));
    if (!freePairs.length) return null;
    if (n <= 2) {
      const p = freePairs[Math.floor(rng() * freePairs.length)];
      return { seats: p, pool: p };
    }
    const blocks: SpotDef[][] = [];
    for (const a of freePairs) {
      if (a[0].dir !== 'down') continue;
      const b = freePairs.find((p) => p[0].dir === 'down' && p[0].tx === a[0].tx + 1);
      if (b) blocks.push([a[0], b[0], a[1], b[1]]);
    }
    if (!blocks.length) return null;
    const blk = blocks[Math.floor(rng() * blocks.length)];
    // os dois primeiros frente a frente, depois os vizinhos
    const order = [blk[0], blk[2], blk[1], blk[3]];
    return { seats: order.slice(0, n), pool: order };
  }

  private inPool(id: string): boolean {
    const owner = this.sim.spots.ownerOf(id);
    return !!owner && owner.startsWith('g:');
  }

  /** A TV do lounge está ocupada (programa ou videogame). */
  tvBusy(): boolean {
    for (const g of this.gatherings) if ((g.kind === 'tv' || g.kind === 'videogame') && g.phase !== 'ended') return true;
    return false;
  }

  /** O que a TV do lounge mostra agora (null = programação normal). */
  tvScreen(): { mode: 'show' | 'game'; seed: number } | null {
    for (const g of this.gatherings) {
      if (g.phase !== 'run' && g.phase !== 'final') continue;
      if (g.kind === 'tv') return { mode: 'show', seed: PROGRAM_SEED[g.program ?? 'futebol'] };
      if (g.kind === 'videogame') return { mode: 'game', seed: g.seed };
    }
    return null;
  }

  /** Partida no fliperama em andamento (as telas mostram o jogo). */
  arcadeSeed(): number | null {
    for (const g of this.gatherings) if (g.kind === 'arcade' && (g.phase === 'run' || g.phase === 'final')) return g.seed;
    return null;
  }

  // =================================================================== passo 'gather' (por personagem)

  /** Pose do participante enquanto a roda dura. Retorna true quando ele deve sair (roda acabou). */
  stepGather(ch: Character, g: Gathering, now: number): boolean {
    const m = g.members.find((x) => x.id === ch.id);
    if (!m || m.left || g.phase === 'ended') return true;
    if (!m.arrived) m.arrived = true;
    const spot = m.spot ? this.sim.spots.get(m.spot) : undefined;
    if (m.actPose && now < m.actUntil) ch.setPose(m.actPose, m.actHeld);
    else if (g.phase === 'gather') ch.setPose(ch.seated ? 'sit' : 'stand', m.carry === 'none' ? 'none' : m.carry);
    else ch.setPose(m.pose, m.held);
    const dir = m.tile?.dir ?? spot?.dir;
    if (dir) ch.dir = dir;
    return false;
  }

  // =================================================================== saída de alguém

  /** O plano de `ch` foi descartado (trabalho chamou, foi embora...): sai da roda. */
  leave(ch: Character, now: number): void {
    const g = ch.gathering;
    ch.gathering = null;
    if (!g || g.phase === 'ended') return;
    const m = g.members.find((x) => x.id === ch.id);
    if (!m || m.left) return;
    m.left = true;
    g.pending = g.pending.filter((p) => p.id !== ch.id);
    const rest = active(g);
    if (!rest.length) return this.end(g, now);
    if (g.phase === 'gather') {
      // ainda indo para o lugar: sem quórum, desfaz a roda
      const need = KINDS[g.kind].match ? 2 : g.kind === 'mirror' ? 1 : KINDS[g.kind].min;
      const left = KINDS[g.kind].match ? players(g).length : rest.length;
      if (left < need) this.end(g, now);
      return;
    }
    if (g.phase !== 'run') return;
    if (KINDS[g.kind].match && m.role === 'player') {
      const other = players(g)[0];
      const oc = other ? this.sim.chars.get(other.id) : undefined;
      if (oc) {
        this.say(oc, 'Ganhei por W.O.! 😎', now);
        this.act(other!, 'cheer', 'none', 1600, now);
      }
      g.phase = 'final';
      g.until = now + 1800;
      return;
    }
    if (rest.length < Math.max(1, KINDS[g.kind].min) || (g.kind !== 'tv' && rest.length < 2 && g.kind !== 'mirror')) {
      g.until = Math.min(g.until || now + 4000, now + 4000);
      if (g.kind !== 'tv') {
        g.phase = 'final';
        g.until = now + 1200;
      }
    }
  }

  /** Saindo da roda porque o trabalho chamou (ou o shell terminou): avisa a turma. */
  calledAway(ch: Character, prevMode: string, now: number): void {
    if (!ch.gathering) return;
    this.say(ch, L.pick(prevMode === 'shell' ? L.SHELL_DONE : L.CALLED, ch.rng), now);
  }

  private end(g: Gathering, now: number): void {
    if (g.phase === 'ended') return;
    g.phase = 'ended';
    const tag = ownerTag(g);
    for (const id of g.pool) this.sim.spots.release(id, tag);
    g.pool.length = 0;
    // quem ainda estava a caminho volta direto para a mesa
    for (const m of g.members) {
      if (m.left || m.arrived) continue;
      const c = this.sim.chars.get(m.id);
      if (c && c.gathering === g) this.sim.clearPlan(c);
    }
    void now;
  }

  /** Encerra tudo (aba volta do segundo plano). */
  reset(now: number): void {
    for (const g of this.gatherings) this.end(g, now);
    this.gatherings.clear();
    for (const c of this.sim.chars.values()) c.gathering = null;
    this.floaters.length = 0;
  }

  // =================================================================== diretor (por quadro)

  update(now: number): void {
    for (const g of this.gatherings) {
      if (g.phase === 'ended') continue;
      if (g.pending.length) this.flushPending(g, now);
      if (g.phase === 'gather') {
        this.checkStart(g, now);
        continue;
      }
      if (g.phase === 'final') {
        if (now >= g.until) this.end(g, now);
        continue;
      }
      if (now >= g.nextAt) this.beat(g, now);
    }
    if (this.floaters.length) {
      let n = 0;
      for (const f of this.floaters) if (now < f.until) this.floaters[n++] = f;
      this.floaters.length = n;
    }
  }

  /** Baixa frequência: limpa rodas encerradas e grava as carteiras. */
  housekeeping(now: number): void {
    for (const g of this.gatherings) if (g.phase === 'ended') this.gatherings.delete(g);
    if (now >= this.nextSaveAt) {
      this.nextSaveAt = now + 5_000;
      this.wallets.save(now);
    }
  }

  private flushPending(g: Gathering, now: number): void {
    let n = 0;
    for (const p of g.pending) {
      if (now < p.at) {
        g.pending[n++] = p;
        continue;
      }
      const c = this.sim.chars.get(p.id);
      if (c) this.say(c, p.text, now);
    }
    g.pending.length = n;
  }

  private checkStart(g: Gathering, now: number): void {
    const need = g.members.filter((m) => !m.left && m.role !== 'watcher' && !m.late);
    const ready = need.filter((m) => m.arrived);
    const min = g.kind === 'mirror' ? 1 : KINDS[g.kind].min;
    if (ready.length === need.length && ready.length >= min) return this.begin(g, now);
    if (now - g.createdAt < GATHER_TIMEOUT_MS) return;
    // alguém não chegou: segue com quem está lá (se der) ou desfaz
    if (!KINDS[g.kind].match && ready.length >= min) {
      for (const m of need) if (!m.arrived) this.dropMember(g, m);
      return this.begin(g, now);
    }
    this.end(g, now);
  }

  private dropMember(g: Gathering, m: Member): void {
    m.left = true;
    const c = this.sim.chars.get(m.id);
    if (c && c.gathering === g) this.sim.clearPlan(c);
  }

  private begin(g: Gathering, now: number): void {
    g.phase = 'run';
    g.startAt = now;
    g.nextAt = now + 900;
    const rng = g.rng;
    for (const m of active(g)) this.basePose(g, m, now);
    switch (g.kind) {
      case 'tv':
        g.until = now + between(rng, 30_000, 65_000);
        g.nextAt = now + 1_500;
        break;
      case 'kitchen':
        g.until = now + between(rng, 24_000, 45_000);
        g.nextAt = now + 500;
        break;
      case 'talk':
        g.until = now + between(rng, 10_000, 18_000);
        g.nextAt = now + 400;
        break;
      case 'mirror':
        g.until = now + between(rng, 6_000, 11_000);
        g.nextAt = now + between(rng, 2_000, 3_500);
        break;
      case 'videogame':
      case 'arcade':
        g.until = now + between(rng, 7_000, 10_000); // fim da rodada
        g.nextAt = now + 1_200;
        break;
      case 'pingpong':
        g.nextAt = now + between(rng, 1_800, 3_000);
        break;
      case 'rps':
        g.nextAt = now + 600;
        break;
    }
  }

  /** Pose de base de cada um enquanto a roda rola. */
  private basePose(g: Gathering, m: Member, now: number): void {
    const rng = g.rng;
    const c = this.sim.chars.get(m.id);
    const p = c ? personaFor(c.info.seed) : null;
    switch (g.kind) {
      case 'tv':
        // pipoca para quem é de séries/sonecas (e às vezes para os outros)
        if (p && (hasTrait(p, 'series') || hasTrait(p, 'sonecas') || rng() < 0.3)) [m.pose, m.held] = ['wait', 'popcorn'];
        else [m.pose, m.held] = ['sit', 'none'];
        break;
      case 'videogame':
        [m.pose, m.held] = m.role === 'player' ? ['game', 'controller'] : ['sit', 'none'];
        break;
      case 'arcade':
        [m.pose, m.held] = ['use', 'none'];
        break;
      case 'pingpong':
        [m.pose, m.held] = m.role === 'player' ? ['play', 'paddle'] : ['stand', 'none'];
        break;
      case 'kitchen':
        [m.pose, m.held] = ['sit', m.carry === 'none' ? 'none' : m.carry];
        break;
      case 'mirror':
        [m.pose, m.held] = ['groom', rng() < 0.5 ? 'lipstick' : 'comb'];
        break;
      default:
        [m.pose, m.held] = ['stand', 'none'];
    }
    void now;
  }

  // =================================================================== roteiros

  private beat(g: Gathering, now: number): void {
    switch (g.kind) {
      case 'tv':
        return this.beatTv(g, now);
      case 'videogame':
      case 'arcade':
        return this.beatGame(g, now);
      case 'pingpong':
        return this.beatPingPong(g, now);
      case 'kitchen':
      case 'talk':
        return this.beatChat(g, now);
      case 'rps':
        return this.beatRps(g, now);
      case 'mirror':
        return this.beatMirror(g, now);
    }
  }

  private beatTv(g: Gathering, now: number): void {
    const rng = g.rng;
    const ms = active(g);
    if (now >= g.until) {
      const c = this.charOf(this.randomOf(ms, rng));
      if (c) this.say(c, L.pick(L.TV.end, rng), now);
      g.phase = 'final';
      g.until = now + 1_400;
      return;
    }
    g.nextAt = now + between(rng, 3_500, 6_500);
    // quem é de sonecas cochila no sofá na segunda metade
    for (const m of ms) {
      const c = this.charOf(m);
      if (c && m.pose !== 'sleep' && hasTrait(personaFor(c.info.seed), 'sonecas') && now - g.startAt > (g.until - g.startAt) * 0.5) {
        [m.pose, m.held] = ['sleep', 'none'];
        c.setIcon('zzz', Math.max(1_000, g.until - now), now);
      }
    }
    const awake = ms.filter((m) => m.pose !== 'sleep');
    if (!awake.length) return;
    const speaker = this.charOf(this.randomOf(awake, rng));
    const r = rng();
    switch (g.program) {
      case 'futebol': {
        // o gol da tela (a cada lance): gol do "nosso" time (direita) = festa; do outro = lamento
        const lance = this.sim.footballLance(now);
        const goal = lance ? lance.progress >= lance.goalAt && g.step !== lance.lance : r < 0.25;
        if (lance) {
          const toGoal = (lance.goalAt - lance.progress + (lance.progress >= lance.goalAt ? 1 : 0)) * lance.period + 150;
          g.nextAt = Math.min(g.nextAt, now + toGoal);
        }
        if (goal && lance && !lance.right) {
          g.step = lance.lance;
          for (const m of awake) this.act(m, 'sulk', 'none', 1_600, now);
          if (speaker) this.say(speaker, L.pick(L.TV.futebol.against, rng), now);
        } else if (goal) {
          if (lance) g.step = lance.lance;
          for (const m of awake) this.act(m, 'cheer', 'none', 1_900, now);
          if (speaker) this.say(speaker, L.pick(L.TV.futebol.goal, rng), now);
          for (const m of awake) {
            const c = this.charOf(m);
            if (c && hasTrait(personaFor(c.info.seed), 'esporte')) c.setIcon('star', 1_600, now);
          }
        } else if (r < 0.3) {
          if (speaker) this.say(speaker, L.pick(L.TV.futebol.miss, rng), now);
          for (const m of awake) if (this.charOf(m) !== speaker) this.emote(m, '😱', now);
        } else if (speaker && r < 0.75) this.say(speaker, L.pick(L.TV.futebol.talk, rng, {}, g.lastLine), now);
        break;
      }
      case 'novela':
        if (r < 0.3) {
          if (speaker) this.say(speaker, L.pick(L.TV.novela.twist, rng), now);
          for (const m of awake) if (this.charOf(m) !== speaker) this.emote(m, '😱', now);
        } else if (r < 0.5) {
          if (speaker) this.say(speaker, L.pick(L.TV.novela.love, rng), now);
          for (const m of awake) this.charOf(m)?.setIcon('heart', 1_600, now);
        } else if (speaker) this.say(speaker, L.pick(L.TV.novela.talk, rng, {}, g.lastLine), now);
        break;
      default:
        if (r < 0.45) {
          for (const m of awake) this.act(m, 'laugh', 'none', 1_600, now);
          if (speaker) this.say(speaker, L.pick(L.TV.desenho.funny, rng), now);
        } else if (speaker) this.say(speaker, L.pick(L.TV.desenho.talk, rng, {}, g.lastLine), now);
    }
  }

  /** Videogame (melhor de 3, no sofá) e fliperama (uma partida, em pé). */
  private beatGame(g: Gathering, now: number): void {
    const rng = g.rng;
    const ps = players(g);
    if (ps.length < 2) {
      g.phase = 'final';
      g.until = now + 1_000;
      return;
    }
    if (now < g.until) {
      // durante a rodada: provocações e torcida
      g.nextAt = now + between(rng, 2_000, 3_400);
      const who = ps[g.step++ % 2];
      const c = this.charOf(who);
      if (c && rng() < 0.75) this.say(c, L.pick(L.GAME.trash, rng, {}, g.lastLine), now);
      for (const w of active(g).filter((m) => m.role === 'watcher')) {
        if (rng() < 0.35) {
          this.act(w, 'cheer', 'none', 1_300, now);
          const wc = this.charOf(w);
          const fav = this.charOf(ps[Math.floor(rng() * 2)]);
          if (wc && fav && rng() < 0.6) this.say(wc, L.pick(L.GAME.cheer, rng, { nome: fav.info.name }), now);
        }
      }
      return;
    }
    // fim da rodada
    const [a, b] = ps;
    const ca = this.charOf(a);
    const cb = this.charOf(b);
    const pa = ca ? personaFor(ca.info.seed) : null;
    const pb = cb ? personaFor(cb.info.seed) : null;
    const aWins = rng() < winChance(pa?.skill ?? 0.5, pb?.skill ?? 0.5);
    const [w, l] = aWins ? [a, b] : [b, a];
    g.score[aWins ? 0 : 1]++;
    const target = TARGET[g.kind] ?? 1;
    if (Math.max(...g.score) >= target) return this.finishMatch(g, w, l, now);
    this.act(w, 'cheer', g.kind === 'videogame' ? 'controller' : 'none', 1_500, now);
    this.act(l, 'sulk', g.kind === 'videogame' ? 'controller' : 'none', 1_500, now);
    const cw = this.charOf(w);
    if (cw) this.say(cw, L.pick(L.GAME.round, rng), now);
    g.until = now + 1_500 + between(rng, 7_000, 10_000);
    g.nextAt = now + 1_900;
  }

  private beatPingPong(g: Gathering, now: number): void {
    const rng = g.rng;
    const ps = players(g);
    if (ps.length < 2) {
      g.phase = 'final';
      g.until = now + 1_000;
      return;
    }
    g.nextAt = now + between(rng, 2_200, 3_800);
    const [a, b] = ps;
    const pa = this.charOf(a);
    const pb = this.charOf(b);
    const aWins = rng() < winChance(pa ? personaFor(pa.info.seed).skill : 0.5, pb ? personaFor(pb.info.seed).skill : 0.5);
    const i = aWins ? 0 : 1;
    g.score[i]++;
    const scorer = aWins ? a : b;
    const other = aWins ? b : a;
    if (g.score[i] >= (TARGET.pingpong ?? 5)) return this.finishMatch(g, scorer, other, now);
    const c = this.charOf(scorer);
    if (c && rng() < 0.6) {
      const mine = g.score[i];
      const theirs = g.score[1 - i];
      this.say(c, rng() < 0.5 ? `${mine} × ${theirs} 🏓` : L.pick(L.PINGPONG.point, rng, {}, g.lastLine), now);
    }
    for (const w of active(g).filter((m) => m.role === 'watcher')) {
      if (rng() < 0.4) {
        this.act(w, 'cheer', 'none', 1_200, now);
        const wc = this.charOf(w);
        if (wc && c && rng() < 0.4) this.say(wc, L.pick(L.PINGPONG.cheer, rng, { nome: c.info.name }), now);
      }
    }
  }

  /** Fim de uma partida: comemoração, troféu, aposta paga, placar registrado. */
  private finishMatch(g: Gathering, w: Member, l: Member, now: number): void {
    const rng = g.rng;
    const cw = this.charOf(w);
    const cl = this.charOf(l);
    g.winner = w.id;
    g.loser = l.id;
    const held: HeldItem = g.kind === 'videogame' ? 'controller' : g.kind === 'pingpong' ? 'paddle' : 'none';
    this.act(w, 'cheer', held, 3_000, now);
    this.act(l, 'sulk', held === 'paddle' ? 'none' : held, 3_000, now);
    cw?.setIcon('trophy', 3_000, now);
    const [sa, sb] = g.score;
    const hi = Math.max(sa, sb);
    const lo = Math.min(sa, sb);
    if (cw) this.say(cw, g.kind === 'pingpong' ? L.pick(L.PINGPONG.final, rng, { a: hi, b: lo }) : L.pick(L.GAME.round, rng), now);
    if (cl) g.pending.push({ id: cl.id, at: now + 1_000, text: L.pick(L.RPS.lose, rng) });
    for (const m of active(g)) if (m.role === 'watcher') this.act(m, rng() < 0.5 ? 'cheer' : 'laugh', 'none', 1_800, now);
    this.settle(g, w, l, now);
    g.phase = 'final';
    g.until = now + 3_400;
  }

  /** Paga a aposta (se houver), registra o placar e conta para a interface. */
  private settle(g: Gathering, w: Member, l: Member, now: number): void {
    const cw = this.charOf(w);
    const cl = this.charOf(l);
    if (!cw || !cl) return;
    this.wallets.recordMatch(w.id, l.id);
    const what = MATCH_WHAT[g.kind] ?? 'na aposta';
    const icon = KINDS[g.kind].emoji;
    const paid = g.bet ? this.wallets.transfer(l.id, w.id, g.bet, icon, what, now) : 0;
    if (paid) {
      this.float(cw, `+🪙${paid}`, COIN_COLOR, now);
      this.float(cl, `−🪙${paid}`, LOSS_COLOR, now);
      this.sim.pushEffect({ kind: 'coins', charId: cl.id, toId: cw.id, at: now });
    }
    const score = g.kind === 'pingpong' || g.kind === 'videogame' ? ` (${Math.max(...g.score)} a ${Math.min(...g.score)})` : '';
    this.event(g, icon, cw.id, paid ? `ganhou 🪙${paid} de ${cl.info.name} ${what}${score}` : `venceu ${cl.info.name} ${what}${score}`, now);
  }

  private beatChat(g: Gathering, now: number): void {
    const rng = g.rng;
    const ms = active(g);
    if (ms.length < 2 || now >= g.until) {
      g.phase = 'final';
      g.until = now + 900;
      return;
    }
    g.nextAt = now + between(rng, 2_400, 4_200);
    // quem fala: não repete o último; quem é mais sociável fala mais
    const pool = ms.filter((m) => m.id !== g.lastSpeaker);
    let speaker = pool[0];
    let best = -1;
    for (const m of pool) {
      const c = this.charOf(m);
      const s = (c ? personaFor(c.info.seed).sociability : 0.5) + rng();
      if (s > best) {
        best = s;
        speaker = m;
      }
    }
    const c = this.charOf(speaker);
    if (!c) return;
    const p = personaFor(c.info.seed);
    const { line, topic } = this.topicLine(g, c, p, now);
    g.lastSpeaker = speaker.id;
    this.act(speaker, 'talk', speaker.pose === 'sit' ? speaker.held : 'none', 1_700, now);
    this.say(c, line, now);
    const listeners = ms.filter((m) => m !== speaker);
    if (topic === 'piadas') {
      for (const m of listeners) this.act(m, 'laugh', 'none', 1_600, now);
      const lc = this.charOf(this.randomOf(listeners, rng));
      if (lc) g.pending.push({ id: lc.id, at: now + 800, text: L.pick(L.CHAT.laugh, rng) });
    } else if (topic === 'fofoca') {
      for (const m of listeners) this.emote(m, '👀', now + 300);
    } else if (rng() < 0.45) {
      const lc = this.charOf(this.randomOf(listeners, rng));
      if (lc) g.pending.push({ id: lc.id, at: now + 1_100, text: L.pick(L.CHAT.react, rng) });
    }
    // um gole de café de vez em quando
    for (const m of ms) if (m !== speaker && (m.held === 'coffee' || m.held === 'water') && rng() < 0.2) this.act(m, 'drink', m.held, 1_400, now);
  }

  /** Assunto da fala: o do traço de quem fala, o dia/hora, trabalho ou papo genérico. */
  private topicLine(g: Gathering, c: Character, p: Persona, now: number): { line: string; topic: string } {
    const rng = g.rng;
    const vars = { nome: this.otherName(g, c, rng), sala: this.roomName(c, rng) };
    const r = rng();
    if (r < 0.12) {
      const t = L.timeLine(new Date(now));
      if (t && t !== g.lastLine) return { line: t, topic: 'time' };
    }
    if (r < 0.2) return { line: p.catchphrase, topic: 'catch' };
    const topics = p.traits.map((t: TraitId) => L.TRAIT_TOPICS[t]).filter((t): t is keyof typeof L.CHAT => !!t);
    let topic: keyof typeof L.CHAT = topics.length && rng() < 0.65 ? topics[Math.floor(rng() * topics.length)] : rng() < 0.6 ? 'work' : 'generic';
    if (topic === 'react' || topic === 'laugh') topic = 'generic';
    return { line: L.pick(L.CHAT[topic], rng, vars, g.lastLine), topic };
  }

  private beatRps(g: Gathering, now: number): void {
    const rng = g.rng;
    const ps = players(g);
    if (ps.length < 2) {
      g.phase = 'final';
      g.until = now + 1_000;
      return;
    }
    const [a, b] = ps;
    const ca = this.charOf(a);
    const cb = this.charOf(b);
    if (!ca || !cb) return;
    // passos: 0..2 contagem "jo-ken-pô"; 3 revela; 4 resultado
    if (g.step <= 2) {
      for (const m of ps) this.act(m, 'rps', 'none', 540, now);
      this.say(ca, L.RPS.count[g.step], now, 700);
      if (g.step === 0) for (const m of ps) this.emote(m, '✊', now);
      g.step++;
      g.nextAt = now + 540;
      return;
    }
    if (g.step === 3) {
      const ga = pickGesture(rng, personaFor(ca.info.seed));
      const gb = pickGesture(rng, personaFor(cb.info.seed));
      g.gestures = [ga, gb];
      this.act(a, 'rps', ga, 2_200, now);
      this.act(b, 'rps', gb, 2_200, now);
      ca.setIcon(GESTURE_ICON[ga], 2_200, now);
      cb.setIcon(GESTURE_ICON[gb], 2_200, now);
      g.step = 4;
      g.nextAt = now + 1_500;
      return;
    }
    if (g.step === 4) {
      const res = rpsResult(g.gestures![0], g.gestures![1]);
      if (res === 0) {
        g.ties++;
        for (const m of ps) this.act(m, 'laugh', 'none', 1_000, now);
        if (g.ties >= 3) {
          this.say(ca, L.pick(L.RPS.stalemate, rng), now);
          g.phase = 'final';
          g.until = now + 1_600;
          return;
        }
        this.say(this.charOf(ps[g.ties % 2]) ?? ca, L.pick(L.RPS.tie, rng), now);
        g.step = 0;
        g.nextAt = now + 1_400;
        return;
      }
      const [w, l] = res === 1 ? [a, b] : [b, a];
      const cw = this.charOf(w)!;
      const cl = this.charOf(l)!;
      this.act(w, 'cheer', 'none', 2_600, now);
      this.act(l, 'sulk', 'none', 2_600, now);
      cw.setIcon(g.bet ? 'coin' : 'trophy', 2_600, now);
      this.say(cw, L.pick(g.bet ? L.RPS.win : L.RPS.winHonor, rng), now);
      g.pending.push({ id: cl.id, at: now + 1_000, text: L.pick(L.RPS.lose, rng) });
      for (const m of active(g)) if (m.role === 'watcher') this.act(m, 'laugh', 'none', 1_600, now);
      const watcher = active(g).find((m) => m.role === 'watcher');
      const wc = watcher ? this.charOf(watcher) : undefined;
      if (wc) g.pending.push({ id: wc.id, at: now + 600, text: L.pick(L.RPS.watch, rng) });
      this.settle(g, w, l, now);
      // revanche: quem perdeu e é de competição/apostas pede mais uma (se ainda tem moedinhas)
      const lp = personaFor(cl.info.seed);
      const keen = hasTrait(lp, 'competicao') || hasTrait(lp, 'apostas');
      if (keen && g.rematches < 1 && rng() < 0.6 && (!g.bet || this.wallets.coins(cl.id) >= 1)) {
        g.rematches++;
        g.bet = g.bet ? Math.min(g.bet, this.wallets.coins(cl.id), this.wallets.coins(cw.id)) : 0;
        g.pending.push({ id: cl.id, at: now + 2_200, text: L.pick(L.RPS.rematch, rng) });
        g.step = 0;
        g.ties = 0;
        g.nextAt = now + 3_400;
        return;
      }
      g.phase = 'final';
      g.until = now + 2_900;
    }
  }

  private beatMirror(g: Gathering, now: number): void {
    const rng = g.rng;
    const ms = active(g);
    if (!ms.length) return;
    if (now >= g.until) {
      for (const m of ms) {
        const c = this.charOf(m);
        if (!c) continue;
        c.setIcon('sparkle', 1_800, now);
        this.sim.pushEffect({ kind: 'sparkle', charId: c.id, at: now });
        this.say(c, L.pick(m.held === 'lipstick' && rng() < 0.6 ? L.MIRROR.lipstick : L.MIRROR.solo, rng), now);
        this.act(m, 'stand', 'none', 2_000, now);
      }
      g.phase = 'final';
      g.until = now + 1_600;
      return;
    }
    g.nextAt = now + between(rng, 2_600, 3_600);
    if (ms.length > 1) {
      const c = this.charOf(ms[g.step++ % ms.length]);
      if (c) this.say(c, L.pick(L.MIRROR.duo, rng, {}, g.lastLine), now);
    } else if (rng() < 0.3) {
      const c = this.charOf(ms[0]);
      if (c) this.emote(ms[0], rng() < 0.5 ? '💅' : '✨', now);
    }
  }

  // =================================================================== dinheiro do trabalho

  /** Snapshot: garante a carteira e paga tarefas concluídas (com "+🪙" quando é ao vivo). */
  syncAgent(ch: Character, a: AgentInfo, now: number, live: boolean): void {
    const { created } = this.wallets.ensure(a, now);
    if (created) return;
    const paid = this.wallets.payTasks(a, now);
    if (paid && live) this.earned(ch, paid, now);
  }

  /** Pedido do usuário atendido (fim de turno do principal). */
  turnDone(ch: Character, now: number): void {
    const v = this.wallets.credit(ch.id, TURN_REWARD, '💬', 'Pedido atendido', now);
    if (v) this.earned(ch, v, now);
  }

  /** Subagente entregou o resultado: a tarefa dele está paga. */
  delivered(ch: Character, now: number): void {
    const v = this.wallets.credit(ch.id, DELIVERY_REWARD, '📦', `Entregou: ${ch.info.title ?? 'resultado'}`, now);
    if (v) this.earned(ch, v, now);
  }

  private earned(ch: Character, v: number, now: number): void {
    this.float(ch, `+🪙${v}`, COIN_COLOR, now);
    if (!ch.icon) ch.setIcon('coin', 1_400, now);
  }

  // =================================================================== consulta (interface)

  /** "Vendo TV com Rafaela e Bia" — o que o agente está fazendo numa roda, se estiver. */
  doing(id: string): string | null {
    const ch = this.sim.chars.get(id);
    const g = ch?.gathering;
    if (!g || g.phase === 'ended') return null;
    const others = active(g)
      .filter((m) => m.id !== id)
      .map((m) => this.sim.chars.get(m.id)?.info.name)
      .filter((n): n is string => !!n);
    const label = g.kind === 'tv' && g.program ? `Vendo ${g.program === 'futebol' ? 'futebol' : g.program === 'novela' ? 'novela' : 'desenho'} na TV` : KINDS[g.kind].label;
    const going = g.phase === 'gather' ? ' (a caminho)' : '';
    const bet = g.bet && KINDS[g.kind].match ? ` · valendo 🪙${g.bet}` : '';
    return `${KINDS[g.kind].emoji} ${label}${others.length ? ` com ${joinNames(others)}` : ''}${bet}${going}`;
  }

  /** Tudo o que a interface mostra da vida social de um agente presente (null se não está no escritório). */
  info(id: string): AgentSocial | null {
    const ch = this.sim.chars.get(id);
    if (!ch) return null;
    const p = personaFor(ch.info.seed);
    const w = this.wallets.get(id);
    const bonds: AgentSocial['bonds'] = [];
    for (const o of this.sim.chars.values()) {
      if (o === ch || o.leaving || o.gone) continue;
      const kind = bondBetween(ch.info.seed, o.info.seed);
      if (kind) bonds.push({ id: o.id, name: o.info.name, kind, record: w?.vs[o.id] ? [w.vs[o.id][0], w.vs[o.id][1]] : null });
    }
    bonds.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'amizade' ? -1 : 1));
    return {
      traits: p.traits.map((t) => ({ emoji: TRAITS[t].emoji, label: TRAITS[t].label, desc: TRAITS[t].desc })),
      catchphrase: p.catchphrase,
      coins: w?.coins ?? 0,
      earned: w?.earned ?? 0,
      wins: w?.wins ?? 0,
      losses: w?.losses ?? 0,
      bonds,
      doing: this.doing(id),
      ledger: w ? w.ledger.map((e) => ({ ...e })) : [],
    };
  }

  // =================================================================== utilidades

  say(ch: Character, text: string, now: number, ms = SAY_MS): void {
    ch.sayText = text;
    ch.sayAt = now;
    ch.sayUntil = now + ms;
    const g = ch.gathering;
    if (g) g.lastLine = text;
  }

  private act(m: Member, pose: Pose, held: HeldItem, ms: number, now: number): void {
    m.actPose = pose;
    m.actHeld = held;
    m.actUntil = now + ms;
  }

  private emote(m: Member, emoji: string, now: number): void {
    const c = this.charOf(m);
    if (!c || (c.sayText && now < c.sayUntil)) return;
    c.chatEmoji = emoji;
    c.chatUntil = now + 1_300;
  }

  private float(ch: Character, text: string, color: string, now: number): void {
    if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({ charId: ch.id, text, color, at: now, until: now + FLOATER_MS });
  }

  private event(g: Gathering, icon: string, agentId: string, text: string, now: number): void {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    const first = g.members.find((m) => m.spot);
    const area = first?.spot ? this.sim.spots.get(first.spot)?.areaId : undefined;
    const place = (area && (PLACES[area] ?? this.sim.rooms.get(area)?.info.name)) || 'Escritório';
    this.events.push({ id: `social:${g.id}:${++this.eventSeq}`, at: now, icon, agentId, text, place });
  }

  private charOf(m: Member | undefined): Character | undefined {
    return m ? this.sim.chars.get(m.id) : undefined;
  }

  private randomOf<T>(list: readonly T[], rng: () => number): T | undefined {
    return list.length ? list[Math.floor(rng() * list.length) % list.length] : undefined;
  }

  /** Nome de um colega para a fofoca: de preferência alguém de fora da roda. */
  private otherName(g: Gathering, c: Character, rng: () => number): string | undefined {
    const inside = new Set(g.members.map((m) => m.id));
    const all = [...this.sim.chars.values()].filter((o) => o !== c && !o.leaving);
    const out = all.filter((o) => !inside.has(o.id));
    return this.randomOf(out.length ? out : all, rng)?.info.name;
  }

  private roomName(c: Character, rng: () => number): string | undefined {
    const own = this.sim.rooms.get(c.roomId)?.info.name;
    if (own && rng() < 0.6) return own;
    const rooms = [...this.sim.rooms.values()].filter((r) => r.listed);
    return this.randomOf(rooms, rng)?.info.name ?? own;
  }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
