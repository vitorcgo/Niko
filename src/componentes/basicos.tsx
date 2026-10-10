import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Check, X, Info, TriangleAlert } from "lucide-react";
import { T } from "../textos/textos";
import { useInterface } from "../estado/interface";

type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo" | "destaque";

interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  pequeno?: boolean;
  icone?: ReactNode;
  soIcone?: boolean;
}

export function Botao({ variante = "secundario", pequeno, icone, soIcone, className = "", children, type = "button", ...resto }: PropsBotao) {
  const classes = ["botao", `botao-${variante}`, pequeno ? "botao-pequeno" : "", soIcone ? "botao-icone" : "", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} {...resto}>
      {icone}
      {!soIcone && children}
    </button>
  );
}

interface PropsCampo {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  obrigatorio?: boolean;
  id: string;
  children: ReactNode;
}

export function Campo({ rotulo, erro, dica, obrigatorio, id, children }: PropsCampo) {
  return (
    <div className="campo-grupo">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio" aria-hidden="true">*</span>}
      </label>
      {children}
      {erro ? (
        <span className="campo-erro" id={`${id}-erro`} role="alert">
          <AlertCircle size={12} />
          {erro}
        </span>
      ) : dica ? (
        <span className="campo-dica" id={`${id}-dica`}>{dica}</span>
      ) : null}
    </div>
  );
}

export function Alternador({ ligado, aoMudar, rotulo, desativado }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string; desativado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      className="alternador"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desativado}
      onClick={() => aoMudar(!ligado)}
    />
  );
}

export function LinhaAlternador({ rotulo, dica, ligado, aoMudar, desativado }: { rotulo: string; dica?: string; ligado: boolean; aoMudar: (v: boolean) => void; desativado?: boolean }) {
  return (
    <div className="linha-entre linha-config">
      <div className="coluna" style={{ gap: 2 }}>
        <span>{rotulo}</span>
        {dica && <span className="campo-dica">{dica}</span>}
      </div>
      <Alternador ligado={ligado} aoMudar={aoMudar} rotulo={rotulo} desativado={desativado} />
    </div>
  );
}

export function CaixaMarcar({ marcada, aoMudar, rotulo }: { marcada: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="checkbox" className="caixa-marcar" aria-checked={marcada} aria-label={rotulo} onClick={() => aoMudar(!marcada)}>
      {marcada && <Check size={12} strokeWidth={2.5} />}
    </button>
  );
}

interface PropsCartao {
  titulo?: ReactNode;
  icone?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
  estilo?: React.CSSProperties;
}

export function Cartao({ titulo, icone, acoes, children, className = "", estilo }: PropsCartao) {
  return (
    <section className={`cartao ${className}`} style={estilo}>
      {(titulo || acoes) && (
        <header className="cartao-cabecalho">
          {titulo && (
            <h3 className="cartao-titulo">
              {icone}
              <span className="cortar">{titulo}</span>
            </h3>
          )}
          {acoes && <div className="cartao-acoes">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pilulas<V extends string>({ opcoes, valor, aoMudar, rotulo }: { opcoes: { valor: V; rotulo: string }[]; valor: V; aoMudar: (v: V) => void; rotulo: string }) {
  return (
    <div className="pilulas" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" className="pilula" aria-pressed={valor === o.valor} onClick={() => aoMudar(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Segmentado<V extends string>({ opcoes, valor, aoMudar, rotulo }: { opcoes: { valor: V; rotulo: string; icone?: ReactNode }[]; valor: V; aoMudar: (v: V, origem: HTMLButtonElement) => void; rotulo: string }) {
  return (
    <div className="segmentado" role="tablist" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="tab" aria-selected={valor === o.valor} onClick={(evento) => aoMudar(o.valor, evento.currentTarget)}>
          {o.icone}
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Progresso({ valor, nivel, rotulo }: { valor: number; nivel?: "alerta" | "erro" | "sucesso"; rotulo?: string }) {
  const p = Math.max(0, Math.min(1, valor));
  return (
    <div className="progresso" data-nivel={nivel} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={rotulo}>
      <span style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export function Vazio({ icone, titulo, texto, acao }: { icone?: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      {icone}
      <span className="vazio-titulo">{titulo}</span>
      {texto && <span>{texto}</span>}
      {acao}
    </div>
  );
}

export function AvisoFaixa({ tipo = "info", children }: { tipo?: "info" | "alerta" | "erro"; children: ReactNode }) {
  const Icone = tipo === "info" ? Info : TriangleAlert;
  return (
    <div className={`aviso-faixa ${tipo !== "info" ? `aviso-faixa-${tipo}` : ""}`} role={tipo === "erro" ? "alert" : "note"}>
      <Icone size={14} />
      <div>{children}</div>
    </div>
  );
}

interface PropsModal {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  largo?: boolean;
}

export function Modal({ aberto, titulo, aoFechar, children, largo }: PropsModal) {
  const caixa = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<Element | null>(null);

  useEffect(() => {
    if (!aberto) return;
    focoAnterior.current = document.activeElement;
    const t = window.setTimeout(() => {
      const alvo = caixa.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.modal-fechar)");
      alvo?.focus();
    }, 30);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar();
      }
      if (e.key === "Tab" && caixa.current) {
        const focaveis = Array.from(caixa.current.querySelectorAll<HTMLElement>("button, input, textarea, select, [tabindex='0']")).filter((el) => !el.hasAttribute("disabled"));
        if (focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", aoTeclar, true);
      if (focoAnterior.current instanceof HTMLElement) focoAnterior.current.focus();
    };
  }, [aberto, aoFechar]);

  const destino = document.getElementById("camada-sistema") ?? document.body;

  return createPortal(
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="fundo-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) aoFechar();
          }}
        >
          <motion.div
            ref={caixa}
            className={`modal ${largo ? "modal-largo" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.3, 0.9, 0.3, 1] }}
          >
            <div className="modal-cabecalho">
              <h2 className="modal-titulo">{titulo}</h2>
              <Botao variante="fantasma" pequeno soIcone className="empurrar modal-fechar" icone={<X size={16} />} aria-label={T.geral.fechar} onClick={aoFechar} />
            </div>
            <div className="modal-corpo">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    destino,
  );
}

export function ConfirmarModal({
  aberto,
  titulo,
  texto,
  rotuloConfirmar = T.geral.excluir,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  texto: string;
  rotuloConfirmar?: string;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={aoFechar}>
      <p className="texto-2">{texto}</p>
      <div className="formulario-acoes">
        <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
        <Botao
          variante="perigo"
          onClick={() => {
            aoConfirmar();
            aoFechar();
          }}
        >
          {rotuloConfirmar}
        </Botao>
      </div>
    </Modal>
  );
}

export function AvisosRodape() {
  const avisos = useInterface((s) => s.avisos);
  const dispensar = useInterface((s) => s.dispensarAviso);
  return (
    <div className="avisos-rodape" aria-live="polite">
      <AnimatePresence>
        {avisos.map((a) => (
          <motion.div
            key={a.id}
            className="aviso-rodape"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.2 }}
          >
            <span>{a.texto}</span>
            {a.desfazer && (
              <Botao
                variante="fantasma"
                pequeno
                onClick={() => {
                  a.desfazer?.();
                  dispensar(a.id);
                }}
              >
                {T.geral.desfazer}
              </Botao>
            )}
            <Botao variante="fantasma" pequeno soIcone icone={<X size={14} />} aria-label={T.geral.fechar} onClick={() => dispensar(a.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="tecla">{children}</kbd>;
}
