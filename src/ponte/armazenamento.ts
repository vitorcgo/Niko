import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { objeto } from "../utilitarios/validacoes";

export const PREFIXO = "niko:";
const bancoDeTeste = (() => {
  try {
    const nome = new URLSearchParams(window.location.search).get("banco") ?? "";
    return /^[a-z0-9-]{1,20}$/.test(nome) ? nome : "";
  } catch {
    return "";
  }
})();
const CABECALHOS: Record<string, string> = { "x-niko": "1", "content-type": "application/json", ...(bancoDeTeste ? { "x-niko-banco": bancoDeTeste } : {}) };

export function cabecalhoDoBanco(): Record<string, string> {
  return bancoDeTeste ? { "x-niko-banco": bancoDeTeste } : {};
}

export type ModoArmazenamento = "banco" | "local";

let modo: ModoArmazenamento = "local";
const cache = new Map<string, string>();
const pendentes = new Map<string, string | null>();
let temporizador = 0;
const nomeCanal = bancoDeTeste ? `niko-dados-${bancoDeTeste}` : "niko-dados";
const canal = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(nomeCanal) : null;
const ouvintesDeFora = new Set<(chave: string) => void>();
const ORIGEM = Math.random().toString(36).slice(2);
const EVENTO_DADOS = nomeCanal;
const avisosPendentes = new Map<string, string | null>();
let temporizadorAviso = 0;

interface MudancaDeDados {
  banco: string;
  origem: string;
  chave: string;
  valor: string | null;
}

function tauriDisponivel(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function avisarOutrasJanelas(chave: string, valor: string | null) {
  canal?.postMessage({ origem: ORIGEM, banco: bancoDeTeste, chave, valor } satisfies MudancaDeDados);
  if (!tauriDisponivel()) return;
  avisosPendentes.set(chave, valor);
  if (temporizadorAviso) return;
  temporizadorAviso = window.setTimeout(async () => {
    temporizadorAviso = 0;
    const itens = [...avisosPendentes];
    avisosPendentes.clear();
    try {
      const { emit } = await import("@tauri-apps/api/event");
      for (const [c, v] of itens) await emit(EVENTO_DADOS, { origem: ORIGEM, banco: bancoDeTeste, chave: c, valor: v } satisfies MudancaDeDados);
    } catch {
      return;
    }
  }, 120);
}

function receberDeFora(m: unknown) {
  if (!objeto(m) || m.banco !== bancoDeTeste || typeof m.origem !== "string" || typeof m.chave !== "string" || !/^niko:[a-z0-9_-]{1,60}$/.test(m.chave) || (m.valor !== null && (typeof m.valor !== "string" || m.valor.length > 20_000_000))) return;
  if (m.origem === ORIGEM || pendentes.has(m.chave)) return;
  const atual = cache.get(m.chave) ?? null;
  if (atual === m.valor) return;
  if (m.valor === null) cache.delete(m.chave);
  else cache.set(m.chave, m.valor as string);
  const chaveRecebida = m.chave;
  ouvintesDeFora.forEach((f) => f(chaveRecebida));
}

async function recarregarDaPonte() {
  if (modo !== "banco") return;
  try {
    const r = await fetch("/ponte/dados", { headers: CABECALHOS });
    if (!r.ok) return;
    const resposta: unknown = await r.json();
    if (!objeto(resposta) || !objeto(resposta.dados)) return;
    for (const [k, v] of Object.entries(resposta.dados)) receberDeFora({ origem: "ponte", banco: bancoDeTeste, chave: k, valor: v });
  } catch {
    return;
  }
}

function localSeguro<T>(fn: () => T, reserva: T): T {
  try {
    return fn();
  } catch {
    return reserva;
  }
}

async function enviarPendentes(manterViva = false) {
  window.clearTimeout(temporizador);
  temporizador = 0;
  if (pendentes.size === 0) return;
  const itens = Object.fromEntries(pendentes);
  pendentes.clear();
  try {
    const r = await fetch("/ponte/dados", { method: "POST", headers: CABECALHOS, body: JSON.stringify({ itens }), keepalive: manterViva && JSON.stringify(itens).length < 60000 });
    if (!r.ok) throw new Error(`http_${r.status}`);
  } catch {
    for (const [k, v] of Object.entries(itens)) if (!pendentes.has(k) && (cache.get(k) ?? null) === v) pendentes.set(k, v);
    window.dispatchEvent(new CustomEvent("niko:armazenamento-falhou"));
    agendar(4000);
  }
}

function agendar(ms = 350) {
  if (temporizador) return;
  temporizador = window.setTimeout(() => void enviarPendentes(), ms);
}

const armazenamentoSeguro: StateStorage = {
  getItem: (nome) => (modo === "banco" ? cache.get(nome) ?? null : localSeguro(() => localStorage.getItem(nome), cache.get(nome) ?? null)),
  setItem: (nome, valor) => {
    if (travado) return;
    if (modo === "banco") {
      if (cache.get(nome) === valor) return;
      cache.set(nome, valor);
      pendentes.set(nome, valor);
      agendar();
      avisarOutrasJanelas(nome, valor);
      return;
    }
    try {
      localStorage.setItem(nome, valor);
    } catch {
      cache.set(nome, valor);
      window.dispatchEvent(new CustomEvent("niko:armazenamento-cheio"));
    }
  },
  removeItem: (nome) => {
    if (travado) return;
    if (modo === "banco") {
      cache.delete(nome);
      pendentes.set(nome, null);
      agendar();
      avisarOutrasJanelas(nome, null);
      return;
    }
    localSeguro(() => localStorage.removeItem(nome), undefined);
    cache.delete(nome);
  },
};

export const armazenamento = createJSONStorage(() => armazenamentoSeguro);

export function chave(nome: string): string {
  return `${PREFIXO}${nome}`;
}

export function modoArmazenamento(): ModoArmazenamento {
  return modo;
}

function chavesLocais(): string[] {
  return localSeguro(() => Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)), []);
}

