import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { PomodoroStage, PomodoroSession } from "../types";
import { generateId } from "../utils/basics";
import { useConfig } from "./settings";

interface StatePomodoro {
  etapa: PomodoroStage;
  rodando: boolean;
  terminaEm: number | null;
  restanteMs: number | null;
  duracaoMs: number;
  inicioEtapa: string | null;
  ciclo: number;
  materiaId?: string;
  tarefaId?: string;
  sessoes: PomodoroSession[];
  start: (minutes?: number) => void;
  pausar: () => void;
  resume: () => void;
  toggle: () => void;
  restart: () => void;
  stop: () => void;
  skip: () => void;
  completeStage: (statusValue?: "concluida" | "interrompida") => PomodoroStage;
  selectStage: (stage: PomodoroStage) => void;
  setLink: (subjectId?: string, taskId?: string) => void;
  replace: (sessions: PomodoroSession[]) => void;
}

function minutesStage(stage: PomodoroStage): number {
  const p = useConfig.getState().pomodoro;
  return stage === "foco" ? p.foco : stage === "pausa_curta" ? p.curta : p.longa;
}

export const usePomodoro = create<StatePomodoro>()(
  persist(
    (set, get) => ({
      etapa: "foco",
      rodando: false,
      terminaEm: null,
      restanteMs: null,
      duracaoMs: 25 * 60000,
      inicioEtapa: null,
      ciclo: 1,
      sessoes: [],
      start: (minutes) => {
        const durationMs = Math.round((minutes ?? minutesStage(get().etapa)) * 60000);
        set({ rodando: true, duracaoMs: durationMs, terminaEm: Date.now() + durationMs, restanteMs: null, inicioEtapa: new Date().toISOString() });
      },
      pausar: () => {
        const { terminaEm: endsAt, rodando: running } = get();
        if (!running || !endsAt) return;
        set({ rodando: false, restanteMs: Math.max(0, endsAt - Date.now()), terminaEm: null });
      },
      resume: () => {
        const { restanteMs: remainingMs } = get();
        if (remainingMs == null) {
          get().start();
          return;
        }
        set({ rodando: true, terminaEm: Date.now() + remainingMs, restanteMs: null });
      },
      toggle: () => {
        const s = get();
        if (s.rodando) s.pausar();
        else if (s.restanteMs != null) s.resume();
        else s.start();
      },
      restart: () => set({ rodando: false, terminaEm: null, restanteMs: null, inicioEtapa: null, duracaoMs: minutesStage(get().etapa) * 60000 }),
      stop: () => {
        const s = get();
        if (!s.inicioEtapa) return;
        const minutes = Math.round(Math.max(0, s.duracaoMs - remainingCurrent(s, Date.now())) / 600) / 100;
        const session: PomodoroSession = { id: generateId(), etapa: s.etapa, inicio: s.inicioEtapa, minutos: minutes, materiaId: s.materiaId, tarefaId: s.tarefaId, situacao: "interrompida" };
        set({ sessoes: [...s.sessoes, session].slice(-5000), rodando: false, terminaEm: null, restanteMs: null, inicioEtapa: null, duracaoMs: minutesStage(s.etapa) * 60000 });
      },
      skip: () => {
        const s = get();
        const next = nextStage(s.etapa, s.ciclo);
        set({
          etapa: next.etapa,
          ciclo: next.ciclo,
          rodando: false,
          terminaEm: null,
          restanteMs: null,
          inicioEtapa: null,
          duracaoMs: minutesStage(next.etapa) * 60000,
        });
      },
      completeStage: (statusValue = "concluida") => {
        const s = get();
        const session: PomodoroSession = {
          id: generateId(),
          etapa: s.etapa,
          inicio: s.inicioEtapa ?? new Date(Date.now() - s.duracaoMs).toISOString(),
          minutos: Math.round(s.duracaoMs / 60000),
          materiaId: s.etapa === "foco" ? s.materiaId : undefined,
          tarefaId: s.etapa === "foco" ? s.tarefaId : undefined,
          situacao: statusValue,
        };
        const next = nextStage(s.etapa, s.ciclo);
        set({
          sessoes: [...s.sessoes, session].slice(-5000),
          etapa: next.etapa,
          ciclo: next.ciclo,
          rodando: false,
          terminaEm: null,
          restanteMs: null,
          inicioEtapa: null,
          duracaoMs: minutesStage(next.etapa) * 60000,
        });
        if (useConfig.getState().pomodoro.autoProxima) get().start();
        return s.etapa;
      },
      selectStage: (stage) => {
        if (get().rodando) return;
        set({ etapa: stage, terminaEm: null, restanteMs: null, duracaoMs: minutesStage(stage) * 60000 });
      },
      setLink: (subjectId, taskId) => set({ materiaId: subjectId, tarefaId: taskId }),
      replace: (sessions) => set({ sessoes: sessions }),
    }),
    {
      name: key("pomodoro"),
      storage: storage,
      partialize: (s) => ({
        etapa: s.etapa,
        rodando: s.rodando,
        terminaEm: s.terminaEm,
        restanteMs: s.restanteMs,
        duracaoMs: s.duracaoMs,
        inicioEtapa: s.inicioEtapa,
        ciclo: s.ciclo,
        materiaId: s.materiaId,
        tarefaId: s.tarefaId,
        sessoes: s.sessoes,
      }),
    },
  ),
);

function nextStage(stage: PomodoroStage, cycle: number): { etapa: PomodoroStage; ciclo: number } {
  const cycles = useConfig.getState().pomodoro.ciclos;
  if (stage === "foco") return { etapa: cycle >= cycles ? "pausa_longa" : "pausa_curta", ciclo: cycle };
  if (stage === "pausa_longa") return { etapa: "foco", ciclo: 1 };
  return { etapa: "foco", ciclo: cycle + 1 };
}

export function remainingCurrent(s: Pick<StatePomodoro, "rodando" | "terminaEm" | "restanteMs" | "duracaoMs">, now: number): number {
  if (s.rodando && s.terminaEm) return Math.max(0, s.terminaEm - now);
  if (s.restanteMs != null) return s.restanteMs;
  return s.duracaoMs;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}
