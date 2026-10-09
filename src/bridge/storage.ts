import { createJSONStorage, type StateStorage } from "zustand/middleware";

export const PREFIX = "niko:";
const databaseTest = (() => {
  try {
    const nameValue = new URLSearchParams(window.location.search).get("banco") ?? "";
    return /^[a-z0-9-]{1,20}$/.test(nameValue) ? nameValue : "";
  } catch {
    return "";
  }
})();
const HEADERS: Record<string, string> = { "x-niko": "1", "content-type": "application/json", ...(databaseTest ? { "x-niko-banco": databaseTest } : {}) };

export function databaseHeaders(): Record<string, string> {
  return databaseTest ? { "x-niko-banco": databaseTest } : {};
}

export type ModeStorage = "banco" | "local";

let mode: ModeStorage = "local";
const cache = new Map<string, string>();
const pendingRequests = new Map<string, string | null>();
let timer = 0;
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("niko-dados") : null;
const listenersOutside = new Set<(key: string) => void>();
const ORIGIN = Math.random().toString(36).slice(2);
const EVENT_DATA = "niko-dados";
const noticesPending = new Map<string, string | null>();
let timerNotice = 0;

interface ChangeData {
  origem: string;
  chave: string;
  valor: string | null;
}

function tauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function notifyOthersWindows(key: string, value: string | null) {
  channel?.postMessage({ origem: ORIGIN, chave: key, valor: value } satisfies ChangeData);
  if (!tauriAvailable()) return;
  noticesPending.set(key, value);
  if (timerNotice) return;
  timerNotice = window.setTimeout(async () => {
    timerNotice = 0;
    const items = [...noticesPending];
    noticesPending.clear();
    try {
      const { emit } = await import("@tauri-apps/api/event");
      for (const [c, v] of items) await emit(EVENT_DATA, { origem: ORIGIN, chave: c, valor: v } satisfies ChangeData);
    } catch {
      return;
    }
  }, 120);
}

function receiveOutside(m: ChangeData) {
  if (!m || m.origem === ORIGIN || pendingRequests.has(m.chave)) return;
  const current = cache.get(m.chave) ?? null;
  if (current === m.valor) return;
  if (m.valor === null) cache.delete(m.chave);
  else cache.set(m.chave, m.valor);
  listenersOutside.forEach((f) => f(m.chave));
}

async function reloadBridge() {
  if (mode !== "banco") return;
  try {
    const r = await fetch("/ponte/dados", { headers: HEADERS });
    if (!r.ok) return;
    const { dados: payload } = (await r.json()) as { dados: Record<string, string> };
    for (const [k, v] of Object.entries(payload)) receiveOutside({ origem: "ponte", chave: k, valor: v });
  } catch {
    return;
  }
}

function localSafe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function sendPending(keepAlive = false) {
  window.clearTimeout(timer);
  timer = 0;
  if (pendingRequests.size === 0) return;
  const items = Object.fromEntries(pendingRequests);
  pendingRequests.clear();
  try {
    const r = await fetch("/ponte/dados", { method: "POST", headers: HEADERS, body: JSON.stringify({ itens: items }), keepalive: keepAlive && JSON.stringify(items).length < 60000 });
    if (!r.ok) throw new Error(`http_${r.status}`);
  } catch {
    for (const [k, v] of Object.entries(items)) if (!pendingRequests.has(k) && (cache.get(k) ?? null) === v) pendingRequests.set(k, v);
    window.dispatchEvent(new CustomEvent("niko:armazenamento-falhou"));
    schedule(4000);
  }
}

function schedule(ms = 350) {
  if (timer) return;
  timer = window.setTimeout(() => void sendPending(), ms);
}

const storageSafe: StateStorage = {
  getItem: (nameValue) => (mode === "banco" ? cache.get(nameValue) ?? null : localSafe(() => localStorage.getItem(nameValue), cache.get(nameValue) ?? null)),
  setItem: (nameValue, value) => {
    if (locked) return;
    if (mode === "banco") {
      if (cache.get(nameValue) === value) return;
      cache.set(nameValue, value);
      pendingRequests.set(nameValue, value);
      schedule();
      notifyOthersWindows(nameValue, value);
      return;
    }
    try {
      localStorage.setItem(nameValue, value);
    } catch {
      cache.set(nameValue, value);
      window.dispatchEvent(new CustomEvent("niko:armazenamento-cheio"));
    }
  },
  removeItem: (nameValue) => {
    if (locked) return;
    if (mode === "banco") {
      cache.delete(nameValue);
      pendingRequests.set(nameValue, null);
      schedule();
      notifyOthersWindows(nameValue, null);
      return;
    }
    localSafe(() => localStorage.removeItem(nameValue), undefined);
    cache.delete(nameValue);
  },
};

