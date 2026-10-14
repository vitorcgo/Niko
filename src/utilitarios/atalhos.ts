import { TECLA_SUPER } from "../desktop/plataforma";

export const ACOES_GLOBAIS =["captura", "lupa", "sistema", "pomodoro", "midia", "privacidade", "naoPerturbe", "pedido", "proximaAba", "terminal"] as const;

export type AcaoGlobal = (typeof ACOES_GLOBAIS)[number];

export type SituacaoDoAtalho = "ok" | "desligado" | "invalido" | "repetido" | "digita_caractere" | "em_uso";

export const ATALHOS_PADRAO: Record<AcaoGlobal, string> = {
  captura: "ctrl+alt+Space",
  lupa: "ctrl+alt+KeyL",
  sistema: "ctrl+alt+KeyN",
  pomodoro: "ctrl+alt+KeyP",
  midia: "ctrl+alt+KeyM",
  privacidade: "ctrl+alt+KeyH",
  naoPerturbe: "",
  pedido: "",
  proximaAba: "",
  terminal: "",
};

const MODIFICADORES = ["ctrl", "alt", "shift", "super"] as const;
type Modificador = (typeof MODIFICADORES)[number];

const NOME_DO_MODIFICADOR: Record<Modificador, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", super: TECLA_SUPER };

const NOME_DA_TECLA: Record<string, string> = {
  Space: "Espaço",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

const TECLA_ACEITA = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/;

export function separarTeclas(teclas: string): { modificadores: Modificador[]; tecla: string } | null {
  const partes = teclas.split("+").map((p) => p.trim()).filter(Boolean);
  const tecla = partes.pop();
  if (!tecla || !TECLA_ACEITA.test(tecla)) return null;
  const modificadores = partes.map((p) => p.toLowerCase());
  if (modificadores.some((m) => !MODIFICADORES.includes(m as Modificador))) return null;
  const unicos = MODIFICADORES.filter((m) => modificadores.includes(m));
  const funcao = /^F\d+$/.test(tecla);
  if (!funcao && !unicos.some((m) => m === "ctrl" || m === "alt" || m === "super")) return null;
  return { modificadores: unicos, tecla };
}

export function formatarTeclas(teclas: string): string {
  const s = separarTeclas(teclas);
  if (!s) return "";
  const tecla = NOME_DA_TECLA[s.tecla] ?? s.tecla.replace(/^Key|^Digit/, "");
  return [...s.modificadores.map((m) => NOME_DO_MODIFICADOR[m]), tecla].join(" + ");
}

export function teclasDoEvento(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
  if (!TECLA_ACEITA.test(e.code)) return null;
  const modificadores: Modificador[] = [];
  if (e.ctrlKey) modificadores.push("ctrl");
  if (e.altKey) modificadores.push("alt");
  if (e.shiftKey) modificadores.push("shift");
  if (e.metaKey) modificadores.push("super");
  const teclas = [...modificadores, e.code].join("+");
  return separarTeclas(teclas) ? teclas : null;
}

export function combinaCom(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">, teclas: string): boolean {
  const alvo = separarTeclas(teclas);
  const recebido = teclasDoEvento(e);
  if (!alvo || !recebido) return false;
  const r = separarTeclas(recebido);
  return r !== null && r.tecla === alvo.tecla && r.modificadores.join() === alvo.modificadores.join();
}

export function atalhosComPadrao(salvos: Partial<Record<string, unknown>> | undefined): Record<AcaoGlobal, string> {
  const saida = { ...ATALHOS_PADRAO };
  for (const acao of ACOES_GLOBAIS) {
    const valor = salvos?.[acao];
    if (valor === "" || (typeof valor === "string" && separarTeclas(valor))) saida[acao] = valor;
  }
  return saida;
}
