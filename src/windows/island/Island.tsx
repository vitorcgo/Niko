import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Plus, Music, Timer, CalendarDays, MessageCircle, Plug, Bell, Volume2, VolumeX, AppWindow, ChevronUp, Pin, PinOff, Check, CircleAlert, Download, CodeXml, ShieldAlert, LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { useConfig, type TabIsland, type SectionToday, type ViewIsland } from "../../state/settings";
import { stateWithNotice, useIsland } from "../../state/island";
import { useInterface } from "../../state/interface";
import { useAgents, AGENTS, stateAgent, alertFresh } from "../../state/agents";
import { usePomodoro, remainingCurrent, formatClock } from "../../state/pomodoro";
import { useMedia, backgroundCover, mediaActiveIsland } from "../../state/media";
import { Character } from "../../characters/Character";
import { Brand } from "../../brands/Brand";
import { Ring } from "../../components/Charts";
import { T } from "../../i18n/ptBR";
import { playSound } from "../../bridge/sounds";
import {
  ViewToday, ViewCapture, ViewMedia, ViewFocus, ViewConnections, ViewNotices,
} from "./Views";
import { someoneCovers } from "../geometry";
import { ChatView } from "./ChatView";
import { ClaudeView } from "./claude/ClaudeView";
import { useClaudeCodeLifecycle, returnPendingOnTerminal } from "./claude/useClaudeCodeLifecycle";
import { BRAND_TOOL, nameTool } from "./claude/tools";
import { tabEnabled } from "../../utils/features";
import { typesCaptureEnabled } from "../../utils/capture";
import { useClaudeCode, sessionActive, nameModel } from "../../state/claudeCode";
import { useUpdate } from "../../state/update";
import { NATIVE, releaseSystemInitial, listenShortcut, listenEvent, useAreaInteractive, useCursorOutside, useStateFront } from "../../desktop/desktop";
import { Greeting } from "./animations/Greeting";
import { useDailyGreeting } from "./animations/useDailyGreeting";
import { HEIGHT_GREETING, EVENT_GREETING, WIDTH_GREETING } from "./animations/requestGreeting";
import { TopBar, HEIGHT_BANNER } from "./bar/TopBar";
import { tabNeighbor, toggleTabBar } from "./bar/barActions";
import { SpaceCharacter, ContinuousCharacter } from "./animations/ContinuousCharacter";
import { StageWork, AnimatedStages } from "./animations/AnimatedStages";
import { attributesBackground, useAppearanceBorder, variablesBorder } from "../appearance";
import type { AgentId, AgentState } from "../../types";
import "./island.css";

const ICON_TAB: Record<TabIsland, LucideIcon> = {
  hoje: CalendarDays,
  midia: Music,
  foco: Timer,
  chat: MessageCircle,
  conexoes: Plug,
  avisos: Bell,
  claude: CodeXml,
};

const VIEW_TAB: Record<ViewIsland, () => React.JSX.Element | null> = {
  hoje: ViewToday,
  captura: ViewCapture,
  midia: ViewMedia,
  foco: ViewFocus,
  chat: ChatView,
  conexoes: ViewConnections,
  avisos: ViewNotices,
  claude: ClaudeView,
};

const HEIGHT_TAB: Record<Exclude<ViewIsland, "hoje">, number> = {
  captura: 168,
  midia: 184,
  foco: 176,
  chat: 300,
  conexoes: 350,
  avisos: 178,
  claude: 296,
};

const HEIGHT_TODAY: Record<SectionToday, number> = { agenda: 318, tarefas: 258, habitos: 238 };

function heightView(view: ViewIsland, sectionToday: SectionToday) {
  return view === "hoje" ? HEIGHT_TODAY[sectionToday] : HEIGHT_TAB[view];
}

// Wider tabs: the AI tab uses a wide, short layout with one usage strip per tool.
const WIDTH_TAB: Partial<Record<ViewIsland, number>> = { claude: 820 };

const SCALE = { pequena: 0.85, media: 1, grande: 1.15 };

function stateCalm(e: AgentState): AgentState {
  return e === "alerta" || e === "erro" ? "ocioso" : e;
}
const WIDTH_EXPANDED = 660;
const GREETING_VENCE_AT_MS = 15 * 60_000;
const HEIGHT_COMPACT = 30;
const HEIGHT_COMPACT_MEDIA = 34;
const SIZE_COVER_COMPACT = 28;
const AGENT_TAB: Partial<Record<ViewIsland, AgentId>> = { hoje: "organizador", foco: "tutor", conexoes: "java", claude: "java" };
const ROTATION_MS = 8 * 60_000;
const TABS_WITHOUT_SIDEBAR: ViewIsland[] = ["chat", "midia"];
const THRESHOLD_SCROLL = 40;
const INTERVAL_BETWEEN_SWAPS_MS = 180;

