import { addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import { T } from "../i18n/ptBR";
import { fromISO, toISO } from "./dates";
import { formatMoney } from "./money";
import type { EventType, Habit, Recurrence, Task } from "../types";
import type { useOrganization } from "../state/organization";
import type { useRoutine } from "../state/routine";
import type { useStudies } from "../state/studies";
import type { useFinances } from "../state/finances";
import { functionEnabled, type Feature } from "./features";

export type SourceCalendar = keyof typeof T.calendario.fontes;

export interface ItemCalendar {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  fonte: SourceCalendar;
  evento?: EventType;
  habito?: Habit;
  tarefa?: Task;
  link?: string;
}

export interface DataCalendar {
  eventos: ReturnType<typeof useOrganization.getState>["eventos"];
  metas: ReturnType<typeof useOrganization.getState>["metas"];
  tarefas: ReturnType<typeof useRoutine.getState>["tarefas"];
  habitos?: ReturnType<typeof useRoutine.getState>["habitos"];
  datas: ReturnType<typeof useStudies.getState>["datas"];
  revisoes: ReturnType<typeof useStudies.getState>["revisoesConteudo"];
  recorrentes: ReturnType<typeof useFinances.getState>["recorrentes"];
}

export type ScopeEditing = "este" | "todos";
export type DataEvent = Omit<EventType, "id" | "ultimoDisparo" | "excecoes">;

export function canMarkDone(i: ItemCalendar): boolean {
  return Boolean(i.evento || i.tarefa || i.habito);
}

export function itemDone(i: ItemCalendar, records: Record<string, Record<string, number>>): boolean {
  if (i.evento) return (i.evento.feitos ?? []).includes(i.data);
  if (i.tarefa) return i.tarefa.status === "concluida";
  if (i.habito) {
    const value = records[i.data]?.[i.habito.id];
    return Boolean(value) && (i.habito.tipo === "sim_nao" ? value >= 1 : value >= i.habito.meta);
  }
  return false;
}

export function repeatsTodoDay(i: ItemCalendar) {
  return i.evento?.repeticao === "diaria" || Boolean(i.habito);
}

export function occurrences(e: EventType, start: string, end: string): string[] {
  if (e.repeticao === "nenhuma") return e.data >= start && e.data <= end ? [e.data] : [];
  const skip = new Set(e.excecoes ?? []);
  const result: string[] = [];
  let d = fromISO(e.data);
  let protection = 0;
  while (toISO(d) <= end && protection < 800) {
    const iso = toISO(d);
    if (iso >= start && !skip.has(iso)) result.push(iso);
    d = e.repeticao === "diaria" ? addDays(d, 1) : e.repeticao === "semanal" ? addWeeks(d, 1) : addMonths(d, 1);
    protection++;
  }
  return result;
}

export function editEvent(eventValue: EventType, occurrence: string, newItems: DataEvent, scope: ScopeEditing): { atualizar: Partial<EventType>; criar?: DataEvent } {
  if (eventValue.repeticao !== "nenhuma" && scope === "este") {
    return { atualizar: { excecoes: [...new Set([...(eventValue.excecoes ?? []), occurrence])] }, criar: { ...newItems, repeticao: "nenhuma" } };
  }
  if (eventValue.repeticao === "nenhuma" || newItems.repeticao === "nenhuma") return { atualizar: { ...newItems, excecoes: undefined } };
  const offset = differenceInCalendarDays(fromISO(newItems.data), fromISO(occurrence));
  const move = (iso: string) => toISO(addDays(fromISO(iso), offset));
  return { atualizar: { ...newItems, data: move(eventValue.data), excecoes: eventValue.excecoes?.map(move) } };
}

export function deleteOccurrence(eventValue: EventType, occurrence: string, scope: ScopeEditing): Partial<EventType> | "excluir" {
  if (eventValue.repeticao === "nenhuma" || scope === "todos") return "excluir";
  return { excecoes: [...new Set([...(eventValue.excecoes ?? []), occurrence])] };
}

const QUICK_RECURRENCE: [RegExp, Recurrence][] = [
  [/^(todo dia|todos os dias|diariamente)\b/i, "diaria"],
  [/^(toda semana|todas as semanas|semanalmente)\b/i, "semanal"],
  [/^(todo m[eê]s|todos os meses|mensalmente)\b/i, "mensal"],
];

export function extractRecurrence(text: string): { repeticao: Recurrence; resto: string } {
  for (const [rule, recurrence] of QUICK_RECURRENCE) {
    const loose = new RegExp(rule.source.replace(/^\^/, "(?:^|\\s)"), "i");
    if (loose.test(text)) return { repeticao: recurrence, resto: text.replace(loose, " ").replace(/\s+/g, " ").trim() };
  }
  return { repeticao: "nenhuma", resto: text.trim() };
}

export function readEventQuick(text: string): { titulo: string; hora?: string; repeticao: Recurrence } {
  let rest = text.trim();
  let recurrence: Recurrence = "nenhuma";
  let time: string | undefined;
  for (let step = 0; step < 2; step++) {
    const rule = QUICK_RECURRENCE.find(([r]) => r.test(rest));
    if (rule && recurrence === "nenhuma") {
      recurrence = rule[1];
      rest = rest.replace(rule[0], "").trim();
      continue;
    }
    const m = /^(?:[aà]s\s+)?(\d{1,2})(?:[:h](\d{2}))?h?\s+(.+)$/i.exec(rest);
    if (m && !time) {
      const candidate = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate)) {
        time = candidate;
        rest = m[3].trim();
      }
    }
  }
  return { titulo: rest, hora: time, repeticao: recurrence };
}

