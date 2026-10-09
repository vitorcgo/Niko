import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, ArrowUp } from "lucide-react";
import { advanceStage, createStateStages, receiveStages, type StageVisual } from "./rules";
import { useMotionPreferences } from "./useMotionPreferences";
import { useConfig } from "../../../state/settings";
import "./animations.css";

export function AnimatedStages({ contexto: context, etapas: stages, compacta: compact = false }: { contexto: string; etapas: readonly StageVisual[]; compacta?: boolean }) {
  const reduce = useMotionPreferences();
  const privacy = useConfig((s) => s.privacidade);
  const [state, setState] = useState(() => createStateStages(context, stages));
  const displayed = reduce || state.contexto !== context ? createStateStages(context, stages) : state;
  const next = displayed.fila[0];
  const height = compact ? 12 : 20;

  useEffect(() => {
    setState((current) => reduce ? createStateStages(context, stages) : receiveStages(current, context, stages));
  }, [context, stages, reduce]);

  useEffect(() => {
    if (!next || reduce) return;
    if (document.hidden) {
      setState((current) => createStateStages(current.contexto, [current.atual, ...current.fila].filter((stage): stage is StageVisual => stage !== null)));
      return;
    }
    const clock = window.setTimeout(() => setState((current) => advanceStage(current)), 380);
    const onHide = () => {
      if (document.hidden) {
        window.clearTimeout(clock);
        setState((current) => createStateStages(current.contexto, [current.atual, ...current.fila].filter((stage): stage is StageVisual => stage !== null)));
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(clock);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [next?.id, context, reduce]);

  if (!displayed.atual) return null;
  const lines = [displayed.anterior, displayed.atual, next];
  return (
    <span className={`ilha-etapas${compact ? " ilha-etapas-compacta" : ""}`} aria-label={privacy ? undefined : stages.at(-1)?.texto}>
      {lines.map((stage, index) => stage && (
        <motion.span key={`${stage.id}-${index}`} className={`ilha-etapa${index === 0 ? " ilha-etapa-anterior" : ""}`} aria-hidden="true"
          initial={index === 2 && !reduce ? { y: height * 2, opacity: 0 } : false}
          animate={{ y: height * (index - (next ? 1 : 0)), opacity: index === 0 ? next ? 0 : 0.5 : index === 2 ? next ? 1 : 0 : next ? 0.5 : 1, scale: index === 0 || index === 1 && next ? 0.94 : 1 }}
          transition={{ duration: reduce ? 0 : 0.38, ease: [0.4, 0, 0.2, 1] }}>
          {index === 0 ? <ArrowUp size={compact ? 8 : 11} /> : <ChevronRight size={compact ? 9 : 12} />}
          <span className="cortar privado" title={privacy ? undefined : stage.texto}>{stage.texto}</span>
        </motion.span>
      ))}
    </span>
  );
}

export function StageWork({ contexto: context, texto: text }: { contexto: string; texto: string }) {
  const [historyValue, setHistory] = useState(() => ({ contexto: context, etapas: [{ id: "0", texto: text }], numero: 0 }));
  useEffect(() => {
    setHistory((current) => {
      if (current.contexto !== context) return { contexto: context, etapas: [{ id: "0", texto: text }], numero: 0 };
      if (current.etapas.at(-1)?.texto === text) return current;
      const number = current.numero + 1;
      return { contexto: context, etapas: [...current.etapas, { id: String(number), texto: text }].slice(-12), numero: number };
    });
  }, [context, text]);
  return <AnimatedStages contexto={context} etapas={historyValue.contexto === context ? historyValue.etapas : [{ id: "0", texto: text }]} compacta />;
}