function agentRotation(favorite: AgentId, now: number): AgentId {
  const order: AgentId[] = [favorite, ...AGENTS.filter((a) => a !== favorite)];
  return order[Math.floor(now / ROTATION_MS) % order.length];
}
const SPRING = { type: "spring" as const, visualDuration: 0.5, bounce: 0.2 };
const CLOSE = { duration: 0.34, ease: [0.45, 0, 0.2, 1] as [number, number, number, number] };

function useNow(interval: number, active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval, active]);
  return now;
}

export function Island() {
  const cfg = useConfig((s) => s.ilha);
  const soundEnabled = useConfig((s) => s.sons.ligado);
  const setConfig = useConfig((s) => s.set);
  const sounds = useConfig((s) => s.sons);
  const favorite = useConfig((s) => s.agentes.favorito);
  const names = useConfig((s) => s.agentes.nomes);
  const roles = useConfig((s) => s.agentes.cargos);
  const privacy = useConfig((s) => s.privacidade);
  const preferenceMovement = useReducedMotion();
  const animacoesDisabled = useConfig((s) => s.reduzirAnimacoes);
  const reduceAnimacoes = animacoesDisabled || preferenceMovement;
  const state = useIsland((s) => s.estado);
  const tab = useIsland((s) => s.aba);
  const sectionToday = useIsland((s) => s.secaoHoje);
  const reveal = useIsland((s) => s.revelacao);
  const greeting = useIsland((s) => s.saudacao);
  const stopGreeting = useIsland((s) => s.stopGreeting);
  const isGreeting = greeting !== null;
  useDailyGreeting(cfg.ativa);
  const setState = useIsland((s) => s.setState);
  const openValue = useIsland((s) => s.open);
  const collapse = useIsland((s) => s.collapse);
  useInterface((s) => s.sistemaMaximizado);
  useInterface((s) => s.geometria);
  const windowsConnection = useInterface((s) => s.janelasConexao);
  const [revealed, setRevealed] = useState(false);
  const systemOpen = useInterface((s) => s.sistemaAberto);
  const systemMinimized = useInterface((s) => s.sistemaMinimizado);
  const navigateTo = useInterface((s) => s.navigateTo);
  const agents = useAgents();
  const pomodoro = usePomodoro();
  const media = useMedia();
  useClaudeCodeLifecycle(cfg.ativa && cfg.blocos.claude);
  const requestsClaude = useClaudeCode((s) => s.pedidos);
  const minute = useNow(60_000, true);
  const agentTurn = agentRotation(favorite, minute);
  const claudeActive = useClaudeCode(sessionActive);
  const sessionSidebar = useClaudeCode((s) => s.sessoes[s.focada ?? ""] ?? s.sessoes[s.ordem[0]]);
  const stateSidebar = sessionSidebar && requestsClaude.some((p) => p.sessao === sessionSidebar.id) ? "aprovacao" : sessionSidebar?.estado ?? "terminou";
  const root = useRef<HTMLDivElement>(null);
  const bodyIsland = useRef<HTMLDivElement>(null);
  const [about, setAbout] = useState(false);
  const update = useUpdate();
  useEffect(() => {
    const first = window.setTimeout(() => void useUpdate.getState().check(), 15000);
    const always = window.setInterval(() => void useUpdate.getState().check(), 6 * 3600000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(always);
    };
  }, []);
  useAreaInteractive([".ilha-raiz .ilha", ".ilha-gatilho", ".ilha-barra-aba", ".ilha-pop"]);
  useCursorOutside(useCallback(() => setAbout(false), []));
  useEffect(() => {
    let active = true;
    let disable: () => void = () => undefined;
    void listenEvent(EVENT_GREETING, () => useIsland.getState().greet()).then((f) => {
      if (active) disable = f;
      else f();
    });
    return () => {
      active = false;
      disable();
    };
  }, []);
  const [barAtUsage, setBarAtUsage] = useState(false);
  const appearance = useAppearanceBorder(cfg.fundo, cfg.opacidade);
  const [remainingClose, setRemainingClose] = useState<number | null>(null);
  const previous = useRef({ w: 0, h: 0 });
  const clockHover = useRef<number | undefined>(undefined);
  const clockRevealed = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(clockHover.current);
      window.clearTimeout(clockRevealed.current);
    },
    [],
  );

  const disabled = useConfig((s) => s.funcoesDesligadas);
  const hasNotices = agents.alertas.length > 0 || (state === "expandida" && tab === "avisos");
  const tabs = cfg.ordemAbas.filter((a) => cfg.blocos[a] && (a !== "avisos" || hasNotices) && tabEnabled(a, disabled));
  const captureAvailable = typesCaptureEnabled(disabled).length > 0;
  const tabCurrent: ViewIsland = tab === "captura" && captureAvailable ? "captura" : tabs.includes(tab as TabIsland) ? tab : tabs[0] ?? "hoje";
  const tabBeforeCapture = useRef<TabIsland>("hoje");
  const scrollTabs = useRef({ acumulado: 0, ultimaTroca: 0 });
  const [fixada, setFixada] = useState(false);
  const toOShortcut = useRef({ abas: tabs, abaAtual: tabCurrent, estado: state });
  toOShortcut.current = { abas: tabs, abaAtual: tabCurrent, estado: state };
  useEffect(() => {
    let alive = true;
    let disable: () => void = () => undefined;
    void listenShortcut((action) => {
      if (action !== "proximaAba") return;
      const { abas: list, abaAtual: current, estado: now } = toOShortcut.current;
      if (list.length === 0) return;
      const index = list.indexOf(current as TabIsland);
      void playSound("blip");
      openValue(now === "expandida" ? list[(index + 1) % list.length] : list[Math.max(0, index)]);
    }).then((f) => {
      if (alive) disable = f;
      else f();
    });
    return () => {
      alive = false;
      disable();
    };
  }, [openValue]);
  const front = useStateFront(cfg.ativa);
  const [sidesFreeNative, setSidesFreeNative] = useState(true);
  useEffect(() => {
    if (front.frente !== "sobreposta") setSidesFreeNative(!front.maximizada && !front.telaCheia);
  }, [front.frente, front.maximizada, front.telaCheia]);
  const appOpenBrowser = (systemOpen && !systemMinimized) || windowsConnection.some((j) => !j.minimizada);
  const sidesFree = NATIVE ? sidesFreeNative : !appOpenBrowser;
  const covered = cfg.modo === "inteligente" && !revealed && (NATIVE ? front.cobre : someoneCovers({ x: (window.innerWidth - WIDTH_EXPANDED) / 2, y: 0, w: WIDTH_EXPANDED, h: 40 }));
  const pomodoroStarted = pomodoro.rodando || pomodoro.restanteMs != null;
  const now = useNow(1000, pomodoro.rodando && state !== "expandida");
  const clock = useNow(15000, cfg.repouso === "relogio" || cfg.repouso === "agente" || cfg.repouso === "midia");
  const alerts = agents.alertas;
  const notSeen = alerts.filter((a) => !a.visto).length;
  const fresh = alerts.filter((a) => alertFresh(a, agents.relogio)).length;
  const working = AGENTS.filter((a) => ["pensando", "escrevendo"].includes(stateAgent(agents, a)));

  const requestPending = requestsClaude.length > 0;
  const stateEffective = isGreeting ? "compacta" : covered && state !== "expandida" && !reveal && !requestPending ? "escondida" : (cfg.modo === "fixo" || requestPending) && state === "escondida" ? "compacta" : stateWithNotice(state, Boolean(reveal));

  useEffect(() => {
    if (cfg.modo !== "esconder" || stateEffective !== "compacta" || about || barAtUsage || reveal || fresh > 0 || pomodoro.rodando || update.fase !== "nada" || requestPending) return;
    const t = window.setTimeout(() => setState("escondida"), cfg.esconderSeg * 1000);
    return () => window.clearTimeout(t);
  }, [cfg.modo, cfg.esconderSeg, stateEffective, about, barAtUsage, reveal, fresh, pomodoro.rodando, setState, update.fase, requestPending]);

  useEffect(() => {
    if (state === "expandida" && tabCurrent === "avisos") useAgents.getState().markSeen();
  }, [state, tabCurrent, alerts.length]);

  useEffect(() => {
    if (stateEffective !== "expandida") setFixada(false);
  }, [stateEffective]);

  useEffect(() => {
    if (stateEffective !== "expandida" || about || cfg.fechamentoSeg === 0 || tabCurrent === "claude" || fixada) {
      setRemainingClose(null);
      return;
    }
    const end = Date.now() + cfg.fechamentoSeg * 1000;
    const t = window.setInterval(() => {
      const focusInside = root.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT";
      if (focusInside) return;
      const r = end - Date.now();
      if (r <= 0) {
        collapse();
        void playSound("close");
        setRemainingClose(null);
        return;
      }
      setRemainingClose(r);
    }, 100);
    return () => window.clearInterval(t);
  }, [stateEffective, about, cfg.fechamentoSeg, collapse, tabCurrent, fixada]);

  useEffect(() => {
    if (stateEffective !== "expandida") return;
    const onPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        collapse();
        void playSound("close");
      }
    };
    const onClickOutside = (e: PointerEvent) => {
      if (!fixada && root.current && !root.current.contains(e.target as Node)) collapse();
    };
    window.addEventListener("keydown", onPress);
    window.addEventListener("pointerdown", onClickOutside, true);
    return () => {
      window.removeEventListener("keydown", onPress);
      window.removeEventListener("pointerdown", onClickOutside, true);
    };
  }, [stateEffective, collapse, fixada]);

  const claudeUnavailable = !cfg.ativa || !cfg.blocos.claude;
  useEffect(() => {
    if (claudeUnavailable && requestsClaude.length > 0) returnPendingOnTerminal();
  }, [claudeUnavailable, requestsClaude.length]);

  useEffect(() => {
    if (!greeting) return;
    if (front.telaCheia) {
      void releaseSystemInitial();
      return;
    }
    if (Date.now() - greeting.id > GREETING_VENCE_AT_MS) stopGreeting();
  }, [greeting, front.telaCheia, stopGreeting]);

  useEffect(() => {
    if (!front.telaCheia) return;
    window.clearTimeout(clockHover.current);
    setRevealed(false);
    if (useIsland.getState().estado === "expandida") collapse();
  }, [front.telaCheia, collapse]);

  const compact = useMemo(() => {
    if (reveal) return { tipo: "revelacao" as const, largura: 380 };
    if (update.fase !== "nada") return { tipo: "atualizacao" as const, largura: 350 };
    if (requestsClaude.length > 0) return { tipo: "claudePedido" as const, largura: 340 };
    if (pomodoroStarted) return { tipo: "pomodoro" as const, largura: media.tocando ? 330 : 290 };
    if (cfg.blocos.midia && mediaActiveIsland(media)) return { tipo: "midia" as const, largura: 330 };
    if (claudeActive) return { tipo: "claude" as const, largura: 330 };
    if (working.length > 0) return { tipo: "trabalho" as const, largura: 280 };
    if (cfg.repouso === "relogio") return { tipo: "relogio" as const, largura: 190 };
    if (cfg.repouso === "midia") return { tipo: "relogio" as const, largura: 190 };
    if (cfg.repouso === "agente") return { tipo: "agente" as const, largura: 230 };
    return { tipo: "nada" as const, largura: 120 };
  }, [reveal, pomodoroStarted, media.tocando, Boolean(media.faixa), working.length, cfg.repouso, cfg.blocos.midia, update.fase, requestsClaude.length, Boolean(claudeActive)]);

  if (!cfg.ativa || front.telaCheia) return null;

  const scale = SCALE[cfg.tamanho];
  const target = isGreeting
    ? { w: WIDTH_GREETING, h: HEIGHT_GREETING, r: 40 }
    : stateEffective === "escondida"
      ? { w: 120, h: 6, r: 6 }
      : stateEffective === "compacta"
        ? { w: compact.largura, h: compact.tipo === "revelacao" ? 56 : compact.tipo === "midia" ? HEIGHT_COMPACT_MEDIA : HEIGHT_COMPACT, r: compact.tipo === "midia" || compact.tipo === "revelacao" ? 14 : 12 }
        : { w: WIDTH_TAB[tabCurrent] ?? WIDTH_EXPANDED, h: heightView(tabCurrent, sectionToday), r: 30 };
  const growing = target.w * target.h >= previous.current.w * previous.current.h;
  previous.current = { w: target.w, h: target.h };
  const transition = growing ? SPRING : CLOSE;

  const ViewCurrent = VIEW_TAB[tabCurrent];
  const agentSidebar: AgentId = tabCurrent === "avisos" && alerts[0] ? alerts[0].agenteId : AGENT_TAB[tabCurrent] ?? (working[0] as AgentId | undefined) ?? agentTurn;
  const agentCompact = ["agente", "pomodoro", "relogio", "nada"].includes(compact.tipo) ? agentTurn : compact.tipo === "trabalho" ? working[0] : compact.tipo === "revelacao" && !reveal?.marca ? reveal?.agente : undefined;
  const agentContinuous = stateEffective === "expandida" ? agentSidebar : agentCompact ?? agentTurn;
  const remainingPomodoro = remainingCurrent(pomodoro, now);
  const barVisible = cfg.laterais && stateEffective !== "escondida" && sidesFree && !isGreeting;

  const tabCompact = (): ViewIsland | undefined =>
    compact.tipo === "revelacao" ? reveal?.aba : compact.tipo === "pomodoro" ? "foco" : compact.tipo === "midia" ? "midia" : compact.tipo === "trabalho" ? "chat" : compact.tipo === "claude" || compact.tipo === "claudePedido" ? "claude" : undefined;

  const triggerCompact = () => {
    window.clearTimeout(clockHover.current);
    if (compact.tipo === "atualizacao") {
      if (update.fase === "disponivel" || update.fase === "erro") void update.install();
      return;
    }
    openValue(tabCompact());
    if (compact.tipo === "revelacao") useIsland.getState().dismissReveal();
    void playSound("open");
  };

  const contentCompact = () => {
    switch (compact.tipo) {
      case "atualizacao":
        return (
          <>
            <div className="ilha-compacta-lado">
              {update.fase === "baixando" || update.fase === "instalando" ? <Ring progresso={update.progresso} tamanho={18} espessura={2.5} cor="#a78bfa" /> : <Download size={15} color="#a78bfa" />}
            </div>
            <span className="ilha-compacta-texto">
              {update.fase === "disponivel" ? T.ilha.atualizacao.disponivel(update.versao) : update.fase === "baixando" ? T.ilha.atualizacao.baixando(Math.round(update.progresso * 100)) : update.fase === "instalando" ? T.ilha.atualizacao.instalando : T.ilha.atualizacao.falhou}
            </span>
            <div className="ilha-compacta-lado">
              {update.fase === "disponivel" && <span className="ilha-atualizar">{T.ilha.atualizacao.atualizar}</span>}
            </div>
          </>
        );
      case "revelacao":
        return (
          <>
            <div className="ilha-compacta-lado">
              {reveal?.marca ? <Brand marca={reveal.marca} tamanho={16} /> : reveal?.agente ? <SpaceCharacter agente={reveal.agente} tamanho={20} posicao="compacta" /> : null}
            </div>
            <span className="ilha-compacta-texto privado" role="status">{reveal?.texto}</span>
            <div className="ilha-compacta-lado">
              {reveal?.tipo === "alerta" ? <CircleAlert size={15} color="#f5a524" /> : <Check size={15} color="#34d399" />}
            </div>
          </>
        );
      case "pomodoro":
        return (
          <>
            <div className="ilha-compacta-lado">
              <Ring progresso={1 - remainingPomodoro / pomodoro.duracaoMs} tamanho={18} espessura={2.5} cor={pomodoro.etapa === "foco" ? undefined : "#34d399"} />
              <span className="ilha-tempo">{formatClock(remainingPomodoro)}</span>
            </div>
            <span className="ilha-compacta-texto" style={{ color: "var(--i-dim-2)" }}>
              {T.pomodoro.etapas[pomodoro.etapa]}
            </span>
            <div className="ilha-compacta-lado">
              {media.tocando ? <span className="ilha-capa" style={{ width: 18, height: 18, background: backgroundCover(media.faixa) }} /> : <MiniAgents ids={working} />}
            </div>
          </>
        );
      case "midia":
        return (
          <>
            <div className="ilha-compacta-lado">
              <span className="ilha-capa ilha-capa-compacta" style={{ width: SIZE_COVER_COMPACT, height: SIZE_COVER_COMPACT, background: backgroundCover(media.faixa) }} />
            </div>
            <span className="ilha-compacta-texto privado">{media.faixa?.titulo ?? ""}</span>
            <div className="ilha-compacta-lado">
              <span className={`ilha-onda ${media.tocando ? "" : "parada"}`}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          </>
        );
      case "trabalho":
        return (
          <>
            <MiniAgents ids={working} continuo />
            <StageWork contexto={working[0]} texto={agents.tarefaAtual[working[0]] || T.agentes.estados.escrevendo} />
          </>
        );
      case "claudePedido":
        return (
          <>
            <div className="ilha-compacta-lado">
              <Brand marca={BRAND_TOOL[requestsClaude[0]?.ferramentaDeCodigo ?? "claude"]} tamanho={16} />
            </div>
            <span className="ilha-compacta-texto ilha-claude-compacta" data-estado="aprovacao">
              {T.ilha.claude.permissaoCompacta(nameTool(requestsClaude[0]?.ferramentaDeCodigo), requestsClaude[0]?.projeto ?? "")}
            </span>
            <div className="ilha-compacta-lado">
              <ShieldAlert size={15} color="#f0a060" />
            </div>
          </>
        );
      case "claude": {
        const step = [...(claudeActive?.passos ?? [])].reverse().find((p) => p.tipo === "ferramenta");
        return (
          <>
            <div className="ilha-compacta-lado">
              <Brand marca={BRAND_TOOL[claudeActive?.ferramenta ?? "claude"]} tamanho={16} />
            </div>
            {step && claudeActive ? <AnimatedStages contexto={claudeActive.id} etapas={claudeActive.passos.filter((p) => p.tipo === "ferramenta" || p.tipo === "fim" || p.tipo === "erro").map((p) => ({ id: p.id, texto: `${p.rotulo} ${p.detalhe ?? ""}`.trim() }))} compacta /> : <span className="ilha-compacta-texto brilho-texto">{T.ilha.claude.estados[claudeActive?.estado ?? "pensando"]}</span>}
            <div className="ilha-compacta-lado">
              <LoaderCircle size={14} className="girando" color="#4daafc" />
            </div>
          </>
        );
      }
      case "relogio":
        return <span className="ilha-compacta-texto ilha-tempo">{new Date(clock).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>;
      case "agente":
        return (
          <>
            <div className="ilha-compacta-lado">
              <SpaceCharacter agente={agentTurn} tamanho={22} posicao="compacta" />
            </div>
            <span className="ilha-compacta-texto ilha-relogio">
              <span className="ilha-tempo">{new Date(clock).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="ilha-mini">{new Date(clock).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "")}</span>
            </span>
            <div className="ilha-compacta-lado" style={{ width: 22 }} />
          </>
        );      default:
        return null;
    }
  };

  return (
    <>
      {cfg.laterais && (
        <TopBar
          visivel={barVisible}
          escala={scale}
          larguraDaIlha={target.w * scale}
          aparencia={appearance}
          aoAbrirAba={(a, section) => toggleTabBar(tabs.includes(a) ? a : tabs[0] ?? "hoje", section)}
          aoUsar={setBarAtUsage}
        />
      )}
      {stateEffective === "escondida" && (
        <div
          className="ilha-gatilho"
          onDragEnter={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            setRevealed(true);
            openValue("chat");
          }}
          onPointerEnter={() => {
            setRevealed(true);
            setState("compacta");
            void playSound("peek");
          }}
        />
      )}
      <div
        ref={root}
        className="ilha-raiz"
        data-privacidade={privacy ? "sim" : "nao"}
        {...attributesBackground(appearance)}
        style={{
          ...variablesBorder(appearance),
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
          opacity: covered && stateEffective === "escondida" ? 0 : 1,
          ["--topo-orelhas" as string]: `${barVisible ? HEIGHT_BANNER : 0}px`,
          ["--raio-orelha" as string]: barVisible ? "10px" : "14px",
        }}
        onPointerEnter={() => {
          setAbout(true);
          window.clearTimeout(clockRevealed.current);
        }}
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          if (useIsland.getState().estado !== "expandida" || useIsland.getState().aba !== "chat") {
            openValue("chat");
            void playSound("open");
          }
        }}
        onPointerLeave={() => {
          setAbout(false);
          window.clearTimeout(clockHover.current);
          window.clearTimeout(clockRevealed.current);
          if (revealed) clockRevealed.current = window.setTimeout(() => setRevealed(false), 1500);
        }}
      >
        <motion.div
          ref={bodyIsland}
          className="ilha"
          style={{ ["--fundo-ilha" as string]: appearance.fundo }}
          initial={false}
          animate={{ width: target.w, height: target.h, borderBottomLeftRadius: target.r, borderBottomRightRadius: target.r }}
          transition={transition}
        >
          <AnimatePresence>
            {reveal && !isGreeting && <motion.div key={reveal.texto} className="ilha-sinal-aviso" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: reduceAnimacoes ? 0.45 : [0, 0.7, 0.25, 0.6, 0.25] }} exit={{ opacity: 0 }} transition={{ duration: reduceAnimacoes ? 0.12 : 1.2 }} />}
          </AnimatePresence>
          <AnimatePresence>
            {reveal && stateEffective === "expandida" && !isGreeting && <motion.button key={reveal.texto} type="button" className="ilha-aviso-aberta" initial={{ opacity: 0, y: reduceAnimacoes ? 0 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => { openValue(reveal.aba); useIsland.getState().dismissReveal(); }}>
              <Bell size={16} /><span className="privado" role="status">{reveal.texto}</span>
            </motion.button>}
          </AnimatePresence>
          <div className="ilha-recorte">
            <AnimatePresence mode="popLayout" initial={false}>
              {greeting && <Greeting key={`saudacao-${greeting.id}`} versaoNova={greeting.versaoNova} aoTerminar={stopGreeting} />}
              {stateEffective === "compacta" && !isGreeting && (
                <motion.div
                  key={`c-${compact.tipo}`}
                  className="ilha-compacta"
                  data-tipo={compact.tipo}
                  role="button"
                  tabIndex={0}
                  aria-label={T.ilha.expandir}
                  initial={{ opacity: 0, filter: "blur(8px)", scale: 0.97 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.16, duration: 0.3 } }}
                  exit={{ opacity: 0, filter: "blur(8px)", scale: 0.97, transition: { duration: 0.16 } }}
                  onClick={triggerCompact}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      triggerCompact();
                    }
                  }}
                  onPointerEnter={() => {
                    window.clearTimeout(clockHover.current);
                    if (cfg.abrirHover && compact.tipo !== "atualizacao") clockHover.current = window.setTimeout(() => useIsland.getState().estado === "compacta" && openValue(tabCompact()), 280);
                  }}
                  onPointerLeave={() => window.clearTimeout(clockHover.current)}
                >
                  {["pomodoro", "relogio", "nada"].includes(compact.tipo) && (
                    <div className="ilha-compacta-lado">
                      <SpaceCharacter agente={agentTurn} tamanho={22} posicao="compacta" />
                    </div>
                  )}
                  {contentCompact()}
                  {compact.tipo !== "revelacao" && notSeen > 0 && (
                    <span className="ilha-contador" aria-label={T.ilha.fila(notSeen)} title={T.ilha.fila(notSeen)}>{notSeen}</span>
                  )}
                </motion.div>
              )}
              {stateEffective === "expandida" && (
                <motion.div
                  key="expandida"
                  className="ilha-expandida"
                  initial={{ opacity: 0, filter: "blur(8px)", scale: 0.97 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.16, duration: 0.3 } }}
                  exit={{ opacity: 0, filter: "blur(8px)", scale: 0.97, transition: { duration: 0.16 } }}
                >
                  <div
                    className="ilha-cabecalho"
                    onWheel={(e) => {
                      const r = scrollTabs.current;
                      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                      const nowMs = Date.now();
                      if (nowMs - r.ultimaTroca < INTERVAL_BETWEEN_SWAPS_MS) return;
                      r.acumulado += delta;
                      if (Math.abs(r.acumulado) < THRESHOLD_SCROLL) return;
                      const step = r.acumulado > 0 ? 1 : -1;
                      r.acumulado = 0;
                      r.ultimaTroca = nowMs;
                      const next = tabNeighbor(tabs, tabCurrent === "captura" ? tabBeforeCapture.current : tabCurrent, step);
                      if (!next || next === tabCurrent) return;
                      void playSound("blip");
                      openValue(next);
                    }}
                  >
                    <div className="ilha-abas" role="tablist" aria-label={T.app.nome}>
                      {tabs.map((a, i) => {
                        const Icon = ICON_TAB[a];
                        return (
                          <motion.button
                            key={a}
                            type="button"
                            role="tab"
                            className="ilha-aba"
                            aria-selected={a === tabCurrent}
                            aria-label={T.ilha.abas[a]}
                            title={T.ilha.abas[a]}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: 0.3 + i * 0.035 } }}
                            onClick={() => {
                              if (a !== tabCurrent) void playSound("blip");
                              openValue(a);
                            }}
                          >
                            <Icon size={14} />
                            {a === tabCurrent && <span className="ilha-aba-nome">{T.ilha.abas[a]}</span>}
                            {a === "claude" && requestsClaude.length > 0 && <span className="ilha-aba-selo">{requestsClaude.length}</span>}
                            {a === "avisos" && notSeen > 0 && <span className="ilha-aba-selo">{notSeen}</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                    <div className="ilha-acoes">
                      {captureAvailable && (
                        <button
                          type="button"
                          className="ilha-acao"
                          aria-label={T.ilha.capturar}
                          aria-pressed={tabCurrent === "captura"}
                          data-dica={T.ilha.capturar}
                          onClick={() => {
                            void playSound("blip");
                            if (tabCurrent === "captura") {
                              openValue(tabs.includes(tabBeforeCapture.current) ? tabBeforeCapture.current : tabs[0] ?? "hoje");
                              return;
                            }
                            tabBeforeCapture.current = tabCurrent;
                            openValue("captura");
                          }}
                        >
                          <Plus size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={soundEnabled ? T.ilha.silenciar : T.ilha.ativarSom}
                        data-dica={soundEnabled ? T.ilha.silenciar : T.ilha.ativarSom}
                        onClick={() => setConfig({ sons: { ...sounds, ligado: !soundEnabled } })}
                      >
                        {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      </button>
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={T.ilha.abrirSistema}
                        data-dica={T.ilha.abrirSistema}
                        onClick={() => {
                          const route = { hoje: sectionToday === "agenda" ? "calendario" : "journal", captura: "inicio", midia: "inicio", foco: "estudos", chat: "chat", conexoes: "conexoes", avisos: "inicio", claude: "configuracoes" } as const;
                          navigateTo(route[tabCurrent]);
                          collapse();
                          void playSound("open");
                        }}
                      >
                        <AppWindow size={14} />
                      </button>
                      <button
                        type="button"
                        className="ilha-acao"
                        aria-label={fixada ? T.ilha.desafixar : T.ilha.fixar}
                        data-dica={fixada ? T.ilha.desafixar : T.ilha.fixar}
                        aria-pressed={fixada}
                        data-ativa={fixada || undefined}
                        onClick={() => {
                          void playSound("blip");
                          setFixada((f) => !f);
                        }}
                      >
                        {fixada ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      <button type="button" className="ilha-acao" aria-label={T.ilha.fecharIlha} data-dica={T.ilha.fecharIlha} onClick={() => collapse()}>
                        <ChevronUp size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="ilha-miolo">
                  {!TABS_WITHOUT_SIDEBAR.includes(tabCurrent) && <motion.div className="ilha-lateral" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.2 } }}>
                    <SpaceCharacter agente={agentSidebar} tamanho={heightView(tabCurrent, sectionToday) < 200 ? 50 : 70} posicao="expandida" />
                    <span className="ilha-lateral-nome cortar">{names[agentSidebar]}</span>
                    {tabCurrent === "claude" && sessionSidebar ? (
                      <>
                        <span className="ilha-lateral-cargo cortar" title={sessionSidebar.cwd}>{sessionSidebar.projeto}</span>
                        {sessionSidebar.modelo && <span className="ilha-lateral-modelo cortar" title={sessionSidebar.modelo}>{nameModel(sessionSidebar.modelo)}</span>}
                        <span className="ilha-lateral-estado" data-estado={stateSidebar}>{T.ilha.claude.estados[stateSidebar]}</span>
                      </>
                    ) : (
                      <span className="ilha-lateral-cargo" title={roles[agentSidebar]}>{roles[agentSidebar]}</span>
                    )}
                  </motion.div>}
                  <div className="ilha-visoes">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={tabCurrent}
                        className="ilha-visao"
                        initial={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.24, ease: [0.3, 1.2, 0.4, 1] } }}
                        exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)", transition: { duration: 0.12 } }}
                      >
                        <ViewCurrent />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <ContinuousCharacter ilha={bodyIsland} posicao={stateEffective === "expandida" ? "expandida" : "compacta"} ativo={stateEffective !== "escondida" && !isGreeting} escala={scale} agente={agentContinuous} estado={stateEffective === "compacta" ? stateCalm(stateAgent(agents, agentContinuous)) : stateAgent(agents, agentContinuous)} rotulo={names[agentContinuous]} destinoKey={stateEffective === "expandida" ? tabCurrent : compact.tipo} />
          {remainingClose != null && remainingClose <= 10000 && (
            <span className="ilha-contagem" style={{ width: (remainingClose / 10000) * 160 }} aria-hidden="true" />
          )}
        </motion.div>
      </div>
    </>
  );
}

function MiniAgents({ ids, continuo: continuous = false }: { ids: string[]; continuo?: boolean }) {
  return (
    <div className="ilha-compacta-lado" style={{ gap: 2 }}>
      {ids.slice(0, 3).map((id, i) => (
        <motion.span key={id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.035 } }}>
          {i === 0 && continuous ? <SpaceCharacter agente={id as AgentId} tamanho={20} posicao="compacta" /> : <Character agente={id as AgentId} tamanho={20} interativo={false} halo={false} />}
        </motion.span>
      ))}
    </div>
  );
}
