import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import { storage, key } from "../bridge/storage";
import type {
  Area,
  ReviewCard,
  KanbanColumn,
  ImportantDate,
  SavedLink,
  Subject,
  Page,
  ReviewRecord,
  ContentReview,
  AreaType,
} from "../types";
import { generateId } from "../utils/basics";
import { fromISO, todayISO, toISO } from "../utils/dates";
import { addDays } from "date-fns";

const scheduler = fsrs();

export const COLUMNS_BY_TYPE: Record<AreaType, string[]> = {
  faculdade: ["A estudar", "Estudando", "Revisar", "Dominado"],
  idiomas: ["Vocabulário", "Praticando", "Dominado"],
  programacao: ["Ideias", "Fazendo", "Revisar", "Feito"],
  concurso: ["Edital", "Estudando", "Questões", "Dominado"],
  cursos: ["A ver", "Vendo", "Concluído"],
};

export const COLORS_AREA = ["#3b6fe0", "#2f9e6b", "#d9922b", "#a855f7", "#e05a8a", "#0ea5a4"];

function columnsInitial(type: AreaType): KanbanColumn[] {
  const names = COLUMNS_BY_TYPE[type];
  return names.map((nameValue, i) => ({ id: generateId(), nome: nameValue, conclui: i === names.length - 1 }));
}

function fromCard(base: Omit<ReviewCard, keyof ReturnType<typeof toFields>>, card: Card): ReviewCard {
  return { ...base, ...toFields(card) };
}

function toFields(card: Card) {
  return {
    vencimento: card.due.toISOString(),
    estabilidade: card.stability,
    dificuldade: card.difficulty,
    diasDecorridos: card.elapsed_days,
    diasAgendados: card.scheduled_days,
    repeticoes: card.reps,
    lapsos: card.lapses,
    estado: card.state,
    ultimaRevisao: card.last_review ? new Date(card.last_review).toISOString() : undefined,
    aprendizado: card.learning_steps,
  };
}

function toCard(c: ReviewCard): Card {
  return {
    due: new Date(c.vencimento),
    stability: c.estabilidade,
    difficulty: c.dificuldade,
    elapsed_days: c.diasDecorridos,
    scheduled_days: c.diasAgendados,
    reps: c.repeticoes,
    lapses: c.lapsos,
    state: c.estado,
    last_review: c.ultimaRevisao ? new Date(c.ultimaRevisao) : undefined,
    learning_steps: c.aprendizado,
  };
}

export interface DataStudies {
  areas: Area[];
  materias: Subject[];
  paginas: Page[];
  datas: ImportantDate[];
  cartoes: ReviewCard[];
  revisoesConteudo: ContentReview[];
  links: SavedLink[];
  registroRevisoes: ReviewRecord[];
}

