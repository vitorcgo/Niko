import { changeTool, countChanges } from "./diff";
import { toISO } from "./dates";

const DAY_MS = 86_400_000;
const WEEKS_RETAINED = 12;
const MAX_TURN_MS = 6 * 3_600_000;
const LIMIT_FILES = 300;
const TOOLS_COMMAND = new Set(["Bash", "PowerShell", "BashOutput", "shell", "run_shell_command"]);

export interface EventCode {
  evento: string;
  sessao: string;
  ferramenta?: string;
  cwd: string;
  recebidoEm: string;
  dados: Record<string, unknown>;
}

export interface DaySession {
  ms: number;
  mais: number;
  menos: number;
  comandos: number;
  pedidos: number;
  perguntas: number;
  arquivos: string[];
}

export interface RecordSession {
  id: string;
  ferramenta: string;
  projeto: string;
  inicio: number;
  fim: number;
  trabalhoMs: number;
  turnoDesde: number | null;
  dias: Record<string, DaySession>;
  turnos: number;
}

const DAY_EMPTY: DaySession = { ms: 0, mais: 0, menos: 0, comandos: 0, pedidos: 0, perguntas: 0, arquivos: [] };

export interface HistoryCode {
  sessoes: Record<string, RecordSession>;
  ultimoEvento: number;
}

export interface WeeklySummary {
  inicio: string;
  tempoMs: number;
  sessoes: number;
  arquivos: number;
  mais: number;
  menos: number;
  comandos: number;
  pedidos: number;
  perguntas: number;
  agente: { ferramenta: string; tempoMs: number } | null;
  projeto: { nome: string; tempoMs: number } | null;
  diaMaisCheio: { dia: string; tempoMs: number } | null;
  maisLonga: { projeto: string; tempoMs: number } | null;
}

export const HISTORY_EMPTY: HistoryCode = { sessoes: {}, ultimoEvento: 0 };

function nameDirectory(cwd: string): string {
  const clean = cwd.replace(/[\\/]+$/, "");
  return clean.slice(Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/")) + 1) || "";
}

function dayValue(r: RecordSession, moment: number): DaySession {
  const key = toISO(new Date(moment));
  const dayValue = { ...DAY_EMPTY, ...r.dias[key] };
  dayValue.arquivos = [...dayValue.arquivos];
  r.dias = { ...r.dias, [key]: dayValue };
  return dayValue;
}

function closeTurn(r: RecordSession, until: number) {
  if (r.turnoDesde === null) return;
  const duration = Math.max(0, Math.min(until - r.turnoDesde, MAX_TURN_MS));
  r.trabalhoMs += duration;
  dayValue(r, r.turnoDesde).ms += duration;
  r.turnoDesde = null;
}

export function acumular(h: HistoryCode, e: EventCode): HistoryCode {
  const when = Date.parse(e.recebidoEm);
  if (!e.sessao || !Number.isFinite(when) || when <= h.ultimoEvento || e.evento.startsWith("Niko")) return h;
  const previous = h.sessoes[e.sessao];
  const r: RecordSession = previous
    ? { ...previous, dias: previous.dias ?? {} }
    : { id: e.sessao, ferramenta: e.ferramenta ?? "claude", projeto: nameDirectory(e.cwd), inicio: when, fim: when, trabalhoMs: 0, turnoDesde: null, dias: {}, turnos: 0 };
  const lastActivity = r.fim;
  if (e.cwd && !r.projeto) r.projeto = nameDirectory(e.cwd);
  r.fim = Math.max(r.fim, when);
  const nameValue = typeof e.dados.tool_name === "string" ? e.dados.tool_name : "";
  const input = (e.dados.tool_input && typeof e.dados.tool_input === "object" ? e.dados.tool_input : {}) as Record<string, unknown>;
  switch (e.evento) {
    case "UserPromptSubmit":
      closeTurn(r, lastActivity);
      r.turnos += 1;
      r.turnoDesde = when;
      break;
    case "PreToolUse": {
      if (r.turnoDesde === null) r.turnoDesde = when;
      const currentDay = dayValue(r, when);
      if (TOOLS_COMMAND.has(nameValue)) currentDay.comandos += 1;
      const change = changeTool(nameValue, input);
      if (change) {
        const { mais: more, menos: less } = countChanges(change);
        currentDay.mais += more;
        currentDay.menos += less;
        if (!currentDay.arquivos.includes(change.arquivo) && currentDay.arquivos.length < LIMIT_FILES) currentDay.arquivos.push(change.arquivo);
      }
      break;
    }
    case "PermissionRequest":
      if (nameValue === "AskUserQuestion") dayValue(r, when).perguntas += 1;
      else dayValue(r, when).pedidos += 1;
      break;
    case "Stop":
    case "StopFailure":
      closeTurn(r, when);
      break;
    case "SessionEnd":
      closeTurn(r, lastActivity);
      break;
    default:
      break;
  }
  const limit = when - WEEKS_RETAINED * 7 * DAY_MS;
  const sessions = Object.fromEntries(Object.entries({ ...h.sessoes, [r.id]: r }).filter(([, s]) => s.fim >= limit));
  return { sessoes: sessions, ultimoEvento: when };
}

export function startWeek(data: Date): Date {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const sinceSecond = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceSecond);
  return d;
}

