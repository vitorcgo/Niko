// Simulação do escritório: concilia snapshots do servidor com os personagens e salas do mundo,
// planeja comportamentos e executa as filas de passos a cada frame.
import type { AgentInfo, OfficeSnapshot, Provider, RoomInfo } from '../../../../shared/types';
import type { ArtModule, Dir, RoomTheme } from '../../art/api';
import type { WorldOptions } from '../api';
import { COL_W, COMPACT_DELAY_MS, DISMANTLE_DELAY_MS, FOOT_DX, FOOT_DY, MISSING_DEBOUNCE_MS, RUN_SPEED, TILE, WALK_SPEED } from '../constants';
import { assembleBuilding, type BuildingLayout } from '../layout/building';
import { RECEPTION_ID } from '../layout/core';
import { columnsFor, inRect } from '../layout/geometry';
import { layoutProjectRoom } from '../layout/room';
import type { SpotDef, SpotKind } from '../layout/types';
import { PathFinder } from '../path/astar';
import { BLOCKED, FREE, SEAT } from '../path/grid';
import { PROGRAM_SEED } from '../social/gathering';
import { hasTrait, personaFor, soloWeights } from '../social/persona';
import { Social } from '../social/social';
import { browserStorage, type StorageLike } from '../social/wallet';
import {
  canDismantle,
  chooseSeat,
  idleSitMs,
  isLastInRoom,
  isLongIdle,
  modeFor,
  pickIdleActivity,
  shouldRun,
  type IdleActivity,
  type Mode,
} from './behavior';
import { Character, dirOf, facing } from './character';
import { Elevator } from './elevator';
import { RoomFxState } from './github';
import { RoomState } from './room-state';
import { countShells, latestShellDone, shellLabel, shellStage, shellWaitSince, spinDir, spinPhase, yawnPhase } from './shell';
import { SpotRegistry } from './spots';
import type { Step } from './steps';

/**
 * Efeito visual pontual pedido pela simulação ao render (drenado a cada frame): confete (shell
 * concluído), moedinhas voando de quem perdeu a aposta para quem ganhou e brilho (espelho).
 */
export type WorldEffect =
  | { kind: 'confetti'; charId: string; at: number }
  | { kind: 'coins'; charId: string; toId: string; at: number }
  | { kind: 'sparkle'; charId: string; at: number };

export { SHELL_DONE_TOOL } from './shell';
/** Comemoração (shell concluído) e lamento (falhou/morto). */
const CHEER_MS = 2_200;
const SULK_MS = 4_000;
const MAX_EFFECTS = 32;
/** Dono das reservas dos lugares de uma sala fantasma (endereço antigo de uma mudança). */
const GHOST_OWNER = '@mudança';

