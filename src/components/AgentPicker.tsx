import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Character } from "../characters/Character";
import { AGENTS } from "../state/agents";
import { useConfig } from "../state/settings";
import { useChatting } from "../state/chatting";
import { playSound } from "../bridge/sounds";
import { T } from "../i18n/ptBR";
import type { AgentId } from "../types";

const INTERVALS = [70, 70, 75, 80, 90, 105, 125, 150, 185];

function sequenceUntil(target: AgentId): AgentId[] {
  const end = AGENTS.indexOf(target);
  const steps = INTERVALS.length;
  return Array.from({ length: steps + 1 }, (_, i) => AGENTS[(end - (steps - i) + AGENTS.length * 4) % AGENTS.length]);
}

export function Typing() {
  return (
    <span className="pontos-digitando" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }} />
      ))}
    </span>
  );
}

export function AgentPicker({ tamanho: size = 30 }: { tamanho?: number }) {
  const phase = useChatting((s) => s.fase);
  const agent = useChatting((s) => s.agente);
  const names = useConfig((s) => s.agentes.nomes);
  const sequence = useMemo(() => (agent ? sequenceUntil(agent) : []), [agent]);
  const [step, setStep] = useState(0);
  const stopped = phase !== "escolhendo" || step >= sequence.length - 1;

  useEffect(() => {
    if (phase !== "escolhendo") {
      setStep(sequence.length - 1);
      return;
    }
    setStep(0);
    let i = 0;
    let t = 0;
    const advance = () => {
      i += 1;
      setStep(i);
      if (i < sequence.length - 1) {
        void playSound("tick", "interface");
        t = window.setTimeout(advance, INTERVALS[i] ?? 180);
      } else void playSound("pop", "interface");
    };
    t = window.setTimeout(advance, INTERVALS[0]);
    return () => window.clearTimeout(t);
  }, [phase, sequence]);

  if (!phase || !agent) return null;
  const displayed = sequence[Math.min(step, sequence.length - 1)] ?? agent;

  return (
    <div className="roleta" data-parou={stopped ? "sim" : "nao"}>
      <div className="roleta-janela" style={{ width: size + 14, height: size + 14 }}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={`${displayed}-${step}`}
            className="roleta-boneco"
            initial={{ y: "-90%", opacity: 0.4 }}
            animate={stopped ? { y: [0, -7, 0], opacity: 1, transition: { duration: 0.34, ease: "easeOut" } } : { y: 0, opacity: 1, transition: { duration: 0.06 } }}
            exit={{ y: "90%", opacity: 0, transition: { duration: 0.06 } }}
          >
            <Character agente={displayed} estado={stopped ? (phase === "respondendo" ? "pensando" : "sucesso") : "ocioso"} tamanho={size} interativo={false} halo={false} olhar={false} />
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="roleta-texto">
        {phase === "escolhendo" && !stopped ? (
          <>{T.chat.escolhendo}</>
        ) : (
          <>
            <b>{names[agent]}</b> {phase === "respondendo" ? T.chat.pensandoCurto : T.chat.vaiResponder}
            <Typing />
          </>
        )}
      </span>
    </div>
  );
}
