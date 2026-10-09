// Rodas (atividades em grupo dos ociosos): tipos e regras PURAS — escolha da atividade pela
// personalidade, apostas, jokenpô e quem vence uma partida. O roteiro de cada roda (quem fala,
// comemora, paga) fica em social.ts.
import type { Dir, HeldItem, Pose } from '../../art/api';
import { hasTrait, type Bond, type Persona, type TraitId } from './persona';

export type GatherKind = 'tv' | 'videogame' | 'arcade' | 'pingpong' | 'kitchen' | 'talk' | 'rps' | 'mirror';
export type Role = 'player' | 'watcher' | 'talker';
export type Program = 'futebol' | 'novela' | 'desenho';
export type Gesture = 'rock' | 'paper' | 'scissors';

/** Programa da TV -> seed de drawScreen('show') (contrato da arte: seed % 3). */
export const PROGRAM_SEED: Readonly<Record<Program, number>> = { futebol: 0, novela: 1, desenho: 2 };

export interface KindInfo {
  /** "Vendo TV" — para a interface ("Vendo TV com Rafaela"). */
  label: string;
  emoji: string;
  /** Mínimo de participantes para a roda acontecer. */
  min: number;
  /** Máximo (jogadores + torcida). */
  max: number;
  /** Sozinho também vale (só para quem está ocioso; quem espera shell só entra em grupo). */
  solo?: boolean;
  /** Jogo com vencedor (pode ter aposta). */
  match?: boolean;
}

export const KINDS: Readonly<Record<GatherKind, KindInfo>> = {
  tv: { label: 'Vendo TV', emoji: '📺', min: 2, max: 5 },
  videogame: { label: 'Jogando videogame', emoji: '🎮', min: 2, max: 5, match: true },
  arcade: { label: 'Duelo no fliperama', emoji: '👾', min: 2, max: 2, match: true },
  pingpong: { label: 'Jogando pingue-pongue', emoji: '🏓', min: 2, max: 4, match: true },
  kitchen: { label: 'Papo na copa', emoji: '☕', min: 2, max: 4 },
  talk: { label: 'Conversando', emoji: '💬', min: 2, max: 2 },
  rps: { label: 'Jokenpô', emoji: '✊', min: 2, max: 4, match: true },
  mirror: { label: 'Se arrumando no espelho', emoji: '💄', min: 1, max: 2, solo: true },
};

export interface Member {
  id: string;
  role: Role;
  /** Spot reservado pela roda (assento, ponto de uso, ponto da torcida) ou null (em pé num tile). */
  spot: string | null;
  /** Em pé sem spot (torcida do jokenpô). */
  tile?: { x: number; y: number; dir: Dir };
  arrived: boolean;
  left: boolean;
  /** Entrou com a roda já formada (ou se formando): ninguém espera por ele para começar. */
  late?: boolean;
  /** Pose de base enquanto participa. */
  pose: Pose;
  held: HeldItem;
  /** Ação curta por cima da pose de base (comemorar, rir, gesto...). */
  actPose: Pose | null;
  actHeld: HeldItem;
  actUntil: number;
  /** O que segura ao voltar para a mesa (o café da copa). */
  carry: 'none' | 'coffee' | 'water';
}

export interface Gathering {
  id: number;
  kind: GatherKind;
  host: string;
  members: Member[];
  /** gather: indo para os lugares; run: rolando; final: comemoração/despedida; ended: acabou. */
  phase: 'gather' | 'run' | 'final' | 'ended';
  createdAt: number;
  startAt: number;
  /** Fim previsto (atividades sem placar). */
  until: number;
  /** Próxima batida do roteiro. */
  nextAt: number;
  /** Contador de batidas (uso livre por roteiro). */
  step: number;
  seed: number;
  rng: () => number;
  program: Program | null;
  /** Moedinhas em jogo (0 = só pela honra). */
  bet: number;
  /** Placar [jogador 0, jogador 1]. */
  score: [number, number];
  gestures: [Gesture, Gesture] | null;
  ties: number;
  rematches: number;
  winner: string | null;
  loser: string | null;
  /** Spots reservados pela roda (dono `g:<id>`), devolvidos quando ela acaba. */
  pool: string[];
  lastLine: string | null;
  lastSpeaker: string | null;
  /** Falas agendadas (ex.: o "bora!" de quem foi convidado, um pouco depois do convite). */
  pending: { id: string; at: number; text: string }[];
}

export function ownerTag(g: Pick<Gathering, 'id'>): string {
  return `g:${g.id}`;
}

export function players(g: Gathering): Member[] {
  return g.members.filter((m) => m.role === 'player' && !m.left);
}

export function active(g: Gathering): Member[] {
  return g.members.filter((m) => !m.left);
}

// ---------------------------------------------------------------- escolha da atividade

const BASE: Readonly<Record<GatherKind, number>> = {
  tv: 10,
  videogame: 9,
  arcade: 5,
  pingpong: 9,
  kitchen: 12,
  talk: 8,
  rps: 8,
  mirror: 2,
};

