// Timelapse no mundo: durante o replay a simulação roda num relógio próprio, acelerado por um fator
// de animação moderado (andar 1 h de gravação em 6 s não caberia em passos de verdade), enquanto os
// snapshots chegam no relógio da gravação, bem mais rápido. Para os limiares que comparam o snapshot
// com o "agora" (cochilo depois de 10 min ocioso, estágios da espera de shell, comando em primeiro
// plano demorado), as idades são preservadas: os horários do snapshot são deslocados para o relógio
// do mundo no momento em que ele é aplicado (rebaseSnapshot).
import type { OfficeSnapshot } from '../../../shared/types';

/**
 * Fator de animação do mundo para uma velocidade de reprodução: ~raiz da velocidade, entre 1 e 16
 * (60× -> 6, 180× -> 10, 600× -> 16). Acima disso os personagens só se teletransportariam.
 */
export function animScale(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.min(16, Math.max(1, Math.round(Math.sqrt(speed) * 0.75)));
}

/**
 * Desloca para o relógio do mundo os horários do snapshot que o mundo compara com o "agora":
 * `statusSince` e o início dos shells. As atividades ficam como estão (o mundo só as compara entre si).
 */
export function rebaseSnapshot(snap: OfficeSnapshot, delta: number): OfficeSnapshot {
  if (!delta) return snap;
  return {
    ...snap,
    serverTime: snap.serverTime + delta,
    agents: snap.agents.map((a) => {
      const out = { ...a, statusSince: a.statusSince + delta };
      if (a.shells) out.shells = a.shells.map((j) => ({ ...j, startedAt: j.startedAt + delta }));
      return out;
    }),
  };
}
