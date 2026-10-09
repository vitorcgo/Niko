import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { JournalDay, Habit, TaskStatus, Task } from "../types";
import { generateId } from "../utils/basics";
import { todayISO } from "../utils/dates";

export const DAY_EMPTY: JournalDay = { diario: "", nota: "", manha: "", tarde: "", noite: "" };

interface Instant {
  tarefas: Task[];
  habitos: Habit[];
  registros: Record<string, Record<string, number>>;
  dias: Record<string, JournalDay>;
}

interface StateRoutine extends Instant {
  passado: Instant[];
  futuro: Instant[];
  diasAbertos: string[];
  createTask: (payload: Partial<Task> & { titulo: string }) => Task;
  updateTask: (id: string, partial: Partial<Task>) => void;
  changeStatus: (id: string, status: TaskStatus) => void;
  deleteTask: (id: string) => Task | undefined;
  restoreTask: (task: Task) => void;
  createHabit: (payload: Omit<Habit, "id" | "arquivado">) => void;
  updateHabit: (id: string, partial: Partial<Habit>) => void;
  registerHabit: (data: string, habitId: string, value: number) => void;
  updateDay: (data: string, partial: Partial<JournalDay>) => void;
  markOpening: () => void;
  undo: () => void;
  redo: () => void;
  replace: (payload: Partial<Instant>) => void;
}

export const useRoutine = create<StateRoutine>()(
  persist(
    (set, get) => {
      const hasHistory = (change: (s: StateRoutine) => Partial<Instant>) =>
        set((s) => {
          const instant: Instant = { tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias };
          return { ...change(s), passado: [...s.passado.slice(-49), instant], futuro: [] };
        });

      return {
        tarefas: [],
        habitos: [],
        registros: {},
        dias: {},
        passado: [],
        futuro: [],
        diasAbertos: [],
        createTask: (payload) => {
          const task: Task = {
            id: generateId(),
            descricao: "",
            status: "a_fazer",
            prioridade: "media",
            checklist: [],
            criadaEm: new Date().toISOString(),
            ordem: Date.now(),
            ...payload,
            titulo: payload.titulo.trim().slice(0, 200),
          };
          hasHistory((s) => ({ tarefas: [...s.tarefas, task] }));
          return task;
        },
        updateTask: (id, partial) =>
          hasHistory((s) => ({ tarefas: s.tarefas.map((t) => (t.id === id ? { ...t, ...partial } : t)) })),
        changeStatus: (id, status) =>
          hasHistory((s) => ({
            tarefas: s.tarefas.map((t) =>
              t.id === id
                ? { ...t, status, concluidaEm: status === "concluida" ? new Date().toISOString() : undefined }
                : t,
            ),
          })),
        deleteTask: (id) => {
          const task = get().tarefas.find((t) => t.id === id);
          hasHistory((s) => ({ tarefas: s.tarefas.filter((t) => t.id !== id) }));
          return task;
        },
        restoreTask: (task) => hasHistory((s) => ({ tarefas: [...s.tarefas.filter((t) => t.id !== task.id), task] })),
        createHabit: (payload) =>
          hasHistory((s) => ({ habitos: [...s.habitos, { ...payload, id: generateId(), arquivado: false, nome: payload.nome.trim().slice(0, 60) }] })),
        updateHabit: (id, partial) =>
          hasHistory((s) => ({ habitos: s.habitos.map((h) => (h.id === id ? { ...h, ...partial } : h)) })),
        registerHabit: (data, habitId, value) =>
          hasHistory((s) => ({
            registros: { ...s.registros, [data]: { ...s.registros[data], [habitId]: Math.max(0, value) } },
          })),
        updateDay: (data, partial) =>
          set((s) => ({ dias: { ...s.dias, [data]: { ...DAY_EMPTY, ...s.dias[data], ...partial } } })),
        markOpening: () => {
          const today = todayISO();
          const { diasAbertos: daysOpen } = get();
          if (daysOpen.includes(today)) return;
          set({ diasAbertos: [...daysOpen, today].slice(-400) });
        },
        undo: () =>
          set((s) => {
            const previous = s.passado[s.passado.length - 1];
            if (!previous) return {};
            const current: Instant = { tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias };
            return { ...previous, passado: s.passado.slice(0, -1), futuro: [current, ...s.futuro].slice(0, 50) };
          }),
        redo: () =>
          set((s) => {
            const next = s.futuro[0];
            if (!next) return {};
            const current: Instant = { tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias };
            return { ...next, futuro: s.futuro.slice(1), passado: [...s.passado, current].slice(-50) };
          }),
        replace: (payload) => set({ ...payload, passado: [], futuro: [] }),
      };
    },
    {
      name: key("rotina"),
      storage: storage,
      partialize: (s) => ({ tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias, diasAbertos: s.diasAbertos }),
    },
  ),
);

export function tasksDay(tasks: Task[], data: string): Task[] {
  return tasks.filter((t) => t.data === data).sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.ordem - b.ordem);
}

export function habitCompleted(habit: Habit, value: number | undefined): boolean {
  if (!value) return false;
  return habit.tipo === "sim_nao" ? value >= 1 : value >= habit.meta;
}