const FALLBACK_THEME: RoomTheme = {
  carpet: '#5b7fa6',
  carpet2: '#4f7093',
  wall: { base: '#e7e3db', trim: '#9b9184', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const LOUNGE_SEATS: SpotKind[] = ['sofa', 'armchair', 'beanbag'];
/** Onde dá para sentar e mexer no celular. */
const PHONE_SEATS: SpotKind[] = ['beanbag', 'sofa', 'armchair', 'cafe_seat', 'bench'];
/** Assentos de descanso possíveis já na carga inicial (bancos de corredor/banheiro não). */
const INITIAL_LOUNGE_SEATS: SpotKind[] = ['sofa', 'armchair', 'beanbag', 'cafe_seat'];
/** Fração dos ociosos elegíveis que começa fora da mesa. */
const INITIAL_LOUNGE_SHARE = 0.15;
/** Só quem está ocioso há pelo menos isto pode começar descansando (quem acabou de parar volta logo). */
const INITIAL_LOUNGE_MIN_IDLE_MS = 90_000;
/** Ninguém sai para passear nos primeiros segundos depois de abrir a página. */
const INITIAL_OUTING_DELAY_MS = 5_000;
const ENTER_MS = 180;

function between(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}

export class Sim {
  readonly chars = new Map<string, Character>();
  readonly rooms = new Map<string, RoomState>();
  readonly spots = new SpotRegistry();
  readonly elevators: Elevator[] = [];
  building: BuildingLayout;
  readonly finder: PathFinder;
  /** Incrementa quando o prédio muda (salas surgem/somem, largura). */
  layoutVersion = 0;
  now = 0;
  initialized = false;
  /** furnitureId -> até quando a máquina está em uso (cafeteira passando café). */
  readonly machineUntil = new Map<string, number>();
  /** Cabines ocupadas (furnitureId). */
  readonly stallBusy = new Set<string>();
  /** Vida social: rodas dos ociosos, personalidades e carteiras (social/social.ts). */
  readonly social: Social;
  /** Depuração: agentes forçados a encerrar e salas forçadas a sumir do snapshot. */
  readonly forcedOffline = new Set<string>();
  readonly hiddenRooms = new Set<string>();
  /** Contas do snapshot (id -> cor/letra/ferramenta) para etiquetas: a do Codex ganha chip vazado e o selo. */
  accounts = new Map<string, { short: string; color: string; name: string; provider?: Provider }>();
  /** Depuração: salas/agentes extras mesclados a cada snapshot (sessões simuladas). */
  injected: { rooms: RoomInfo[]; agents: AgentInfo[] } = { rooms: [], agents: [] };
  /** Depuração: campos sobrepostos a agentes reais do snapshot (ex.: shells forçados). */
  readonly agentPatches = new Map<string, Partial<AgentInfo>>();
  /** Efeitos pontuais (confete) para o render desenhar; o render esvazia a lista. */
  readonly effects: WorldEffect[] = [];
  /** Festa e alarme das salas (eventos do GitHub; sim/github.ts). */
  readonly roomFx = new RoomFxState();
  private lastSnapshot: OfficeSnapshot | null = null;
  /** Desde quando há uma vaga livre antes da última sala (0 = não há). */
  private gapSince = 0;
  private moveSeq = 0;
  private shrinkPending = false;
  private nextHousekeeping = 0;

  /** `storage` das carteiras: null = só em memória (o timelapse não mexe nas moedinhas de verdade). */
  constructor(
    private readonly art: ArtModule,
    private readonly options: () => WorldOptions,
    storage: StorageLike | null = browserStorage(),
  ) {
    this.social = new Social(this, storage);
    this.building = assembleBuilding(columnsFor([]), [], 0);
    this.finder = new PathFinder(this.building.grid);
    this.spots.setSpots(this.building.spots);
    for (const s of this.spots.ofKind('elevator')) this.elevators.push(new Elevator(this.elevators.length, s.id));
  }

  // =================================================================== snapshot

  applySnapshot(input: OfficeSnapshot, now: number): void {
    let snap = this.injected.rooms.length || this.injected.agents.length ? { ...input, rooms: [...input.rooms, ...this.injected.rooms], agents: [...input.agents, ...this.injected.agents] } : input;
    if (this.agentPatches.size) {
      const patches = this.agentPatches;
      snap = { ...snap, agents: snap.agents.map((a) => (patches.has(a.id) ? { ...a, ...patches.get(a.id) } : a)) };
    }
    this.lastSnapshot = input;
    this.now = now;
    const first = !this.initialized;
    this.initialized = true;
    this.accounts = new Map(snap.accounts.map((a) => [a.id, { short: a.short, color: a.color, name: a.name, ...(a.provider === 'codex' ? { provider: a.provider } : {}) }]));

    // ---- salas
    let layoutDirty = false;
    const listed = new Set<string>();
    // na ordem de chegada (slot do servidor): na carga inicial as salas ocupam as vagas 0, 1, 2... nessa ordem
    for (const r of [...snap.rooms].sort((a, b) => a.slot - b.slot)) {
      if (this.hiddenRooms.has(r.id)) continue;
      listed.add(r.id);
      const rs = this.rooms.get(r.id);
      if (!rs) {
        this.createRoom(r, first, now);
        layoutDirty = true;
        continue;
      }
      if (rs.info.name !== r.name || rs.info.seed !== r.seed) rs.version++;
      rs.info = r;
      if (!rs.listed) {
        rs.listed = true;
        rs.readyToDismantleAt = 0;
        if (rs.phase === 'dismantling') rs.rebuild(now);
      }
    }
    for (const rs of this.rooms.values()) {
      if (!listed.has(rs.id) && rs.listed) {
        rs.listed = false;
        rs.unlistedAt = now;
      }
    }
    if (layoutDirty) this.relayout();
    this.roomFx.sync(snap.rooms, input.serverTime, now);

    // ---- agentes
    const seen = new Set<string>();
    const fresh: Character[] = [];
    for (const a of snap.agents) {
      seen.add(a.id);
      const ch = this.chars.get(a.id);
      if (ch) {
        this.updateAgent(ch, a, now);
        this.social.syncAgent(ch, a, now, true);
        continue;
      }
      if (a.status === 'offline' || this.forcedOffline.has(a.id) || this.hiddenRooms.has(a.roomId)) continue;
      // subagente que nunca vimos trabalhar e já terminou, ou cujo pai está indo embora: não entra
      if (a.status === 'done') continue;
      if (a.kind === 'sub' && a.parentId) {
        const parent = this.chars.get(a.parentId);
        if (parent && (parent.leaving || parent.gone)) continue;
      }
      const nc = this.spawn(a, first, now);
      if (nc) {
        fresh.push(nc);
        // chegou ao escritório: carteira com o saldo inicial (tarefas já concluídas pagas em silêncio)
        this.social.syncAgent(nc, a, now, false);
      }
    }
    for (const ch of this.chars.values()) {
      if (!seen.has(ch.id) && !ch.leaving && ch.missingSince === null) ch.missingSince = now;
    }
    // modos (depois de todos existirem, para subagentes acharem o pai)
    for (const ch of fresh) {
      ch.mode = this.modeOf(ch);
      this.refreshShell(ch, now);
    }
    if (first) {
      // quem trabalha/espera senta primeiro; ociosos depois (assim nenhuma sala fica vazia)
      const seated = new Set<string>();
      const order = [...fresh].sort((a, b) => Number(a.mode === 'idle') - Number(b.mode === 'idle'));
      for (const ch of order) this.placeInitial(ch, now, seated);
    }
    this.refreshRoomInfo();
  }

  /** Reaplica o último snapshot (depuração). */
  reapply(now: number): void {
    if (this.lastSnapshot) this.applySnapshot(this.lastSnapshot, now);
  }

  private createRoom(r: RoomInfo, first: boolean, now: number): RoomState {
    let theme = FALLBACK_THEME;
    try {
      theme = this.art.roomTheme(r.seed) ?? FALLBACK_THEME;
    } catch {
      theme = FALLBACK_THEME;
    }
    // a primeira vaga livre do prédio (o slot do servidor só dá a ordem de chegada)
    const slot = this.freeSlot();
    const layout = layoutProjectRoom({ id: r.id, slot, seed: r.seed }, theme);
    const rs = new RoomState(r, theme, layout, first ? 'ready' : 'building', now, first, slot);
    this.rooms.set(r.id, rs);
    return rs;
  }

  /** Menor vaga sem sala (contando as que ainda estão desmontando). */
  private freeSlot(): number {
    const used = new Set<number>();
    for (const r of this.rooms.values()) if (r.phase !== 'gone') used.add(r.slot);
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  private updateAgent(ch: Character, a: AgentInfo, now: number): void {
    const prevStatus = ch.info.status;
    const hadShells = !!ch.info.shells?.length;
    ch.info = a;
    ch.missingSince = null;
    if (a.roomId !== ch.roomId && !ch.leaving) {
      if (ch.homeSpot) this.spots.release(ch.homeSpot, ch.id);
      ch.homeSpot = null;
      ch.roomId = a.roomId;
      this.interrupt(ch);
    }
    const act = a.activity;
    if (act && act.id !== ch.lastActivityId) {
      const firstSeen = ch.lastActivityId === null;
      ch.lastActivityId = act.id;
      if (!firstSeen) {
        ch.activityChangedAt = now;
        if (act.kind === 'done') ch.setIcon('check', 2600, now);
        if (act.kind === 'error') ch.setIcon('sweat', 2200, now);
        if (act.kind === 'delegate' && ch.info.kind === 'main' && a.status === 'working') this.planDelegate(ch, now);
        // pedido atendido: moedinhas pelo trabalho
        if (act.kind === 'done' && ch.info.kind === 'main') this.social.turnDone(ch, now);
      }
    }
    // fim de um shell: comemora ou lamenta (uma vez por notificação)
    const sd = latestShellDone(a);
    if (sd && sd.at > ch.shellDoneAt) {
      ch.shellDoneAt = sd.at;
      this.reactShellDone(ch, !sd.error, now);
    }
    // shells mudam sem mudar o status (ex.: comando em primeiro plano começou/terminou)
    if (prevStatus !== a.status || hadShells || !!a.shells?.length || ch.mode === 'shell' || this.forcedOffline.has(ch.id)) this.refreshMode(ch);
    this.refreshShell(ch, now);
  }

  /** Recalcula o modo e interrompe o plano se mudou. */
  private refreshMode(ch: Character): void {
    if (ch.leaving) return;
    const mode = this.modeOf(ch);
    if (mode === ch.mode) return;
    const prev = ch.mode;
    ch.mode = mode;
    if (prev === 'idle' && mode !== 'idle') ch.nextOutingAt = 0;
    if (ch.icon === 'zzz') ch.setIcon(null, 0, this.now);
    this.refreshShell(ch, this.now);
    // numa roda, ocioso <-> esperando shell não muda nada (segue na roda)
    if (ch.gathering && (mode === 'idle' || mode === 'shell') && (prev === 'idle' || prev === 'shell')) return;
    // o trabalho chamou no meio de uma roda: avisa a turma antes de sair
    if (ch.gathering) this.social.calledAway(ch, prev, this.now);
    // comemoração/lamento do fim de um shell em andamento: termina (curta, volta à mesa) e o
    // planejador segue o modo novo; ir embora não espera
    if (this.now < ch.reactUntil && mode !== 'leave' && mode !== 'deliver') return;
    ch.reactUntil = 0;
    this.interrupt(ch);
  }

  private modeOf(ch: Character): Mode {
    const a = ch.info;
    if (ch.leaving) return 'leave';
    const parent = a.parentId ? this.chars.get(a.parentId) : undefined;
    const parentGone = !!parent && (parent.leaving || parent.gone);
    const missing = ch.missingSince !== null && this.now - ch.missingSince >= MISSING_DEBOUNCE_MS;
    const offline = this.forcedOffline.has(ch.id);
    if (a.kind === 'sub' && a.status === 'done' && !ch.delivered && !offline && !parentGone) return 'deliver';
    const m = modeFor(offline ? 'offline' : a.status, { kind: a.kind, missing, parentGone, shells: a.shells, now: this.now });
    if (m === 'deliver' && ch.delivered) return 'leave';
    return m;
  }

  // =================================================================== espera de shell

  /** Atualiza início/quantidade/rótulo da espera de shell (no snapshot e quando o modo muda). */
  private refreshShell(ch: Character, now: number): void {
    if (ch.mode !== 'shell') {
      ch.shellSince = 0;
      ch.shellCount = 0;
      ch.shellStage = null;
      ch.shellEnteredAt = 0;
      return;
    }
    const a = ch.info;
    if (!ch.shellEnteredAt) ch.shellEnteredAt = now;
    // relógios do servidor e do navegador podem divergir um pouco: nunca "no futuro"
    ch.shellSince = Math.min(now, shellWaitSince(a));
    ch.shellCount = Math.max(1, countShells(a.shells, a.status !== 'shell'));
    const label = shellLabel(a);
    if (label !== ch.shellLabel) {
      ch.shellLabel = label;
      ch.shellTextKey = -1;
    }
    ch.shellStage = shellStage(now - ch.shellSince);
  }

  /**
   * Um shell terminou (Activity 'ShellDone'): sucesso -> levanta e comemora com confete e ⭐;
   * falha/morto -> nuvenzinha de chuva ('storm') e ombros caídos. Depois segue o status atual.
   */
  private reactShellDone(ch: Character, ok: boolean, now: number): void {
    if (ch.leaving || ch.mode === 'leave' || ch.mode === 'deliver') return;
    ch.setIcon(ok ? 'star' : 'storm', ok ? CHEER_MS : SULK_MS, now);
    if (ok) this.pushEffect({ kind: 'confetti', charId: ch.id, at: now });
    // só encena na própria mesa e parado; andando/passeando fica só o ícone (e o confete)
    const home = this.spots.get(ch.homeSpot);
    if (!home || ch.atSpot !== home.id || ch.step || ch.queue.length || ch.gathering) return;
    if (ok) {
      ch.reactUntil = now + CHEER_MS + 2 * ENTER_MS + 200;
      if (home.seated) ch.queue.push({ t: 'exit' });
      ch.queue.push({ t: 'act', pose: 'stretch', ms: CHEER_MS * 0.55 }, { t: 'act', pose: 'raise_hand', ms: CHEER_MS * 0.45 });
      if (home.seated) ch.queue.push({ t: 'enter', spot: home.id });
    } else {
      // cabeça baixa, desanimado, sem sair da cadeira
      ch.reactUntil = now + SULK_MS;
      ch.queue.push({ t: 'act', pose: home.seated ? 'sleep' : 'stand', ms: SULK_MS });
    }
  }

  /** Lance do futebol da TV agora (para a torcida comemorar junto com o "GOL" da tela). */
  footballLance(t: number): { lance: number; progress: number; right: boolean; period: number; goalAt: number } | null {
    try {
      return this.art.footballLance?.(t, PROGRAM_SEED.futebol) ?? null;
    } catch {
      return null;
    }
  }

  /** Pede um efeito visual ao render (confete, moedinhas, brilho). */
  pushEffect(e: WorldEffect): void {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift();
    this.effects.push(e);
  }

  // =================================================================== nascimento e posicionamento

  private spawn(a: AgentInfo, first: boolean, now: number): Character | null {
    let appearance;
    try {
      appearance = this.art.appearanceFromSeed(a.seed, { look: a.look, sub: a.kind === 'sub' });
    } catch {
      return null;
    }
    const ch = new Character(a, appearance);
    ch.lastActivityId = a.activity?.id ?? null;
    ch.shellDoneAt = latestShellDone(a)?.at ?? 0;
    this.chars.set(a.id, ch);
    if (first) return ch;
    // chegada pelo elevador
    const el = this.pickElevator(ch);
    const spot = this.spots.get(el.spotId)!;
    ch.placeAtTile(spot.tx, spot.ty);
    ch.x = spot.x;
    ch.y = spot.y - 6;
    ch.dir = 'down';
    ch.alpha = 0;
    ch.inside = true;
    ch.arriving = true;
    ch.hiddenUntil = el.reserveAppear(now);
    // subagentes disparados juntos não saem do elevador no mesmo instante
    if (a.kind === 'sub') ch.hiddenUntil += Math.floor(ch.rng() * 600);
    ch.queue.push({ t: 'elevOut', elev: el.index, phase: 0 });
    return ch;
  }

  /**
   * Carga inicial: todos começam no lugar natural (a própria mesa), sem ninguém "parado no
   * corredor". Só uma minoria dos ociosos de verdade (parados há um tempo, sem cochilar) aparece
   * num sofá/poltrona/puff/café — nunca em banco de corredor ou banheiro, e nunca esvaziando a sala.
   */
  private placeInitial(ch: Character, now: number, roomsSeated: Set<string>): void {
    this.assignHome(ch);
    const home = this.spots.get(ch.homeSpot);
    // primeiro passeio só depois de alguns segundos: a carga inicial mostra todos no lugar
    ch.nextOutingAt = now + INITIAL_OUTING_DELAY_MS + idleSitMs(ch.rng, this.options().liveliness) * ch.rng();
    const relaxing =
      ch.mode === 'idle' &&
      !!home &&
      roomsSeated.has(ch.roomId) &&
      now - ch.info.statusSince >= INITIAL_LOUNGE_MIN_IDLE_MS &&
      !isLongIdle(ch.info.status, ch.info.statusSince, now, this.options().passearOcioso) &&
      ch.rng() < INITIAL_LOUNGE_SHARE;
    if (relaxing) {
      const seat = this.randomFree(INITIAL_LOUNGE_SEATS, ch);
      if (seat && this.spots.reserve(seat.id, ch.id)) {
        ch.tempSpots.push(seat.id);
        this.snapTo(ch, seat);
        const held = seat.kind === 'cafe_seat' ? 'coffee' : 'none';
        ch.queue.push({ t: 'act', pose: 'sit', held, ms: between(ch.rng, 4000, 14000) }, { t: 'exit' }, { t: 'do', fn: () => this.releaseTemp(ch) });
        return;
      }
    }
    if (home) {
      this.snapTo(ch, home);
      roomsSeated.add(ch.roomId);
    } else this.placeOverflow(ch);
  }

  /** Sem lugar reservado: em pé dentro da própria sala (se ela existe) ou na recepção. */
  private placeOverflow(ch: Character): void {
    const room = this.rooms.get(ch.roomId);
    const t = room && room.present ? this.overflowTile(ch, room) : null;
    ch.standTile = t;
    const p = t ?? this.lobbyTile(ch);
    ch.placeAtTile(p.x, p.y);
  }

  private snapTo(ch: Character, s: SpotDef): void {
    ch.tx = s.tx;
    ch.ty = s.ty;
    ch.x = s.x;
    ch.y = s.y;
    ch.dir = s.dir;
    ch.atSpot = s.id;
    ch.seated = !!s.seated;
    ch.sortY = s.sortY ?? null;
  }

  /** Reserva mesa (ou banqueta/ponto em pé) na sala do personagem. */
  private assignHome(ch: Character): void {
    if (ch.homeSpot && this.spots.get(ch.homeSpot) && this.spots.ownerOf(ch.homeSpot) === ch.id) return;
    ch.homeSpot = null;
    const room = this.rooms.get(ch.roomId);
    if (!room || !room.present) return;
    const seat = chooseSeat(room.layout.spots, (id) => this.spots.isFree(id, ch.id), ch.info.kind);
    if (seat && this.spots.reserve(seat.id, ch.id)) ch.homeSpot = seat.id;
  }

  private pickElevator(ch: Character): Elevator {
    let best = this.elevators[0];
    for (const e of this.elevators) if (e.load < best.load || (e.load === best.load && ch.rng() < 0.5)) best = e;
    return best;
  }

  // =================================================================== layout

  /** Recalcula o prédio (largura, grade, spots) a partir das salas presentes. */
  relayout(force = false): void {
    const present = [...this.rooms.values()].filter((r) => r.present);
    let cols = columnsFor(present.map((r) => r.slot));
    const cur = this.building.cols;
    if (cols < cur && !force) {
      // só encolhe quando ninguém está na faixa que vai sumir
      const limit = cols * COL_W * TILE;
      if ([...this.chars.values()].some((c) => !c.gone && c.x >= limit - TILE)) {
        cols = cur;
        this.shrinkPending = true;
      } else this.shrinkPending = false;
    } else this.shrinkPending = false;
    const building = assembleBuilding(
      cols,
      present.map((r) => r.layout),
      this.layoutVersion + 1,
    );
    this.building = building;
    this.layoutVersion++;
    this.finder.setGrid(building.grid);
    const lost = this.spots.setSpots(building.spots);
    for (const { owner } of lost) {
      const ch = this.chars.get(owner);
      if (!ch) continue;
      if (ch.homeSpot && !this.spots.get(ch.homeSpot)) ch.homeSpot = null;
      ch.tempSpots = ch.tempSpots.filter((s) => this.spots.get(s));
    }
    for (const ch of this.chars.values()) {
      if (ch.atSpot && !this.spots.get(ch.atSpot)) {
        ch.atSpot = null;
        ch.seated = false;
        ch.sortY = null;
      }
      // caminhos em andamento são recalculados a partir do tile atual; destino que deixou de existir (o
      // prédio encolheu e levou o bebedouro do corredor, a sala foi desmontada) invalida o plano: sem isto o
      // passo não acharia caminho e teletransportaria o personagem para fora do prédio
      let stale = false;
      for (const s of ch.step ? [ch.step, ...ch.queue] : ch.queue) {
        if (s.t !== 'go') continue;
        s.path = undefined;
        if (!this.building.grid.nearestWalkable(s.tx, s.ty, 4)) stale = true;
      }
      if (stale) this.interrupt(ch);
      if (!this.building.grid.walkable(ch.tx, ch.ty) && !ch.atSpot && !ch.inside) {
        const n = this.building.grid.nearestWalkable(ch.tx, ch.ty);
        if (n) {
          ch.tx = n.x;
          ch.ty = n.y;
        }
      }
    }
  }

  // =================================================================== atualização por frame

  update(dt: number, now: number): void {
    this.now = now;
    for (const e of this.elevators) e.update(dt, now);
    this.updateRooms(now);
    this.social.update(now);
    if (this.roomFx.active.size) this.roomFx.update(this, now);
    for (const ch of this.chars.values()) {
      if (ch.missingSince !== null && !ch.leaving && now - ch.missingSince >= MISSING_DEBOUNCE_MS) this.refreshMode(ch);
      this.runCharacter(ch, dt, now);
    }
    for (const [id, ch] of this.chars) {
      if (ch.gone) {
        this.spots.releaseAll(id);
        this.chars.delete(id);
      }
    }
    if (now >= this.nextHousekeeping) {
      this.nextHousekeeping = now + 1000;
      this.housekeeping(now);
    }
  }

  /** Verificações de baixa frequência (pai saindo, salas sem dono, encolher prédio). */
  private housekeeping(now: number): void {
    for (const ch of this.chars.values()) {
      if (ch.info.kind === 'sub' && !ch.leaving) this.refreshMode(ch);
      // comando em primeiro plano passou dos 10 s (ou a espera acabou): muda de modo sem snapshot novo
      else if (!ch.leaving && (ch.mode === 'shell' || (ch.info.status === 'working' && ch.info.shells?.length))) this.refreshMode(ch);
      if (ch.mode === 'idle' && isLongIdle(ch.info.status, ch.info.statusSince, now, this.options().passearOcioso) && ch.atSpot === ch.homeSpot && ch.pose === 'sleep' && ch.icon !== 'zzz') {
        ch.setIcon('zzz', 1e12, now);
      }
    }
    if (this.shrinkPending) this.relayout();
    this.social.housekeeping(now);
    for (const [id, until] of this.machineUntil) if (until < now) this.machineUntil.delete(id);
    this.refreshRoomInfo();
  }

  private updateRooms(now: number): void {
    let dirty = false;
    for (const room of this.rooms.values()) {
      if (room.phase === 'building' && room.progress(now) >= 1) room.setPhase('ready', now);
      if (room.phase === 'dismantling' && room.progress(now) >= 1) {
        room.setPhase('gone', now);
        dirty = true;
      }
      if (!room.listed && (room.phase === 'ready' || room.phase === 'building')) {
        const occupants = this.occupants(room);
        // segurança: sala sem ninguém e luz acesa sem ninguém para apagar
        if (occupants === 0 && room.lightOn && !this.switchClaimValid(room) && now - room.unlistedAt > 2500) room.setLight(false, now);
        const ok = canDismantle({ listed: room.listed, occupants, lightOn: room.lightOn, dark: room.light(now) <= 0.01, unlistedForMs: now - room.unlistedAt }, 0);
        if (!ok) room.readyToDismantleAt = 0;
        else if (!room.readyToDismantleAt) room.readyToDismantleAt = now;
        else if (now - room.readyToDismantleAt >= DISMANTLE_DELAY_MS) room.setPhase('dismantling', now);
      }
    }
    for (const [id, room] of this.rooms) {
      if (room.phase === 'gone') {
        this.rooms.delete(id);
        dirty = true;
      }
    }
    if (dirty) this.relayout();
    this.compact(now);
  }

  // =================================================================== mudança de sala

  /**
   * Sem buracos entre as salas: quando uma vaga fica livre antes da última sala (um terminal fechou e a
   * sala foi desmontada), a sala mais distante se muda para ela depois de COMPACT_DELAY_MS. Uma sala por
   * vez, só sala pronta e com a sessão aberta; o prédio encolhe quando o endereço antigo é desmontado.
   */
  private compact(now: number): void {
    const free = this.freeSlot();
    let far: RoomState | null = null;
    for (const r of this.rooms.values()) {
      if (r.slot > free && !r.ghost && r.listed && r.phase === 'ready' && (!far || r.slot > far.slot)) far = r;
    }
    if (!far) {
      this.gapSince = 0;
      return;
    }
    if (!this.gapSince) this.gapSince = now;
    if (now - this.gapSince < COMPACT_DELAY_MS) return;
    this.gapSince = 0;
    this.moveRoom(far, free, now);
  }

  /**
   * Muda a sala para outra vaga: ela é construída de novo lá (apagada; o primeiro a chegar acende a luz)
   * e o endereço antigo vira uma sala fantasma que espera esvaziar, apaga e é desmontada. Os lugares
   * mantêm os ids (cada um continua com a sua mesa, agora na sala nova); quem está sentado ou a caminho
   * de um lugar da sala passa a usar o lugar equivalente da fantasma, levanta dali e vai andando.
   */
  moveRoom(room: RoomState, slot: number, now: number): void {
    const before = room.layout;
    const ghostId = `${room.id}#mudança${++this.moveSeq}`;
    const ghostLayout = layoutProjectRoom({ id: ghostId, slot: room.slot, seed: room.seed }, room.theme);
    const ghost = new RoomState({ ...room.info, id: ghostId, seed: room.seed }, room.theme, ghostLayout, 'ready', now, false, room.slot);
    ghost.ghost = true;
    ghost.listed = false;
    ghost.unlistedAt = now;
    ghost.lightOn = room.lightOn;
    ghost.lightAt = room.lightAt;
    this.rooms.set(ghostId, ghost);
    // o layout é determinístico pela semente: o i-ésimo lugar da fantasma é o i-ésimo da sala antiga
    const alias = new Map<string, string>();
    before.spots.forEach((s, i) => {
      const g = ghostLayout.spots[i];
      if (g && g.kind === s.kind) alias.set(s.id, g.id);
    });

    room.slot = slot;
    room.layout = layoutProjectRoom({ id: room.id, slot, seed: room.seed }, room.theme);
    room.setPhase('building', now);
    room.lightOn = false;
    room.lightAt = -1e9;
    room.switchClaim = null;
    room.readyToDismantleAt = 0;
    room.version++;
    this.relayout();
    // os lugares da fantasma não são de ninguém (nenhum passeio ou roda vai parar lá)
    for (const s of ghostLayout.spots) this.spots.reserve(s.id, GHOST_OWNER);

    for (const ch of this.chars.values()) {
      if (ch.gone) continue;
      let touched = false;
      if (ch.atSpot && alias.has(ch.atSpot)) {
        ch.atSpot = alias.get(ch.atSpot)!;
        touched = true;
      }
      // a caminho de um lugar, do interruptor ou de um canto da sala antiga: o plano fica velho (o passo que não
      // pode ser interrompido termina no endereço antigo: senta na fantasma, mexe na luz da fantasma)
      for (const step of ch.step ? [ch.step, ...ch.queue] : ch.queue) {
        if (step.t === 'enter' && alias.has(step.spot)) {
          step.spot = alias.get(step.spot)!;
          touched = true;
        } else if (step.t === 'switch' && step.room === room.id) {
          step.room = ghostId;
          touched = true;
        } else if (step.t === 'go' && inRect(before.rect, step.tx, step.ty)) touched = true;
      }
      if (ch.tempSpots.some((id) => alias.has(id))) touched = true;
      if (touched || (ch.roomId === room.id && ch.standTile) || inRect(before.rect, ch.tx, ch.ty)) {
        ch.standTile = null;
        this.interrupt(ch);
      }
    }
  }

  private switchClaimValid(room: RoomState): boolean {
    if (!room.switchClaim) return false;
    const c = this.chars.get(room.switchClaim);
    if (!c || c.gone) {
      room.switchClaim = null;
      return false;
    }
    return true;
  }

  /** Personagens associados à sala (não saindo) + qualquer um fisicamente dentro dela. */
  occupants(room: RoomState, except?: string): number {
    let n = 0;
    for (const c of this.chars.values()) {
      if (c.gone || c.id === except) continue;
      if ((c.roomId === room.id && !c.leaving) || inRect(room.layout.rect, c.tx, c.ty)) n++;
    }
    return n;
  }

  /** Quantos estão fisicamente dentro do retângulo da sala. */
  private physicallyInside(room: RoomState, except?: string): number {
    let n = 0;
    for (const c of this.chars.values()) if (!c.gone && c.id !== except && inRect(room.layout.rect, c.tx, c.ty)) n++;
    return n;
  }

  /** Contas presentes e quadro kanban de cada sala. */
  private refreshRoomInfo(): void {
    for (const room of this.rooms.values()) {
      const accs = new Set<string>();
      const board: RoomState['board'] = [];
      for (const c of this.chars.values()) {
        if (c.roomId !== room.id || c.leaving) continue;
        accs.add(c.info.account);
        if (c.info.kind === 'main') for (const t of c.info.tasks) if (board.length < 15) board.push({ status: t.status });
      }
      room.accounts = [...accs].sort();
      room.board = board;
    }
  }

  // =================================================================== execução dos passos

  private runCharacter(ch: Character, dt: number, now: number): void {
    // animação
    ch.animT += dt * 1000;
    ch.updateLane(dt);
    if (ch.icon && now >= ch.iconUntil) ch.icon = null;
    // "zzz" só enquanto dorme: quem levanta (uma roda chamou, festa na sala, um passeio) acordou, e o ícone não vai
    // junto. O cochilo na mesa de quem está ocioso há muito tempo não muda o modo, então ninguém mais o apagaria.
    if (ch.icon === 'zzz' && ch.pose !== 'sleep') ch.icon = null;
    if (ch.mode === 'shell' && ch.shellSince) ch.shellStage = shellStage(now - ch.shellSince);
    if (!ch.step) {
      if (ch.replan) {
        ch.replan = false;
        this.clearPlan(ch);
      }
      ch.step = ch.queue.shift() ?? null;
      ch.stepT = 0;
      ch.stepStarted = false;
    }
    if (ch.step) {
      const done = this.runStep(ch, ch.step, dt, now);
      ch.stepT += dt * 1000;
      if (done) {
        ch.step = null;
        if (ch.replan) {
          ch.replan = false;
          this.clearPlan(ch);
        }
      }
      return;
    }
    // fila vazia: decide o próximo plano ou descansa
    if (now >= ch.thinkAt) {
      const planned = this.think(ch, now);
      if (!planned) ch.thinkAt = now + 400;
    }
    if (!ch.step && !ch.queue.length) this.restPose(ch, now);
  }

  private runStep(ch: Character, s: Step, dt: number, now: number): boolean {
    const first = !ch.stepStarted;
    ch.stepStarted = true;
    switch (s.t) {
      case 'go':
        return this.stepGo(ch, s, dt);
      case 'enter': {
        const spot = this.spots.get(s.spot);
        if (!spot) return true;
        if (first) {
          ch.enterFrom = { x: ch.x, y: ch.y };
          if (spot.seated) ch.sortY = spot.sortY ?? null;
        }
        const k = Math.min(1, (ch.stepT + dt * 1000) / ENTER_MS);
        const from = ch.enterFrom ?? { x: ch.x, y: ch.y };
        ch.x = from.x + (spot.x - from.x) * k;
        ch.y = from.y + (spot.y - from.y) * k;
        if (k >= 1) {
          this.snapTo(ch, spot);
          ch.setPose(spot.seated ? 'sit' : 'stand', ch.held);
          return true;
        }
        return false;
      }
      case 'exit': {
        if (!ch.atSpot) return true;
        const spot = this.spots.get(ch.atSpot);
        if (!spot) {
          ch.atSpot = null;
          ch.seated = false;
          ch.sortY = null;
          return true;
        }
        const tx = spot.tx * TILE + FOOT_DX;
        const ty = spot.ty * TILE + FOOT_DY;
        if (first) ch.enterFrom = { x: ch.x, y: ch.y };
        const k = Math.min(1, (ch.stepT + dt * 1000) / ENTER_MS);
        const from = ch.enterFrom ?? { x: ch.x, y: ch.y };
        ch.x = from.x + (tx - from.x) * k;
        ch.y = from.y + (ty - from.y) * k;
        ch.seated = false;
        ch.setPose('stand', ch.held);
        if (k >= 1) {
          ch.atSpot = null;
          ch.sortY = null;
          ch.tx = spot.tx;
          ch.ty = spot.ty;
          return true;
        }
        return false;
      }
      case 'act': {
        if (first) {
          if (s.dir) ch.dir = s.dir;
          if (s.icon) ch.setIcon(s.icon, s.ms, now);
          if (s.machine) this.machineUntil.set(s.machine, now + s.ms);
        }
        ch.setPose(s.pose, s.held ?? 'none');
        return ch.stepT >= s.ms;
      }
      case 'until': {
        if (first && s.dir) ch.dir = s.dir;
        ch.setPose(s.pose ?? (ch.seated ? 'sit' : 'stand'), s.held ?? ch.held);
        if (ch.stepT >= s.maxMs) return true;
        return ch.stepT >= s.minMs && s.cond();
      }
      case 'elevOut':
        return this.stepElevOut(ch, s, dt, now);
      case 'elevIn':
        return this.stepElevIn(ch, s, dt, now);
      case 'stall':
        return this.stepStall(ch, s, dt, now);
      case 'switch':
        return this.stepSwitch(ch, s, now);
      case 'gather':
        return this.social.stepGather(ch, s.g, now);
      case 'do':
        s.fn();
        return true;
      case 'remove':
        ch.gone = true;
        return true;
    }
  }

  private findPath(sx: number, sy: number, gx: number, gy: number, out: number[]): boolean {
    const grid = this.building.grid;
    if (!grid.walkable(gx, gy)) {
      const n = grid.nearestWalkable(gx, gy, 4);
      if (!n) return false;
      gx = n.x;
      gy = n.y;
    }
    if (this.finder.find(sx, sy, gx, gy, out)) return true;
    const s = grid.nearestWalkable(sx, sy, 6);
    if (s && (s.x !== sx || s.y !== sy) && this.finder.find(s.x, s.y, gx, gy, out)) {
      out.unshift(s.x, s.y);
      return true;
    }
    return false;
  }

  private stepGo(ch: Character, s: Extract<Step, { t: 'go' }>, dt: number): boolean {
    if (!s.path) {
      s.path = [];
      s.i = 0;
      if (!this.findPath(ch.tx, ch.ty, s.tx, s.ty, s.path)) {
        // sem caminho (não deveria acontecer): teletransporta para não travar
        ch.placeAtTile(s.tx, s.ty);
        s.path.length = 0;
      }
    }
    const path = s.path;
    let budget = (s.run ? RUN_SPEED : WALK_SPEED) * ch.speedK * dt;
    let moved = false;
    while (budget > 0.0001) {
      let gx: number;
      let gy: number;
      const i = s.i ?? 0;
      if (i < path.length) {
        ch.tx = path[i];
        ch.ty = path[i + 1];
        gx = ch.tx * TILE + FOOT_DX;
        gy = ch.ty * TILE + FOOT_DY;
      } else if (s.fx !== undefined && s.fy !== undefined && !s.fine) {
        gx = s.fx;
        gy = s.fy;
      } else break;
      const dx = gx - ch.x;
      const dy = gy - ch.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) ch.dir = dirOf(dx, dy, ch.dir);
      if (d <= budget) {
        ch.x = gx;
        ch.y = gy;
        budget -= d;
        if (i < path.length) s.i = i + 2;
        else s.fine = true;
      } else {
        ch.x += (dx / d) * budget;
        ch.y += (dy / d) * budget;
        budget = 0;
      }
      moved = true;
    }
    const arrived = (s.i ?? 0) >= path.length && (s.fx === undefined || s.fine);
    if (arrived) {
      if (s.dir) ch.dir = s.dir;
      ch.setPose('stand', s.held ?? 'none');
      return true;
    }
    if (moved) ch.setPose(s.run ? 'run' : 'walk', s.held ?? 'none');
    return false;
  }

  private stepElevOut(ch: Character, s: Extract<Step, { t: 'elevOut' }>, dt: number, now: number): boolean {
    const el = this.elevators[s.elev] ?? this.elevators[0];
    const spot = this.spots.get(el.spotId)!;
    ch.dir = 'down';
    if (s.phase === 0) {
      ch.alpha = 0;
      ch.setPose('stand');
      if (now >= ch.hiddenUntil) {
        el.request(ch.id);
        s.phase = 1;
      }
      return false;
    }
    if (s.phase === 1) {
      ch.x = spot.x;
      ch.y = spot.y - 6;
      if (el.door >= 2.5) {
        ch.inside = false;
        ch.alpha = Math.min(1, ch.alpha + dt * 5);
        if (ch.alpha >= 1 && el.isOpen) s.phase = 2;
      }
      return false;
    }
    // sai do elevador até o tile da frente
    const gx = spot.tx * TILE + FOOT_DX;
    const gy = spot.ty * TILE + FOOT_DY;
    const dx = gx - ch.x;
    const dy = gy - ch.y;
    const d = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;
    ch.alpha = 1;
    if (d <= step) {
      ch.x = gx;
      ch.y = gy;
      ch.tx = spot.tx;
      ch.ty = spot.ty;
      el.release(ch.id, now);
      ch.setPose('stand');
      return true;
    }
    ch.x += (dx / d) * step;
    ch.y += (dy / d) * step;
    ch.setPose('walk');
    return false;
  }

  private stepElevIn(ch: Character, s: Extract<Step, { t: 'elevIn' }>, dt: number, now: number): boolean {
    const el = this.elevators[s.elev] ?? this.elevators[0];
    const spot = this.spots.get(el.spotId)!;
    if (s.phase === 0) {
      ch.dir = 'up';
      ch.setPose('stand');
      el.request(ch.id);
      if (el.isOpen) s.phase = 1;
      return false;
    }
    if (s.phase === 1) {
      const gx = spot.x;
      const gy = spot.y - 6;
      const dx = gx - ch.x;
      const dy = gy - ch.y;
      const d = Math.hypot(dx, dy);
      const step = WALK_SPEED * dt;
      ch.dir = 'up';
      if (d <= step) {
        ch.x = gx;
        ch.y = gy;
        s.phase = 2;
        ch.dir = 'down';
        ch.setPose('stand');
      } else {
        ch.x += (dx / d) * step;
        ch.y += (dy / d) * step;
        ch.setPose('walk');
      }
      return false;
    }
    ch.alpha = Math.max(0, ch.alpha - dt * 3.5);
    if (ch.alpha <= 0) {
      ch.inside = true;
      el.release(ch.id, now);
      return true;
    }
    return false;
  }

  private stepStall(ch: Character, s: Extract<Step, { t: 'stall' }>, dt: number, now: number): boolean {
    const spot = this.spots.get(s.spot);
    if (!spot) return true;
    const furn = spot.furnitureId ?? spot.id;
    const ax = spot.tx * TILE + FOOT_DX;
    const ay = spot.ty * TILE + FOOT_DY;
    if (s.phase === 0) {
      // entra pela porta (sobe um pouco) e some
      const dx = spot.x - ch.x;
      const dy = spot.y - ch.y;
      const d = Math.hypot(dx, dy);
      const step = WALK_SPEED * 0.8 * dt;
      ch.dir = 'up';
      ch.setPose('walk');
      if (d > step) {
        ch.x += (dx / d) * step;
        ch.y += (dy / d) * step;
      } else {
        ch.x = spot.x;
        ch.y = spot.y;
      }
      ch.alpha = Math.max(0, ch.alpha - dt * 4);
      if (d <= step && ch.alpha <= 0) {
        ch.inside = true;
        this.stallBusy.add(furn);
        s.phase = 1;
        ch.stallUntil = now + s.ms;
      }
      return false;
    }
    if (s.phase === 1) {
      if (now >= (ch.stallUntil ?? 0)) {
        s.phase = 2;
        this.stallBusy.delete(furn);
        ch.inside = false;
        ch.dir = 'down';
      }
      return false;
    }
    // sai da cabine
    const dx = ax - ch.x;
    const dy = ay - ch.y;
    const d = Math.hypot(dx, dy);
    const step = WALK_SPEED * 0.8 * dt;
    ch.alpha = Math.min(1, ch.alpha + dt * 4);
    ch.dir = 'down';
    ch.setPose('walk');
    if (d > step) {
      ch.x += (dx / d) * step;
      ch.y += (dy / d) * step;
      return false;
    }
    ch.x = ax;
    ch.y = ay;
    ch.alpha = 1;
    ch.tx = spot.tx;
    ch.ty = spot.ty;
    ch.setPose('stand');
    return true;
  }

  private stepSwitch(ch: Character, s: Extract<Step, { t: 'switch' }>, now: number): boolean {
    const room = this.rooms.get(s.room);
    if (!room) return true;
    const spot = room.layout.spots.find((p) => p.kind === 'switch');
    if (spot) ch.dir = spot.dir;
    if (s.phase === 0) {
      ch.setPose('use');
      if (ch.stepT >= 420) {
        s.phase = 1;
        const stillLast = !s.onlyIfLast || isLastInRoom(room.id, ch.id, this.chars.values());
        if (stillLast && (s.on ? room.present : true)) room.setLight(s.on, now);
      }
      return false;
    }
    ch.setPose('use');
    if (ch.stepT >= 700) {
      ch.setPose('stand');
      return true;
    }
    return false;
  }

  // =================================================================== planejamento

  /** Interrompe o plano atual (respeitando passos que precisam terminar). */
  interrupt(ch: Character): void {
    if (ch.step && !this.interruptible(ch.step)) {
      ch.replan = true;
      if (ch.step.t === 'stall' && ch.step.phase <= 1) ch.stallUntil = Math.min(ch.stallUntil ?? 0, this.now + 2000);
      return;
    }
    this.clearPlan(ch);
  }

  interruptible(s: Step): boolean {
    return s.t === 'go' || s.t === 'act' || s.t === 'until' || s.t === 'gather' || s.t === 'do';
  }

  /** Descarta a fila (e sai da roda, se estiver numa). */
  clearPlan(ch: Character): void {
    ch.queue.length = 0;
    ch.step = null;
    ch.thinkAt = 0;
    this.releaseTemp(ch);
    // o passo 'do' que soltaria o interruptor foi descartado junto com a fila: sem isto a reserva
    // vaza e ninguém mais acende (ou apaga) a luz da sala enquanto este personagem existir
    const room = this.rooms.get(ch.roomId);
    if (room && room.switchClaim === ch.id) room.switchClaim = null;
    if (ch.gathering) this.social.leave(ch, this.now);
    ch.chatUntil = 0;
  }

  releaseTemp(ch: Character): void {
    for (const id of ch.tempSpots) if (id !== ch.homeSpot) this.spots.release(id, ch.id);
    ch.tempSpots.length = 0;
  }

  reserveTemp(ch: Character, spot: SpotDef): boolean {
    if (!this.spots.reserve(spot.id, ch.id)) return false;
    ch.tempSpots.push(spot.id);
    return true;
  }

  /** Decide o próximo plano. Retorna true se planejou algo. */
  private think(ch: Character, now: number): boolean {
    if (ch.gone) return false;
    if (ch.mode === 'leave') return this.planLeave(ch, now);
    if (ch.mode === 'deliver') return this.planDeliver(ch, now);
    const room = this.rooms.get(ch.roomId);
    if (!room || !room.present) return this.planLobby(ch, room);
    this.assignHome(ch);
    if (!ch.homeSpot) return this.planOverflow(ch, room);
    ch.standTile = null;
    // sala apagada: o primeiro a chegar acende a luz
    if (!room.lightOn && room.phase !== 'dismantling' && !this.switchClaimValid(room)) {
      room.switchClaim = ch.id;
      const sw = room.layout.spots.find((p) => p.kind === 'switch');
      if (sw) {
        const steps: Step[] = [];
        this.pushLeave(ch, steps);
        steps.push(
          { t: 'go', tx: sw.tx, ty: sw.ty, fx: sw.x, fy: sw.y, dir: sw.dir, run: ch.mode === 'wait' },
          { t: 'until', cond: () => room.phase === 'ready', minMs: 0, maxMs: 6000, dir: sw.dir },
          { t: 'switch', room: room.id, on: true, phase: 0 },
          { t: 'do', fn: () => room.switchClaim === ch.id && (room.switchClaim = null) },
        );
        ch.queue.push(...steps);
        return true;
      }
    }
    if (ch.atSpot !== ch.homeSpot) return this.planGoHome(ch, now);
    ch.arriving = false;
    if (ch.mode === 'idle' && !isLongIdle(ch.info.status, ch.info.statusSince, now, this.options().passearOcioso)) {
      if (!ch.nextOutingAt) ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      if (now >= ch.nextOutingAt) {
        if (this.planOuting(ch, now)) return true;
        ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      }
    }
    // esperando um shell: só sai da mesa para uma roda (sozinho, fica na pipoca)
    if (ch.mode === 'shell') {
      if (!ch.nextSocialAt) ch.nextSocialAt = now + idleSitMs(ch.rng, this.options().liveliness) * 1.3;
      if (now >= ch.nextSocialAt) {
        ch.nextSocialAt = now + idleSitMs(ch.rng, this.options().liveliness) * 1.3;
        const p = personaFor(ch.info.seed);
        if (this.social.hasCompany(ch, now) && ch.rng() < 0.5 + p.sociability * 0.4 && this.social.tryInitiate(ch, now, true)) return true;
      }
    }
    return false;
  }

  /** Levantar/sair do lugar atual antes de andar. */
  private pushLeave(ch: Character, steps: Step[]): void {
    if (ch.atSpot) steps.push({ t: 'exit' });
  }

  private planGoHome(ch: Character, now: number, held: 'none' | 'coffee' | 'water' = 'none'): boolean {
    const home = this.spots.get(ch.homeSpot);
    if (!home) return false;
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const dist = Math.abs(home.tx - ch.tx) + Math.abs(home.ty - ch.ty);
    // quem acabou de chegar anda (a não ser que precise do usuário); depois corre se estiver longe
    const run = shouldRun(dist, ch.mode) && (!ch.arriving || ch.mode === 'wait');
    steps.push({ t: 'go', tx: home.tx, ty: home.ty, run, held }, { t: 'enter', spot: home.id });
    if (ch.mode === 'idle') steps.push({ t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) });
    void now;
    ch.queue.push(...steps);
    return true;
  }

  /** Sem sala ainda (aguardando slot): espera na recepção. */
  private planLobby(ch: Character, room: RoomState | undefined): boolean {
    const t = this.lobbyTile(ch);
    ch.queue.push(
      { t: 'go', tx: t.x, ty: t.y },
      { t: 'until', cond: () => !!room && room.present, minMs: 800, maxMs: 4000, dir: 'down' },
    );
    return true;
  }

  /**
   * Sala lotada (todos os lugares reservados): trabalha em pé dentro da própria sala, num canto
   * livre, até vagar um lugar. Nunca fica rodando pela recepção.
   */
  private planOverflow(ch: Character, room: RoomState): boolean {
    const stay = ch.standTile && !ch.atSpot && ch.tx === ch.standTile.x && ch.ty === ch.standTile.y && this.overflowFree(ch.tx, ch.ty, ch);
    const t = stay ? ch.standTile : this.overflowTile(ch, room);
    if (!t) return this.planLobby(ch, room);
    ch.standTile = t;
    ch.arriving = false;
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const r = room.layout.rect;
    // de frente para o meio da sala (onde estão as mesas)
    const dir: Dir = facing(t.x * TILE, t.y * TILE, (r.x + 5) * TILE, (r.y + 6) * TILE);
    if (t.x !== ch.tx || t.y !== ch.ty || ch.atSpot) {
      const dist = Math.abs(t.x - ch.tx) + Math.abs(t.y - ch.ty);
      steps.push({ t: 'go', tx: t.x, ty: t.y, dir, run: shouldRun(dist, ch.mode) });
    }
    // esperando um shell em pé: só a ampulheta (a pose de espera é sentada)
    const pose = ch.mode === 'wait' ? 'raise_hand' : ch.mode === 'work' ? 'read' : 'stand';
    const held = ch.mode === 'work' ? 'laptop' : 'none';
    steps.push({ t: 'until', cond: () => this.hasFreeSeat(room, ch), minMs: 1500, maxMs: 12_000, pose, held, dir });
    ch.queue.push(...steps);
    return true;
  }

  private hasFreeSeat(room: RoomState, ch: Character): boolean {
    return !!chooseSeat(room.layout.spots, (id) => this.spots.isFree(id, ch.id), ch.info.kind);
  }

  /** Tile livre para alguém ficar em pé (sem assento, sem spot e sem outra pessoa). */
  private overflowFree(x: number, y: number, ch: Character, busy = this.busyTiles(ch.id)): boolean {
    const grid = this.building.grid;
    if (grid.get(x, y) !== FREE || busy.has(y * grid.w + x)) return false;
    for (const s of this.spots.all()) if (s.tx === x && s.ty === y) return false;
    return true;
  }

  /** Melhor tile livre da sala para trabalhar em pé: junto a paredes/móveis, longe da porta. */
  private overflowTile(ch: Character, room: RoomState): { x: number; y: number } | null {
    const grid = this.building.grid;
    const r = room.layout.rect;
    const door = room.layout.door;
    const busy = this.busyTiles(ch.id);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let y = r.y + 2; y <= r.y + 10; y++) {
      for (let x = r.x + 1; x <= r.x + 14; x++) {
        if (!this.overflowFree(x, y, ch, busy)) continue;
        if (door && Math.abs(x - (door.x + door.w / 2 - 0.5)) <= 1.5 && Math.abs(y - (door.y + door.h / 2 - 0.5)) <= 2) continue;
        // de costas para uma parede/móvel parece natural; espremido entre dois móveis ou colado em
        // outra pessoa, não
        const solidAt = (dx: number, dy: number) => grid.get(x + dx, y + dy) === BLOCKED;
        let crowd = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) if (busy.has((y + dy) * grid.w + x + dx)) crowd++;
        const backed = solidAt(0, -1) || solidAt(0, 1) ? 2 : solidAt(1, 0) || solidAt(-1, 0) ? 1 : 0;
        const squeezed = (solidAt(1, 0) && solidAt(-1, 0)) || (solidAt(0, 1) && solidAt(0, -1)) ? 3 : 0;
        const score = backed - squeezed - crowd * 3 - (Math.abs(x - ch.tx) + Math.abs(y - ch.ty)) * 0.05 + ch.rng() * 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    return best;
  }

  private lobbyTile(ch: Character): { x: number; y: number } {
    const reception = this.building.core.find((a) => a.id === RECEPTION_ID)!;
    const r = reception.rect;
    for (let k = 0; k < 20; k++) {
      const x = r.x + 2 + Math.floor(ch.rng() * 12);
      const y = r.y + 3 + Math.floor(ch.rng() * 7);
      if (this.building.grid.get(x, y) === 1) return { x, y };
    }
    return { x: r.x + 6, y: r.y + 9 };
  }

  private planDelegate(ch: Character, now: number): void {
    if (ch.step || ch.queue.length || ch.atSpot !== ch.homeSpot || !ch.homeSpot) return;
    const room = this.rooms.get(ch.roomId);
    const door = room?.layout.door;
    const dir: Dir = door ? facing(ch.x, ch.y, (door.x + door.w / 2) * TILE, (door.y + door.h / 2) * TILE) : 'down';
    const home = ch.homeSpot;
    ch.queue.push(
      { t: 'exit' },
      {
        // em pé, virado para a porta, "explicando" a tarefa a quem chega ('raise_hand' e ✋ ficam
        // reservados para quando o agente precisa do usuário)
        t: 'until',
        cond: () => ![...this.chars.values()].some((c) => c.info.parentId === ch.id && c.arriving),
        minMs: 2600,
        maxMs: 7500,
        pose: 'talk',
        held: 'none',
        dir,
      },
      { t: 'go', tx: ch.tx, ty: ch.ty },
      { t: 'enter', spot: home },
    );
    ch.setIcon('chat', 2600, now);
  }

  private planLeave(ch: Character, now: number): boolean {
    ch.leaving = true;
    ch.arriving = false;
    this.spots.releaseAll(ch.id);
    ch.homeSpot = null;
    ch.tempSpots.length = 0;
    if (ch.gathering) this.social.leave(ch, now);
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const room = this.rooms.get(ch.roomId);
    if (room && room.present && room.lightOn && !this.switchClaimValid(room) && isLastInRoom(room.id, ch.id, this.chars.values())) {
      const sw = room.layout.spots.find((p) => p.kind === 'switch');
      if (sw) {
        room.switchClaim = ch.id;
        steps.push(
          { t: 'go', tx: sw.tx, ty: sw.ty, fx: sw.x, fy: sw.y, dir: sw.dir },
          { t: 'until', cond: () => this.physicallyInside(room, ch.id) === 0, minMs: 250, maxMs: 9000, dir: sw.dir },
          { t: 'switch', room: room.id, on: false, phase: 0, onlyIfLast: true },
          { t: 'do', fn: () => room.switchClaim === ch.id && (room.switchClaim = null) },
        );
      }
    }
    const el = this.pickElevator(ch);
    const es = this.spots.get(el.spotId)!;
    steps.push({ t: 'go', tx: es.tx, ty: es.ty, fx: es.tx * TILE + FOOT_DX + (es.x - (es.tx * TILE + FOOT_DX)) * 0.5, fy: es.ty * TILE + FOOT_DY - 2, dir: 'up' });
    steps.push({ t: 'elevIn', elev: el.index, phase: 0 }, { t: 'remove' });
    ch.queue.push(...steps);
    void now;
    return true;
  }

  private planDeliver(ch: Character, now: number): boolean {
    const parent = ch.info.parentId ? this.chars.get(ch.info.parentId) : undefined;
    if (!parent || parent.leaving || parent.gone) {
      ch.delivered = true;
      ch.mode = 'leave';
      return this.planLeave(ch, now);
    }
    const target = this.besideTile(parent, ch);
    const steps: Step[] = [];
    this.pushLeave(ch, steps);
    const held = ch.rng() < 0.5 ? 'papers' : 'box';
    const title = ch.info.title ?? 'resultado';
    steps.push(
      { t: 'go', tx: target.x, ty: target.y, held },
      {
        t: 'do',
        fn: () => {
          ch.dir = facing(ch.x, ch.y, parent.x, parent.y);
          ch.showBubble('📦', `Entregando: ${title}`, 3000, this.now);
          ch.setIcon('box', 2800, this.now);
          parent.setIcon(parent.rng() < 0.5 ? 'heart' : 'check', 2800, this.now);
        },
      },
      { t: 'act', pose: 'talk', held, ms: 2700 },
      {
        t: 'do',
        fn: () => {
          ch.delivered = true;
          ch.mode = 'leave';
          this.social.delivered(ch, this.now);
        },
      },
    );
    ch.queue.push(...steps);
    return true;
  }

  /** Tile caminhável ao lado de alguém (evitando assentos e tiles ocupados), o mais próximo de quem vem. */
  private besideTile(target: Character, from: Character): { x: number; y: number } {
    const grid = this.building.grid;
    const busy = this.busyTiles(from.id, target.id);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      const x = target.tx + dx;
      const y = target.ty + dy;
      const cell = grid.get(x, y);
      if (cell === 0) continue;
      const d = Math.abs(x - from.tx) + Math.abs(y - from.ty) + (cell === SEAT ? 20 : 0) + (busy.has(y * grid.w + x) ? 40 : 0) + (dx && dy ? 3 : 0);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best ?? grid.nearestWalkable(target.tx, target.ty) ?? { x: target.tx, y: target.ty };
  }

  /** Tiles (índice y*w+x) onde há alguém parado ou indo parar, exceto `a` e `b`. */
  busyTiles(a: string, b?: string): Set<number> {
    const w = this.building.grid.w;
    const out = new Set<number>();
    for (const c of this.chars.values()) {
      if (c.gone || c.id === a || c.id === b) continue;
      out.add(c.ty * w + c.tx);
      const go = c.step?.t === 'go' ? c.step : c.queue.find((s): s is Extract<Step, { t: 'go' }> => s.t === 'go');
      if (go) out.add(go.ty * w + go.tx);
      if (c.standTile) out.add(c.standTile.y * w + c.standTile.x);
    }
    return out;
  }

  private randomFree(kinds: SpotKind[], ch: Character): SpotDef | null {
    const cands: SpotDef[] = [];
    for (const k of kinds) for (const s of this.spots.ofKind(k)) if (this.spots.isFree(s.id, ch.id)) cands.push(s);
    if (!cands.length) return null;
    return cands[Math.floor(ch.rng() * cands.length)];
  }

  private planOuting(ch: Character, now: number): boolean {
    const near = { tx: ch.tx, ty: ch.ty };
    const rng = ch.rng;
    const persona = personaFor(ch.info.seed);
    // colegas à toa: a vontade é de companhia (a personalidade dosa) — TV, jogo, papo, aposta...
    if (this.social.hasCompany(ch, now) && rng() < 0.45 + persona.sociability * 0.4 && this.social.tryInitiate(ch, now, false)) return true;
    const avail: Partial<Record<IdleActivity, boolean>> = {
      coffee: !!this.spots.findFree('coffee', { by: ch.id }),
      water: !!this.spots.findFree('water', { by: ch.id }),
      bathroom: !!this.spots.findFree('stall', { by: ch.id }),
      lounge: LOUNGE_SEATS.some((k) => !!this.spots.findFree(k, { by: ch.id })),
      // jogos e conversas são rodas (social/): aqui só o que se faz sozinho
      pingpong: false,
      talk: false,
      window: !!this.spots.findFree('window', { by: ch.id }),
      shelf: !!this.spots.findFree('shelf', { by: ch.id }),
      arcade: !!this.spots.findFree('arcade', { by: ch.id }),
      snack: !!this.spots.findFree('snack', { by: ch.id }),
      stretch: true,
      mirror: !!this.social.plan('mirror', 1, ch),
      phone: !!this.randomFree(PHONE_SEATS, ch),
    };
    const what = pickIdleActivity(rng, avail, soloWeights(persona));
    if (!what) return false;
    const steps: Step[] = [];
    const goUse = (s: SpotDef, held: 'none' | 'coffee' = 'none'): void => {
      steps.push({ t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir: s.dir, held });
    };
    const release = (s: SpotDef) => steps.push({ t: 'do', fn: () => this.spots.release(s.id, ch.id) });
    let carry: 'none' | 'coffee' | 'water' = 'none';

    switch (what) {
      case 'coffee': {
        const s = this.spots.findFree('coffee', { near, by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: 1900, machine: s.furnitureId, icon: 'coffee' }, { t: 'act', pose: 'drink', held: 'coffee', ms: 2600 });
        release(s);
        carry = 'coffee';
        if (rng() < 0.45) {
          const seat = this.spots.findFree('cafe_seat', { by: ch.id, rng, near: { tx: s.tx, ty: s.ty } });
          if (seat && this.reserveTemp(ch, seat)) {
            steps.push(
              { t: 'go', tx: seat.tx, ty: seat.ty, held: 'coffee' },
              { t: 'enter', spot: seat.id },
              { t: 'act', pose: 'sit', held: 'coffee', ms: between(rng, 6000, 15000) },
              { t: 'exit' },
            );
            release(seat);
          }
        }
        break;
      }
      case 'water': {
        const s = this.spots.findFree('water', { near, by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: 1000 }, { t: 'act', pose: 'drink', held: 'water', ms: 2500 });
        release(s);
        carry = rng() < 0.4 ? 'water' : 'none';
        break;
      }
      case 'bathroom': {
        const s = this.spots.findFree('stall', { by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'stall', spot: s.id, ms: between(rng, 5000, 12000), phase: 0 });
        release(s);
        const sink = this.spots.findFree('sink', { near: { tx: s.tx, ty: s.ty }, by: ch.id });
        if (sink && this.reserveTemp(ch, sink)) {
          goUse(sink);
          steps.push({ t: 'act', pose: 'use', ms: 2200 });
          release(sink);
        }
        break;
      }
      case 'lounge': {
        const s = this.randomFree(LOUNGE_SEATS, ch);
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'enter', spot: s.id });
        if (rng() < (hasTrait(persona, 'sonecas') ? 0.7 : 0.25)) steps.push({ t: 'act', pose: 'sit', ms: between(rng, 3000, 6000) }, { t: 'act', pose: 'sleep', ms: between(rng, 8000, 16000), icon: 'zzz' });
        else steps.push({ t: 'act', pose: 'sit', ms: between(rng, 9000, 22000), icon: rng() < 0.3 ? 'music' : undefined });
        steps.push({ t: 'exit' });
        release(s);
        break;
      }
      case 'pingpong':
      case 'talk':
        return this.social.tryInitiate(ch, now, false);
      case 'mirror':
        return this.social.startSolo('mirror', ch, now);
      case 'phone': {
        // senta num puff/sofá/banco e fica rolando o celular
        const s = this.randomFree(PHONE_SEATS, ch);
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'enter', spot: s.id }, { t: 'act', pose: 'read', held: 'phone', ms: between(rng, 8000, 18000) }, { t: 'exit' });
        release(s);
        break;
      }
      case 'window': {
        // olhar pela janela ou dar uma conferida no quadro kanban da própria sala
        const board = rng() < 0.35 ? this.spots.findFree('whiteboard', { by: ch.id, filter: (p) => p.areaId === ch.roomId }) : null;
        const s = board ?? this.spots.findFree('window', { by: ch.id, rng });
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: board ? 'read' : 'stand', held: board ? 'papers' : 'none', ms: between(rng, 5000, 10000), icon: rng() < 0.3 ? 'idea' : undefined });
        release(s);
        break;
      }
      case 'shelf': {
        const s = this.spots.findFree('shelf', { by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'read', held: 'book', ms: between(rng, 5000, 9000) });
        release(s);
        break;
      }
      case 'arcade': {
        const s = this.spots.findFree('arcade', { by: ch.id, rng })!;
        if (!this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: between(rng, 6000, 12000), icon: rng() < 0.4 ? 'star' : undefined });
        release(s);
        break;
      }
      case 'snack': {
        // máquina de snacks ou geladeira da copa
        const s = this.spots.findFree(rng() < 0.6 ? 'snack' : 'fridge', { by: ch.id, rng }) ?? this.spots.findFree('snack', { by: ch.id, rng });
        if (!s || !this.reserveTemp(ch, s)) return false;
        this.pushLeave(ch, steps);
        goUse(s);
        steps.push({ t: 'act', pose: 'use', ms: 1600 }, { t: 'act', pose: 'stand', ms: 900 });
        release(s);
        break;
      }
      case 'stretch': {
        const home = ch.homeSpot;
        if (!home) return false;
        steps.push({ t: 'exit' }, { t: 'act', pose: 'stretch', ms: 2600 }, { t: 'enter', spot: home });
        steps.push({ t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) });
        ch.queue.push(...steps);
        return true;
      }
    }
    ch.queue.push(...steps);
    this.pushHome(ch, carry);
    void now;
    return true;
  }

  /** Volta para a mesa ao final de um passeio. */
  pushHome(ch: Character, held: 'none' | 'coffee' | 'water'): void {
    const home = this.spots.get(ch.homeSpot);
    ch.queue.push({ t: 'do', fn: () => this.releaseTemp(ch) });
    if (!home) return;
    ch.queue.push({ t: 'go', tx: home.tx, ty: home.ty, held }, { t: 'enter', spot: home.id });
    ch.queue.push({ t: 'do', fn: () => (ch.nextOutingAt = this.now + idleSitMs(ch.rng, this.options().liveliness)) });
  }

  /** Pose de descanso quando não há passos (na mesa: digitando, pedindo atenção, sentado ou cochilando). */
  private restPose(ch: Character, now: number): void {
    const spot = ch.atSpot ? this.spots.get(ch.atSpot) : undefined;
    const atHome = !!spot && ch.atSpot === ch.homeSpot;
    if (!spot) {
      // sem lugar (sala lotada): trabalha em pé com o notebook
      if (ch.mode === 'wait') ch.setPose('raise_hand');
      else if (ch.mode === 'work' && ch.standTile) ch.setPose('read', 'laptop');
      else ch.setPose('stand');
      return;
    }
    if (spot.kind === 'stand') {
      ch.dir = spot.dir;
      if (ch.mode === 'work') ch.setPose('read', 'laptop');
      else if (ch.mode === 'wait') ch.setPose('raise_hand');
      else ch.setPose('stand');
      return;
    }
    if (!spot.seated) {
      ch.setPose('stand');
      return;
    }
    ch.dir = spot.dir;
    // sem mesa (banqueta, poltrona, puff): trabalha no notebook
    const laptop = spot.kind === 'stool' || spot.kind === 'nook';
    if (atHome && ch.mode === 'work') ch.setPose('type', laptop ? 'laptop' : 'none');
    else if (atHome && ch.mode === 'wait') ch.setPose('raise_hand');
    else if (atHome && ch.mode === 'shell') this.shellPose(ch, spot, now);
    else if (ch.mode === 'idle' && isLongIdle(ch.info.status, ch.info.statusSince, now, this.options().passearOcioso)) ch.setPose('sleep');
    else ch.setPose('sit');
  }

  /**
   * Pose da espera de shell sentado na mesa, pela escalada (sim/shell.ts): pipoca, braços cruzados
   * com giros na cadeira, bocejos sob a teia e, por fim, o cochilo. Sem alocação (roda por frame).
   */
  private shellPose(ch: Character, spot: SpotDef, now: number): void {
    const age = now - ch.shellSince;
    switch (ch.shellStage ?? shellStage(age)) {
      case 'popcorn':
        ch.setPose('wait', 'popcorn');
        return;
      case 'restless': {
        // giro completo na cadeira (direções em sequência rápida), de braços cruzados
        ch.dir = spinDir(spinPhase(age, ch.info.seed), spot.dir);
        ch.setPose('wait');
        return;
      }
      case 'cobweb': {
        const yawn = yawnPhase(age, ch.info.seed);
        if (yawn >= 0) {
          // bocejo: a cabeça pende e um 🥱 escapa
          if (now > ch.chatUntil) {
            ch.chatEmoji = '🥱';
            ch.chatUntil = now + 1300;
          }
          ch.setPose('sleep');
        } else ch.setPose('wait');
        return;
      }
      case 'nap':
        ch.setPose('sleep');
        return;
    }
  }

  // =================================================================== aba oculta

  /** Avança tudo instantaneamente para os destinos (usado ao voltar de uma aba oculta). */
  fastForward(now: number): void {
    this.now = now;
    for (const room of this.rooms.values()) {
      if (room.phase === 'building') room.setPhase('ready', now - 10_000);
      if (room.phase === 'dismantling') room.setPhase('gone', now);
      room.lightAt = now - 10_000;
    }
    this.updateRooms(now);
    for (const e of this.elevators) e.reset();
    this.machineUntil.clear();
    this.social.reset(now);
    for (const ch of [...this.chars.values()]) {
      for (let guard = 0; guard < 60 && !ch.gone; guard++) {
        if (!ch.step) ch.step = ch.queue.shift() ?? null;
        if (!ch.step) break;
        this.finishStep(ch, ch.step, now);
        ch.step = null;
      }
      ch.gathering = null;
      if (ch.leaving && !ch.gone) ch.gone = true;
      if (ch.gone) {
        this.spots.releaseAll(ch.id);
        this.chars.delete(ch.id);
        continue;
      }
      ch.alpha = 1;
      ch.inside = false;
      ch.arriving = false;
      ch.hiddenUntil = 0;
      ch.stepT = 0;
      if (ch.mode === 'work' || ch.mode === 'wait' || ch.mode === 'idle' || ch.mode === 'shell') {
        ch.reactUntil = 0;
        this.assignHome(ch);
        const home = this.spots.get(ch.homeSpot);
        if (home) {
          this.snapTo(ch, home);
          ch.standTile = null;
        } else {
          ch.atSpot = null;
          ch.seated = false;
          ch.sortY = null;
          this.placeOverflow(ch);
        }
        this.releaseTemp(ch);
        ch.nextOutingAt = now + idleSitMs(ch.rng, this.options().liveliness);
      }
    }
    for (const room of this.rooms.values()) {
      if (room.present && this.occupants(room) > 0) room.setLight(true, now - 10_000);
      room.switchClaim = null;
    }
    this.stallBusy.clear();
  }

  private finishStep(ch: Character, s: Step, now: number): void {
    switch (s.t) {
      case 'go':
        ch.placeAtTile(s.tx, s.ty);
        if (s.fx !== undefined && s.fy !== undefined) {
          ch.x = s.fx;
          ch.y = s.fy;
        }
        if (s.dir) ch.dir = s.dir;
        break;
      case 'enter': {
        const spot = this.spots.get(s.spot);
        if (spot) this.snapTo(ch, spot);
        break;
      }
      case 'exit':
        if (ch.atSpot) {
          const spot = this.spots.get(ch.atSpot);
          if (spot) ch.placeAtTile(spot.tx, spot.ty);
        }
        ch.atSpot = null;
        ch.seated = false;
        ch.sortY = null;
        break;
      case 'switch': {
        const room = this.rooms.get(s.room);
        if (room && (!s.onlyIfLast || isLastInRoom(room.id, ch.id, this.chars.values()))) room.setLight(s.on, now - 10_000);
        break;
      }
      case 'stall': {
        const spot = this.spots.get(s.spot);
        if (spot) ch.placeAtTile(spot.tx, spot.ty);
        break;
      }
      case 'elevOut': {
        const el = this.elevators[s.elev] ?? this.elevators[0];
        const spot = this.spots.get(el.spotId);
        if (spot) ch.placeAtTile(spot.tx, spot.ty);
        break;
      }
      case 'do':
        s.fn();
        break;
      case 'remove':
      case 'elevIn':
        ch.gone = true;
        break;
      default:
        break;
    }
  }
}
