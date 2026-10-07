import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { Rota, ServicoId } from "../tipos";

export type NomeJanela = "sistema" | "ilha" | "dock";

interface InternosTauri {
  metadata?: { currentWindow?: { label?: string } };
}

const internos = typeof window !== "undefined" ? (window as unknown as { __TAURI_INTERNALS__?: InternosTauri }).__TAURI_INTERNALS__ : undefined;

export const NATIVO = Boolean(internos);

export const LINUX = NATIVO && (window as unknown as { __NIKO_PLATAFORMA__?: string }).__NIKO_PLATAFORMA__ === "linux";

export const JANELA: NomeJanela | null = NATIVO ? ((internos?.metadata?.currentWindow?.label as NomeJanela | undefined) ?? "sistema") : null;

export type Comando =
  | { tipo: "irPara"; rota: Rota; parametros?: Record<string, string> }
  | { tipo: "abrirConexao"; id: ServicoId }
  | { tipo: "abrirBusca" }
  | { tipo: "abrirCaptura" };

const canal = typeof window !== "undefined" && !NATIVO && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("niko-comandos") : null;

export function enviarComando(c: Comando) {
  if (NATIVO) {
    void emitTo("sistema", "niko-comandos", c).catch((erro) => console.error("Falha ao enviar comando para a janela do Niko", erro));
  } else canal?.postMessage(c);
  void mostrarSistema();
}

export function ouvirComandos(fn: (c: Comando) => void): () => void {
  if (NATIVO) {
    let ativo = true;
    let desligar: () => void = () => undefined;
    void listen<Comando>("niko-comandos", (e) => {
      if (ativo) fn(e.payload);
    }, { target: { kind: "WebviewWindow", label: "sistema" } }).then((f) => {
      if (ativo) desligar = f;
      else f();
    }).catch((erro) => console.error("Falha ao receber comandos na janela do Niko", erro));
    return () => {
      if (!ativo) return;
      ativo = false;
      desligar();
    };
  }
  if (!canal) return () => undefined;
  const aoReceber = (e: MessageEvent<Comando>) => fn(e.data);
  canal.addEventListener("message", aoReceber);
  return () => canal.removeEventListener("message", aoReceber);
}

export function foraDoSistema(): boolean {
  return NATIVO && JANELA !== "sistema";
}

async function invocar<T>(comando: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!NATIVO) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(comando, args);
  } catch {
    return null;
  }
}

function ehLinkExterno(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
}

export function abrirLink(url: string) {
  if (!ehLinkExterno(url)) return;
  if (NATIVO) void invocar("abrir_link", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function desviarLinksExternos() {
  if (!NATIVO) return;
  document.addEventListener(
    "click",
    (e) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || !ehLinkExterno(link.href)) return;
      e.preventDefault();
      abrirLink(link.href);
    },
    true,
  );
}

export function mostrarSistema() {
  return invocar("mostrar_sistema");
}

export function informarAreaInterativa(retangulos: { x: number; y: number; w: number; h: number }[]) {
  if (LINUX && JANELA !== "dock") return;
  return invocar("area_interativa", { janela: JANELA, retangulos });
}

export async function dimensionarIlha(largura: number, altura: number) {
  if (!LINUX || JANELA !== "ilha") return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("dimensionar_ilha", { largura, altura });
}

export async function janelaAtual() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function ouvirEvento(nome: string, fn: () => void): Promise<() => void> {
  if (!NATIVO) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen(nome, fn);
}

function enviarPelaPonte(base: string, token: string | null) {
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    if (typeof entrada === "string" && entrada.startsWith("/ponte")) {
      const cabecalhos = new Headers(opcoes?.headers);
      if (token) cabecalhos.set("x-niko-token", token);
      return original(`${base}${entrada}`, { ...opcoes, headers: cabecalhos });
    }
    return original(entrada, opcoes);
  };
}