export function itemsCalendar(all: DataCalendar, from: string, until: string): ItemCalendar[] {
  const enabled = (f: Feature) => functionEnabled(f);
  const payload: DataCalendar = {
    eventos: enabled("calendario") ? all.eventos : [],
    tarefas: enabled("journal") ? all.tarefas : [],
    habitos: enabled("journal") ? all.habitos : [],
    datas: enabled("estudos") ? all.datas : [],
    revisoes: enabled("estudos") ? all.revisoes : [],
    metas: enabled("metas") ? all.metas : [],
    recorrentes: enabled("financas") ? all.recorrentes : [],
  };
  const list: ItemCalendar[] = [];
  for (const e of payload.eventos) for (const d of occurrences(e, from, until)) list.push({ id: `${e.id}-${d}`, titulo: e.titulo, data: d, hora: e.hora, fonte: "eventos", evento: e });
  for (const t of payload.tarefas) if (t.data && t.data >= from && t.data <= until && t.status !== "cancelada") list.push({ id: t.id, titulo: t.titulo, data: t.data, hora: t.hora, fonte: "tarefas", tarefa: t });
  const hasTime = (payload.habitos ?? []).filter((h) => !h.arquivado && h.hora);
  if (hasTime.length > 0 && from <= until) {
    for (const day of eachDayOfInterval({ start: fromISO(from), end: fromISO(until) }).slice(0, 800)) {
      const iso = toISO(day);
      for (const h of hasTime) list.push({ id: `habito-${h.id}-${iso}`, titulo: h.nome, data: iso, hora: h.hora, fonte: "habitos", habito: h });
    }
  }
  for (const d of payload.datas) if (d.data >= from && d.data <= until) list.push({ id: d.id, titulo: `${T.estudos.tiposData[d.tipo]}: ${d.titulo}`, data: d.data, fonte: "estudos" });
  for (const r of payload.revisoes) if (!r.feita && r.data >= from && r.data <= until) list.push({ id: r.id, titulo: T.calendario.revisao, data: r.data, fonte: "estudos" });
  for (const m of payload.metas) if (m.prazo && m.prazo >= from && m.prazo <= until) list.push({ id: m.id, titulo: m.nome, data: m.prazo, fonte: "metas" });
  for (const r of payload.recorrentes) {
    if (!r.ativa) continue;
    let d = startOfMonth(fromISO(from));
    while (toISO(d) <= until) {
      const day = toISO(new Date(d.getFullYear(), d.getMonth(), Math.min(r.dia, endOfMonth(d).getDate())));
      if (day >= from && day <= until && (r.frequencia === "mensal" || d.getMonth() + 1 === r.mesAnual)) list.push({ id: `${r.id}-${day}`, titulo: `${r.descricao} ${formatMoney(r.valor)}`, data: day, fonte: "financas" });
      d = addMonths(d, 1);
    }
  }
  return list.sort((a, b) => `${a.data}${a.hora ?? "99"}`.localeCompare(`${b.data}${b.hora ?? "99"}`));
}
