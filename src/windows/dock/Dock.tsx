import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { NATIVE, LABEL, useAreaInteractive, useCursorOutside, useAppsOpen, actWindow, toggleSystemNative, showThumbnails, hideBarWindows, reserveSpaceDock, useStateFront, setDocks, useMonitors, listenEvent, returnFocus, type AppOpen } from "../../desktop/desktop";
import { AppSearch } from "./AppSearch";
import { eachDockShowsTheirApps, dockActiveMonitor, myMonitor, ALL_THE_MONITORS } from "./monitors";
import { groupApps, nameGroup } from "./groups";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useConfig } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { useAgents } from "../../state/agents";
import { LogoNiko } from "../../components/LogoNiko";
import { Brand } from "../../brands/Brand";
import { T } from "../../i18n/ptBR";
import { playSound } from "../../bridge/sounds";
import { HEIGHT_DOCK, someoneCovers } from "../geometry";
import { ICON_ROUTE } from "../system/routes";
import { COLOR_AGENT } from "../../characters/colors";
import { attributesBackground, useAppearanceBorder, variablesBorder } from "../appearance";
import "./dock.css";

interface DockItemProps {
  mouseX: MotionValue<number>;
  ampliar: boolean;
  rotulo: string;
  estado?: "frente" | "aberto" | "minimizado";
  aoClicar: () => void;
  children: React.ReactNode;
  alerta?: string;
  semDica?: boolean;
  aoEntrar?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  aoSair?: () => void;
}

function DockItem({ mouseX, ampliar: enlarge, rotulo: label, estado: state, aoClicar: onClick, children, alerta: alertValue, semDica: withoutHint, aoEntrar: onEnter, aoSair: onExit }: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !Number.isFinite(x)) return 999;
    return x - (r.left + r.width / 2);
  });
  const sizeTarget = useTransform(distance, [-120, 0, 120], enlarge ? [42, 54, 42] : [42, 42, 42]);
  const size = useSpring(sizeTarget, { mass: 0.12, stiffness: 200, damping: 15 });
  return (
    <motion.button
      ref={ref}
      type="button"
      className="dock-item"
      data-estado={state}
      style={{ width: size, height: size }}
      aria-label={label}
      title={withoutHint ? undefined : label}
      onClick={onClick}
      onPointerEnter={onEnter}
      onPointerLeave={onExit}
      whileTap={{ scale: 0.9 }}
      layout
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
    >
      {children}
      {state && <span className="dock-ponto" aria-hidden="true" />}
      {alertValue && <span className="dock-alerta" style={{ background: alertValue }} aria-hidden="true" />}
    </motion.button>
  );
}

const WIDTH_CARD_PREVIEW = 196;
const SPACE_PREVIEW = 8;