interface StateStudies extends DataStudies {
  createArea: (nameValue: string, type: AreaType) => Area;
  deleteArea: (id: string) => void;
  createSubject: (areaId: string, nameValue: string, semester?: string) => Subject;
  updateSubject: (id: string, partial: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;
  createPage: (subjectId: string, parentId?: string) => Page;
  updatePage: (id: string, partial: Partial<Page>) => void;
  deletePage: (id: string) => void;
  markStudied: (pageId: string, intervals?: number[]) => void;
  completeReviewContent: (id: string) => void;
  createDate: (payload: Omit<ImportantDate, "id" | "concluida">) => void;
  updateDate: (id: string, partial: Partial<ImportantDate>) => void;
  deleteDate: (id: string) => void;
  createCard: (subjectId: string, front: string, back: string) => void;
  deleteCard: (id: string) => void;
  evaluateCard: (id: string, note: Grade) => void;
  saveLink: (payload: Omit<SavedLink, "id" | "criadoEm">) => SavedLink;
  updateLink: (id: string, partial: Partial<SavedLink>) => void;
  deleteLink: (id: string) => void;
  replace: (payload: Partial<DataStudies>) => void;
}

export const useStudies = create<StateStudies>()(
  persist(
    (set, get) => ({
      areas: [],
      materias: [],
      paginas: [],
      datas: [],
      cartoes: [],
      revisoesConteudo: [],
      links: [],
      registroRevisoes: [],
      createArea: (nameValue, type) => {
        const area: Area = { id: generateId(), nome: nameValue.trim().slice(0, 60), tipo: type, cor: COLORS_AREA[get().areas.length % COLORS_AREA.length] };
        set((s) => ({ areas: [...s.areas, area] }));
        return area;
      },
      deleteArea: (id) =>
        set((s) => {
          const subjects = s.materias.filter((m) => m.areaId === id).map((m) => m.id);
          const pages = s.paginas.filter((p) => !subjects.includes(p.materiaId));
          const remaining = new Set(pages.map((p) => p.id));
          return {
            areas: s.areas.filter((a) => a.id !== id),
            materias: s.materias.filter((m) => m.areaId !== id),
            paginas: pages,
            revisoesConteudo: s.revisoesConteudo.filter((r) => remaining.has(r.paginaId)),
            datas: s.datas.filter((d) => !subjects.includes(d.materiaId)),
            cartoes: s.cartoes.filter((c) => !subjects.includes(c.materiaId)),
          };
        }),
      createSubject: (areaId, nameValue, semester) => {
        const area = get().areas.find((a) => a.id === areaId);
        const subject: Subject = {
          id: generateId(),
          areaId,
          nome: nameValue.trim().slice(0, 80),
          colunas: columnsInitial(area?.tipo ?? "cursos"),
          semestre: semester,
        };
        set((s) => ({ materias: [...s.materias, subject] }));
        return subject;
      },
      updateSubject: (id, partial) => set((s) => ({ materias: s.materias.map((m) => (m.id === id ? { ...m, ...partial } : m)) })),
      deleteSubject: (id) =>
        set((s) => {
          const pages = s.paginas.filter((p) => p.materiaId !== id);
          const remaining = new Set(pages.map((p) => p.id));
          return {
            materias: s.materias.filter((m) => m.id !== id),
            paginas: pages,
            revisoesConteudo: s.revisoesConteudo.filter((r) => remaining.has(r.paginaId)),
            datas: s.datas.filter((d) => d.materiaId !== id),
            cartoes: s.cartoes.filter((c) => c.materiaId !== id),
          };
        }),
      createPage: (subjectId, parentId) => {
        const page: Page = { id: generateId(), materiaId: subjectId, paiId: parentId, titulo: "", conteudo: "", atualizadaEm: new Date().toISOString() };
        set((s) => ({ paginas: [...s.paginas, page] }));
        return page;
      },
      updatePage: (id, partial) =>
        set((s) => ({ paginas: s.paginas.map((p) => (p.id === id ? { ...p, ...partial, atualizadaEm: new Date().toISOString() } : p)) })),
      deletePage: (id) =>
        set((s) => {
          const remove = new Set([id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const p of s.paginas) if (p.paiId && remove.has(p.paiId) && !remove.has(p.id)) { remove.add(p.id); grew = true; }
          }
          return {
            paginas: s.paginas.filter((p) => !remove.has(p.id)),
            revisoesConteudo: s.revisoesConteudo.filter((r) => !remove.has(r.paginaId)),
          };
        }),
      markStudied: (pageId, intervals = [1, 7, 30]) => {
        const today = todayISO();
        set((s) => ({
          paginas: s.paginas.map((p) => (p.id === pageId ? { ...p, estudadaEm: today } : p)),
          revisoesConteudo: [
            ...s.revisoesConteudo.filter((r) => r.paginaId !== pageId || r.feita),
            ...intervals.map((d) => ({ id: generateId(), paginaId: pageId, data: toISO(addDays(fromISO(today), d)), feita: false })),
          ],
        }));
      },
      completeReviewContent: (id) => set((s) => ({ revisoesConteudo: s.revisoesConteudo.map((r) => (r.id === id ? { ...r, feita: true } : r)) })),
      createDate: (payload) => set((s) => ({ datas: [...s.datas, { ...payload, titulo: payload.titulo.trim().slice(0, 120), id: generateId(), concluida: false }] })),
      updateDate: (id, partial) => set((s) => ({ datas: s.datas.map((d) => (d.id === id ? { ...d, ...partial } : d)) })),
      deleteDate: (id) => set((s) => ({ datas: s.datas.filter((d) => d.id !== id) })),
      createCard: (subjectId, front, back) => {
        const base = { id: generateId(), materiaId: subjectId, frente: front.trim().slice(0, 500), verso: back.trim().slice(0, 2000) };
        set((s) => ({ cartoes: [...s.cartoes, fromCard(base, createEmptyCard(new Date()))] }));
      },
      deleteCard: (id) => set((s) => ({ cartoes: s.cartoes.filter((c) => c.id !== id) })),
      evaluateCard: (id, note) => {
        const card = get().cartoes.find((c) => c.id === id);
        if (!card) return;
        const result = scheduler.next(toCard(card), new Date(), note);
        const today = todayISO();
        set((s) => {
          const record = s.registroRevisoes.find((r) => r.data === today);
          return {
            cartoes: s.cartoes.map((c) => (c.id === id ? fromCard({ id: c.id, materiaId: c.materiaId, frente: c.frente, verso: c.verso }, result.card) : c)),
            registroRevisoes: record
              ? s.registroRevisoes.map((r) => (r.data === today ? { ...r, quantidade: r.quantidade + 1 } : r))
              : [...s.registroRevisoes, { data: today, quantidade: 1 }],
          };
        });
      },
      saveLink: (payload) => {
        const link: SavedLink = { ...payload, id: generateId(), criadoEm: new Date().toISOString() };
        set((s) => ({ links: [link, ...s.links] }));
        return link;
      },
      updateLink: (id, partial) => set((s) => ({ links: s.links.map((l) => (l.id === id ? { ...l, ...partial } : l)) })),
      deleteLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),
      replace: (payload) => set(payload),
    }),
    { name: key("estudos"), storage: storage },
  ),
);

export function cardsOverdue(cards: ReviewCard[], now = new Date()): ReviewCard[] {
  return cards.filter((c) => new Date(c.vencimento) <= now);
}

export function reviewsToToday(state: Pick<DataStudies, "cartoes" | "revisoesConteudo">): number {
  const endDay = new Date();
  endDay.setHours(23, 59, 59, 999);
  const today = todayISO();
  return cardsOverdue(state.cartoes, endDay).length + state.revisoesConteudo.filter((r) => !r.feita && r.data <= today).length;
}

export function forecastIntervals(card: ReviewCard, now = new Date()): Record<1 | 2 | 3 | 4, number> {
  const preview = scheduler.repeat(toCard(card), now);
  const ms = (r: Rating) => preview[r as Grade].card.due.getTime() - now.getTime();
  return { 1: ms(Rating.Again), 2: ms(Rating.Hard), 3: ms(Rating.Good), 4: ms(Rating.Easy) };
}

export function describeInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d`;
  const months = Math.round(d / 30);
  return months < 12 ? `${months} m` : `${(d / 365).toFixed(1).replace(".", ",")} a`;
}