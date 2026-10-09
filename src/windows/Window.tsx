import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { Minus, Square, Copy, X } from "lucide-react";
import type { Geometry } from "../state/interface";
import { T } from "../i18n/ptBR";
import { limit } from "../utils/basics";
import { windowCurrent } from "../desktop/desktop";

import { workArea } from "./geometry";

export { workArea as areaUtil, HEIGHT_BAR_TASKS as ALTURA_BARRA_TAREFAS } from "./geometry";

interface Props {
  titulo: ReactNode;
  rotuloAcessivel: string;
  geometria: Geometry;
  maximizada: boolean;
  z: number;
  minimo: { w: number; h: number };
  inicioBarra?: ReactNode;
  acoesBarra?: ReactNode;
  aoFocar: () => void;
  aoFechar: () => void;
  aoMinimizar: () => void;
  aoMaximizar: () => void;
  aoMudarGeometria: (g: Geometry) => void;
  children: ReactNode;
  idCamada?: string;
  nativa?: boolean;
}

const DIRECTION_NATIVE = { n: "North", s: "South", l: "East", o: "West", nl: "NorthEast", no: "NorthWest", sl: "SouthEast", so: "SouthWest" } as const;

type Direction = "n" | "s" | "l" | "o" | "nl" | "no" | "sl" | "so";

export function adjustGeometry(g: Geometry, minimum: { w: number; h: number }): Geometry {
  const area = workArea();
  const w = limit(g.w, Math.min(minimum.w, area.w), area.w);
  const h = limit(g.h, Math.min(minimum.h, area.h), area.h);
  return { w, h, x: limit(g.x, -w + 120, area.w - 120), y: limit(g.y, 0, area.h - 40) };
}

export function WindowValue({
  titulo: title,
  rotuloAcessivel: labelAccessible,
  geometria: geometry,
  maximizada: maximized,
  z,
  minimo: minimum,
  inicioBarra: startBar,
  acoesBarra: actionsBar,
  aoFocar: onFocus,
  aoFechar: onClose,
  aoMinimizar: onMinimize,
  aoMaximizar: onMaximize,
  aoMudarGeometria: onChangeGeometry,
  children,
  idCamada: idLayer,
  nativa: native = false,
}: Props) {
  const drag = useRef<{ x: number; y: number; g: Geometry; direcao?: Direction } | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const geometryAlive = useRef(geometry);
  geometryAlive.current = geometry;

  useEffect(() => {
    const onResize = () => onChangeGeometry(adjustGeometry(geometryAlive.current, minimum));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onChangeGeometry, minimum]);

  const area = workArea();
  const g = maximized ? { x: 0, y: 0, w: area.w, h: area.h } : geometry;

  const start = (e: React.PointerEvent, direction?: Direction) => {
    if (e.button !== 0) return;
    if (native) {
      if (!direction && (e.target as HTMLElement).closest("button, input, select, a")) return;
      e.preventDefault();
      void windowCurrent().then((j) => (direction ? j.startResizeDragging(DIRECTION_NATIVE[direction]) : j.startDragging()));
      return;
    }
    if (maximized && direction) return;
    onFocus();
    if (!direction && (e.target as HTMLElement).closest("button, input, select, a")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, g: { ...g }, direcao: direction };
  };

  const move = (e: React.PointerEvent) => {
    const a = drag.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.direcao) {
      if (maximized) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        const width = geometry.w;
        const ratio = (a.x - g.x) / g.w;
        onMaximize();
        drag.current = { x: e.clientX, y: e.clientY, g: { ...geometry, x: e.clientX - width * ratio, y: 0 } };
        return;
      }
      onChangeGeometry(adjustGeometry({ ...a.g, x: a.g.x + dx, y: a.g.y + dy }, minimum));
      return;
    }
    let { x, y, w, h } = a.g;
    if (a.direcao.includes("l")) w = a.g.w + dx;
    if (a.direcao.includes("s")) h = a.g.h + dy;
    if (a.direcao.includes("o")) {
      w = a.g.w - dx;
      x = a.g.x + dx;
    }
    if (a.direcao.includes("n")) {
      h = a.g.h - dy;
      y = a.g.y + dy;
    }
    const mw = Math.min(minimum.w, area.w);
    const mh = Math.min(minimum.h, area.h);
    if (w < mw) {
      if (a.direcao.includes("o")) x -= mw - w;
      w = mw;
    }
    if (h < mh) {
      if (a.direcao.includes("n")) y -= mh - h;
      h = mh;
    }
    onChangeGeometry(adjustGeometry({ x, y, w, h }, minimum));
  };

  const finish = (e: React.PointerEvent) => {
    if (!drag.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!drag.current.direcao && e.clientY <= 2 && !maximized) onMaximize();
    drag.current = null;
  };

  const handles: Direction[] = ["n", "s", "l", "o", "nl", "no", "sl", "so"];

  return (
    <motion.div
      ref={element}
      className={`janela ${maximized ? "janela-maximizada" : ""} ${native ? "janela-nativa" : ""}`}
      role="dialog"
      aria-label={labelAccessible}
      style={native ? { zIndex: z } : { left: g.x, top: g.y, width: g.w, height: g.h, zIndex: z }}
      initial={native ? false : { opacity: 0, scale: 0.96, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 24, transition: { duration: 0.2, ease: [0.45, 0, 0.2, 1] } }}
      transition={{ duration: 0.28, ease: [0.3, 0.9, 0.3, 1] }}
      onPointerDownCapture={onFocus}
    >
      <div
        className="janela-barra"
        onPointerDown={(e) => start(e)}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, select, a")) return;
          if (native) void windowCurrent().then((j) => j.toggleMaximize());
          else onMaximize();
        }}
      >
        {startBar}
        <div className="janela-titulo cortar">{title}</div>
        <div className="janela-acoes-barra">{actionsBar}</div>
        <div className="janela-controles">
          <button type="button" className="janela-controle" aria-label={T.janela.minimizar} title={T.janela.minimizar} onClick={native ? () => void windowCurrent().then((j) => j.minimize()) : onMinimize}>
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="janela-controle"
            aria-label={maximized ? T.janela.restaurar : T.janela.maximizar}
            title={maximized ? T.janela.restaurar : T.janela.maximizar}
            onClick={native ? () => void windowCurrent().then((j) => j.toggleMaximize()) : onMaximize}
          >
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button type="button" className="janela-controle janela-fechar" aria-label={T.janela.fechar} title={T.janela.fechar} onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="janela-corpo" id={idLayer}>
        {children}
      </div>
      {(native || !maximized) &&
        handles.map((d) => (
          <div
            key={d}
            className={`janela-alca janela-alca-${d}`}
            onPointerDown={(e) => start(e, d)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}
          />
        ))}
    </motion.div>
  );
}
