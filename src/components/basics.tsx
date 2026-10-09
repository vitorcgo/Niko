import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Check, X, Info, TriangleAlert } from "lucide-react";
import { T } from "../i18n/ptBR";
import { useInterface } from "../state/interface";

type VariantButton = "primario" | "secundario" | "fantasma" | "perigo" | "destaque";

interface PropsButton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VariantButton;
  pequeno?: boolean;
  icone?: ReactNode;
  soIcone?: boolean;
}

export function Button({ variante: variant = "secundario", pequeno: small, icone: icon, soIcone: onlyIcon, className = "", children, type = "button", ...rest }: PropsButton) {
  const classes = ["botao", `botao-${variant}`, small ? "botao-pequeno" : "", onlyIcon ? "botao-icone" : "", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {!onlyIcon && children}
    </button>
  );
}

interface PropsField {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  obrigatorio?: boolean;
  id: string;
  children: ReactNode;
}

export function Field({ rotulo: label, erro: error, dica: hint, obrigatorio: required, id, children }: PropsField) {
  return (
    <div className="campo-grupo">
      <label className="campo-rotulo" htmlFor={id}>
        {label}
        {required && <span className="obrigatorio" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <span className="campo-erro" id={`${id}-erro`} role="alert">
          <AlertCircle size={12} />
          {error}
        </span>
      ) : hint ? (
        <span className="campo-dica" id={`${id}-dica`}>{hint}</span>
      ) : null}
    </div>
  );
}

export function Toggle({ ligado: enabled, aoMudar: onChange, rotulo: label, desativado: disabled }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string; desativado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      className="alternador"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
    />
  );
}

export function LineToggle({ rotulo: label, dica: hint, ligado: enabled, aoMudar: onChange, desativado: disabled }: { rotulo: string; dica?: string; ligado: boolean; aoMudar: (v: boolean) => void; desativado?: boolean }) {
  return (
    <div className="linha-entre linha-config">
      <div className="coluna" style={{ gap: 2 }}>
        <span>{label}</span>
        {hint && <span className="campo-dica">{hint}</span>}
      </div>
      <Toggle ligado={enabled} aoMudar={onChange} rotulo={label} desativado={disabled} />
    </div>
  );
}

export function BoxMark({ marcada: marked, aoMudar: onChange, rotulo: label }: { marcada: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="checkbox" className="caixa-marcar" aria-checked={marked} aria-label={label} onClick={() => onChange(!marked)}>
      {marked && <Check size={12} strokeWidth={2.5} />}
    </button>
  );
}

interface PropsCard {
  titulo?: ReactNode;
  icone?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
  estilo?: React.CSSProperties;
}

export function Card({ titulo: title, icone: icon, acoes: actions, children, className = "", estilo: style }: PropsCard) {
  return (
    <section className={`cartao ${className}`} style={style}>
      {(title || actions) && (
        <header className="cartao-cabecalho">
          {title && (
            <h3 className="cartao-titulo">
              {icon}
              <span className="cortar">{title}</span>
            </h3>
          )}
          {actions && <div className="cartao-acoes">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pills<V extends string>({ opcoes: options, valor: value, aoMudar: onChange, rotulo: label }: { opcoes: { valor: V; rotulo: string }[]; valor: V; aoMudar: (v: V) => void; rotulo: string }) {
  return (
    <div className="pilulas" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.valor} type="button" className="pilula" aria-pressed={value === o.valor} onClick={() => onChange(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Segmented<V extends string>({ opcoes: options, valor: value, aoMudar: onChange, rotulo: label }: { opcoes: { valor: V; rotulo: string; icone?: ReactNode }[]; valor: V; aoMudar: (v: V) => void; rotulo: string }) {
  return (
    <div className="segmentado" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.valor} type="button" role="tab" aria-selected={value === o.valor} onClick={() => onChange(o.valor)}>
          {o.icone}
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Progress({ valor: value, nivel: level, rotulo: label }: { valor: number; nivel?: "alerta" | "erro" | "sucesso"; rotulo?: string }) {
  const p = Math.max(0, Math.min(1, value));
  return (
    <div className="progresso" data-nivel={level} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={label}>
      <span style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export function Empty({ icone: icon, titulo: title, texto: text, acao: action }: { icone?: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      {icon}
      <span className="vazio-titulo">{title}</span>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}

export function NoticeBanner({ tipo: type = "info", children }: { tipo?: "info" | "alerta" | "erro"; children: ReactNode }) {
  const Icon = type === "info" ? Info : TriangleAlert;
  return (
    <div className={`aviso-faixa ${type !== "info" ? `aviso-faixa-${type}` : ""}`} role={type === "erro" ? "alert" : "note"}>
      <Icon size={14} />
      <div>{children}</div>
    </div>
  );
}

interface ModalProps {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  largo?: boolean;
}

export function Modal({ aberto: isOpen, titulo: title, aoFechar: onClose, children, largo: wide }: ModalProps) {
  const box = useRef<HTMLDivElement>(null);
  const focusPrevious = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    focusPrevious.current = document.activeElement;
    const t = window.setTimeout(() => {
      const target = box.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.modal-fechar)");
      target?.focus();
    }, 30);
    const onPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && box.current) {
        const focusable = Array.from(box.current.querySelectorAll<HTMLElement>("button, input, textarea, select, [tabindex='0']")).filter((el) => !el.hasAttribute("disabled"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onPress, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onPress, true);
      if (focusPrevious.current instanceof HTMLElement) focusPrevious.current.focus();
    };
  }, [isOpen, onClose]);

  const destination = document.getElementById("camada-sistema") ?? document.body;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fundo-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={box}
            className={`modal ${wide ? "modal-largo" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.3, 0.9, 0.3, 1] }}
          >
            <div className="modal-cabecalho">
              <h2 className="modal-titulo">{title}</h2>
              <Button variante="fantasma" pequeno soIcone className="empurrar modal-fechar" icone={<X size={16} />} aria-label={T.geral.fechar} onClick={onClose} />
            </div>
            <div className="modal-corpo">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    destination,
  );
}

export function ConfirmModal({
  aberto: isOpen,
  titulo: title,
  texto: text,
  rotuloConfirmar: labelConfirm = T.geral.excluir,
  aoConfirmar: onConfirm,
  aoFechar: onClose,
}: {
  aberto: boolean;
  titulo: string;
  texto: string;
  rotuloConfirmar?: string;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  return (
    <Modal aberto={isOpen} titulo={title} aoFechar={onClose}>
      <p className="texto-2">{text}</p>
      <div className="formulario-acoes">
        <Button onClick={onClose}>{T.geral.cancelar}</Button>
        <Button
          variante="perigo"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {labelConfirm}
        </Button>
      </div>
    </Modal>
  );
}

export function NoticesFooter() {
  const notices = useInterface((s) => s.avisos);
  const dismiss = useInterface((s) => s.dismissNotice);
  return (
    <div className="avisos-rodape" aria-live="polite">
      <AnimatePresence>
        {notices.map((a) => (
          <motion.div
            key={a.id}
            className="aviso-rodape"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.2 }}
          >
            <span>{a.texto}</span>
            {a.undo && (
              <Button
                variante="fantasma"
                pequeno
                onClick={() => {
                  a.undo?.();
                  dismiss(a.id);
                }}
              >
                {T.geral.desfazer}
              </Button>
            )}
            <Button variante="fantasma" pequeno soIcone icone={<X size={14} />} aria-label={T.geral.fechar} onClick={() => dismiss(a.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="tecla">{children}</kbd>;
}
