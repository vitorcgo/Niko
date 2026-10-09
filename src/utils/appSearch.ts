import { normalizeText } from "./basics";

export type SearchEngine = "google" | "duckduckgo" | "bing";

export const SEARCHENGINES: SearchEngine[] = ["google", "duckduckgo", "bing"];

const ADDRESS_SEARCHENGINE: Record<SearchEngine, string> = {
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
};

export interface Usage {
  vezes: number;
  ultimo: number;
}

const DAY_MS = 86_400_000;

export function scoreName(query: string, nameValue: string): number {
  const q = normalizeText(query);
  const n = normalizeText(nameValue);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 90 - Math.min(n.length - q.length, 20) * 0.2;
  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((p) => p.startsWith(q))) return 78;
  const termos = q.split(/\s+/).filter(Boolean);
  if (termos.length > 1 && termos.every((t) => words.some((p) => p.startsWith(t)))) return 72;
  if (termos.length > 1 && termos.every((t) => n.includes(t))) return 65;
  const position = n.indexOf(q);
  if (position >= 0) return 60 - Math.min(position, 20) * 0.5;
  const junto = q.replace(/\s+/g, "");
  if (junto.length >= 2 && words.map((p) => p[0]).join("").startsWith(junto)) return 55;
  if (junto.length >= 3) {
    let i = 0;
    for (const letter of n) if (letter === junto[i]) i++;
    if (i === junto.length) return 30;
  }
  return 0;
}

export function bonusUsage(usage: Usage | undefined, now = Date.now()): number {
  if (!usage) return 0;
  const frequency = Math.min(usage.vezes, 20) * 0.5;
  const days = (now - usage.ultimo) / DAY_MS;
  const recencia = days < 1 ? 5 : days < 7 ? 3 : days < 30 ? 1 : 0;
  return frequency + recencia;
}

export function registerUsage(usage: Record<string, Usage>, id: string, limit: number, now = Date.now()): Record<string, Usage> {
  const next = { ...usage, [id]: { vezes: (usage[id]?.vezes ?? 0) + 1, ultimo: now } };
  const ids = Object.keys(next);
  if (ids.length <= limit) return next;
  for (const old of ids.sort((a, b) => next[a].ultimo - next[b].ultimo).slice(0, ids.length - limit)) delete next[old];
  return next;
}

type Token = { tipo: "num"; valor: number } | { tipo: "op"; valor: string };

function numberBrazilian(rawValue: string): number {
  if (rawValue.includes(",") && rawValue.includes(".")) return Number(rawValue.replace(/\./g, "").replace(",", "."));
  return Number(rawValue.replace(",", "."));
}

function separate(text: string): Token[] | null {
  const clean = text.replace(/×|x(?=\s*[\d(])/gi, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  const pecas: Token[] = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (/[\d.,]/.test(c)) {
      let end = i;
      while (end < clean.length && /[\d.,]/.test(clean[end])) end++;
      const value = numberBrazilian(clean.slice(i, end));
      if (!Number.isFinite(value)) return null;
      pecas.push({ tipo: "num", valor: value });
      i = end;
    } else if ("+-*/%^()".includes(c)) {
      pecas.push({ tipo: "op", valor: c });
      i++;
    } else return null;
  }
  return pecas;
}

export function calculate(text: string): number | null {
  if (!/\d/.test(text) || !/[+\-*/%^×÷x]/i.test(text.replace(/^\s*-/, ""))) return null;
  if (!/^[\d\s+\-*/%^().,x×÷]+$/i.test(text)) return null;
  const pecas = separate(text);
  if (!pecas?.length) return null;
  let p = 0;
  const is = (v: string) => pecas[p]?.tipo === "op" && pecas[p].valor === v;
  const expressao = (): number => {
    let v = term();
    while (is("+") || is("-")) {
      const op = pecas[p++].valor;
      const d = term();
      v = op === "+" ? v + d : v - d;
    }
    return v;
  };
  const term = (): number => {
    let v = potencia();
    while (is("*") || is("/") || is("%")) {
      const op = pecas[p++].valor;
      const d = potencia();
      v = op === "*" ? v * d : op === "/" ? v / d : v % d;
    }
    return v;
  };
  const potencia = (): number => {
    const base = unario();
    if (!is("^")) return base;
    p++;
    return Math.pow(base, potencia());
  };
  const unario = (): number => {
    if (is("-")) {
      p++;
      return -unario();
    }
    if (is("+")) {
      p++;
      return unario();
    }
    return atomo();
  };
  const atomo = (): number => {
    const x = pecas[p++];
    if (!x) throw new Error("fim");
    if (x.tipo === "num") return x.valor;
    if (x.valor !== "(") throw new Error("simbolo");
    const v = expressao();
    if (!is(")")) throw new Error("parenteses");
    p++;
    return v;
  };
  try {
    const result = expressao();
    return p === pecas.length && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function formatNumber(n: number): string {
  return (Math.round(n * 1e10) / 1e10).toLocaleString("pt-BR", { maximumFractionDigits: 10 });
}

export function numberToCopy(n: number): string {
  return String(Math.round(n * 1e10) / 1e10).replace(".", ",");
}

export function addressWeb(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|gov|edu|br|co|ai|me|tv|xyz)(\/\S*)?$/i.test(t)) return `https://${t}`;
  return null;
}

export function addressSearch(query: string, searchEngine: SearchEngine): string {
  return `${ADDRESS_SEARCHENGINE[searchEngine] ?? ADDRESS_SEARCHENGINE.google}${encodeURIComponent(query.trim())}`;
}
