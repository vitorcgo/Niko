import { T } from "../i18n/ptBR";
import { addDays, differenceInCalendarDays } from "date-fns";
import type { Recurring, Transaction } from "../types";
import { normalizeText } from "./basics";
import { fromISO, toISO } from "./dates";
import { readValueAtCents } from "./money";

export interface CandidateSignature {
  chave: string;
  descricao: string;
  valor: number;
  frequencia: "mensal" | "anual";
  ocorrencias: Transaction[];
  proxima: string;
  contaId: string;
  categoriaId?: string;
  dia: number;
}

export function keyDescription(description: string): string {
  return normalizeText(description).replace(/\d+/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectSubscriptions(transactions: Transaction[], recurring: Recurring[], ignored: string[]): CandidateSignature[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.tipo !== "despesa" || t.recorrenteId || t.grupoParcelasId || t.ajuste) continue;
    const k = keyDescription(t.descricao);
    if (k.length < 3) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const registered = new Set(recurring.map((r) => keyDescription(r.descricao)));
  const result: CandidateSignature[] = [];

  for (const [k, list] of groups) {
    if (registered.has(k) || ignored.includes(k)) continue;
    const sorted = [...list].sort((a, b) => a.data.localeCompare(b.data));
    for (const frequency of ["mensal", "anual"] as const) {
      const [min, max, minimum] = frequency === "mensal" ? [28, 33, 3] : [360, 370, 2];
      const series: Transaction[] = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const previous = series[series.length - 1];
        const interval = differenceInCalendarDays(fromISO(sorted[i].data), fromISO(previous.data));
        const variation = Math.abs(sorted[i].valor - previous.valor) / Math.max(1, previous.valor);
        if (interval >= min && interval <= max && variation <= 0.1) series.push(sorted[i]);
      }
      if (series.length >= minimum) {
        const last = series[series.length - 1];
        result.push({
          chave: k,
          descricao: last.descricao,
          valor: last.valor,
          frequencia: frequency,
          ocorrencias: series,
          proxima: toISO(addDays(fromISO(last.data), frequency === "mensal" ? 30 : 365)),
          contaId: last.contaId,
          categoriaId: last.categoriaId,
          dia: fromISO(last.data).getDate(),
        });
        break;
      }
    }
  }
  return result;
}

export function subscriptionsWithValueNew(transactions: Transaction[], recurring: Recurring[]): Recurring[] {
  return recurring.filter((r) => {
    const last = transactions
      .filter((t) => t.tipo === "despesa" && !t.recorrenteId && keyDescription(t.descricao) === keyDescription(r.descricao))
      .sort((a, b) => b.data.localeCompare(a.data))[0];
    return last && Math.abs(last.valor - r.valor) / Math.max(1, r.valor) > 0.02;
  });
}

export interface LineImported {
  data: string;
  descricao: string;
  valor: number;
}

function dataBr(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text.trim());
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) return text.trim();
  return null;
}

export function readCsv(text: string): { linhas: LineImported[]; invalidas: number } {
  const lines: LineImported[] = [];
  let invalid = 0;
  const raw = text.split(/\r?\n/).filter((l) => l.trim());
  for (const [i, rawValue] of raw.entries()) {
    const separator = rawValue.includes(";") ? ";" : ",";
    const parts = rawValue.split(separator).map((p) => p.replace(/^"|"$/g, "").trim());
    if (parts.length < 3) {
      invalid++;
      continue;
    }
    const data = dataBr(parts[0]);
    const value = readValueAtCents(parts[parts.length - 1].replace(/^-/, "")) ;
    const negative = parts[parts.length - 1].trim().startsWith("-");
    if (!data || value == null) {
      if (i > 0) invalid++;
      continue;
    }
    lines.push({ data, descricao: parts.slice(1, -1).join(" ").slice(0, 120) || T.financas.semDescricao, valor: negative ? -value : value });
  }
  return { linhas: lines, invalidas: invalid };
}

export function readOfx(text: string): { linhas: LineImported[]; invalidas: number } {
  const lines: LineImported[] = [];
  let invalid = 0;
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const field = (nameValue: string) => new RegExp(`<${nameValue}>([^<\\r\\n]+)`, "i").exec(block)?.[1]?.trim();
    const data = field("DTPOSTED");
    const value = Number(field("TRNAMT")?.replace(",", "."));
    const description = field("MEMO") ?? field("NAME") ?? "";
    if (!data || !/^\d{8}/.test(data) || !Number.isFinite(value)) {
      invalid++;
      continue;
    }
    lines.push({ data: `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`, descricao: description.slice(0, 120), valor: Math.round(value * 100) });
  }
  return { linhas: lines, invalidas: invalid };
}