function useThumbnailsPreview(isOpen: boolean, key: string | null) {
  useEffect(() => {
    if (!isOpen) return;
    let previous = "";
    const measure = () => {
      const items = [...document.querySelectorAll<HTMLElement>(".dock-previa-miniatura")].map((el) => {
        const r = el.getBoundingClientRect();
        return { janela: el.dataset.janela ?? "", x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const current = JSON.stringify(items);
      if (current === previous) return;
      previous = current;
      void showThumbnails(items);
    };
    measure();
    const t = window.setInterval(measure, 150);
    return () => {
      window.clearInterval(t);
      void showThumbnails([]);
    };
  }, [isOpen, key]);
}

function PreviewWindows({ lista: list, esquerda: left, aoEntrar: onEnter, aoSair: onExit, aoFocar: onFocus, aoFechar: onClose }: { lista: AppOpen[]; esquerda: number; aoEntrar: () => void; aoSair: () => void; aoFocar: (j: AppOpen) => void; aoFechar: (j: AppOpen) => void }) {
  return (
    <div className="dock-previa" style={{ left: left }} onPointerEnter={onEnter} onPointerLeave={onExit} onPointerMove={(e) => e.stopPropagation()}>
      <div className="dock-previa-lista">
      {list.map((j) => (
        <div key={j.id} className="dock-previa-cartao" data-ativa={j.ativa || undefined} role="button" tabIndex={0} onClick={() => onFocus(j)} onKeyDown={(e) => e.key === "Enter" && onFocus(j)}>
          <div className="dock-previa-topo">
            {j.icone && <img src={j.icone} alt="" width={16} height={16} draggable={false} />}
            <span className="dock-previa-titulo">{j.titulo}</span>
            <button
              type="button"
              className="dock-previa-fechar"
              aria-label={T.dock.fecharJanela}
              title={T.dock.fecharJanela}
              onClick={(e) => {
                e.stopPropagation();
                onClose(j);
              }}
            >
              <X size={14} />
            </button>
          </div>
          <div className="dock-previa-miniatura" data-janela={j.id} />
        </div>
      ))}
      </div>
    </div>
  );
}

function WindowsApps({ mouseX, ampliar: enlarge, ativo: active, monitor }: { mouseX: MotionValue<number>; ampliar: boolean; ativo: boolean; monitor?: string }) {
  const [allTheApps, update] = useAppsOpen(active);
  const apps = monitor ? allTheApps.filter((a) => a.monitor === monitor) : allTheApps;
  const [preview, setPreview] = useState<{ chave: string; centro: number; esquerdaDock: number } | null>(null);
  const clockOpen = useRef<number | undefined>(undefined);
  const clockClose = useRef<number | undefined>(undefined);
  const groups = groupApps(apps);
  const listPreview = preview && active ? groups.get(preview.chave) : undefined;
  useThumbnailsPreview(Boolean(listPreview?.length), preview?.chave ?? null);

  useEffect(
    () => () => {
      window.clearTimeout(clockOpen.current);
      window.clearTimeout(clockClose.current);
    },
    [],
  );

  const cancelClosing = () => window.clearTimeout(clockClose.current);
  const scheduleClosing = () => {
    window.clearTimeout(clockOpen.current);
    window.clearTimeout(clockClose.current);
    clockClose.current = window.setTimeout(() => setPreview(null), 250);
  };
  const closePreview = () => {
    window.clearTimeout(clockOpen.current);
    window.clearTimeout(clockClose.current);
    setPreview(null);
  };
  const enterItem = (key: string, e: React.PointerEvent<HTMLButtonElement>) => {
    cancelClosing();
    window.clearTimeout(clockOpen.current);
    const r = e.currentTarget.getBoundingClientRect();
    const dock = e.currentTarget.closest(".dock")?.getBoundingClientRect();
    const target = { chave: key, centro: r.left + r.width / 2, esquerdaDock: dock?.left ?? 0 };
    if (preview) setPreview(target);
    else clockOpen.current = window.setTimeout(() => setPreview(target), 350);
  };

  if (groups.size === 0) return null;

  let leftPreview = 0;
  if (preview && listPreview) {
    const width = listPreview.length * (WIDTH_CARD_PREVIEW + SPACE_PREVIEW) + SPACE_PREVIEW;
    const leftScreen = Math.min(Math.max(preview.centro - width / 2, 8), window.innerWidth - width - 8);
    leftPreview = leftScreen - preview.esquerdaDock;
  }

  return (
    <>
      <span className="dock-separador" />
      {preview && listPreview && listPreview.length > 0 && (
        <PreviewWindows
          lista={listPreview}
          esquerda={leftPreview}
          aoEntrar={cancelClosing}
          aoSair={scheduleClosing}
          aoFocar={(j) => {
            void playSound("blip");
            closePreview();
            void actWindow("focar", j.id).then(update);
          }}
          aoFechar={(j) => {
            void playSound("blip");
            void actWindow("fechar", j.id).then(() => window.setTimeout(update, 400));
          }}
        />
      )}
      <AnimatePresence initial={false}>
        {[...groups.entries()].map(([key, list]) => {
          const activeValue = list.find((j) => j.ativa);
          const primary = list[0];
          const nameValue = nameGroup(primary);
          return (
            <DockItem
              key={key}
              mouseX={mouseX}
              ampliar={enlarge}
              rotulo={list.length > 1 ? `${nameValue} (${list.length})` : `${nameValue}: ${primary.titulo}`}
              estado={activeValue ? "frente" : list.every((j) => j.minimizada) ? "minimizado" : "aberto"}
              semDica
              aoEntrar={(e) => enterItem(key, e)}
              aoSair={scheduleClosing}
              aoClicar={() => {
                void playSound("blip");
                closePreview();
                if (activeValue && list.length === 1) void actWindow("minimizar", activeValue.id).then(update);
                else {
                  const next = activeValue ? list[(list.indexOf(activeValue) + 1) % list.length] : primary;
                  void actWindow("focar", next.id).then(update);
                }
              }}
            >
              <span className="dock-icone">{primary.icone ? <img src={primary.icone} alt="" width={26} height={26} draggable={false} /> : nameValue.slice(0, 1).toUpperCase()}</span>
            </DockItem>
          );
        })}
      </AnimatePresence>
    </>
  );
}

export function Dock() {
  const cfg = useConfig((s) => s.dock);
  const appearance = useAppearanceBorder(cfg.fundo, cfg.opacidade);
  const namesBar = useConfig((s) => s.barraLateral);
  const isOpen = useInterface((s) => s.sistemaAberto);
  const minimized = useInterface((s) => s.sistemaMinimizado);
  const route = useInterface((s) => s.rota);
  const zSystem = useInterface((s) => s.zSistema);
  const nextZ = useInterface((s) => s.proximoZ);
  const windows = useInterface((s) => s.janelasConexao);
  const setSystem = useInterface((s) => s.setSystem);
  const focusValue = useInterface((s) => s.focusSystem);
  const updateWindow = useInterface((s) => s.updateWindowConnection);
  const focusConnection = useInterface((s) => s.focusConnection);
  useInterface((s) => s.geometria);
  useInterface((s) => s.sistemaMaximizado);
  const alertValue = useAgents((s) => s.alertas[0]);
  const mouseX = useMotionValue(Infinity);
  const [near, setNear] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchOpenNow = useRef(false);
  searchOpenNow.current = searchOpen;
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const toggleSearch = useCallback(() => {
    if (searchOpenNow.current) void returnFocus();
    setSearchOpen(!searchOpenNow.current);
  }, []);
  useAreaInteractive([".dock", ".dock-gatilho", ".dock-previa", ".dock-busca"]);
  useCursorOutside(useCallback(() => setNear(false), []));
  const box = useRef<HTMLDivElement>(null);

  const selectionMonitor = cfg.monitores ?? ALL_THE_MONITORS;
  const monitors = useMonitors();
  const mine = myMonitor(monitors, LABEL);
  const activeHere = cfg.ativo && dockActiveMonitor(selectionMonitor, mine, monitors, LABEL);
  const appsMonitor = eachDockShowsTheirApps(selectionMonitor, monitors) ? mine?.nome : undefined;
  const front = useStateFront(activeHere);
  const primary = !NATIVE || LABEL === "dock";

  useEffect(() => {
    if (NATIVE && primary) void hideBarWindows(cfg.ativo);
  }, [cfg.ativo, primary]);

  useEffect(() => {
    if (NATIVE && primary) void setDocks(cfg.ativo, selectionMonitor);
  }, [cfg.ativo, selectionMonitor, primary]);

  useEffect(() => {
    if (NATIVE) void reserveSpaceDock(activeHere && cfg.modo === "fixo");
  }, [activeHere, cfg.modo]);

  useEffect(() => {
    if (cfg.modo === "fixo") return;
    const onMove = (e: PointerEvent) => {
      const inside = box.current?.contains(e.target as Node);
      const limit = window.innerHeight;
      setNear((p) => (inside ? true : p ? e.clientY > limit - HEIGHT_DOCK - 24 : e.clientY > limit - 6));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [cfg.modo]);

  useEffect(() => {
    if (front.telaCheia) setNear(false);
  }, [front.telaCheia]);

  useEffect(() => {
    let alive = true;
    let disable: () => void = () => undefined;
    void listenEvent("niko://lupa", toggleSearch, true).then((f) => {
      if (alive) disable = f;
      else f();
    });
    return () => {
      alive = false;
      disable();
    };
  }, []);

  useEffect(() => {
    if (!activeHere || front.telaCheia) setSearchOpen(false);
  }, [activeHere, front.telaCheia]);

  if (!activeHere || front.telaCheia) return null;

  const width = 90 + (windows.length + (isOpen ? 1 : 0)) * 50;
  const area = { x: (window.innerWidth - width) / 2, y: window.innerHeight - HEIGHT_DOCK, w: width, h: HEIGHT_DOCK };
  const covered = cfg.modo === "inteligente" && (NATIVE ? front.cobre : someoneCovers(area));
  const hidden = (cfg.modo === "esconder" || covered) && !near && !searchOpen;
  const systemFront = isOpen && !minimized && zSystem === nextZ - 1;
  const background = appearance.fundo;
  const IconTab = ICON_ROUTE[route];
  const nameTab = namesBar.find((b) => b.rota === route)?.nome || T.rotas[route];

  const toggleSystem = () => {
    void playSound("open");
    if (!isOpen || minimized) {
      setSystem({ sistemaAberto: true, sistemaMinimizado: false });
      focusValue();
      return;
    }
    if (systemFront) {
      setSystem({ sistemaMinimizado: true });
      return;
    }
    focusValue();
  };

  const openNiko = () => {
    if (NATIVE) {
      void playSound("open");
      void toggleSystemNative();
      return;
    }
    if (isOpen) {
      void playSound("blip");
      if (minimized) setSystem({ sistemaMinimizado: false });
      focusValue();
      return;
    }
    toggleSystem();
  };

  return (
    <>
      {hidden && <div className="dock-gatilho" onPointerEnter={() => setNear(true)} />}
      <motion.div
        ref={box}
        className="dock"
        {...attributesBackground(appearance)}
        style={{ ...variablesBorder(appearance), height: HEIGHT_DOCK, background: background }}
        initial={false}
        animate={{ y: hidden ? HEIGHT_DOCK + 8 : 0 }}
        transition={{ type: "spring", visualDuration: 0.35, bounce: 0.15 }}
        onPointerMove={(e) => mouseX.set(e.clientX)}
        onPointerLeave={() => {
          mouseX.set(Infinity);
          if (cfg.modo !== "fixo") window.setTimeout(() => !box.current?.matches(":hover") && setNear(false), 500);
        }}
      >
        <span className="dock-orelha dock-orelha-esquerda" style={{ ["--fundo-dock" as string]: background }} aria-hidden="true" />
        <span className="dock-orelha dock-orelha-direita" style={{ ["--fundo-dock" as string]: background }} aria-hidden="true" />
        <DockItem mouseX={mouseX} ampliar={cfg.ampliar} rotulo={T.dock.abrir} aoClicar={openNiko} alerta={alertValue ? COLOR_AGENT[alertValue.agenteId] : undefined}>
          <span className="dock-logo"><LogoNiko tamanho={28} /></span>
        </DockItem>
        <DockItem
          mouseX={mouseX}
          ampliar={cfg.ampliar}
          rotulo={T.dock.busca.botao}
          estado={searchOpen ? "aberto" : undefined}
          aoClicar={() => {
            void playSound(searchOpen ? "close" : "open");
            toggleSearch();
          }}
        >
          <span className="dock-icone"><Search size={19} /></span>
        </DockItem>
        {searchOpen && <AppSearch aoFechar={closeSearch} />}
        {NATIVE ? (
          <WindowsApps mouseX={mouseX} ampliar={cfg.ampliar} ativo={!hidden} monitor={appsMonitor} />
        ) : (
        <>
        {(isOpen || windows.length > 0) && <span className="dock-separador" />}
        <AnimatePresence initial={false}>
          {isOpen && (
            <DockItem key="sistema" mouseX={mouseX} ampliar={cfg.ampliar} rotulo={`${T.app.nome}: ${nameTab}`} estado={minimized ? "minimizado" : systemFront ? "frente" : "aberto"} aoClicar={toggleSystem}>
              <span className="dock-icone"><IconTab size={19} /></span>
            </DockItem>
          )}
          {windows.map((j) => (
            <DockItem
              key={j.id}
              mouseX={mouseX}
              ampliar={cfg.ampliar}
              rotulo={T.conexoes.servicos[j.id].nome}
              estado={j.minimizada ? "minimizado" : "aberto"}
              aoClicar={() => {
                void playSound("blip");
                if (j.minimizada) {
                  updateWindow(j.id, { minimizada: false });
                  focusConnection(j.id);
                } else focusConnection(j.id);
              }}
            >
              <span className="dock-icone"><Brand marca={j.id} tamanho={19} /></span>
            </DockItem>
          ))}
        </AnimatePresence>
        </>
        )}
      </motion.div>
    </>
  );
}
