import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, LayoutGrid, ListTodo, Palette, SlidersHorizontal } from "lucide-react";
import { useConfig, type TabIsland, type SectionToday } from "../../../state/settings";
import { functionEnabled } from "../../../utils/features";
import { useRoutine, tasksDay } from "../../../state/routine";
import { useControlQuick, useAudio, useNetwork } from "../../../state/quickControls";
import { T } from "../../../i18n/ptBR";
import { playSound } from "../../../bridge/sounds";
import { useCursorOutside } from "../../../desktop/desktop";
import { todayISO } from "../../../utils/dates";
import { control, type StateSystem } from "../../../bridge/localBridge";
import { QuickPanel } from "./QuickPanel";
import { Tray } from "./Tray";
import { Personalization } from "./Personalization";
import { createToggleStart } from "./barActions";
import { useIsland } from "../../../state/island";
import { BatteryDrawn, IconNetwork, IconVolume, statusNetwork, wifiEnabled } from "./StatusIcons";
import { attributesBackground, variablesBorder } from "../../appearance";
import type { AppearanceBorder } from "../../../utils/colors";
import "./bar.css";

export const HEIGHT_BANNER = 5;
const HEIGHT_TAB = 30;
const RADIUS_EARS = 10;
const STEP_WHEEL = 2;
const MARGIN_POPS = 6;
const INTERVAL_READ_START_MS = 400;

type Pop = { tipo: "painel" } | { tipo: "personalizar" } | { tipo: "bandeja"; direita: number } | null;

interface SidebarProps {
  visivel: boolean;
  escala: number;
  larguraDaIlha: number;
  aparencia: AppearanceBorder;
  aoAbrirAba: (tab: TabIsland, section?: SectionToday) => void;
  aoUsar: (atUsage: boolean) => void;
}

function labelNetwork(network: StateSystem) {
  const statusValue = statusNetwork(network);
  if (statusValue === "cabo") return T.ilha.barra.cabo;
  if (statusValue === "semInternet") return T.ilha.barra.semInternet;
  if (statusValue === "desconectado") return T.ilha.barra.semConexao;
  if (!wifiEnabled(network)) return T.ilha.barra.wifiDesligado;
  return network.wifi.conectado && network.wifi.ssid ? T.ilha.barra.wifi(network.wifi.ssid) : T.ilha.barra.wifiSemRede;
}

