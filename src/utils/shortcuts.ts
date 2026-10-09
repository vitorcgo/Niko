export const ACTIONS_GLOBAL = ["captura", "lupa", "sistema", "pomodoro", "midia", "privacidade", "naoPerturbe", "pedido", "proximaAba", "terminal"] as const;

export type ActionGlobal = (typeof ACTIONS_GLOBAL)[number];

export type StatusShortcut = "ok" | "desligado" | "invalido" | "repetido" | "digita_caractere" | "em_uso";

export const SHORTCUTS_DEFAULT: Record<ActionGlobal, string> = {
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

const MODIFIERS = ["ctrl", "alt", "shift", "super"] as const;
type Modifier = (typeof MODIFIERS)[number];

const NAME_MODIFIER: Record<Modifier, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", super: "Win" };

const NAME_KEY: Record<string, string> = {
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

const KEY_ACCEPTED = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/;

export function separateKeys(keys: string): { modificadores: Modifier[]; tecla: string } | null {
  const parts = keys.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key || !KEY_ACCEPTED.test(key)) return null;
  const modifiers = parts.map((p) => p.toLowerCase());
  if (modifiers.some((m) => !MODIFIERS.includes(m as Modifier))) return null;
  const uniqueItems = MODIFIERS.filter((m) => modifiers.includes(m));
  const feature = /^F\d+$/.test(key);
  if (!feature && !uniqueItems.some((m) => m === "ctrl" || m === "alt" || m === "super")) return null;
  return { modificadores: uniqueItems, tecla: key };
}

export function formatKeys(keys: string): string {
  const s = separateKeys(keys);
  if (!s) return "";
  const key = NAME_KEY[s.tecla] ?? s.tecla.replace(/^Key|^Digit/, "");
  return [...s.modificadores.map((m) => NAME_MODIFIER[m]), key].join(" + ");
}

export function keysEvent(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string | null {
  if (!KEY_ACCEPTED.test(e.code)) return null;
  const modifiers: Modifier[] = [];
  if (e.ctrlKey) modifiers.push("ctrl");
  if (e.altKey) modifiers.push("alt");
  if (e.shiftKey) modifiers.push("shift");
  if (e.metaKey) modifiers.push("super");
  const keys = [...modifiers, e.code].join("+");
  return separateKeys(keys) ? keys : null;
}

export function matchesWith(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">, keys: string): boolean {
  const target = separateKeys(keys);
  const received = keysEvent(e);
  if (!target || !received) return false;
  const r = separateKeys(received);
  return r !== null && r.tecla === target.tecla && r.modificadores.join() === target.modificadores.join();
}

export function shortcutsWithDefault(saved: Partial<Record<string, unknown>> | undefined): Record<ActionGlobal, string> {
  const output = { ...SHORTCUTS_DEFAULT };
  for (const action of ACTIONS_GLOBAL) {
    const value = saved?.[action];
    if (value === "" || (typeof value === "string" && separateKeys(value))) output[action] = value;
  }
  return output;
}