export async function prepararPonte() {
  if (NATIVO && (window.location.hostname === "tauri.localhost" || window.location.protocol === "tauri:")) {
    const [token, porta] = await Promise.all([invocar<string>("token_ponte"), invocar<number>("porta_ponte")]);
    enviarPelaPonte(`http://127.0.0.1:${porta ?? 47831}`, token);
    return;
  }
  const tokenDeDesenvolvimento = document.querySelector<HTMLMetaElement>('meta[name="niko-token"]')?.content;
  if (tokenDeDesenvolvimento) enviarPelaPonte("", tokenDeDesenvolvimento);
}

export async function sincronizarInicioComWindows(ligado: boolean) {
  if (!NATIVO) return;
  try {
    const { enable, disable, isEnabled } = await import("@tauri-apps/plugin-autostart");
    const atual = await isEnabled();
    if (ligado && !atual) await enable();
    if (!ligado && atual) await disable();
  } catch {
    return;
  }
}

const INTERVALO_SEGURANCA_AREA_MS = 1000;

export function usarAreaInterativa(seletores: string[]) {
  const chaveSeletores = seletores.join(",");
  useEffect(() => {
    if (!NATIVO || LINUX && JANELA !== "dock") return;
    let anterior = "";
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const retangulos = [...document.querySelectorAll(chaveSeletores)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }));
      const atual = JSON.stringify(retangulos);
      if (atual === anterior) return;
      anterior = atual;
      void informarAreaInterativa(retangulos);
    };
    const agendar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir);
    };
    const atributos = new MutationObserver(agendar);
    const observarAlvos = () => {
      atributos.disconnect();
      for (const el of document.querySelectorAll(chaveSeletores)) {
        for (let no: Element | null = el; no && no !== document.body; no = no.parentElement) atributos.observe(no, { attributes: true, attributeFilter: ["style", "class"] });
      }
    };
    const estrutura = new MutationObserver(() => {
      observarAlvos();
      agendar();
    });
    observarAlvos();
    medir();
    estrutura.observe(document.body, { subtree: true, childList: true });
    const eventos = ["resize", "transitionend", "animationend"] as const;
    for (const e of eventos) window.addEventListener(e, agendar, true);
    const seguranca = window.setInterval(() => { if (LINUX) anterior = ""; agendar(); }, INTERVALO_SEGURANCA_AREA_MS);
    return () => {
      atributos.disconnect();
      estrutura.disconnect();
      for (const e of eventos) window.removeEventListener(e, agendar, true);
      window.clearInterval(seguranca);
      window.cancelAnimationFrame(quadro);
    };
  }, [chaveSeletores]);
}

export function usarCursorFora(fn: () => void) {
  useEffect(() => {
    if (!NATIVO || LINUX) return;
    let desligar: () => void = () => undefined;
    let ativo = true;
    void ouvirEvento("niko://cursor-fora", fn).then((f) => {
      if (ativo) desligar = f;
      else f();
    });
    return () => {
      ativo = false;
      desligar();
    };
  }, [fn]);
}
export interface AppAberto {
  id: string;
  pid: number;
  titulo: string;
  minimizada: boolean;
  ativa: boolean;
  app: string;
  nome: string;
  caminho: string | null;
  icone: string | null;
}

