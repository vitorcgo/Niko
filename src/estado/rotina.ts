import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { DiaJournal, Habito, StatusTarefa, Tarefa } from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { hojeISO } from "../utilitarios/datas";

export const DIA_VAZIO: DiaJournal = { diario: "", nota: "", manha: "", tarde: "", noite: "" };

interface Instantaneo {
  tarefas: Tarefa[];
  habitos: Habito[];
  registros: Record<string, Record<string, number>>;
  dias: Record<string, DiaJournal>;
}

interface EstadoRotina extends Instantaneo {
  passado: Instantaneo[];
  futuro: Instantaneo[];
  diasAbertos: string[];
  criarTarefa: (dados: Partial<Tarefa> & { titulo: string }) => Tarefa;
  atualizarTarefa: (id: string, parcial: Partial<Tarefa>) => void;
  mudarStatus: (id: string, status: StatusTarefa) => void;
  moverTarefas: (ids: string[], data: string) => number;
  excluirTarefa: (id: string) => Tarefa | undefined;
  restaurarTarefa: (tarefa: Tarefa) => void;
  criarHabito: (dados: Omit<Habito, "id" | "arquivado">) => void;
  atualizarHabito: (id: string, parcial: Partial<Habito>) => void;
  registrarHabito: (data: string, habitoId: string, valor: number) => void;
  atualizarDia: (data: string, parcial: Partial<DiaJournal>) => void;
  marcarAbertura: () => void;
  desfazer: () => void;
  refazer: () => void;
  substituir: (dados: Partial<Instantaneo>) => void;
}

export const useRotina = create<EstadoRotina>()(
  persist(
    (set, get) => {
      const comHistorico = (mudanca: (s: EstadoRotina) => Partial<Instantaneo>) =>
        set((s) => {
          const instantaneo: Instantaneo = { tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias };
          return { ...mudanca(s), passado: [...s.passado.slice(-49), instantaneo], futuro: [] };
        });

      return {
        tarefas: [],
        habitos: [],
        registros: {},
        dias: {},
        passado: [],
        futuro: [],
        diasAbertos: [],
        criarTarefa: (dados) => {
          const tarefa: Tarefa = {
            id: gerarId(),
            descricao: "",
            status: "a_fazer",
            prioridade: "media",
            checklist: [],
            criadaEm: new Date().toISOString(),
            ordem: Date.now(),
            ...dados,
            titulo: dados.titulo.trim().slice(0, 200),
          };
          comHistorico((s) => ({ tarefas: [...s.tarefas, tarefa] }));
          return tarefa;
        },
        atualizarTarefa: (id, parcial) =>
          comHistorico((s) => ({ tarefas: s.tarefas.map((t) => (t.id === id ? { ...t, ...parcial } : t)) })),
        mudarStatus: (id, status) =>
          comHistorico((s) => ({
            tarefas: s.tarefas.map((t) =>
              t.id === id
                ? { ...t, status, concluidaEm: status === "concluida" ? new Date().toISOString() : undefined }
                : t,
            ),
          })),
        moverTarefas: (ids, data) => {
          const alvo = new Set(ids);
          const movidas = get().tarefas.filter((t) => alvo.has(t.id) && t.data !== data).length;
          if (movidas > 0) comHistorico((s) => ({ tarefas: s.tarefas.map((t) => (alvo.has(t.id) ? { ...t, data } : t)) }));
          return movidas;
        },
        excluirTarefa: (id) => {
          const tarefa = get().tarefas.find((t) => t.id === id);
          comHistorico((s) => ({ tarefas: s.tarefas.filter((t) => t.id !== id) }));
          return tarefa;
        },
        restaurarTarefa: (tarefa) => comHistorico((s) => ({ tarefas: [...s.tarefas.filter((t) => t.id !== tarefa.id), tarefa] })),
        criarHabito: (dados) =>
          comHistorico((s) => ({ habitos: [...s.habitos, { ...dados, id: gerarId(), arquivado: false, nome: dados.nome.trim().slice(0, 60) }] })),
        atualizarHabito: (id, parcial) =>
          comHistorico((s) => ({ habitos: s.habitos.map((h) => (h.id === id ? { ...h, ...parcial } : h)) })),
        registrarHabito: (data, habitoId, valor) =>
          comHistorico((s) => ({
            registros: { ...s.registros, [data]: { ...s.registros[data], [habitoId]: Math.max(0, valor) } },
          })),
        atualizarDia: (data, parcial) =>
          set((s) => ({ dias: { ...s.dias, [data]: { ...DIA_VAZIO, ...s.dias[data], ...parcial } } })),
        marcarAbertura: () => {
          const hoje = hojeISO();
          const { diasAbertos } = get();
          if (diasAbertos.includes(hoje)) return;
          set({ diasAbertos: [...diasAbertos, hoje].slice(-400) });
        },
        desfazer: () =>
          set((s) => {
            const anterior = s.passado[s.passado.length - 1];
            if (!anterior) return {};
            const atual: Instantaneo = { tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias };
            return { ...anterior, passado: s.passado.slice(0, -1), futuro: [atual, ...s.futuro].slice(0, 50) };
          }),
        refazer: () =>
          set((s) => {
            const proximo = s.futuro[0];
            if (!proximo) return {};
            const atual: Instantaneo = { tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias };
            return { ...proximo, futuro: s.futuro.slice(1), passado: [...s.passado, atual].slice(-50) };
          }),
        substituir: (dados) => set({ ...dados, passado: [], futuro: [] }),
      };
    },
    {
      name: chave("rotina"),
      storage: armazenamento,
      partialize: (s) => ({ tarefas: s.tarefas, habitos: s.habitos, registros: s.registros, dias: s.dias, diasAbertos: s.diasAbertos }),
    },
  ),
);

export function tarefasDoDia(tarefas: Tarefa[], data: string): Tarefa[] {
  return tarefas.filter((t) => t.data === data).sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.ordem - b.ordem);
}

export function tarefaPendente(tarefa: Tarefa): boolean {
  return tarefa.status === "a_fazer" || tarefa.status === "em_andamento" || tarefa.status === "em_aguardo";
}

export function pendentesAntesDe(tarefas: Tarefa[], data: string): Tarefa[] {
  return tarefas
    .filter((t) => t.data !== undefined && t.data < data && tarefaPendente(t))
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.ordem - b.ordem);
}

export function habitoCumprido(habito: Habito, valor: number | undefined): boolean {
  if (!valor) return false;
  return habito.tipo === "sim_nao" ? valor >= 1 : valor >= habito.meta;
}