export const storage = createJSONStorage(() => storageSafe);

export function key(nameValue: string): string {
  return `${PREFIX}${nameValue}`;
}

export function modeStorage(): ModeStorage {
  return mode;
}

function keysLocal(): string[] {
  return localSafe(() => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)), []);
}

export async function startStorage(): Promise<ModeStorage> {
  try {
    const control = new AbortController();
    const limit = window.setTimeout(() => control.abort(), 4000);
    const r = await fetch("/ponte/dados", { headers: HEADERS, signal: control.signal });
    window.clearTimeout(limit);
    if (!r.ok) throw new Error(`http_${r.status}`);
    const { dados: payload } = (await r.json()) as { dados: Record<string, string> };
    for (const [k, v] of Object.entries(payload)) cache.set(k, v);
    mode = "banco";
    const local = keysLocal().filter((k) => k !== `${PREFIX}migrado`);
    const alreadyMigrated = localSafe(() => localStorage.getItem(`${PREFIX}migrado`), null);
    if (Object.keys(payload).length === 0 && local.length > 0 && !alreadyMigrated) {
      for (const k of local) {
        const v = localStorage.getItem(k);
        if (v != null) {
          cache.set(k, v);
          pendingRequests.set(k, v);
        }
      }
      await sendPending();
      if (pendingRequests.size === 0) localSafe(() => localStorage.setItem(`${PREFIX}migrado`, new Date().toISOString()), undefined);
    }
    channel?.addEventListener("message", (e: MessageEvent<ChangeData>) => receiveOutside(e.data));
    if (tauriAvailable()) {
      const { listen } = await import("@tauri-apps/api/event");
      await listen<ChangeData>(EVENT_DATA, (e) => receiveOutside(e.payload));
      await listen("niko://saindo", () => void sendPending());
    }
    window.addEventListener("focus", () => void reloadBridge());
    window.addEventListener("pagehide", () => void sendPending(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void sendPending(true);
      else void reloadBridge();
    });
  } catch {
    mode = "local";
  }
  return mode;
}

export function onChangeOutside(fn: (key: string) => void): () => void {
  listenersOutside.add(fn);
  return () => listenersOutside.delete(fn);
}

let locked = false;

export async function resetAll(deleteKeys: boolean): Promise<void> {
  locked = true;
  window.clearTimeout(timer);
  pendingRequests.clear();
  if (mode === "banco") {
    const r = await fetch("/ponte/dados/zerar", { method: "POST", headers: HEADERS, body: JSON.stringify({ confirmacao: "APAGAR", chaves: deleteKeys }) });
    if (!r.ok) {
      locked = false;
      throw new Error(`http_${r.status}`);
    }
    cache.clear();
  }
  for (const k of keysLocal()) if (k !== `${PREFIX}migrado`) localSafe(() => localStorage.removeItem(k), undefined);
  localSafe(() => localStorage.setItem(`${PREFIX}migrado`, new Date().toISOString()), undefined);
}

export function saveNow(): Promise<void> {
  return sendPending();
}

const KEY_NOTIFIED = `${PREFIX}avisados`;

export function markIfNew(code: string): boolean {
  let list: string[] = [];
  try {
    list = JSON.parse((storageSafe.getItem(KEY_NOTIFIED) as string | null) ?? "[]") as string[];
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  if (list.includes(code)) return false;
  storageSafe.setItem(KEY_NOTIFIED, JSON.stringify([...list, code].slice(-300)));
  return true;
}

export function listKeys(): string[] {
  if (mode === "banco") return [...cache.keys()].filter((k) => k.startsWith(PREFIX));
  return keysLocal();
}

export function readKey(nameValue: string): string | null {
  return storageSafe.getItem(nameValue) as string | null;
}

export function writeKey(nameValue: string, value: string) {
  storageSafe.setItem(nameValue, value);
}

export function deleteKey(nameValue: string) {
  storageSafe.removeItem(nameValue);
}

export function storedSize(): number {
  let total = 0;
  for (const k of listKeys()) total += (readKey(k) ?? "").length * 2;
  return total;
}
