import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { Personagem } from "../../../personagens/Personagem";
import type { AgenteId, EstadoAgente } from "../../../tipos";
import { calcularDestinoPersonagem } from "./regras";
import { usarMovimentoReduzido } from "./usarMovimentoReduzido";
import "./animacoes.css";

export function EspacoDoPersonagem({ agente, tamanho, posicao, flutuar = false, className }: { agente?: AgenteId; tamanho: number; posicao: "compacta" | "expandida"; flutuar?: boolean; className?: string }) {
  return <span className={`ilha-personagem-espaco${className ? ` ${className}` : ""}`} data-personagem-agente={agente ?? QUALQUER_AGENTE} data-personagem-posicao={posicao} data-personagem-flutuar={flutuar || undefined} style={{ width: tamanho, height: tamanho }} aria-hidden="true" />;
}

const QUALQUER_AGENTE = "qualquer";
const ESTADOS_ANIMADOS_NA_COMPACTA: EstadoAgente[] = ["pensando", "escrevendo"];

export function PersonagemContinuo({ ilha, posicao, ativo, escala, agente, estado, rotulo, destinoKey }: { ilha: RefObject<HTMLDivElement | null>; posicao: "compacta" | "expandida"; ativo: boolean; escala: number; agente: AgenteId; estado: EstadoAgente; rotulo: string; destinoKey?: string }) {
  const reduzir = usarMovimentoReduzido();
  const parado = posicao === "compacta" && !ESTADOS_ANIMADOS_NA_COMPACTA.includes(estado);
  const x = useSpring(0, { stiffness: 460, damping: 38 });
  const y = useSpring(0, { stiffness: 460, damping: 38 });
  const tamanho = useSpring(1, { stiffness: 460, damping: 38 });
  const opacidade = useMotionValue(0);
  const inicializado = useRef(false);
  const [temDestino, setTemDestino] = useState(false);
  const [flutuando, setFlutuando] = useState(false);

  useEffect(() => {
    const raiz = ilha.current;
    if (!raiz || !ativo) {
      opacidade.set(0);
      setTemDestino(false);
      inicializado.current = false;
      return;
    }
    let quadro = 0;
    let observador: ResizeObserver | null = null;
    let elementosObservados: Element[] = [];
    let espacoObservado: HTMLElement | null = null;
    const inicio = performance.now();
    const medir = () => {
      if (document.hidden) return;
      const espaco = Array.from(raiz.querySelectorAll<HTMLElement>(`[data-personagem-posicao="${posicao}"]:is([data-personagem-agente="${agente}"], [data-personagem-agente="${QUALQUER_AGENTE}"])`)).at(-1);
      setFlutuando(Boolean(espaco?.dataset.personagemFlutuar));
      if (observador && espaco && espaco !== espacoObservado) {
        elementosObservados.forEach((el) => observador?.unobserve(el));
        espacoObservado = espaco;
        elementosObservados = Array.from(espaco.parentElement?.children ?? [espaco]);
        elementosObservados.forEach((el) => observador?.observe(el));
      }
      const destino = espaco ? calcularDestinoPersonagem(raiz.getBoundingClientRect(), espaco.getBoundingClientRect(), escala) : null;
      if (!destino) {
        opacidade.set(0);
        setTemDestino(false);
        return;
      }
      const imediato = reduzir || !inicializado.current;
      if (imediato) {
        x.jump(destino.x);
        y.jump(destino.y);
        tamanho.jump(destino.escala);
      } else {
        x.set(destino.x);
        y.set(destino.y);
        tamanho.set(destino.escala);
      }
      inicializado.current = true;
      opacidade.set(1);
      setTemDestino(true);
    };
    const acompanhar = () => {
      if (document.hidden) return;
      medir();
      if (!reduzir && performance.now() - inicio < 850) quadro = requestAnimationFrame(acompanhar);
    };
    if (typeof ResizeObserver !== "undefined") {
      observador = new ResizeObserver(medir);
      observador.observe(raiz);
    }
    acompanhar();
    const aoEsconder = () => {
      if (document.hidden) {
        cancelAnimationFrame(quadro);
        x.stop();
        y.stop();
        tamanho.stop();
        opacidade.set(0);
        inicializado.current = false;
      } else medir();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      cancelAnimationFrame(quadro);
      observador?.disconnect();
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [ilha, posicao, ativo, escala, agente, reduzir, x, y, tamanho, opacidade, destinoKey]);

  return (
    <motion.div className="ilha-personagem-continuo" data-personagem-continuo={agente} style={{ x, y, scale: tamanho, opacity: opacidade, pointerEvents: posicao === "expandida" && temDestino ? "auto" : "none", visibility: temDestino ? "visible" : "hidden" }} aria-hidden={!temDestino || undefined}>
      {ativo && temDestino && (
        <span className="ilha-personagem-flutuante" data-flutuando={(flutuando && !reduzir) || undefined}>
          <Personagem key={agente} agente={agente} estado={estado} tamanho={70} interativo={posicao === "expandida"} halo={false} rotulo={rotulo} olhar={posicao === "expandida"} estatico={parado} />
        </span>
      )}
    </motion.div>
  );
}
