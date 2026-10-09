import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { AgentId, Alert, Activity, AgentState, Route, ServiceId } from "../types";
import { generateId } from "../utils/basics";
import { playSound, type NameSound } from "../bridge/sounds";
import { noticeEnabled, useIsland } from "./island";
import type { CategoryNotice } from "./settings";

const CATEGORY_ROUTE: Partial<Record<Route, CategoryNotice>> = { calendario: "lembretes", journal: "habitos", estudos: "estudos", financas: "financas", conexoes: "conexoes", consumo: "consumo" };

export const AGENTS: AgentId[] = ["organizador", "tutor", "operador", "java"];

interface Signals {
  pensando: number;
  escrevendo: number;
  ouvindo: boolean;
  sucessoAte: number;
  erro: string | null;
}

const SIGNALS_EMPTY: Signals = { pensando: 0, escrevendo: 0, ouvindo: false, sucessoAte: 0, erro: null };

interface StateAgents {
  sinais: Record<AgentId, Signals>;
  forcado: Partial<Record<AgentId, AgentState>>;
  dormindo: Record<AgentId, boolean>;
  ultimaAtividade: Record<AgentId, number>;
  tarefaAtual: Record<AgentId, string>;
  atividades: Activity[];
  alertas: Alert[];
  relogio: number;
  register: (agent: AgentId, text: string) => void;
  trabalhar: (agent: AgentId, text: string, durationMs?: number) => Promise<void>;
  alertar: (agent: AgentId, text: string, route?: Route, sound?: NameSound, service?: ServiceId, urgent?: boolean) => string;
  resolveAlert: (id: string) => void;
  markSeen: () => void;
  fail: (agent: AgentId, text: string) => void;
  viewError: (agent: AgentId) => void;
  listen: (agent: AgentId, enabled: boolean) => void;
  force: (agent: AgentId, state: AgentState | null) => void;
  checkSleep: (minutes: number) => void;
  tick: () => void;
}

