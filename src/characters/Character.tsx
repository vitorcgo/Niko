import { useEffect, useId, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { motion, useAnimate } from "motion/react";
import { Heart } from "lucide-react";
import type { AgentId, AgentState } from "../types";
import { COLOR_STATE, useStateAgent } from "../state/agents";
import { playSound, playSequence } from "../bridge/sounds";
import { pathCharacter, STATES_SVG, COLOR_AGENT } from "./colors";
import { loadFace, listenMouse, type Face } from "./gaze";
import "./characters.css";

export interface ControlCharacter {
  carinho: () => void;
}

interface Props {
  agente: AgentId;
  estado?: AgentState;
  tamanho?: number;
  interativo?: boolean;
  halo?: boolean;
  rotulo?: string;
  olhar?: boolean;
}

const preLoaded = new Set<AgentId>();
const agentsWithoutArt = new Set<AgentId>();
const listenersWithoutArt = new Map<AgentId, Set<(without: boolean) => void>>();

function markWithoutArt(agent: AgentId) {
  if (agentsWithoutArt.has(agent)) return;
  agentsWithoutArt.add(agent);
  listenersWithoutArt.get(agent)?.forEach((f) => f(true));
  window.setTimeout(() => void checkArt(agent), 8000);
}

async function checkArt(agent: AgentId) {
  if (!agentsWithoutArt.has(agent) || document.hidden) {
    if (agentsWithoutArt.has(agent)) window.setTimeout(() => void checkArt(agent), 8000);
    return;
  }
  try {
    const r = await fetch(pathCharacter(agent, "ocioso"), { method: "HEAD", cache: "no-store" });
    if (r.ok) {
      agentsWithoutArt.delete(agent);
      listenersWithoutArt.get(agent)?.forEach((f) => f(false));
      return;
    }
  } catch {
    return;
  }
  window.setTimeout(() => void checkArt(agent), 8000);
}

function listenWithoutArt(agent: AgentId, f: (without: boolean) => void) {
  if (!listenersWithoutArt.has(agent)) listenersWithoutArt.set(agent, new Set());
  listenersWithoutArt.get(agent)!.add(f);
  return () => {
    listenersWithoutArt.get(agent)?.delete(f);
  };
}

function preLoad(agent: AgentId) {
  if (preLoaded.has(agent)) return;
  preLoaded.add(agent);
  const load = () => STATES_SVG.forEach((e) => {
    const img = new Image();
    img.decoding = "async";
    img.src = pathCharacter(agent, e);
  });
  window.setTimeout(load, 800);
}

export const Character = forwardRef<ControlCharacter, Props>(function Character(
  { agente: agent, estado: stateFixed, tamanho: size = 48, interativo: interactive = true, halo = true, rotulo: label, olhar: followMouse = true },
  ref,
) {
  const stateAlive = useStateAgent(agent);
  const state = stateFixed ?? stateAlive;
  const [scope, animate] = useAnimate();
  const [reaction, setReaction] = useState<"feliz" | "tonto" | null>(null);
  const [hearts, setHearts] = useState(0);
  const [about, setAbout] = useState(false);
  const [visible, setVisible] = useState(true);
  const clicks = useRef<number[]>([]);
  const timers = useRef<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [face, setFace] = useState<Face | null>(null);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const idClip = useId().replace(/:/g, "");
  const [withoutArt, setWithoutArt] = useState(() => agentsWithoutArt.has(agent));
  useEffect(() => listenWithoutArt(agent, setWithoutArt), [agent]);


  const schedule = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    preLoad(agent);
  }, [agent]);

  useEffect(() => {
    const current = timers.current;
    return () => current.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([input]) => setVisible(input.isIntersecting), { rootMargin: "80px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showHappy = (duration = 1400) => {
    setReaction("feliz");
    setHearts((n) => n + 1);
    schedule(() => setReaction((r) => (r === "feliz" ? null : r)), duration);
  };

  useImperativeHandle(ref, () => ({
    carinho: () => {
      showHappy(1900);
      void playSound("proud", "personagens");
    },
  }));

  useEffect(() => {
    if (!interactive || !about || reaction) return;
    const t = window.setTimeout(() => {
      showHappy(1900);
      void playSound("love", "personagens");
    }, 1900);
    return () => window.clearTimeout(t);
  }, [about, interactive, reaction]);

  const onClick = () => {
    if (!interactive) return;
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 1700), now];
    if (clicks.current.length >= 3) {
      clicks.current = [];
      setReaction("tonto");
      void playSequence(["slap", "dizzy"], "personagens", 220);
      void animate(scope.current, { rotate: [0, 360, 720, 1080] }, { duration: 3.3, ease: "easeInOut" });
      schedule(() => setReaction(null), 3300);
      return;
    }
    if (reaction === "tonto") return;
    void animate(scope.current, { scaleX: [1, 1.14, 0.94, 1], scaleY: [1, 0.84, 1.06, 1] }, { duration: 0.37, times: [0, 0.19, 0.54, 1], ease: "easeOut" });
    showHappy();
    void playSequence(["pop", "love"], "personagens", 240);
  };

  const canGaze = followMouse && visible && size >= 24 && !reaction && (state === "ocioso" || state === "ouvindo");

  useEffect(() => {
    if (!canGaze) {
      setGaze(null);
      return;
    }
    void loadFace(agent).then(setFace);
    let previous: { x: number; y: number } | null = null;
    return listenMouse((mx, my) => {
      const el = box.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.55;
      const dx = mx - cx;
      const dy = my - cy;
      const distance = Math.hypot(dx, dy);
      const radius = Math.max(240, size * 4);
      if (distance > radius) {
        if (previous) {
          previous = null;
          setGaze(null);
        }
        return;
      }
      const force = Math.min(1, distance / Math.max(40, size));
      const newItem = { x: distance ? (dx / distance) * force : 0, y: distance ? (dy / distance) * force : 0 };
      if (previous && Math.abs(previous.x - newItem.x) < 0.04 && Math.abs(previous.y - newItem.y) < 0.04) return;
      previous = newItem;
      setGaze(newItem);
    });
  }, [canGaze, agent, size]);

  const stateDisplayed: AgentState = reaction === "feliz" ? "sucesso" : reaction === "tonto" ? "erro" : about && interactive && state === "ocioso" ? "ouvindo" : state;
  const colorHalo = reaction === "tonto" ? "#a855f7" : COLOR_STATE[state];
  const showHalo = halo && size >= 32 && reaction === "tonto";

  return (
    <div
      ref={box}
      className="personagem"
      data-agente={agent}
      style={{ width: size, height: size }}
      role={interactive ? "button" : "img"}
      aria-label={label}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      onPointerEnter={() => {
        if (!interactive) return;
        setAbout(true);
        void playSound("hover", "personagens");
      }}
      onPointerLeave={() => setAbout(false)}
    >
      {showHalo && <span className="personagem-halo" style={{ background: colorHalo }} />}
      <motion.div className="personagem-corpo" animate={{ scale: about && interactive ? 1.08 : 1 }} transition={{ type: "spring", visualDuration: 0.3, bounce: 0.35 }}>
        <div ref={scope} className="personagem-giro">
          {visible && gaze && face ? (
            <svg viewBox="66 78 380 380" width={size} height={size} aria-hidden="true" className="personagem-imagem">
              <defs>
                <path id={`c-${idClip}`} d={face.corpo.d} />
                {face.olhos.map((o, i) => (
                  <clipPath key={i} id={`o-${idClip}-${i}`}>
                    <ellipse cx={o.branco.cx} cy={o.branco.cy} rx={o.branco.rx} ry={o.branco.ry} transform={o.branco.transform} />
                  </clipPath>
                ))}
              </defs>
              <use href={`#c-${idClip}`} transform={face.corpo.transform} fill={face.corpo.fill} />
              {face.olhos.map((o, i) => (
                <g key={i}>
                  <ellipse cx={o.branco.cx} cy={o.branco.cy} rx={o.branco.rx} ry={o.branco.ry} transform={o.branco.transform} fill={o.branco.fill} />
                  <g clipPath={`url(#o-${idClip}-${i})`}>
                    <ellipse
                      cx={o.branco.cx + gaze.x * (o.branco.rx - o.pupila.rx) * 0.95}
                      cy={o.branco.cy + gaze.y * (o.branco.ry - o.pupila.ry) * 0.95}
                      rx={o.pupila.rx}
                      ry={o.pupila.ry}
                      transform={o.pupila.transform}
                      fill={o.pupila.fill}
                      style={{ transition: "cx 0.12s ease-out, cy 0.12s ease-out" }}
                    />
                  </g>
                </g>
              ))}
            </svg>
          ) : visible ? (
            withoutArt ? (
              <span className="personagem-sem-arte" style={{ width: size, height: size, background: COLOR_AGENT[agent], fontSize: Math.round(size * 0.42) }}>{agent.slice(0, 1).toUpperCase()}</span>
            ) : (
              <img src={pathCharacter(agent, stateDisplayed)} width={size} height={size} alt="" draggable={false} decoding="async" className="personagem-imagem" onError={() => markWithoutArt(agent)} />
            )
          ) : (
            <span style={{ width: size, height: size, display: "block" }} />
          )}
          {visible && !withoutArt && size >= 24 && <span className="personagem-textura" style={{ maskImage: `url(${pathCharacter(agent, stateDisplayed)})`, WebkitMaskImage: `url(${pathCharacter(agent, stateDisplayed)})` }} aria-hidden="true" />}
        </div>
      </motion.div>
      {hearts > 0 && reaction === "feliz" && size >= 28 && (
        <span key={hearts} className="coracoes" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Heart key={i} size={Math.max(10, size * 0.2)} fill="#ff6fa8" color="#ff6fa8" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </span>
      )}
    </div>
  );
});
