import { executeCommand, type ResultCommand } from "./commands";
import { useRoutine, DAY_EMPTY } from "../state/routine";
import { todayISO } from "./dates";
import { T } from "../i18n/ptBR";
import { normalizeText, urlSafe } from "./basics";
import { escapeHtml } from "./sanitize";
import { noticeFunctionDisabled, functionEnabled, type Feature } from "./features";

export type TypeCapture = "tarefa" | "gasto" | "link" | "nota" | "lembrete";

export const TYPES_CAPTURE: TypeCapture[] = ["tarefa", "gasto", "link", "nota", "lembrete"];

const FUNCTION_CAPTURE: Record<TypeCapture, Feature> = { tarefa: "journal", nota: "journal", gasto: "financas", link: "estudos", lembrete: "calendario" };

export function typesCaptureEnabled(disabled: readonly Feature[]): TypeCapture[] {
  return TYPES_CAPTURE.filter((t) => functionEnabled(FUNCTION_CAPTURE[t], disabled));
}

export function capture(type: TypeCapture, text: string): ResultCommand {
  const clean = text.trim();
  if (!clean) return { agente: "organizador", resposta: T.validacao.obrigatorio, ok: false };
  if (!functionEnabled(FUNCTION_CAPTURE[type])) return { agente: "organizador", resposta: noticeFunctionDisabled(FUNCTION_CAPTURE[type]), ok: false };
  if (type === "nota") {
    const today = todayISO();
    const routine = useRoutine.getState();
    const current = routine.dias[today] ?? DAY_EMPTY;
    routine.updateDay(today, { diario: `${current.diario}<p>${escapeHtml(clean.slice(0, 1000))}</p>` });
    return { agente: "organizador", resposta: T.ilha.notaSalva, ok: true };
  }
  return executeCommand(`/${type} ${clean}`);
}

export function captureFree(text: string): ResultCommand {
  const clean = text.trim();
  if (clean.startsWith("/")) return executeCommand(clean);
  const [first, ...rest] = clean.split(/\s+/);
  const key = normalizeText(first ?? "").replace(/:$/, "");
  const map: Record<string, TypeCapture> = { tarefa: "tarefa", gasto: "gasto", link: "link", nota: "nota", lembrete: "lembrete" };
  if (map[key]) return capture(map[key], rest.join(" "));
  if (key === "receita") return executeCommand(`/receita ${rest.join(" ")}`);
  if (urlSafe(first ?? "")) return capture("link", clean);
  return capture("tarefa", clean);
}
