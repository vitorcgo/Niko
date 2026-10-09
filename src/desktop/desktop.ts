import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { Route, ServiceId } from "../types";

export type NameWindow = "sistema" | "ilha" | "dock" | "assistive";

interface InternalsTauri {
  metadata?: { currentWindow?: { label?: string } };
}

const internals = typeof window !== "undefined" ? (window as unknown as { __TAURI_INTERNALS__?: InternalsTauri }).__TAURI_INTERNALS__ : undefined;

export const NATIVE = Boolean(internals);

export const LABEL: string | null = NATIVE ? internals?.metadata?.currentWindow?.label ?? "sistema" : null;

export function typeWindow(label: string): NameWindow {
  if (label === "dock" || label.startsWith("dock-")) return "dock";
  if (label === "assistive") return "assistive";
  return label === "ilha" ? "ilha" : "sistema";
}

export const WINDOW: NameWindow | null = LABEL === null ? null : typeWindow(LABEL);

export type Command =
  | { tipo: "irPara"; rota: Route; parametros?: Record<string, string> }
  | { tipo: "abrirConexao"; id: ServiceId }
  | { tipo: "abrirBusca" }
  | { tipo: "abrirCaptura" };

const channel = !NATIVE && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("niko-comandos") : null;

export function sendCommand(c: Command) {
  if (NATIVE) {
    void emitTo("sistema", "niko-comandos", c).catch((error) => console.error("Falha ao enviar comando para a janela do Niko", error));
  } else channel?.postMessage(c);
  void showSystem();
}

export function listenCommands(fn: (c: Command) => void): () => void {
  if (NATIVE) {
    let active = true;
    let disable: () => void = () => undefined;
    void listen<Command>("niko-comandos", (e) => {
      if (active) fn(e.payload);
    }, { target: { kind: "WebviewWindow", label: "sistema" } }).then((f) => {
      if (active) disable = f;
      else f();
    }).catch((error) => console.error("Falha ao receber comandos na janela do Niko", error));
    return () => {
      if (!active) return;
      active = false;
      disable();
    };
  }
  if (!channel) return () => undefined;
  const onReceive = (e: MessageEvent<Command>) => fn(e.data);
  channel.addEventListener("message", onReceive);
  return () => channel.removeEventListener("message", onReceive);
}

export function outsideSystem(): boolean {
  return NATIVE && WINDOW !== "sistema";
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!NATIVE) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch {
    return null;
  }
}

function isLinkExternal(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
}

export function openLink(url: string) {
  if (!isLinkExternal(url)) return;
  if (NATIVE) void invokeNative("abrir_link", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function redirectLinksExternal() {
  if (!NATIVE) return;
  document.addEventListener(
    "click",
    (e) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || !isLinkExternal(link.href)) return;
      e.preventDefault();
      openLink(link.href);
    },
    true,
  );
}

export function showSystem() {
  return invokeNative("mostrar_sistema");
}

export function prepareUpdate() {
  return invokeNative<void>("preparar_atualizacao");
}

export function releaseSystemInitial() {
  return invokeNative("liberar_sistema_inicial");
}

export function timeIdleMs() {
  return invokeNative<number>("tempo_ocioso_ms");
}

export async function versionApp(): Promise<string> {
  if (!NATIVE) return "web";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "desconhecida";
  }
}

export interface ResultShortcut {
  acao: string;
  teclas: string;
  situacao: string;
}

export function setShortcutsGlobal(list: { acao: string; teclas: string }[]) {
  return invokeNative<ResultShortcut[]>("definir_atalhos", { lista: list });
}

export async function listenShortcut(fn: (action: string) => void): Promise<() => void> {
  if (!NATIVE || !LABEL) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("niko://atalho", (e) => fn(e.payload), { target: { kind: "WebviewWindow", label: LABEL } });
}

export function reportAreaInteractive(rectangles: { x: number; y: number; w: number; h: number }[]) {
  return invokeNative("area_interativa", { janela: LABEL, retangulos: rectangles });
}

