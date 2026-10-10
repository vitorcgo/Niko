import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { Rota, ServicoId } from "../tipos";
import { iniciarConsultaPeriodica } from "./consultaPeriodica";

export type NomeJanela = "sistema" | "ilha" | "dock" | "assistive";

interface InternosTauri {
  metadata?: { currentWindow?: { label?: string } };
}

const internos = typeof window !== "undefined" ? (window as unknown as { __TAURI_INTERNALS__?: InternosTauri }).__TAURI_INTERNALS__ : undefined;

export const NATIVO = Boolean(internos);

export const ROTULO: string | null = NATIVO ? internos?.metadata?.currentWindow?.label ?? "sistema" : null;

export function tipoDaJanela(rotulo: string): NomeJanela {
  if (rotulo === "dock" || rotulo.startsWith("dock-")) return "dock";
  if (rotulo === "assistive") return "assistive";
  return rotulo === "ilha" ? "ilha" : "sistema";
}

export const JANELA: NomeJanela | null = ROTULO === null ? null : tipoDaJanela(ROTULO);

export type Comando =
  | { tipo: "irPara"; rota: Rota; parametros?: Record<string, string> }
  | { tipo: "abrirConexao"; id: ServicoId }
  | { tipo: "abrirBusca" }
  | { tipo: "abrirCaptura" };

const canal = !NATIVO && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("niko-comandos") : null;

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

export async function prepararAtualizacao() {
  if (!NATIVO) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("preparar_atualizacao");
}

export function liberarSistemaInicial() {
  return invocar("liberar_sistema_inicial");
}

export function tempoOciosoMs() {
  return invocar<number>("tempo_ocioso_ms");
}

export async function versaoDoApp(): Promise<string> {
  if (!NATIVO) return "web";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "desconhecida";
  }
}

export interface ResultadoDoAtalho {
  acao: string;
  teclas: string;
  situacao: string;
}

export function definirAtalhosGlobais(lista: { acao: string; teclas: string }[]) {
  return invocar<ResultadoDoAtalho[]>("definir_atalhos", { lista });
}

export async function ouvirAtalho(fn: (acao: string) => void): Promise<() => void> {
  if (!NATIVO || !ROTULO) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("niko://atalho", (e) => fn(e.payload), { target: { kind: "WebviewWindow", label: ROTULO } });
}

export function informarAreaInterativa(retangulos: { x: number; y: number; w: number; h: number }[]) {
  return invocar("area_interativa", { janela: ROTULO, retangulos });
}

export async function janelaAtual() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function ouvirEvento(nome: string, fn: () => void, soDestaJanela = false): Promise<() => void> {
  if (!NATIVO) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen(nome, fn, soDestaJanela && ROTULO ? { target: { kind: "WebviewWindow", label: ROTULO } } : undefined);
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
  if (NATIVO && window.location.hostname === "tauri.localhost") {
    let limite = 0;
    try {
      const [token, porta] = await Promise.race([
        Promise.all([invocar<string>("token_ponte"), invocar<number>("porta_ponte")]),
        new Promise<never>((_, rejeitar) => { limite = window.setTimeout(() => rejeitar(new Error("ponte_indisponivel")), 5000); }),
      ]);
      if (!token || typeof porta !== "number" || !Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error("ponte_indisponivel");
      enviarPelaPonte(`http://127.0.0.1:${porta}`, token);
    } finally {
      window.clearTimeout(limite);
    }
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
    if (!NATIVO) return;
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
    const seguranca = window.setInterval(agendar, INTERVALO_SEGURANCA_AREA_MS);
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
    if (!NATIVO) return;
    let desligar: () => void = () => undefined;
    let ativo = true;
    void ouvirEvento("niko://cursor-fora", fn, true).then((f) => {
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
  monitor?: string;
  grupo?: string | null;
  nomeDoGrupo?: string | null;
}

export interface MonitorDoNiko {
  nome: string;
  rotulo: string;
  numero: number;
  principal: boolean;
  largura: number;
  altura: number;
}

export function definirDocks(ligado: boolean, escolha: string) {
  return invocar("definir_docks", { ligado, escolha });
}

export function devolverFoco() {
  return invocar("devolver_foco");
}

export function definirMonitorDaIlha(escolha: string) {
  return invocar("definir_monitor_da_ilha", { escolha });
}

export function usarMonitores(): MonitorDoNiko[] {
  const [lista, setLista] = useState<MonitorDoNiko[]>([]);
  useEffect(() => {
    if (!NATIVO) return;
    let vivo = true;
    let desligar: () => void = () => undefined;
    void invocar<MonitorDoNiko[]>("monitores").then((r) => vivo && r && setLista(r));
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<MonitorDoNiko[]>("niko://monitores", (e) => vivo && setLista(e.payload)).then((f) => {
        if (vivo) desligar = f;
        else f();
      }),
    );
    return () => {
      vivo = false;
      desligar();
    };
  }, []);
  return lista;
}

export function usarAppsAbertos(ativo: boolean): [AppAberto[], () => void] {
  const [apps, setApps] = useState<AppAberto[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (!NATIVO || !ativo) return;
    return iniciarConsultaPeriodica(async (sinal) => {
      try {
        const r = await fetch("/ponte/janelas", { headers: { "x-niko": "1" }, signal: sinal });
        if (!r.ok) return;
        const j = (await r.json()) as { janelas?: AppAberto[] | AppAberto };
        const lista = Array.isArray(j.janelas) ? j.janelas : j.janelas ? [j.janelas] : [];
        if (!sinal.aborted) setApps(lista);
      } catch {
        return;
      }
    }, 2000);
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
  return invocar("reservar_dock", { reservar });
}

export type TipoDaFrente = "area_de_trabalho" | "sobreposta" | "app";

export interface EstadoDaFrente {
  cobre: boolean;
  telaCheia: boolean;
  maximizada: boolean;
  frente: TipoDaFrente;
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

export async function frenteCobreAIlha(): Promise<boolean> {
  const r = await invocar<EstadoDaFrente>("frente_cobre_tela");
  return Boolean(r?.cobre);
}

export async function frenteEmTelaCheia(): Promise<boolean> {
  const r = await invocar<EstadoDaFrente>("frente_cobre_tela");
  return Boolean(r?.telaCheia);
}

export function usarEstadoDaFrente(ativo: boolean): EstadoDaFrente {
  const [estado, setEstado] = useState<EstadoDaFrente>(FRENTE_LIVRE);
  useEffect(() => {
    if (!NATIVO || !ativo) {
      setEstado(FRENTE_LIVRE);
      return;
    }
    return iniciarConsultaPeriodica(async (sinal) => {
      const r = await invocar<EstadoDaFrente>("frente_cobre_tela");
      if (sinal.aborted || !r) return;
      const cobre = Boolean(r?.cobre);
      const telaCheia = Boolean(r?.telaCheia);
      const maximizada = Boolean(r?.maximizada);
      const frente: TipoDaFrente = r?.frente === "app" || r?.frente === "sobreposta" ? r.frente : "area_de_trabalho";
      setEstado((anterior) => (anterior.cobre === cobre && anterior.telaCheia === telaCheia && anterior.maximizada === maximizada && anterior.frente === frente ? anterior : { cobre, telaCheia, maximizada, frente }));
    }, 800);
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
  return invocar("alternar_sistema");
}
