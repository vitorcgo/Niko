import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useMotionPreferences } from "./useMotionPreferences";
import { Character } from "../../../characters/Character";
import { AGENTS } from "../../../state/agents";
import { useConfig } from "../../../state/settings";
import { playSound } from "../../../bridge/sounds";
import { releaseSystemInitial } from "../../../desktop/desktop";
import { useInterface } from "../../../state/interface";
import { hasUpdates } from "../../../utils/releaseNotes";
import { todayISO, greeting } from "../../../utils/dates";
import { habitCompleted, tasksDay, useRoutine } from "../../../state/routine";
import { T } from "../../../i18n/ptBR";
import type { AgentId } from "../../../types";
import "./greeting.css";

const BRIGHTNESS: Record<AgentId, string> = { organizador: "#ff5a5a", tutor: "#b26be0", operador: "#ffc20e", java: "#5b8def" };
const SIZE = 56;
const START_DROP = 0.32;
const INTERVAL_DROP = 0.09;
const DURATION_DROP = 0.42;
const START_TITLE = 1.0;
const INTERVAL_LETTERS = 0.03;
const START_WAVE = 1.95;
const INTERVAL_WAVE = 0.11;
const OUTPUT_MS = 4600;
const END_MS = 5350;
const SPARKS = 7;

type Phase = "entrada" | "saida";

function Sparks({ cor: color, indice: index, pouso: landing }: { cor: string; indice: number; pouso: number }) {
  return (
    <>
      {Array.from({ length: SPARKS }, (_, i) => {
        const angle = ((i / SPARKS) * 360 + index * 23) * (Math.PI / 180);
        const distance = 30 + ((i * 7 + index * 5) % 16);
        return (
          <motion.span
            key={i}
            className="saudacao-faisca"
            style={{ background: i % 2 === 0 ? color : "#ffffff" }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.7, opacity: [0, 1, 0], scale: [0.3, 1, 0.2] }}
            transition={{ delay: landing, duration: 0.85, ease: [0.15, 0.7, 0.3, 1] }}
          />
        );
      })}
    </>
  );
}

