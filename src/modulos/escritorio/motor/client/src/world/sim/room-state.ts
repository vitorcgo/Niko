// Estado de uma sala de projeto no mundo: ciclo de vida (construção/desmontagem) e luz.
import type { RoomInfo } from '../../../../shared/types';
import type { RoomTheme } from '../../art/api';
import { BUILD_MS, DISMANTLE_MS } from '../constants';
import type { AreaLayout } from '../layout/types';
import { lightLevel } from './behavior';

/**
 * - building: animação de construção;
 * - ready: sala pronta;
 * - dismantling: animação de desmontagem;
 * - gone: desmontada (será removida).
 */
export type RoomPhase = 'building' | 'ready' | 'dismantling' | 'gone';

export class RoomState {
  info: RoomInfo;
  /** Semente com que o tema e o layout foram gerados (fixa desde a criação, mesmo se info.seed mudar). */
  readonly seed: number;
  /** Vaga no prédio escolhida pelo cliente (sem buracos; ver Sim.compact). Pode diferir de info.slot. */
  slot: number;
  theme: RoomTheme;
  layout: AreaLayout;
  phase: RoomPhase;
  phaseAt: number;
  listed = true;
  unlistedAt = 0;
  lightOn: boolean;
  lightAt = -1e9;
  /** Personagem que se encarregou do interruptor (acender ao chegar / apagar ao sair). */
  switchClaim: string | null = null;
  /** Quando todas as condições de desmontagem ficaram verdadeiras (0 = não estão). */
  readyToDismantleAt = 0;
  /** Contas presentes (para as bolinhas da placa), atualizadas pelo mundo. */
  accounts: string[] = [];
  /** Itens do quadro kanban. */
  board: { status: 'pending' | 'in_progress' | 'completed' }[] = [];
  /** Incrementa quando algo do cache estático muda (nome, tema). */
  version = 0;
  /**
   * Endereço antigo de uma sala que se mudou: fica no lugar só até quem estava nela sair, apagar
   * e ser desmontado. Ninguém pertence a ela e ela não aparece no snapshot.
   */
  ghost = false;

  constructor(info: RoomInfo, theme: RoomTheme, layout: AreaLayout, phase: RoomPhase, now: number, lit: boolean, slot: number) {
    this.info = info;
    this.seed = info.seed;
    this.slot = slot;
    this.theme = theme;
    this.layout = layout;
    this.phase = phase;
    this.phaseAt = now;
    this.lightOn = lit;
    if (lit) this.lightAt = now - 10_000;
  }

  get id(): string {
    return this.info.id;
  }

  /** Progresso da animação da fase atual (0..1). */
  progress(now: number): number {
    if (this.phase === 'building') return Math.min(1, (now - this.phaseAt) / BUILD_MS);
    if (this.phase === 'dismantling') return Math.min(1, (now - this.phaseAt) / DISMANTLE_MS);
    if (this.phase === 'ready') return 1;
    return 0;
  }

  /** Ocupa a grade (caminhável) e é desenhada. */
  get present(): boolean {
    return this.phase === 'building' || this.phase === 'ready' || this.phase === 'dismantling';
  }

  setPhase(phase: RoomPhase, now: number): void {
    this.phase = phase;
    this.phaseAt = now;
  }

  /** Reverte uma desmontagem em andamento para construção, continuando do ponto visual equivalente. */
  rebuild(now: number): void {
    if (this.phase === 'dismantling') {
      const p = this.progress(now);
      this.phase = 'building';
      this.phaseAt = now - (1 - p) * BUILD_MS;
    } else if (this.phase === 'gone') {
      this.setPhase('building', now);
    }
  }

  setLight(on: boolean, now: number): void {
    if (this.lightOn === on) return;
    this.lightOn = on;
    this.lightAt = now;
  }

  light(now: number): number {
    return lightLevel(this.lightOn, now - this.lightAt);
  }
}
