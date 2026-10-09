// GitHub no escritório, lado da simulação: a festa e o alarme das salas que chegam no snapshot
// (RoomInfo.effect), com os horários do servidor convertidos para o relógio do navegador, e a
// comemoração dos personagens no começo da festa. O desenho (confete, giroflex, tom vermelho no
// chão, faixa e balão "!") fica em render/github-fx.ts.
import type { RoomInfo } from '../../../../shared/types';
import { hash32 } from '../../../../shared/hash';
import { inRect } from '../layout/geometry';
import type { Character } from './character';
import type { Sim } from './sim';

/** Efeito ativo numa sala, no relógio do navegador. */
export interface RoomFx {
  roomId: string;
  kind: 'party' | 'alarm';
  text: string;
  /** Agente responsável (quem abriu/mergeou; quem viu o CI falhar). */
  agentId?: string;
  /** `at` do servidor: identifica o efeito (outro valor = efeito novo, a animação recomeça). */
  key: number;
  /** Início e fim no relógio do navegador. */
  start: number;
  end: number;
  /** Quem já comemorou esta festa. */
  cheered: Set<string>;
  /** Forçado pela depuração (debug.roomEffect): o snapshot não apaga. */
  sticky?: boolean;
}

/** Duração dos pulinhos com os braços para cima ('cheer': 2 quadros de 260 ms). */
export const PARTY_CHEER_MS = 2_600;
/** Entrada/saída do assento (igual à da simulação). */
const SEAT_MS = 180;
/** Atraso máximo de cada um para começar a comemorar (a sala não pula em uníssono). */
const CHEER_STAGGER_MS = 700;
/** Festa com menos tempo que isto pela frente não começa comemoração nova. */
const CHEER_MIN_LEFT_MS = 3_000;

/** Concilia os efeitos das salas com o snapshot. Puro (sem DOM), testável. */
export class RoomFxState {
  readonly active = new Map<string, RoomFx>();

  /**
   * Aplica os efeitos do snapshot. Relógios do servidor e do navegador podem divergir: o que vale é
   * quanto já passou e quanto falta segundo o próprio servidor (`serverTime`).
   */
  sync(rooms: readonly RoomInfo[], serverTime: number, now: number): void {
    const seen = new Set<string>();
    for (const r of rooms) {
      const e = r.effect;
      if (!e || e.until <= serverTime) continue;
      seen.add(r.id);
      const end = now + (e.until - serverTime);
      const cur = this.active.get(r.id);
      if (cur && cur.key === e.at && cur.kind === e.kind) {
        cur.end = end;
        cur.text = e.text;
        cur.agentId = e.agentId;
        continue;
      }
      const elapsed = Math.max(0, Math.min(serverTime - e.at, e.until - e.at));
      this.active.set(r.id, { roomId: r.id, kind: e.kind, text: e.text, agentId: e.agentId, key: e.at, start: now - elapsed, end, cheered: new Set() });
    }
    for (const [id, fx] of [...this.active]) if (!seen.has(id) && !fx.sticky) this.active.delete(id);
  }

  /** Efeito visível da sala agora, se houver. */
  get(roomId: string, now: number): RoomFx | undefined {
    const fx = this.active.get(roomId);
    return fx && now < fx.end ? fx : undefined;
  }

  /** Quem está com o alarme da própria sala ligado (o balão "!"): id do agente -> efeito. */
  alarmOwner(agentId: string, now: number): RoomFx | undefined {
    for (const fx of this.active.values()) if (fx.kind === 'alarm' && fx.agentId === agentId && now < fx.end) return fx;
    return undefined;
  }

  /** Esquece os vencidos e faz a sala comemorar as festas em andamento. */
  update(sim: Sim, now: number): void {
    for (const [id, fx] of this.active) {
      if (now >= fx.end) {
        this.active.delete(id);
        continue;
      }
      if (fx.kind === 'party' && fx.end - now >= CHEER_MIN_LEFT_MS) celebrate(sim, fx, now);
    }
  }
}

/** Atraso determinístico de cada personagem para começar a comemorar. */
export function cheerDelay(charId: string): number {
  return hash32(charId) % CHEER_STAGGER_MS;
}

/**
 * Comemoração da festa: quem está na própria mesa (ou lugar) e parado levanta e dá pulinhos com os
 * braços para cima; quem está andando, numa roda ou ocupado ganha um balãozinho 🎉. O responsável
 * ainda ganha a estrela e um confete. Quem precisa de você (mão levantada) ou está indo embora fica
 * de fora.
 */
export function celebrate(sim: Sim, fx: RoomFx, now: number): void {
  const room = sim.rooms.get(fx.roomId);
  if (!room || !room.present) return;
  for (const ch of sim.chars.values()) {
    if (fx.cheered.has(ch.id) || !inParty(ch, fx.roomId, room.layout.rect, now)) continue;
    if (now - fx.start < cheerDelay(ch.id)) continue;
    fx.cheered.add(ch.id);
    const mine = ch.id === fx.agentId;
    if (mine) {
      ch.setIcon('star', PARTY_CHEER_MS, now);
      sim.pushEffect({ kind: 'confetti', charId: ch.id, at: now });
    }
    const home = sim.spots.get(ch.homeSpot);
    if (home && ch.atSpot === home.id && !ch.step && !ch.queue.length && !ch.gathering) {
      ch.reactUntil = now + PARTY_CHEER_MS + 2 * SEAT_MS + 200;
      if (home.seated) ch.queue.push({ t: 'exit' });
      ch.queue.push({ t: 'act', pose: 'cheer', ms: PARTY_CHEER_MS });
      if (home.seated) ch.queue.push({ t: 'enter', spot: home.id });
    } else if (!mine) {
      ch.chatEmoji = '🎉';
      ch.chatUntil = now + 2_400;
    }
  }
}

/** Pode comemorar a festa desta sala: é dela (ou está lá dentro), visível e disponível. */
function inParty(ch: Character, roomId: string, rect: { x: number; y: number; w: number; h: number }, now: number): boolean {
  if (ch.gone || ch.leaving || ch.inside || ch.arriving || ch.alpha < 0.5 || now < ch.hiddenUntil) return false;
  if (ch.mode === 'wait' || ch.mode === 'leave' || ch.mode === 'deliver') return false;
  return ch.roomId === roomId || inRect(rect, ch.tx, ch.ty);
}
