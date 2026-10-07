import { useEffect, useId, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { LINUX } from "../desktop/desktop";
import { motion, useAnimate } from "motion/react";
import { Heart } from "lucide-react";
import type { AgenteId, EstadoAgente } from "../tipos";
import { COR_ESTADO, useEstadoAgente } from "../estado/agentes";
import { tocarSom, tocarSequencia } from "../ponte/sons";
import { caminhoPersonagem, ESTADOS_SVG, COR_AGENTE } from "./cores";
import { carregarRosto, ouvirMouse, type Rosto } from "./olhar";
import "./personagens.css";

export interface ControlePersonagem {
  carinho: () => void;
}

interface Props {
  agente: AgenteId;
  estado?: EstadoAgente;
  tamanho?: number;
  interativo?: boolean;
  halo?: boolean;
  rotulo?: string;
  olhar?: boolean;
}

const preCarregados = new Set<AgenteId>();
const agentesSemArte = new Set<AgenteId>();
const ouvintesSemArte = new Map<AgenteId, Set<(sem: boolean) => void>>();

function marcarSemArte(agente: AgenteId) {
  if (agentesSemArte.has(agente)) return;
  agentesSemArte.add(agente);
  ouvintesSemArte.get(agente)?.forEach((f) => f(true));
  window.setTimeout(() => void verificarArte(agente), 8000);
}

async function verificarArte(agente: AgenteId) {
  if (!agentesSemArte.has(agente) || document.hidden) {
    if (agentesSemArte.has(agente)) window.setTimeout(() => void verificarArte(agente), 8000);
    return;
  }
  try {
    const r = await fetch(caminhoPersonagem(agente, "ocioso"), { method: "HEAD", cache: "no-store" });
    if (r.ok) {
      agentesSemArte.delete(agente);
      ouvintesSemArte.get(agente)?.forEach((f) => f(false));
      return;
    }
  } catch {
    return;
  }
  window.setTimeout(() => void verificarArte(agente), 8000);
}

function ouvirSemArte(agente: AgenteId, f: (sem: boolean) => void) {
  if (!ouvintesSemArte.has(agente)) ouvintesSemArte.set(agente, new Set());
  ouvintesSemArte.get(agente)!.add(f);
  return () => {
    ouvintesSemArte.get(agente)?.delete(f);
  };
}

function preCarregar(agente: AgenteId) {
  if (preCarregados.has(agente)) return;
  preCarregados.add(agente);
  const carregar = () => ESTADOS_SVG.forEach((e) => {
    const img = new Image();
    img.decoding = "async";
    img.src = caminhoPersonagem(agente, e);
  });
  window.setTimeout(carregar, 800);
}

export const Personagem = forwardRef<ControlePersonagem, Props>(function Personagem(
  { agente, estado: estadoFixo, tamanho = 48, interativo = true, halo = true, rotulo, olhar: seguirMouse = true },
  ref,
) {
  const estadoVivo = useEstadoAgente(agente);
  const estado = estadoFixo ?? estadoVivo;
  const [escopo, animar] = useAnimate();
  const [reacao, setReacao] = useState<"feliz" | "tonto" | null>(null);
  const [coracoes, setCoracoes] = useState(0);
  const [sobre, setSobre] = useState(false);
  const [visivel, setVisivel] = useState(true);
  const cliques = useRef<number[]>([]);
  const temporizadores = useRef<number[]>([]);
  const caixa = useRef<HTMLDivElement>(null);
  const [rosto, setRosto] = useState<Rosto | null>(null);
  const [olhar, setOlhar] = useState<{ x: number; y: number } | null>(null);
  const idClip = useId().replace(/:/g, "");
  const [semArte, setSemArte] = useState(() => agentesSemArte.has(agente));
  useEffect(() => ouvirSemArte(agente, setSemArte), [agente]);


  const agendar = (fn: () => void, ms: number) => {
    temporizadores.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    preCarregar(agente);
  }, [agente]);

  useEffect(() => {
    const atual = temporizadores.current;
    return () => atual.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting), { rootMargin: "80px" });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const mostrarFeliz = (duracao = 1400) => {
    setReacao("feliz");
    setCoracoes((n) => n + 1);
    agendar(() => setReacao((r) => (r === "feliz" ? null : r)), duracao);
  };

  useImperativeHandle(ref, () => ({
    carinho: () => {
      mostrarFeliz(1900);
      void tocarSom("proud", "personagens");
    },
  }));

  useEffect(() => {
    if (!interativo || !sobre || reacao) return;
    const t = window.setTimeout(() => {
      mostrarFeliz(1900);
      void tocarSom("love", "personagens");
    }, 1900);
    return () => window.clearTimeout(t);
  }, [sobre, interativo, reacao]);

  const aoClicar = () => {
    if (!interativo) return;
    const agora = Date.now();
    cliques.current = [...cliques.current.filter((t) => agora - t < 1700), agora];
    if (cliques.current.length >= 3) {
      cliques.current = [];
      setReacao("tonto");
      void tocarSequencia(["slap", "dizzy"], "personagens", 220);
      void animar(escopo.current, { rotate: [0, 360, 720, 1080] }, { duration: 3.3, ease: "easeInOut" });
      agendar(() => setReacao(null), 3300);
      return;
    }
    if (reacao === "tonto") return;
    void animar(escopo.current, { scaleX: [1, 1.14, 0.94, 1], scaleY: [1, 0.84, 1.06, 1] }, { duration: 0.37, times: [0, 0.19, 0.54, 1], ease: "easeOut" });
    mostrarFeliz();
    void tocarSequencia(["pop", "love"], "personagens", 240);
  };

  const podeOlhar = seguirMouse && visivel && tamanho >= 24 && !reacao && (estado === "ocioso" || estado === "ouvindo");

  useEffect(() => {
    if (!podeOlhar) {
      setOlhar(null);
      return;
    }
    void carregarRosto(agente).then(setRosto);
    let anterior: { x: number; y: number } | null = null;
    return ouvirMouse((mx, my) => {
      const el = caixa.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.55;
      const dx = mx - cx;
      const dy = my - cy;
      const distancia = Math.hypot(dx, dy);
      const raio = Math.max(240, tamanho * 4);
      if (distancia > raio) {
        if (anterior) {
          anterior = null;
          setOlhar(null);
        }
        return;
      }
      const forca = Math.min(1, distancia / Math.max(40, tamanho));
      const novo = { x: distancia ? (dx / distancia) * forca : 0, y: distancia ? (dy / distancia) * forca : 0 };
      if (anterior && Math.abs(anterior.x - novo.x) < 0.04 && Math.abs(anterior.y - novo.y) < 0.04) return;
      anterior = novo;
      setOlhar(novo);
    });
  }, [podeOlhar, agente, tamanho]);

  const olharVisual = olhar ?? (LINUX && podeOlhar && estado === "ocioso" ? { x: 0, y: 0 } : null);

  const estadoExibido: EstadoAgente = reacao === "feliz" ? "sucesso" : reacao === "tonto" ? "erro" : sobre && interativo && estado === "ocioso" ? "ouvindo" : estado;
  const corHalo = reacao === "tonto" ? "#a855f7" : COR_ESTADO[estado];
  const mostrarHalo = halo && tamanho >= 32 && reacao === "tonto";

  return (
    <div
      ref={caixa}
      className="personagem"
      data-agente={agente}
      style={{ width: tamanho, height: tamanho }}
      role={interativo ? "button" : "img"}
      aria-label={rotulo}
      tabIndex={interativo ? 0 : undefined}
      onClick={aoClicar}
      onKeyDown={(e) => {
        if (interativo && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          aoClicar();
        }
      }}
      onPointerEnter={() => {
        if (!interativo) return;
        setSobre(true);
        void tocarSom("hover", "personagens");
      }}
      onPointerLeave={() => setSobre(false)}
    >
      {mostrarHalo && <span className="personagem-halo" style={{ background: corHalo }} />}
      <motion.div className="personagem-corpo" animate={{ scale: sobre && interativo ? 1.08 : 1 }} transition={{ type: "spring", visualDuration: 0.3, bounce: 0.35 }}>
        <div ref={escopo} className="personagem-giro">
          {visivel && olharVisual && rosto ? (
            <svg viewBox="66 78 380 380" width={tamanho} height={tamanho} aria-hidden="true" className="personagem-imagem">
              <defs>
                <path id={`c-${idClip}`} d={rosto.corpo.d} />
                {rosto.olhos.map((o, i) => (
                  <clipPath key={i} id={`o-${idClip}-${i}`}>
                    <ellipse cx={o.branco.cx} cy={o.branco.cy} rx={o.branco.rx} ry={o.branco.ry} transform={o.branco.transform} />
                  </clipPath>
                ))}
              </defs>
              <use href={`#c-${idClip}`} transform={rosto.corpo.transform} fill={rosto.corpo.fill} />
              {rosto.olhos.map((o, i) => (
                <g key={i}>
                  <ellipse cx={o.branco.cx} cy={o.branco.cy} rx={o.branco.rx} ry={o.branco.ry} transform={o.branco.transform} fill={o.branco.fill} />
                  <g clipPath={`url(#o-${idClip}-${i})`}>
                    <ellipse
                      cx={o.branco.cx + olharVisual.x * (o.branco.rx - o.pupila.rx) * 0.95}
                      cy={o.branco.cy + olharVisual.y * (o.branco.ry - o.pupila.ry) * 0.95}
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
          ) : visivel ? (
            semArte ? (
              <span className="personagem-sem-arte" style={{ width: tamanho, height: tamanho, background: COR_AGENTE[agente], fontSize: Math.round(tamanho * 0.42) }}>{agente.slice(0, 1).toUpperCase()}</span>
            ) : (
              <img src={caminhoPersonagem(agente, estadoExibido)} width={tamanho} height={tamanho} alt="" draggable={false} decoding="async" className="personagem-imagem" onError={() => marcarSemArte(agente)} />
            )
          ) : (
            <span style={{ width: tamanho, height: tamanho, display: "block" }} />
          )}
          {!LINUX && visivel && !semArte && tamanho >= 24 && <span className="personagem-textura" style={{ maskImage: `url(${caminhoPersonagem(agente, estadoExibido)})`, WebkitMaskImage: `url(${caminhoPersonagem(agente, estadoExibido)})` }} aria-hidden="true" />}
        </div>
      </motion.div>
      {coracoes > 0 && reacao === "feliz" && tamanho >= 28 && (
        <span key={coracoes} className="coracoes" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Heart key={i} size={Math.max(10, tamanho * 0.2)} fill="#ff6fa8" color="#ff6fa8" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </span>
      )}
    </div>
  );
});