function Member({ agente: agent, indice: index, fase: phase, reduzido: reduced }: { agente: AgentId; indice: number; fase: Phase; reduzido: boolean }) {
  const delay = START_DROP + index * INTERVAL_DROP;
  const landing = delay + DURATION_DROP;
  const color = BRIGHTNESS[agent];
  const exiting = phase === "saida";
  return (
    <motion.div
      className="saudacao-integrante"
      initial={{ y: reduced ? 0 : -130, opacity: 0, scale: reduced ? 1 : 0.7 }}
      animate={
        exiting
          ? { y: reduced ? 0 : -140, opacity: 0, scale: 0.85, transition: { delay: (AGENTS.length - 1 - index) * 0.06, duration: 0.42, ease: [0.5, 0, 0.75, 0] } }
          : { y: 0, opacity: 1, scale: 1, transition: reduced ? { delay: delay, duration: 0.3 } : { delay: delay, type: "spring", visualDuration: 0.5, bounce: 0.42 } }
      }
    >
      <motion.span
        className="saudacao-sombra"
        style={{ background: color }}
        initial={{ opacity: 0, scaleX: 0.3 }}
        animate={exiting ? { opacity: 0, scaleX: 0.3, transition: { duration: 0.25 } } : { opacity: 0.6, scaleX: 1, transition: { delay: landing - 0.1, duration: 0.5 } }}
      />
      {!reduced && <Sparks cor={color} indice={index} pouso={landing} />}
      <motion.div
        className="saudacao-onda"
        animate={reduced ? undefined : { y: [0, -11, 0], rotate: [0, index % 2 === 0 ? -6 : 6, 0] }}
        transition={{ delay: START_WAVE + index * INTERVAL_WAVE, duration: 0.5, ease: "easeInOut" }}
      >
        <motion.div
          className="saudacao-amasso"
          animate={reduced ? undefined : { scaleX: [1, 1.18, 0.94, 1.02, 1], scaleY: [1, 0.8, 1.07, 0.99, 1] }}
          transition={{ delay: landing - 0.04, duration: 0.5, times: [0, 0.2, 0.5, 0.75, 1], ease: "easeOut" }}
        >
          <Character agente={agent} estado="sucesso" tamanho={SIZE} interativo={false} halo={false} olhar={false} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function summaryToday(): { tarefas: number; habitos: number } {
  const { tarefas: tasks, habitos: habits, registros: records } = useRoutine.getState();
  const today = todayISO();
  const pendingRequests = tasksDay(tasks, today).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;
  const habitsPending = habits.filter((h) => !h.arquivado && !habitCompleted(h, records[today]?.[h.id])).length;
  return { tarefas: pendingRequests, habitos: habitsPending };
}

export function Greeting({ versaoNova: versionNew, aoTerminar: onFinish }: { versaoNova?: string; aoTerminar: () => void }) {
  const nameValue = useConfig((s) => s.nome.trim().split(/\s+/)[0] ?? "");
  const reduced = useMotionPreferences();
  const [phase, setPhase] = useState<Phase>("entrada");
  const [title] = useState(() => T.ilha.saudacao.titulo(greeting(), nameValue));
  const [subtitle] = useState(() => (versionNew ? T.ilha.saudacao.atualizado(versionNew) : T.ilha.saudacao.hoje(summaryToday())));
  const exiting = phase === "saida";
  const exit = useRef<() => void>(() => undefined);

  useEffect(() => {
    const silenciosa = useConfig.getState().naoPerturbe;
    let encerrando = false;
    const relogios: number[] = [];
    const stopValue = () => {
      if (encerrando) return;
      encerrando = true;
      relogios.forEach((t) => window.clearTimeout(t));
      setPhase("saida");
      void releaseSystemInitial();
      if (versionNew && hasUpdates(versionNew)) useInterface.getState().navigateTo("atualizacao", { secao: "novidades" });
      relogios.push(window.setTimeout(onFinish, END_MS - OUTPUT_MS));
    };
    exit.current = stopValue;
    if (!silenciosa) {
      relogios.push(window.setTimeout(() => void playSound("greet", "personagens"), START_DROP * 1000));
      relogios.push(window.setTimeout(() => void playSound("proud", "personagens"), START_WAVE * 1000));
    }
    relogios.push(window.setTimeout(stopValue, OUTPUT_MS));
    return () => relogios.forEach((t) => window.clearTimeout(t));
  }, [onFinish, versionNew]);

  return (
    <motion.div
      className="saudacao"
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${subtitle}. ${T.ilha.saudacao.pular}`}
      title={T.ilha.saudacao.pular}
      onClick={() => exit.current()}
      onKeyDown={(e) => (e.key === "Escape" || e.key === "Enter" || e.key === " ") && exit.current()}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <div className="saudacao-fundo" aria-hidden="true">
        {!reduced && (
          <>
            <motion.span
              className="saudacao-aurora"
              style={{ background: "radial-gradient(closest-side, #8b5cf6, transparent)", left: "8%" }}
              initial={{ opacity: 0, x: -30, scale: 0.6 }}
              animate={exiting ? { opacity: 0, transition: { duration: 0.5 } } : { opacity: [0, 0.55, 0.38], x: [-30, 40, 10], scale: [0.6, 1.1, 1], transition: { duration: 4.2, ease: "easeInOut" } }}
            />
            <motion.span
              className="saudacao-aurora"
              style={{ background: "radial-gradient(closest-side, #f472b6, transparent)", right: "6%" }}
              initial={{ opacity: 0, x: 30, scale: 0.6 }}
              animate={exiting ? { opacity: 0, transition: { duration: 0.5 } } : { opacity: [0, 0.4, 0.3], x: [30, -50, -10], scale: [0.6, 1.15, 1], transition: { duration: 4.4, ease: "easeInOut", delay: 0.15 } }}
            />
            <motion.span
              className="saudacao-anel"
              initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
              animate={exiting ? { opacity: 0, transition: { duration: 0.4 } } : { opacity: [0, 0.5, 0.22], scale: [0.4, 1.25, 1.4], rotate: 140, transition: { duration: 4.4, ease: [0.2, 0.7, 0.3, 1] } }}
            />
          </>
        )}
      </div>
      <div className="saudacao-equipe">
        {AGENTS.map((a, i) => (
          <Member key={a} agente={a} indice={i} fase={phase} reduzido={reduced} />
        ))}
      </div>
      <h2 className="saudacao-titulo" aria-hidden="true">
        {Array.from(title).map((letter, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: reduced ? 0 : 9, filter: reduced ? "blur(0px)" : "blur(8px)" }}
            animate={
              exiting
                ? { opacity: 0, y: -6, filter: "blur(6px)", transition: { delay: i * 0.008, duration: 0.28 } }
                : { opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: START_TITLE + i * INTERVAL_LETTERS, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] } }
            }
          >
            {letter === " " ? " " : letter}
          </motion.span>
        ))}
      </h2>
      <motion.p
        className="saudacao-equipe-texto"
        aria-hidden="true"
        initial={{ opacity: 0, y: 6 }}
        animate={exiting ? { opacity: 0, transition: { duration: 0.2 } } : { opacity: 1, y: 0, transition: { delay: START_TITLE + title.length * INTERVAL_LETTERS + 0.15, duration: 0.5 } }}
      >
        {subtitle}
      </motion.p>
    </motion.div>
  );
}