function byAgent<T>(value: () => T): Record<AgentId, T> {
  return { organizador: value(), tutor: value(), operador: value(), java: value() };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VALIDITY_ALERT = 12 * 3600000;
const ALERT_FRESH = 20000;

export function alertFresh(a: Alert, now = Date.now()): boolean {
  return !a.visto && now - new Date(a.criadoEm).getTime() < ALERT_FRESH;
}

export const useAgents = create<StateAgents>()(
  persist(
    (set, get) => {
      const changeSignal = (agent: AgentId, change: (s: Signals) => Signals) =>
        set((s) => ({
          sinais: { ...s.sinais, [agent]: change(s.sinais[agent]) },
          ultimaAtividade: { ...s.ultimaAtividade, [agent]: Date.now() },
          dormindo: { ...s.dormindo, [agent]: false },
        }));

      return {
        sinais: byAgent(() => ({ ...SIGNALS_EMPTY })),
        forcado: {},
        dormindo: byAgent(() => false),
        ultimaAtividade: byAgent(() => Date.now()),
        tarefaAtual: byAgent(() => ""),
        atividades: [],
        alertas: [],
        relogio: Date.now(),
        register: (agent, text) =>
          set((s) => ({
            atividades: [{ id: generateId(), agenteId: agent, texto: text, data: new Date().toISOString() }, ...s.atividades].slice(0, 80),
            ultimaAtividade: { ...s.ultimaAtividade, [agent]: Date.now() },
            dormindo: { ...s.dormindo, [agent]: false },
          })),
        trabalhar: async (agent, text, durationMs = 900) => {
          set((s) => ({ tarefaAtual: { ...s.tarefaAtual, [agent]: text } }));
          changeSignal(agent, (x) => ({ ...x, pensando: x.pensando + 1 }));
          void playSound("think", "personagens");
          await wait(Math.min(500, durationMs / 2));
          changeSignal(agent, (x) => ({ ...x, pensando: Math.max(0, x.pensando - 1), escrevendo: x.escrevendo + 1 }));
          await wait(durationMs);
          changeSignal(agent, (x) => ({ ...x, escrevendo: Math.max(0, x.escrevendo - 1), sucessoAte: Date.now() + 3000 }));
          set((s) => ({ tarefaAtual: { ...s.tarefaAtual, [agent]: "" } }));
          get().register(agent, text);
          void playSound("finish", "personagens");
          setTimeout(() => set({ relogio: Date.now() }), 3100);
        },
        alertar: (agent, text, route, sound = "question", service, urgent = false) => {
          const repeated = get().alertas.find((a) => a.agenteId === agent && a.texto === text);
          if (repeated) return repeated.id;
          const id = generateId();
          set((s) => ({
            alertas: [...s.alertas, { id, agenteId: agent, texto: text, rota: route, servico: service, criadoEm: new Date().toISOString() }].slice(-20),
            relogio: Date.now(),
          }));
          changeSignal(agent, (x) => x);
          const category = route ? CATEGORY_ROUTE[route] : undefined;
          if (noticeEnabled(category)) {
            const accepted = useIsland.getState().revelar({ texto: text, tipo: "alerta", agente: agent, aba: "avisos", categoria: category }, urgent ? 6000 : 4200, urgent ? "alta" : "normal");
            if (accepted) void playSound(sound, "avisos");
          }
          window.setTimeout(() => set({ relogio: Date.now() }), ALERT_FRESH + 200);
          return id;
        },
        resolveAlert: (id) => set((s) => ({ alertas: s.alertas.filter((a) => a.id !== id) })),
        markSeen: () => {
          if (get().alertas.every((a) => a.visto)) return;
          set((s) => ({ alertas: s.alertas.map((a) => ({ ...a, visto: true })), relogio: Date.now() }));
        },
        fail: (agent, text) => {
          changeSignal(agent, (x) => ({ ...x, erro: text }));
          get().register(agent, text);
          void playSound("error", "avisos");
        },
        viewError: (agent) => changeSignal(agent, (x) => ({ ...x, erro: null })),
        listen: (agent, enabled) => {
          if (get().sinais[agent].ouvindo === enabled) return;
          changeSignal(agent, (x) => ({ ...x, ouvindo: enabled }));
        },
        force: (agent, state) =>
          set((s) => {
            const forced = { ...s.forcado };
            if (state) forced[agent] = state;
            else delete forced[agent];
            return { forcado: forced };
          }),
        checkSleep: (minutes) => {
          const now = Date.now();
          const s = get();
          const overdue = s.alertas.filter((a) => now - new Date(a.criadoEm).getTime() > VALIDITY_ALERT);
          if (overdue.length) set({ alertas: s.alertas.filter((a) => !overdue.includes(a)) });
          const sleeping = { ...s.dormindo };
          let changed = false;
          for (const a of AGENTS) {
            const deveSleep = now - s.ultimaAtividade[a] > minutes * 60000;
            if (deveSleep !== sleeping[a]) {
              sleeping[a] = deveSleep;
              changed = true;
              if (deveSleep) {
                void playSound("yawn", "personagens");
                window.setTimeout(() => void playSound("sleep", "personagens"), 1400);
              }
            }
          }
          if (changed) set({ dormindo: sleeping });
        },
        tick: () => set({ relogio: Date.now() }),
      };
    },
    {
      name: key("agentes"),
      storage: storage,
      version: 1,
      migrate: (saved) => {
        const s = (saved ?? {}) as Partial<StateAgents>;
        return { ...s, alertas: (s.alertas ?? []).filter((a) => !a.servico) } as StateAgents;
      },
      partialize: (s) => ({ atividades: s.atividades, alertas: s.alertas }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<StateAgents>;
        const limit = Date.now() - VALIDITY_ALERT;
        return { ...current, ...saved, alertas: (saved.alertas ?? []).filter((a) => new Date(a.criadoEm).getTime() > limit) };
      },
    },
  ),
);

export function stateAgent(s: StateAgents, agent: AgentId): AgentState {
  const forced = s.forcado[agent];
  if (forced) return forced;
  const x = s.sinais[agent];
  if (s.alertas.some((a) => a.agenteId === agent && alertFresh(a, Math.max(s.relogio, Date.now())))) return "alerta";
  if (x.erro) return "erro";
  if (x.escrevendo > 0) return "escrevendo";
  if (x.pensando > 0) return "pensando";
  if (x.ouvindo) return "ouvindo";
  if (x.sucessoAte > s.relogio && x.sucessoAte > Date.now()) return "sucesso";
  if (s.dormindo[agent]) return "dormindo";
  return "ocioso";
}

export function useStateAgent(agent: AgentId): AgentState {
  return useAgents((s) => stateAgent(s, agent));
}

export const COLOR_STATE: Record<AgentState, string> = {
  ocioso: "#8a8f98",
  ouvindo: "#38bdf8",
  pensando: "#a78bfa",
  escrevendo: "#22d3ee",
  sucesso: "#34d399",
  alerta: "#f5a524",
  erro: "#f4505e",
  dormindo: "#6366f1",
};
