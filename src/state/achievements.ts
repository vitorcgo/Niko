import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { AgentId, AchievementReached } from "../types";

export interface DefinitionAchievement {
  codigo: string;
  agente: AgentId;
  niveis: number[];
}

export const ACHIEVEMENTS: DefinitionAchievement[] = [
  { codigo: "primeira_semana", agente: "organizador", niveis: [7] },
  { codigo: "sequencia_habito", agente: "organizador", niveis: [7, 30, 100, 365] },
  { codigo: "foco", agente: "organizador", niveis: [10, 100, 1000] },
  { codigo: "revisor", agente: "tutor", niveis: [100, 1000, 10000] },
  { codigo: "maratona", agente: "tutor", niveis: [240] },
  { codigo: "prova_vencida", agente: "tutor", niveis: [1] },
  { codigo: "orcamento_em_dia", agente: "operador", niveis: [1] },
  { codigo: "meta_economia", agente: "operador", niveis: [1] },
  { codigo: "sem_pendencias", agente: "operador", niveis: [1] },
  { codigo: "meta_vida", agente: "organizador", niveis: [1] },
];

interface StateAchievements {
  alcancadas: AchievementReached[];
  register: (code: string, level: number) => boolean;
  replace: (reached: AchievementReached[]) => void;
}

export const useAchievements = create<StateAchievements>()(
  persist(
    (set, get) => ({
      alcancadas: [],
      register: (code, level) => {
        if (get().alcancadas.some((a) => a.codigo === code && a.nivel >= level)) return false;
        set((s) => ({ alcancadas: [...s.alcancadas.filter((a) => a.codigo !== code), { codigo: code, nivel: level, data: new Date().toISOString() }] }));
        return true;
      },
      replace: (reached) => set({ alcancadas: reached }),
    }),
    { name: key("conquistas"), storage: storage },
  ),
);