export async function iniciarArmazenamento(): Promise<ModoArmazenamento> {
  try {
    const controle = new AbortController();
    const limite = window.setTimeout(() => controle.abort(), 4000);
    const r = await fetch("/ponte/dados", { headers: CABECALHOS, signal: controle.signal });
    window.clearTimeout(limite);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const resposta: unknown = await r.json();
    if (!objeto(resposta) || !objeto(resposta.dados)) throw new Error("dados_invalidos");
    const dados = resposta.dados;
    for (const [k, v] of Object.entries(dados)) {
      if (!/^niko:[a-z0-9_-]{1,60}$/.test(k) || typeof v !== "string" || v.length > 20_000_000) throw new Error("dados_invalidos");
    }
    for (const [k, v] of Object.entries(dados)) cache.set(k, v as string);
    modo = "banco";
    const locais = chavesLocais().filter((k) => k !== `${PREFIXO}migrado`);
    const jaMigrou = localSeguro(() => localStorage.getItem(`${PREFIXO}migrado`), null);
    if (Object.keys(dados).length === 0 && locais.length > 0 && !jaMigrou) {
      for (const k of locais) {
        const v = localStorage.getItem(k);
        if (v != null) {
          cache.set(k, v);
          pendentes.set(k, v);
        }
      }
      await enviarPendentes();
      if (pendentes.size === 0) localSeguro(() => localStorage.setItem(`${PREFIXO}migrado`, new Date().toISOString()), undefined);
    }
    canal?.addEventListener("message", (e: MessageEvent<MudancaDeDados>) => receberDeFora(e.data));
    if (tauriDisponivel()) {
      const { listen } = await import("@tauri-apps/api/event");
      await listen<MudancaDeDados>(EVENTO_DADOS, (e) => receberDeFora(e.payload));
      await listen("niko://saindo", () => void enviarPendentes());
    }
    window.addEventListener("focus", () => void recarregarDaPonte());
    window.addEventListener("pagehide", () => void enviarPendentes(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void enviarPendentes(true);
      else void recarregarDaPonte();
    });
  } catch {
    modo = "local";
  }
  return modo;
}

export function aoMudarDeFora(fn: (chave: string) => void): () => void {
  ouvintesDeFora.add(fn);
  return () => ouvintesDeFora.delete(fn);
}

let travado = false;

export async function zerarTudo(apagarChaves: boolean): Promise<void> {
  travado = true;
  window.clearTimeout(temporizador);
  pendentes.clear();
  if (modo === "banco") {
    const r = await fetch("/ponte/dados/zerar", { method: "POST", headers: CABECALHOS, body: JSON.stringify({ confirmacao: "APAGAR", chaves: apagarChaves }) });
    if (!r.ok) {
      travado = false;
      throw new Error(`http_${r.status}`);
    }
    cache.clear();
  }
  for (const k of chavesLocais()) if (k !== `${PREFIXO}migrado`) localSeguro(() => localStorage.removeItem(k), undefined);
  localSeguro(() => localStorage.setItem(`${PREFIXO}migrado`, new Date().toISOString()), undefined);
}

export function salvarAgora(): Promise<void> {
  return enviarPendentes();
}

const CHAVE_AVISADOS = `${PREFIXO}avisados`;

export function marcarSeNovo(codigo: string): boolean {
  let lista: string[] = [];
  try {
    lista = JSON.parse((armazenamentoSeguro.getItem(CHAVE_AVISADOS) as string | null) ?? "[]") as string[];
    if (!Array.isArray(lista)) lista = [];
  } catch {
    lista = [];
  }
  if (lista.includes(codigo)) return false;
  armazenamentoSeguro.setItem(CHAVE_AVISADOS, JSON.stringify([...lista, codigo].slice(-300)));
  return true;
}

export function listarChaves(): string[] {
  if (modo === "banco") return [...cache.keys()].filter((k) => k.startsWith(PREFIXO));
  return chavesLocais();
}

export function lerChave(nome: string): string | null {
  return armazenamentoSeguro.getItem(nome) as string | null;
}

export function gravarChave(nome: string, valor: string) {
  armazenamentoSeguro.setItem(nome, valor);
}

export function apagarChave(nome: string) {
  armazenamentoSeguro.removeItem(nome);
}

export function tamanhoGuardado(): number {
  let total = 0;
  for (const k of listarChaves()) total += (lerChave(k) ?? "").length * 2;
  return total;
}