export async function windowCurrent() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function listenEvent(nameValue: string, fn: () => void, onlyDestaWindow = false): Promise<() => void> {
  if (!NATIVE) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen(nameValue, fn, onlyDestaWindow && LABEL ? { target: { kind: "WebviewWindow", label: LABEL } } : undefined);
}

function sendPelaBridge(base: string, token: string | null) {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, options?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/ponte")) {
      const headers = new Headers(options?.headers);
      if (token) headers.set("x-niko-token", token);
      return original(`${base}${input}`, { ...options, headers: headers });
    }
    return original(input, options);
  };
}

export async function prepareBridge() {
  if (NATIVE && window.location.hostname === "tauri.localhost") {
    const [token, port] = await Promise.all([invokeNative<string>("token_ponte"), invokeNative<number>("porta_ponte")]);
    sendPelaBridge(`http://127.0.0.1:${port ?? 47831}`, token);
    return;
  }
  const tokenDevelopment = document.querySelector<HTMLMetaElement>('meta[name="niko-token"]')?.content;
  if (tokenDevelopment) sendPelaBridge("", tokenDevelopment);
}

export async function synchronizeStartWithWindows(enabled: boolean) {
  if (!NATIVE) return;
  try {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
    const current = await isEnabled();
    if (enabled && !current) await enable();
    if (!enabled && current) await disable();
  } catch {
    return;
  }
}

const INTERVAL_SECURITY_AREA_MS = 1000;

export function useAreaInteractive(selectors: string[]) {
  const keySelectors = selectors.join(",");
  useEffect(() => {
    if (!NATIVE) return;
    let previous = "";
    let board = 0;
    const measure = () => {
      board = 0;
      const rectangles = [...document.querySelectorAll(keySelectors)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }));
      const current = JSON.stringify(rectangles);
      if (current === previous) return;
      previous = current;
      void reportAreaInteractive(rectangles);
    };
    const schedule = () => {
      if (!board) board = window.requestAnimationFrame(measure);
    };
    const attributes = new MutationObserver(schedule);
    const observeTargets = () => {
      attributes.disconnect();
      for (const el of document.querySelectorAll(keySelectors)) {
        for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) attributes.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
      }
    };
    const structure = new MutationObserver(() => {
      observeTargets();
      schedule();
    });
    observeTargets();
    measure();
    structure.observe(document.body, { subtree: true, childList: true });
    const events = ["resize", "transitionend", "animationend"] as const;
    for (const e of events) window.addEventListener(e, schedule, true);
    const security = window.setInterval(schedule, INTERVAL_SECURITY_AREA_MS);
    return () => {
      attributes.disconnect();
      structure.disconnect();
      for (const e of events) window.removeEventListener(e, schedule, true);
      window.clearInterval(security);
      window.cancelAnimationFrame(board);
    };
  }, [keySelectors]);
}

export function useCursorOutside(fn: () => void) {
  useEffect(() => {
    if (!NATIVE) return;
    let disable: () => void = () => undefined;
    let active = true;
    void listenEvent("niko://cursor-fora", fn, true).then((f) => {
      if (active) disable = f;
      else f();
    });
    return () => {
      active = false;
      disable();
    };
  }, [fn]);
}
export interface AppOpen {
  id: string;
  pid: number;
  titulo: string;
  minimizada: boolean;
  ativa: boolean;
  app: string;
  nome: string;
  caminho: string | null;
  icone: string | null;
  monitor?: string;
  grupo?: string | null;
  nomeDoGrupo?: string | null;
}

export interface NikoMonitor {
  nome: string;
  rotulo: string;
  numero: number;
  principal: boolean;
  largura: number;
  altura: number;
}

export function setDocks(enabled: boolean, selection: string) {
  return invokeNative("definir_docks", { ligado: enabled, escolha: selection });
}

export function returnFocus() {
  return invokeNative("devolver_foco");
}

export function setMonitorIsland(selection: string) {
  return invokeNative("definir_monitor_da_ilha", { escolha: selection });
}

