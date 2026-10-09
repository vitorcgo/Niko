import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { Character } from "../../../characters/Character";
import type { AgentId, AgentState } from "../../../types";
import { calculateDestinationCharacter } from "./rules";
import { useMotionPreferences } from "./useMotionPreferences";
import "./animations.css";

export function SpaceCharacter({ agente: agent, tamanho: size, posicao: position, flutuar: float = false, className }: { agente?: AgentId; tamanho: number; posicao: "compacta" | "expandida"; flutuar?: boolean; className?: string }) {
  return <span className={`ilha-personagem-espaco${className ? ` ${className}` : ""}`} data-personagem-agente={agent ?? QUALQUER_AGENT} data-personagem-posicao={position} data-personagem-flutuar={float || undefined} style={{ width: size, height: size }} aria-hidden="true" />;
}

const QUALQUER_AGENT = "qualquer";

export function ContinuousCharacter({ ilha: island, posicao: position, ativo: active, escala: scale, agente: agent, estado: state, rotulo: label, destinoKey: destinationKey }: { ilha: RefObject<HTMLDivElement | null>; posicao: "compacta" | "expandida"; ativo: boolean; escala: number; agente: AgentId; estado: AgentState; rotulo: string; destinoKey?: string }) {
  const reduce = useMotionPreferences();
  const x = useSpring(0, { stiffness: 460, damping: 38 });
  const y = useSpring(0, { stiffness: 460, damping: 38 });
  const size = useSpring(1, { stiffness: 460, damping: 38 });
  const opacity = useMotionValue(0);
  const initialized = useRef(false);
  const [hasDestination, setHasDestination] = useState(false);
  const [floating, setFloating] = useState(false);

  useEffect(() => {
    const root = island.current;
    if (!root || !active) {
      opacity.set(0);
      setHasDestination(false);
      initialized.current = false;
      return;
    }
    let board = 0;
    let observer: ResizeObserver | null = null;
    let elementsObserved: Element[] = [];
    let spaceObserved: HTMLElement | null = null;
    const start = performance.now();
    const measure = () => {
      if (document.hidden) return;
      const space = Array.from(root.querySelectorAll<HTMLElement>(`[data-personagem-posicao="${position}"]:is([data-personagem-agente="${agent}"], [data-personagem-agente="${QUALQUER_AGENT}"])`)).at(-1);
      setFloating(Boolean(space?.dataset.personagemFlutuar));
      if (observer && space && space !== spaceObserved) {
        elementsObserved.forEach((el) => observer?.unobserve(el));
        spaceObserved = space;
        elementsObserved = Array.from(space.parentElement?.children ?? [space]);
        elementsObserved.forEach((el) => observer?.observe(el));
      }
      const destination = space ? calculateDestinationCharacter(root.getBoundingClientRect(), space.getBoundingClientRect(), scale) : null;
      if (!destination) {
        opacity.set(0);
        setHasDestination(false);
        return;
      }
      const immediate = reduce || !initialized.current;
      if (immediate) {
        x.jump(destination.x);
        y.jump(destination.y);
        size.jump(destination.escala);
      } else {
        x.set(destination.x);
        y.set(destination.y);
        size.set(destination.escala);
      }
      initialized.current = true;
      opacity.set(1);
      setHasDestination(true);
    };
    const track = () => {
      if (document.hidden) return;
      measure();
      if (!reduce && performance.now() - start < 850) board = requestAnimationFrame(track);
    };
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(root);
    }
    track();
    const onHide = () => {
      if (document.hidden) {
        cancelAnimationFrame(board);
        x.stop();
        y.stop();
        size.stop();
        opacity.set(0);
        initialized.current = false;
      } else measure();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(board);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [island, position, active, scale, agent, reduce, x, y, size, opacity, destinationKey]);

  return (
    <motion.div className="ilha-personagem-continuo" data-personagem-continuo={agent} style={{ x, y, scale: size, opacity: opacity, pointerEvents: position === "expandida" && hasDestination ? "auto" : "none", visibility: hasDestination ? "visible" : "hidden" }} aria-hidden={!hasDestination || undefined}>
      {active && hasDestination && (
        <span className="ilha-personagem-flutuante" data-flutuando={(floating && !reduce) || undefined}>
          <Character key={agent} agente={agent} estado={state} tamanho={70} interativo={position === "expandida"} halo={false} rotulo={label} olhar={position === "expandida"} />
        </span>
      )}
    </motion.div>
  );
}
