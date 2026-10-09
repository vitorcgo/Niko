// Decisões de comportamento — funções PURAS (testáveis sem DOM).
import type { ActivityKind, AgentKind, AgentStatus, ShellJob } from '../../../../shared/types';
import type { ScreenMode } from '../../art/api';
import type { WorldOptions } from '../api';
import type { SpotDef } from '../layout/types';
import { foregroundWaiting } from './shell';

/**
 * Modo de alto nível do personagem (deriva do status do agente).
 * 'shell' = esperando um shell terminar: fica na mesa (sem passear) com a gag da espera (sim/shell.ts).
 */
export type Mode = 'work' | 'wait' | 'idle' | 'shell' | 'deliver' | 'leave';

export function modeFor(
  status: AgentStatus,
  opts: { kind: AgentKind; missing?: boolean; parentGone?: boolean; shells?: readonly ShellJob[]; now?: number },
): Mode {
  if (opts.missing || status === 'offline') return 'leave';
  if (status === 'done') return opts.kind === 'sub' ? 'deliver' : 'idle';
  if (opts.kind === 'sub' && opts.parentGone) return 'leave';
  if (status === 'waiting') return 'wait';
  if (status === 'shell') return 'shell';
  // trabalhando, mas parado esperando um comando longo em primeiro plano
  if (status === 'working') return opts.now !== undefined && foregroundWaiting(opts.shells, opts.now) ? 'shell' : 'work';
  return 'idle';
}

/** O que aparece no monitor de quem trabalha, conforme o tipo da atividade. */
export function screenModeFor(kind: ActivityKind | undefined): ScreenMode {
  switch (kind) {
    case 'edit':
    case 'write':
    case 'think':
      return 'code';
    case 'run':
    case 'test':
    case 'git':
      return 'terminal';
    case 'web':
    case 'browser':
    case 'mcp':
      return 'browser';
    case 'search':
      return 'search';
    case 'read':
    case 'respond':
    case 'compact':
      return 'docs';
    case 'plan':
      return 'tasks';
    case 'communicate':
    case 'ask':
    case 'prompt':
    case 'delegate':
      return 'chat';
    case 'wait':
    case 'error':
      return 'alert';
    case 'skill':
      return 'tasks';
    case 'done':
      return 'idle';
    default:
      return 'code';
  }
}

export type IdleActivity = 'coffee' | 'water' | 'bathroom' | 'lounge' | 'pingpong' | 'talk' | 'window' | 'shelf' | 'stretch' | 'arcade' | 'snack' | 'mirror' | 'phone';

export const IDLE_WEIGHTS: Readonly<Record<IdleActivity, number>> = {
  coffee: 18,
  water: 12,
  bathroom: 8,
  lounge: 12,
  pingpong: 9,
  talk: 13,
  window: 7,
  shelf: 6,
  stretch: 8,
  arcade: 5,
  snack: 5,
  mirror: 3,
  phone: 6,
};

/** Sorteio ponderado entre as atividades disponíveis (`avail[k] === false` exclui). */
export function pickIdleActivity(
  rng: () => number,
  avail: Partial<Record<IdleActivity, boolean>> = {},
  weights: Readonly<Record<IdleActivity, number>> = IDLE_WEIGHTS,
): IdleActivity | null {
  let total = 0;
  for (const k of Object.keys(IDLE_WEIGHTS) as IdleActivity[]) if (avail[k] !== false) total += weights[k];
  if (total <= 0) return null;
  let r = rng() * total;
  for (const k of Object.keys(IDLE_WEIGHTS) as IdleActivity[]) {
    if (avail[k] === false) continue;
    r -= weights[k];
    if (r < 0) return k;
  }
  return null;
}

const SIT_RANGE: Record<WorldOptions['liveliness'], [number, number]> = {
  calm: [16_000, 42_000],
  normal: [6_000, 20_000],
  lively: [3_000, 10_000],
};

/** Quanto tempo o ocioso fica sentado na mesa antes do próximo passeio. */
export function idleSitMs(rng: () => number, liveliness: WorldOptions['liveliness']): number {
  const [a, b] = SIT_RANGE[liveliness] ?? SIT_RANGE.normal;
  return a + rng() * (b - a);
}

/** Ocioso há mais que isso: cochila na mesa e para de passear. */
export const LONG_IDLE_MS = 10 * 60_000;

export function isLongIdle(status: AgentStatus, statusSince: number, now: number, passearOcioso = false): boolean {
  return !passearOcioso && status === 'idle' && now - statusSince > LONG_IDLE_MS;
}

/**
 * Lugar de trabalho: mesa livre (por ordem de preferência); sem mesa, banqueta do canto de
 * reunião, depois poltrona/puff da sala e, por fim, um ponto em pé.
 */
export function chooseSeat(spots: readonly SpotDef[], isFree: (id: string) => boolean, _kind: AgentKind): SpotDef | null {
  const desks = spots.filter((s) => s.kind === 'desk' && isFree(s.id)).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (desks.length) return desks[0];
  for (const kind of ['stool', 'nook', 'stand'] as const) {
    const free = spots.find((s) => s.kind === kind && isFree(s.id));
    if (free) return free;
  }
  return null;
}

/** Corre para a mesa se estiver longe (ou sempre que precisa do usuário). Esperando um shell: só se estiver muito longe. */
export function shouldRun(pathTiles: number, mode: Mode): boolean {
  if (mode === 'wait') return pathTiles > 2;
  if (mode === 'work') return pathTiles > 12;
  if (mode === 'shell') return pathTiles > 20;
  return false;
}

/** É o último personagem (não saindo) pertencente à sala? */
export function isLastInRoom(roomId: string, selfId: string, chars: Iterable<{ id: string; roomId: string; leaving: boolean }>): boolean {
  for (const c of chars) if (c.id !== selfId && c.roomId === roomId && !c.leaving) return false;
  return true;
}

/** Sala pode ser desmontada: o servidor não a lista, ninguém dentro e luz apagada há algum tempo. */
export function canDismantle(r: { listed: boolean; occupants: number; lightOn: boolean; dark: boolean; unlistedForMs: number }, delayMs: number): boolean {
  return !r.listed && r.occupants === 0 && !r.lightOn && r.dark && r.unlistedForMs >= delayMs;
}

/**
 * Nível de luz (0–1) da animação de acender/apagar.
 * Acender: pisca algumas vezes antes de firmar. Apagar: leve tremida e fade de ~0,6s.
 */
export function lightLevel(on: boolean, elapsedMs: number): number {
  const e = Math.max(0, elapsedMs);
  if (on) {
    if (e < 70) return 0.75;
    if (e < 160) return 0.1;
    if (e < 220) return 0.9;
    if (e < 330) return 0.25;
    return Math.min(1, 0.25 + (e - 330) / 220);
  }
  if (e < 60) return 0.55;
  if (e < 120) return 0.95;
  return Math.max(0, 0.95 * (1 - (e - 120) / 480));
}
