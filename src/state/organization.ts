import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { CardView, EventType, Goal, Pillar } from "../types";
import { generateId } from "../utils/basics";
import { todayISO } from "../utils/dates";

export const PILLARS_DEFAULT = ["Saúde", "Carreira", "Relacionamentos", "Crescimento", "Finanças"];

export interface DataOrganization {
  pilares: Pillar[];
  metas: Goal[];
  visao: CardView[];
  eventos: EventType[];
}

interface StateOrganization extends DataOrganization {
  ensurePillars: () => void;
  createPillar: (nameValue: string) => void;
  updatePillar: (id: string, partial: Partial<Pillar>) => void;
  deletePillar: (id: string) => void;
  createGoal: (payload: Omit<Goal, "id" | "historico">) => void;
  updateGoal: (id: string, partial: Partial<Goal>) => void;
  registerProgress: (id: string, value: number) => void;
  deleteGoal: (id: string) => void;
  createView: (payload: Omit<CardView, "id">) => void;
  updateView: (id: string, partial: Partial<CardView>) => void;
  deleteView: (id: string) => void;
  createEvent: (payload: Omit<EventType, "id">) => EventType;
  updateEvent: (id: string, partial: Partial<EventType>) => void;
  markEventDone: (id: string, data: string, done: boolean) => void;
  deleteEvent: (id: string) => EventType | undefined;
  restoreEvent: (e: EventType) => void;
  replace: (payload: Partial<DataOrganization>) => void;
}

export const useOrganization = create<StateOrganization>()(
  persist(
    (set, get) => ({
      pilares: [],
      metas: [],
      visao: [],
      eventos: [],
      ensurePillars: () => {
        if (get().pilares.length > 0) return;
        set({ pilares: PILLARS_DEFAULT.map((nameValue) => ({ id: generateId(), nome: nameValue, nota: 7 })) });
      },
      createPillar: (nameValue) => set((s) => ({ pilares: [...s.pilares, { id: generateId(), nome: nameValue.trim().slice(0, 40), nota: 5 }] })),
      updatePillar: (id, partial) => set((s) => ({ pilares: s.pilares.map((p) => (p.id === id ? { ...p, ...partial } : p)) })),
      deletePillar: (id) => set((s) => ({ pilares: s.pilares.filter((p) => p.id !== id), metas: s.metas.filter((m) => m.pilarId !== id) })),
      createGoal: (payload) =>
        set((s) => ({ metas: [...s.metas, { ...payload, nome: payload.nome.trim().slice(0, 80), id: generateId(), historico: [{ data: todayISO(), valor: payload.atual }] }] })),
      updateGoal: (id, partial) => set((s) => ({ metas: s.metas.map((m) => (m.id === id ? { ...m, ...partial } : m)) })),
      registerProgress: (id, value) =>
        set((s) => ({
          metas: s.metas.map((m) =>
            m.id === id
              ? { ...m, atual: value, historico: [...m.historico.filter((h) => h.data !== todayISO()), { data: todayISO(), valor: value }].slice(-120) }
              : m,
          ),
        })),
      deleteGoal: (id) => set((s) => ({ metas: s.metas.filter((m) => m.id !== id) })),
      createView: (payload) => set((s) => ({ visao: [...s.visao, { ...payload, id: generateId() }] })),
      updateView: (id, partial) => set((s) => ({ visao: s.visao.map((v) => (v.id === id ? { ...v, ...partial } : v)) })),
      deleteView: (id) => set((s) => ({ visao: s.visao.filter((v) => v.id !== id) })),
      createEvent: (payload) => {
        const eventValue = { ...payload, titulo: payload.titulo.trim().slice(0, 120), id: generateId() };
        set((s) => ({ eventos: [...s.eventos, eventValue] }));
        return eventValue;
      },
      updateEvent: (id, partial) => set((s) => ({ eventos: s.eventos.map((e) => (e.id === id ? { ...e, ...partial } : e)) })),
      markEventDone: (id, data, done) =>
        set((s) => ({
          eventos: s.eventos.map((e) => {
            if (e.id !== id) return e;
            const others = (e.feitos ?? []).filter((d) => d !== data);
            return { ...e, feitos: (done ? [...others, data] : others).sort().slice(-400) };
          }),
        })),
      deleteEvent: (id) => {
        const eventValue = get().eventos.find((e) => e.id === id);
        set((s) => ({ eventos: s.eventos.filter((e) => e.id !== id) }));
        return eventValue;
      },
      restoreEvent: (e) => set((s) => ({ eventos: [...s.eventos, e] })),
      replace: (payload) => set(payload),
    }),
    { name: key("organizacao"), storage: storage },
  ),
);