/** Quanto cada traço multiplica a vontade de cada roda. */
const TRAIT_K: Partial<Record<TraitId, Partial<Record<GatherKind, number>>>> = {
  series: { tv: 3 },
  games: { videogame: 3, arcade: 2.5 },
  esporte: { pingpong: 3, tv: 1.3 },
  competicao: { pingpong: 1.8, videogame: 1.8, rps: 1.8, arcade: 1.5 },
  apostas: { rps: 3.5 },
  fofoca: { kitchen: 2.5, talk: 1.8 },
  cafeina: { kitchen: 2.2 },
  piadas: { kitchen: 1.5, talk: 1.5 },
  vaidade: { mirror: 5 },
  timidez: { talk: 0.6, kitchen: 0.7, rps: 0.6, pingpong: 0.7, videogame: 0.8 },
  sonecas: { tv: 1.5, pingpong: 0.6 },
  economia: { rps: 0.4 },
  calma: { talk: 1.3, kitchen: 1.2, rps: 0.5, pingpong: 0.7 },
  leitura: { tv: 0.8 },
};

export function kindWeight(kind: GatherKind, p: Persona): number {
  let w = BASE[kind];
  for (const t of p.traits) w *= TRAIT_K[t]?.[kind] ?? 1;
  return w;
}

/** Sorteio ponderado entre as rodas possíveis agora (`avail[k]` true). */
export function pickKind(rng: () => number, p: Persona, avail: Partial<Record<GatherKind, boolean>>): GatherKind | null {
  const kinds = (Object.keys(BASE) as GatherKind[]).filter((k) => avail[k]);
  let total = 0;
  for (const k of kinds) total += kindWeight(k, p);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const k of kinds) {
    r -= kindWeight(k, p);
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1] ?? null;
}

/**
 * Nota de um colega como parceiro numa roda: afinidade com a atividade, vínculo (amizade puxa
 * para qualquer roda; rivalidade para os jogos) e um pouco de acaso.
 */
export function partnerScore(kind: GatherKind, p: Persona, bond: Bond | null, rng: () => number): number {
  let s = kindWeight(kind, p) / BASE[kind] + p.sociability;
  if (bond === 'amizade') s += 1.2;
  if (bond === 'rivalidade') s += KINDS[kind].match ? 1.6 : -0.8;
  return s + rng() * 1.2;
}

/** Programa da TV, pelo gosto de quem liga. */
export function pickProgram(rng: () => number, p: Persona): Program {
  if (hasTrait(p, 'esporte') && rng() < 0.7) return 'futebol';
  if (hasTrait(p, 'series') && rng() < 0.6) return 'novela';
  const r = rng();
  return r < 0.4 ? 'futebol' : r < 0.75 ? 'novela' : 'desenho';
}

// ---------------------------------------------------------------- apostas e partidas

/** Teto de uma aposta. */
export const MAX_BET = 50;

/**
 * Valor em jogo (0 = só pela honra). Jokenpô sempre vale algo quando os dois têm moedinhas;
 * nas partidas, só entre rivais ou com alguém de "apostas" na roda.
 */
export function betFor(kind: GatherKind, a: Persona, b: Persona, coinsA: number, coinsB: number, bond: Bond | null, rng: () => number): number {
  const cap = Math.min(coinsA, coinsB, MAX_BET);
  if (cap < 1) return 0;
  let v: number;
  if (kind === 'rps') {
    v = 10;
    if (hasTrait(a, 'apostas') || hasTrait(b, 'apostas')) v = 20;
    if (hasTrait(a, 'competicao')) v += 5;
  } else if (KINDS[kind].match) {
    const keen = bond === 'rivalidade' || hasTrait(a, 'apostas') || hasTrait(b, 'apostas');
    if (!keen && !(hasTrait(a, 'competicao') && rng() < 0.35)) return 0;
    if (keen && rng() < 0.3) return 0;
    v = bond === 'rivalidade' ? 15 : 10;
  } else return 0;
  if (hasTrait(a, 'economia') || hasTrait(b, 'economia')) v = 5;
  return Math.max(1, Math.min(cap, v));
}

/** Quem ganha no jokenpô: 0 empate, 1 o primeiro, 2 o segundo. */
export function rpsResult(a: Gesture, b: Gesture): 0 | 1 | 2 {
  if (a === b) return 0;
  const beats: Record<Gesture, Gesture> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  return beats[a] === b ? 1 : 2;
}

export const GESTURES: readonly Gesture[] = ['rock', 'paper', 'scissors'];

/** Gesto escolhido (quem é de "competição" tem uma quedinha pela pedra). */
export function pickGesture(rng: () => number, p: Persona): Gesture {
  if (hasTrait(p, 'competicao') && rng() < 0.2) return 'rock';
  return GESTURES[Math.floor(rng() * 3) % 3];
}

/** Probabilidade de A vencer um ponto/rodada contra B, pela habilidade (0,15–0,85). */
export function winChance(skillA: number, skillB: number): number {
  return Math.max(0.15, Math.min(0.85, 0.5 + (skillA - skillB) * 0.6));
}

/** Pontos para vencer cada jogo. */
export const TARGET: Readonly<Partial<Record<GatherKind, number>>> = { pingpong: 5, videogame: 2, arcade: 1 };

/** Ícone de cada gesto acima da cabeça (contrato da arte). */
export const GESTURE_ICON = { rock: 'hand_rock', paper: 'hand_paper', scissors: 'hand_scissors' } as const;
export const GESTURE_EMOJI: Readonly<Record<Gesture, string>> = { rock: '✊', paper: '✋', scissors: '✌️' };