export function usarAppsAbertos(ativo: boolean): [AppAberto[], () => void] {
  const [apps, setApps] = useState<AppAberto[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (!NATIVO || !ativo) return;
    let vivo = true;
    const ler = async () => {
      try {
        const r = await fetch("/ponte/janelas", { headers: { "x-niko": "1" } });
        if (!r.ok) return;
        const j = (await r.json()) as { janelas?: AppAberto[] | AppAberto };
        const lista = Array.isArray(j.janelas) ? j.janelas : j.janelas ? [j.janelas] : [];
        if (vivo) setApps(lista);
      } catch {
        return;
      }
    };
    void ler();
    const t = window.setInterval(() => void ler(), 2000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [ativo, versao]);
  return [apps, () => setVersao((v) => v + 1)];
}

export interface AreaMiniatura {
  janela: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function mostrarMiniaturas(itens: AreaMiniatura[]) {
  return invocar("miniaturas_janelas", { itens });
}

export function ocultarBarraDoWindows(ocultar: boolean) {
  return invocar("barra_windows", { ocultarBarra: ocultar });
}

export function reservarEspacoDoDock(reservar: boolean) {
  if (LINUX) return fetch("/ponte/janelas/reservar", { method: "POST", headers: { "x-niko": "1", "content-type": "application/json" }, body: JSON.stringify({ reservar }) }).catch(() => null);
  return invocar("reservar_dock", { reservar });
}

export type TipoDaFrente = "area_de_trabalho" | "sobreposta" | "app";

export interface EstadoDaFrente {
  cobre: boolean;
  telaCheia: boolean;
  maximizada: boolean;
  frente: TipoDaFrente;
  cursorNoDock?: boolean;
  geracao?: string;
}

const FRENTE_LIVRE: EstadoDaFrente = { cobre: false, telaCheia: false, maximizada: false, frente: "area_de_trabalho" };

export async function permitirNotificacoes(): Promise<boolean> {
  if (!NATIVO) return false;
  try {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export async function notificarWindows(titulo: string, corpo: string): Promise<void> {
  if (!NATIVO) return;
  try {
    const { isPermissionGranted, sendNotification } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) sendNotification({ title: titulo, body: corpo });
  } catch {
    return;
  }
}

async function lerEstadoDaFrente(): Promise<EstadoDaFrente | null> {
  if (!LINUX) return invocar<EstadoDaFrente>("frente_cobre_tela");
  try {
    const resposta = await fetch("/ponte/janelas/estado", { headers: { "x-niko": "1" } });
    return resposta.ok ? await resposta.json() as EstadoDaFrente : null;
  } catch { return null; }
}

export async function frenteCobreAIlha(): Promise<boolean> {
  const r = await lerEstadoDaFrente();
  return Boolean(r?.cobre);
}

export async function frenteEmTelaCheia(): Promise<boolean> {
  const r = await lerEstadoDaFrente();
  return Boolean(r?.telaCheia);
}

export function usarEstadoDaFrente(ativo: boolean): EstadoDaFrente {
  const [estado, setEstado] = useState<EstadoDaFrente>(FRENTE_LIVRE);
  useEffect(() => {
    if (!NATIVO || !ativo) {
      setEstado(FRENTE_LIVRE);
      return;
    }
    let vivo = true;
    const ler = async () => {
      const r = await lerEstadoDaFrente();
      if (!vivo) return;
      const cobre = Boolean(r?.cobre);
      const telaCheia = Boolean(r?.telaCheia);
      const maximizada = Boolean(r?.maximizada);
      const frente: TipoDaFrente = r?.frente === "app" || r?.frente === "sobreposta" ? r.frente : "area_de_trabalho";
      const cursorNoDock = LINUX ? Boolean(r?.cursorNoDock) : undefined;
      const geracao = LINUX && typeof r?.geracao === "string" ? r.geracao : undefined;
      setEstado((anterior) => (anterior.geracao === geracao && anterior.cobre === cobre && anterior.telaCheia === telaCheia && anterior.maximizada === maximizada && anterior.frente === frente && anterior.cursorNoDock === cursorNoDock ? anterior : { cobre, telaCheia, maximizada, frente, ...(LINUX ? { cursorNoDock, geracao } : {}) }));
    };
    void ler();
    const t = window.setInterval(() => void ler(), 800);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [ativo]);
  return estado;
}

export async function agirNaJanela(acao: "focar" | "minimizar" | "fechar", id: string) {
  try {
    await fetch(`/ponte/janelas/${acao}`, { method: "POST", headers: { "x-niko": "1", "content-type": "application/json" }, body: JSON.stringify({ janela: id }) });
  } catch {
    return;
  }
}

export function alternarSistemaNativo() {
  if (LINUX) return fetch("/ponte/janelas/niko", { method: "POST", headers: { "x-niko": "1", "content-type": "application/json" }, body: "{}" }).catch(() => null);
  return invocar("alternar_sistema");
}
