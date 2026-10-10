import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import type { AgenteId, EstadoAgente } from "../../tipos";
import { useConfig } from "../../estado/configuracoes";
import { Personagem, type ControlePersonagem } from "../../personagens/Personagem";
import type { AparenciaAgente } from "../../personagens/personalizacao";
import type { AcessoriosAgente } from "../../personagens/acessorios";
import { tocarSom } from "../../ponte/sons";

interface VisualDaPrevia {
  agente: AgenteId;
  aparencia: AparenciaAgente;
  acessorios: AcessoriosAgente;
  corAcessorio: string | null;
}

export function PreviaGuardaRoupa({ agente, aparencia, acessorios, corAcessorio, tamanho, estado, nome, controle }: VisualDaPrevia & { tamanho: number; estado: EstadoAgente; nome: string; controle: RefObject<ControlePersonagem | null> }) {
  const reduzido = useReducedMotion();
  const reduzir = useConfig((s) => s.reduzirAnimacoes) || reduzido;
  const visual = { agente, aparencia, acessorios, corAcessorio };
  const assinatura = JSON.stringify(visual);
  const atual = useRef(visual);
  atual.current = visual;
  const anterior = useRef(assinatura);
  const [exibido, setExibido] = useState(visual);
  const [fase, setFase] = useState<"repouso" | "saida" | "entrada">("repouso");
  useEffect(() => {
    if (reduzir) {
      anterior.current = assinatura;
      setExibido(atual.current);
      setFase("repouso");
      return;
    }
    if (anterior.current === assinatura) return;
    anterior.current = assinatura;
    if (exibido.agente !== agente) {
      setExibido(atual.current);
      setFase("repouso");
      return;
    }
    if (fase === "saida") return;
    setFase("saida");
    void tocarSom("pop", "personagens");
  }, [assinatura, reduzir, agente, exibido.agente, fase]);
  useEffect(() => {
    if (fase === "repouso") return;
    const limite = window.setTimeout(() => { setExibido(atual.current); setFase("repouso"); }, 1600);
    return () => window.clearTimeout(limite);
  }, [fase, assinatura]);

  return <div className="time-camarim" data-fase={reduzir ? "repouso" : fase}>
    <div className="time-camarim-figura" onAnimationEnd={(e) => {
      if (e.target !== e.currentTarget) return;
      if (fase === "saida") { setExibido(atual.current); setFase("entrada"); }
      else if (fase === "entrada") setFase("repouso");
    }}><Personagem ref={controle} {...exibido} tamanho={tamanho} estado={estado} interativo olhar={false} textura={false} rotulo={nome} /></div>
    {fase !== "repouso" && !reduzir && <svg key={assinatura} className="time-camarim-fumaca" viewBox="0 0 160 160" aria-hidden="true">
      {[
        [-42, -18, 14], [-28, -42, 17], [4, -52, 15], [35, -37, 13],
        [44, -6, 16], [24, 22, 12], [-10, 29, 14], [-38, 14, 12],
      ].map(([x, y, raio], i) => <g key={i} className="time-fumaca-particula" style={{ "--fumaca-x": `${x}px`, "--fumaca-y": `${y}px`, animationDelay: `${i % 3 * .035}s` } as CSSProperties}>
        <circle cx="80" cy="85" r={raio} /><circle cx="89" cy="82" r={raio * .65} />
      </g>)}
    </svg>}
  </div>;
}