export function useMonitors(): NikoMonitor[] {
  const [list, setList] = useState<NikoMonitor[]>([]);
  useEffect(() => {
    if (!NATIVE) return;
    let alive = true;
    let disable: () => void = () => undefined;
    void invokeNative<NikoMonitor[]>("monitores").then((r) => alive && r && setList(r));
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<NikoMonitor[]>("niko://monitores", (e) => alive && setList(e.payload)).then((f) => {
        if (alive) disable = f;
        else f();
      }),
    );
    return () => {
      alive = false;
      disable();
    };
  }, []);
  return list;
}

export function useAppsOpen(active: boolean): [AppOpen[], () => void] {
  const [apps, setApps] = useState<AppOpen[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!NATIVE || !active) return;
    let alive = true;
    const read = async () => {
      try {
        const r = await fetch("/ponte/janelas", { headers: { "x-niko": "1" } });
        if (!r.ok) return;
        const j = (await r.json()) as { janelas?: AppOpen[] | AppOpen };
        const list = Array.isArray(j.janelas) ? j.janelas : j.janelas ? [j.janelas] : [];
        if (alive) setApps(list);
      } catch {
        return;
      }
    };
    void read();
    const t = window.setInterval(() => void read(), 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [active, version]);
  return [apps, () => setVersion((v) => v + 1)];
}

export interface AreaThumbnail {
  janela: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function showThumbnails(items: AreaThumbnail[]) {
  return invokeNative("miniaturas_janelas", { itens: items });
}

export function hideBarWindows(hide: boolean) {
  return invokeNative("barra_windows", { ocultarBarra: hide });
}

export function reserveSpaceDock(reserve: boolean) {
  return invokeNative("reservar_dock", { reservar: reserve });
}

export type ForegroundType = "area_de_trabalho" | "sobreposta" | "app";

export interface ForegroundState {
  cobre: boolean;
  telaCheia: boolean;
  maximizada: boolean;
  frente: ForegroundType;
}

const FRONT_FREE: ForegroundState = { cobre: false, telaCheia: false, maximizada: false, frente: "area_de_trabalho" };

export async function allowNotifications(): Promise<boolean> {
  if (!NATIVE) return false;
  try {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export async function notifyWindows(title: string, body: string): Promise<void> {
  if (!NATIVE) return;
  try {
    const { isPermissionGranted, sendNotification } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) sendNotification({ title: title, body: body });
  } catch {
    return;
  }
}

export async function frontCoversAIsland(): Promise<boolean> {
  const r = await invokeNative<ForegroundState>("frente_cobre_tela");
  return Boolean(r?.cobre);
}

export async function frontAtScreenFull(): Promise<boolean> {
  const r = await invokeNative<ForegroundState>("frente_cobre_tela");
  return Boolean(r?.telaCheia);
}

export function useStateFront(active: boolean): ForegroundState {
  const [state, setState] = useState<ForegroundState>(FRONT_FREE);
  useEffect(() => {
    if (!NATIVE || !active) {
      setState(FRONT_FREE);
      return;
    }
    let alive = true;
    const read = async () => {
      const r = await invokeNative<ForegroundState>("frente_cobre_tela");
      if (!alive) return;
      const covers = Boolean(r?.cobre);
      const screenFull = Boolean(r?.telaCheia);
      const maximized = Boolean(r?.maximizada);
      const front: ForegroundType = r?.frente === "app" || r?.frente === "sobreposta" ? r.frente : "area_de_trabalho";
      setState((previous) => (previous.cobre === covers && previous.telaCheia === screenFull && previous.maximizada === maximized && previous.frente === front ? previous : { cobre: covers, telaCheia: screenFull, maximizada: maximized, frente: front }));
    };
    void read();
    const t = window.setInterval(() => void read(), 800);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [active]);
  return state;
}

export async function actWindow(action: "focar" | "minimizar" | "fechar", id: string) {
  try {
    await fetch(`/ponte/janelas/${action}`, { method: "POST", headers: { "x-niko": "1", "content-type": "application/json" }, body: JSON.stringify({ janela: id }) });
  } catch {
    return;
  }
}

export function toggleSystemNative() {
  return invokeNative("alternar_sistema");
}