function SideLeft({ pop, alternarPersonalizacao: togglePersonalization, aoAbrirAba: onOpenTab }: { pop: Pop; alternarPersonalizacao: () => void; aoAbrirAba: (tab: TabIsland, section?: SectionToday) => void }) {
  const stateIsland = useIsland((s) => s.estado);
  const tabIsland = useIsland((s) => s.aba);
  const sectionToday = useIsland((s) => s.secaoHoje);
  const tasksOpen = stateIsland === "expandida" && tabIsland === "hoje" && sectionToday === "tarefas";
  const start = useRef(createToggleStart(control.iniciar, control.alternarIniciar));
  const clockStart = useRef<number | undefined>(undefined);
  const [startBusy, setStartBusy] = useState(false);
  useEffect(() => () => window.clearInterval(clockStart.current), []);
  const prepareStart = () => {
    start.current.preparar();
    window.clearInterval(clockStart.current);
    clockStart.current = window.setInterval(() => start.current.preparar(), INTERVAL_READ_START_MS);
  };
  const tasks = useRoutine((s) => s.tarefas);
  const hasTasks = useConfig((s) => functionEnabled("journal", s.funcoesDesligadas));
  const dailyItems = tasksDay(tasks, todayISO()).filter((t) => t.status !== "cancelada");
  const done = dailyItems.filter((t) => t.status === "concluida").length;
  const labelTasks = dailyItems.length ? T.ilha.barra.tarefasHojeDica(done, dailyItems.length) : T.ilha.barra.semTarefas;

  return (
    <div className="ilha-barra-lado">
      <button
        type="button"
        className="ilha-barra-botao"
        data-ativo={pop?.tipo === "personalizar" || undefined}
        aria-label={T.ilha.barra.personalizar}
        aria-expanded={pop?.tipo === "personalizar"}
        title={T.ilha.barra.personalizar}
        onClick={togglePersonalization}
      >
        <Palette size={14} />
      </button>
      <button
        type="button"
        className="ilha-barra-botao"
        aria-label={T.ilha.barra.iniciar}
        title={T.ilha.barra.iniciar}
        aria-busy={startBusy}
        onPointerEnter={prepareStart}
        onPointerLeave={() => {
          window.clearInterval(clockStart.current);
          start.current.limpar();
        }}
        onFocus={() => start.current.preparar()}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          if (startBusy) return;
          void playSound("blip");
          setStartBusy(true);
          void start.current.alternar().catch(() => useIsland.getState().notifyFailure(T.ilha.barra.indisponivel)).finally(() => setStartBusy(false));
        }}
      >
        <LayoutGrid size={14} />
      </button>
      {hasTasks && (
        <button type="button" className="ilha-barra-botao ilha-barra-texto" title={labelTasks} aria-label={labelTasks} aria-expanded={tasksOpen} data-ativo={tasksOpen || undefined} onClick={() => onOpenTab("hoje", "tarefas")}>
          <ListTodo size={13} />
          <span className="numero">{dailyItems.length ? T.ilha.barra.tarefasHoje(done, dailyItems.length) : "0"}</span>
        </button>
      )}
    </div>
  );
}
function SideRight({ pop, alternarPainel: togglePanel, alternarBandeja: toggleTray }: { pop: Pop; alternarPainel: () => void; alternarBandeja: (button: HTMLElement) => void }) {
  const output = useControlQuick((s) => s.audio?.saida ?? null);
  const network = useControlQuick((s) => s.rede);
  const setVolume = useControlQuick((s) => s.setVolume);
  const icons = useConfig((s) => s.ilha.iconesDaBarra);
  const battery = icons.bateria ? (network?.bateria ?? null) : null;
  const showNetwork = icons.rede && network;
  const showVolume = icons.volume && output;

  return (
    <div className="ilha-barra-lado ilha-barra-lado-direito">
      <button
        type="button"
        className="ilha-barra-botao"
        data-ativo={pop?.tipo === "bandeja" || undefined}
        aria-label={T.ilha.barra.bandeja}
        aria-expanded={pop?.tipo === "bandeja"}
        title={T.ilha.barra.bandeja}
        onClick={(e) => toggleTray(e.currentTarget)}
      >
        <ChevronUp size={14} className="ilha-barra-chevron" />
      </button>
      <button type="button" className="ilha-barra-botao ilha-barra-status" data-ativo={pop?.tipo === "painel" || undefined} aria-label={T.ilha.barra.painel} aria-expanded={pop?.tipo === "painel"} title={T.ilha.barra.painel} onClick={togglePanel}>
        {showNetwork && (
          <span className="ilha-barra-indicador" title={labelNetwork(network)} data-alerta={statusNetwork(network) === "semInternet" || undefined}>
            <IconNetwork rede={network} tamanho={14} />
          </span>
        )}
        {showVolume && (
          <span
            className="ilha-barra-indicador"
            title={`${output.mudo ? T.ilha.barra.volumeMudo : T.ilha.barra.volume(output.volume)}. ${T.ilha.barra.rolarParaVolume}`}
            onWheel={(e) => setVolume("saida", Math.max(0, Math.min(100, output.volume + (e.deltaY < 0 ? STEP_WHEEL : -STEP_WHEEL))))}
          >
            <IconVolume volume={output.volume} mudo={output.mudo} tamanho={14} />
          </span>
        )}
        {battery && (
          <span className="ilha-barra-indicador ilha-barra-bateria" title={T.ilha.barra.bateria(battery.nivel, battery.carregando)}>
            <span className="ilha-barra-valor">{battery.nivel}%</span>
            <BatteryDrawn nivel={battery.nivel} carregando={battery.carregando} />
          </span>
        )}
        {!showNetwork && !showVolume && !battery && <SlidersHorizontal size={13} />}
      </button>
    </div>
  );
}

