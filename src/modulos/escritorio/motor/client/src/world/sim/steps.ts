// Passos da fila de ações de um personagem. Criados no planejamento (nunca por frame).
import type { Dir, HeldItem, IconName, Pose } from '../../art/api';
import type { Gathering } from '../social/gathering';

export type Step =
  /** Anda (ou corre) até o tile (tx, ty); depois, opcionalmente, até a posição fina (fx, fy) e vira para `dir`. */
  | { t: 'go'; tx: number; ty: number; run?: boolean; fx?: number; fy?: number; dir?: Dir; held?: HeldItem; path?: number[]; i?: number; fine?: boolean }
  /** Encaixa no spot (assento ou ponto de uso). Exige estar no tile de aproximação. */
  | { t: 'enter'; spot: string }
  /** Sai do spot atual de volta ao tile de aproximação (levantar). */
  | { t: 'exit' }
  /** Fica numa pose por um tempo. */
  | { t: 'act'; pose: Pose; ms: number; held?: HeldItem; dir?: Dir; icon?: IconName; machine?: string; seated?: boolean }
  /** Espera uma condição (ou o tempo máximo), numa pose. */
  | { t: 'until'; cond: () => boolean; minMs: number; maxMs: number; pose?: Pose; held?: HeldItem; dir?: Dir }
  /** Surge dentro do elevador e sai para o tile da frente. */
  | { t: 'elevOut'; elev: number; phase: number }
  /** Entra no elevador e some. */
  | { t: 'elevIn'; elev: number; phase: number }
  /** Usa a cabine do banheiro: entra, some, porta fecha; depois sai. */
  | { t: 'stall'; spot: string; ms: number; phase: number }
  /** Liga/desliga a luz da sala no interruptor (precisa estar no spot do interruptor). */
  | { t: 'switch'; room: string; on: boolean; phase: number; onlyIfLast?: boolean }
  /** Participa de uma roda (TV, jogo, papo...) até ela acabar; a pose vem do diretor (social/social.ts). */
  | { t: 'gather'; g: Gathering }
  /** Efeito colateral imediato. */
  | { t: 'do'; fn: () => void }
  /** Remove o personagem do mundo. */
  | { t: 'remove' };