export function weekPassada(today: Date): Date {
  const start = startWeek(today);
  start.setDate(start.getDate() - 7);
  return start;
}

function largest<T>(map: Map<T, number>): { chave: T; valor: number } | null {
  let best: { chave: T; valor: number } | null = null;
  for (const [key, value] of map) if (value > 0 && (!best || value > best.valor)) best = { chave: key, valor: value };
  return best;
}

export function summaryWeek(h: HistoryCode, start: Date): WeeklySummary {
  const days = Array.from({ length: 7 }, (_, i) => toISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  const byAgent = new Map<string, number>();
  const byProject = new Map<string, number>();
  const byDay = new Map<string, number>();
  const files = new Set<string>();
  const summary: WeeklySummary = { inicio: days[0], tempoMs: 0, sessoes: 0, arquivos: 0, mais: 0, menos: 0, comandos: 0, pedidos: 0, perguntas: 0, agente: null, projeto: null, diaMaisCheio: null, maisLonga: null };
  for (const s of Object.values(h.sessoes)) {
    const fromWeek = days.map((d) => [d, s.dias?.[d]] as const).filter((x): x is readonly [string, DaySession] => Boolean(x[1]));
    const time = fromWeek.reduce((sum, [, d]) => sum + d.ms, 0);
    if (time <= 0) continue;
    summary.tempoMs += time;
    summary.sessoes += 1;
    for (const [key, d] of fromWeek) {
      summary.mais += d.mais;
      summary.menos += d.menos;
      summary.comandos += d.comandos;
      summary.pedidos += d.pedidos;
      summary.perguntas += d.perguntas;
      for (const a of d.arquivos) files.add(a);
      if (d.ms) byDay.set(key, (byDay.get(key) ?? 0) + d.ms);
    }
    byAgent.set(s.ferramenta, (byAgent.get(s.ferramenta) ?? 0) + time);
    if (s.projeto) byProject.set(s.projeto, (byProject.get(s.projeto) ?? 0) + time);
    if (!summary.maisLonga || time > summary.maisLonga.tempoMs) summary.maisLonga = { projeto: s.projeto, tempoMs: time };
  }
  summary.arquivos = files.size;
  const agent = largest(byAgent);
  const project = largest(byProject);
  const dayValue = largest(byDay);
  summary.agente = agent && { ferramenta: agent.chave, tempoMs: agent.valor };
  summary.projeto = project && { nome: project.chave, tempoMs: project.valor };
  summary.diaMaisCheio = dayValue && { dia: dayValue.chave, tempoMs: dayValue.valor };
  return summary;
}