export function TopBar({ visivel: visible, escala: scale, larguraDaIlha: widthIsland, aparencia: appearance, aoAbrirAba: onOpenTab, aoUsar: onUse }: SidebarProps) {
  const [pop, setPop] = useState<Pop>(null);
  const [about, setAbout] = useState(false);
  useAudio(visible, pop?.tipo === "painel" ? 1000 : 3000);
  useNetwork(visible, pop?.tipo === "painel" ? 8000 : 30000);
  useCursorOutside(useCallback(() => setAbout(false), []));

  useEffect(() => {
    const { audio, rede: network, synchronizeAudio, synchronizeNetwork } = useControlQuick.getState();
    if (!audio) void synchronizeAudio();
    if (!network) void synchronizeNetwork();
  }, []);

  useEffect(() => {
    if (!visible) setPop(null);
  }, [visible]);

  useEffect(() => onUse(about || pop !== null), [about, pop, onUse]);

  useEffect(() => {
    if (!pop) return;
    const closeValue = () => setPop(null);
    const closeIfNotSelectingColor = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "color") return;
      closeValue();
    };
    const onPress = (e: KeyboardEvent) => e.key === "Escape" && closeValue();
    const onClickOutside = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest(".ilha-pop, .ilha-barra")) closeValue();
    };
    window.addEventListener("keydown", onPress);
    window.addEventListener("pointerdown", onClickOutside, true);
    window.addEventListener("blur", closeIfNotSelectingColor);
    return () => {
      window.removeEventListener("keydown", onPress);
      window.removeEventListener("pointerdown", onClickOutside, true);
      window.removeEventListener("blur", closeIfNotSelectingColor);
    };
  }, [pop]);

  const togglePanel = () => {
    void playSound(pop?.tipo === "painel" ? "close" : "open");
    setPop((current) => (current?.tipo === "painel" ? null : { tipo: "painel" }));
  };

  const togglePersonalization = () => {
    void playSound(pop?.tipo === "personalizar" ? "close" : "open");
    setPop((current) => (current?.tipo === "personalizar" ? null : { tipo: "personalizar" }));
  };

  const toggleTray = (button: HTMLElement) => {
    void playSound(pop?.tipo === "bandeja" ? "close" : "open");
    const r = button.getBoundingClientRect();
    const right = Math.max(MARGIN_POPS, window.innerWidth - r.right - 40);
    setPop((current) => (current?.tipo === "bandeja" ? null : { tipo: "bandeja", direita: right }));
  };

  const height = HEIGHT_TAB * scale;
  const topPops = height + MARGIN_POPS;
  const meiaIsland = Math.max(0, widthIsland / 2 - 1);
  const cropIsland = `linear-gradient(to right, #000 calc(50% - ${meiaIsland}px), transparent calc(50% - ${meiaIsland}px), transparent calc(50% + ${meiaIsland}px), #000 calc(50% + ${meiaIsland}px))`;
  const variables = variablesBorder(appearance);
  const onEnter = () => setAbout(true);
  const onExit = () => setAbout(false);

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="barra"
            className="ilha-barra"
            {...attributesBackground(appearance)}
            style={{ ...variables, height: height, ["--escala-barra" as string]: scale, ["--faixa" as string]: `${HEIGHT_BANNER}px`, ["--raio-aba" as string]: `${RADIUS_EARS}px` }}
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "spring", visualDuration: 0.35, bounce: 0.12 }}
          >
            <span className="ilha-barra-faixa" style={{ maskImage: cropIsland, WebkitMaskImage: cropIsland }} aria-hidden="true" />
            <div className="ilha-barra-aba ilha-barra-aba-esquerda" onPointerEnter={onEnter} onPointerLeave={onExit}>
              <SideLeft
                pop={pop}
                alternarPersonalizacao={togglePersonalization}
                aoAbrirAba={(tab, section) => {
                  const island = useIsland.getState();
                  setPop(null);
                  void playSound(island.estado === "expandida" && island.aba === tab && (!section || island.secaoHoje === section) ? "close" : "open");
                  onOpenTab(tab, section);
                }}
              />
            </div>
            <div className="ilha-barra-aba ilha-barra-aba-direita" onPointerEnter={onEnter} onPointerLeave={onExit}>
              <SideRight pop={pop} alternarPainel={togglePanel} alternarBandeja={toggleTray} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="ilha-pops" {...attributesBackground(appearance)} style={variables}>
        <AnimatePresence>
          {visible && pop?.tipo === "personalizar" && <Personalization key="personalizar" topo={topPops} aoFechar={() => setPop(null)} />}
          {visible && pop?.tipo === "painel" && <QuickPanel key="painel" topo={topPops} aoFechar={() => setPop(null)} />}
          {visible && pop?.tipo === "bandeja" && <Tray key="bandeja" topo={topPops} direita={pop.direita} aoFechar={() => setPop(null)} />}
        </AnimatePresence>
      </div>
    </>
  );
}
