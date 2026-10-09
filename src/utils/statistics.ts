import { addDays, eachDayOfInterval, startOfYear, endOfYear } from "date-fns";
import type { Habit, PomodoroSession, Task, ReviewRecord, Connection } from "../types";
import { toISO, todayISO, fromISO, dayMoment } from "./dates";
import { habitCompleted } from "../state/routine";
import { readKey, writeKey } from "../bridge/storage";

export type SourceMap = "tudo" | "estudo" | "habitos" | "tarefas" | "commits";

export interface DataMap {
  sessoes: PomodoroSession[];
  registroRevisoes: ReviewRecord[];
  habitos: Habit[];
  registros: Record<string, Record<string, number>>;
  tarefas: Task[];
  conexoes: Connection[];
}


const KEY_COMMITS = "niko:commits";
let commitsAtMemory: Record<string, number> | null = null;

export function storeCommits(newItems: Record<string, number>) {
  const current = commitsGithub();
  commitsAtMemory = { ...current, ...newItems };
  writeKey(KEY_COMMITS, JSON.stringify(commitsAtMemory));
}

function commitsGithub(): Record<string, number> {
  if (commitsAtMemory) return commitsAtMemory;
  try {
    commitsAtMemory = JSON.parse(readKey(KEY_COMMITS) ?? "{}") as Record<string, number>;
  } catch {
    commitsAtMemory = {};
  }
  return commitsAtMemory;
}

export function commitsDay(data: string, connections: Connection[]): number {
  const github = connections.find((c) => c.id === "github");
  if (!github?.chaveSalva) return 0;
  return commitsGithub()[data] ?? 0;
}
export function minutesStudyByDay(sessions: PomodoroSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (s.etapa !== "foco" || s.situacao !== "concluida") continue;
    const d = dayMoment(s.inicio);
    map.set(d, (map.get(d) ?? 0) + s.minutos);
  }
  return map;
}

export function valuesMap(payload: DataMap, source: SourceMap, year = new Date().getFullYear()) {
  const days = eachDayOfInterval({ start: startOfYear(new Date(year, 0, 1)), end: endOfYear(new Date(year, 0, 1)) }).map(toISO);
  const study = minutesStudyByDay(payload.sessoes);
  const reviews = new Map(payload.registroRevisoes.map((r) => [r.data, r.quantidade]));
  const completed = new Map<string, number>();
  for (const t of payload.tarefas) {
    if (t.status !== "concluida" || !t.concluidaEm) continue;
    const d = dayMoment(t.concluidaEm);
    completed.set(d, (completed.get(d) ?? 0) + 1);
  }
  const active = payload.habitos.filter((h) => !h.arquivado);

  return days.map((data) => {
    const minutes = study.get(data) ?? 0;
    const cards = reviews.get(data) ?? 0;
    const tasks = completed.get(data) ?? 0;
    const record = payload.registros[data] ?? {};
    const pctHabits = active.length ? active.filter((h) => habitCompleted(h, record[h.id])).length / active.length : 0;
    const commits = commitsDay(data, payload.conexoes);

    const levelStudy = minutes + cards === 0 ? 0 : minutes >= 120 ? 4 : minutes >= 60 ? 3 : minutes >= 25 || cards >= 20 ? 2 : 1;
    const levelHabits = pctHabits === 0 ? 0 : pctHabits >= 1 ? 4 : pctHabits >= 0.66 ? 3 : pctHabits >= 0.33 ? 2 : 1;
    const levelTasks = tasks === 0 ? 0 : tasks >= 6 ? 4 : tasks >= 4 ? 3 : tasks >= 2 ? 2 : 1;
    const levelCommits = commits === 0 ? 0 : commits >= 8 ? 4 : commits >= 5 ? 3 : commits >= 2 ? 2 : 1;

    const levels = { estudo: levelStudy, habitos: levelHabits, tarefas: levelTasks, commits: levelCommits };
    const level =
      source === "tudo"
        ? Math.min(4, Math.round((levelStudy + levelHabits + levelTasks + levelCommits) / 2))
        : levels[source];
    return { data, nivel: level, minutos: minutes, cartoes: cards, tarefas: tasks, pctHabitos: pctHabits, commits };
  });
}

export function sequenceHabit(habit: Habit, records: Record<string, Record<string, number>>): number {
  let day = fromISO(todayISO());
  if (!habitCompleted(habit, records[toISO(day)]?.[habit.id])) day = addDays(day, -1);
  let n = 0;
  while (habitCompleted(habit, records[toISO(day)]?.[habit.id]) && n < 3650) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function sequenceDays(dates: Set<string>): number {
  let day = fromISO(todayISO());
  if (!dates.has(toISO(day))) day = addDays(day, -1);
  let n = 0;
  while (dates.has(toISO(day)) && n < 3650) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
