import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, useAnimate, useVelocity } from "motion/react";
import { Check, FileCode2, FileSpreadsheet, FileText, Image as ImageIcon, Presentation, X } from "lucide-react";
import { Character } from "../characters/Character";
import { readAttachment, typeAttachment, formatSize, MAXIMUM_ATTACHMENTS, type AttachmentReady, type FailureAttachment } from "../utils/attachments";
import { generateId } from "../utils/basics";
import { messageRead } from "../utils/fileReader";
import { playSound } from "../bridge/sounds";
import { T } from "../i18n/ptBR";
import type { AgentId } from "../types";
import { FilePathAnimation } from "../windows/island/animations/FilePathAnimation";

export interface AttachmentAtProgress {
  id: string;
  nome: string;
  tamanho: number;
  tipo: "texto" | "imagem" | "outro";
  progresso: number;
  pronto?: AttachmentReady;
}

const DURATION_MINIMUM = 1400;

export function useAttachments(onError: (text: string) => void) {
  const [list, setList] = useState<AttachmentAtProgress[]>([]);
  const current = useRef(list);
  current.current = list;

  const add = useCallback(
    (files: File[]) => {
      const slots = MAXIMUM_ATTACHMENTS - current.current.length;
      if (files.length > slots) onError(T.chat.anexos.maximo);
      for (const file of files.slice(0, Math.max(0, slots))) {
        const id = generateId();
        const start = performance.now();
        let real = 0;
        let lastTick = 0;
        setList((l) => [...l, { id, nome: file.name, tamanho: file.size, tipo: typeAttachment(file), progresso: 0 }]);
        const animate = () => {
          const time = Math.min(1, (performance.now() - start) / DURATION_MINIMUM);
          const visible = Math.min(real, time < 0.4 ? (time / 0.4) * 0.6 : time < 0.85 ? 0.6 + ((time - 0.4) / 0.45) * 0.32 : 0.92 + ((time - 0.85) / 0.15) * 0.08);
          const tens = Math.floor(visible * 10);
          if (tens > lastTick) {
            lastTick = tens;
            void playSound("tick", "interface");
          }
          setList((l) => l.map((a) => (a.id === id && !a.pronto ? { ...a, progresso: visible } : a)));
          if (visible < 1 && current.current.some((a) => a.id === id)) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        readAttachment(file, (p) => (real = Math.min(0.999, p)))
          .then(async (ready) => {
            real = 1;
            const missing = DURATION_MINIMUM - (performance.now() - start);
            if (missing > 0) await new Promise((r) => setTimeout(r, missing));
            setList((l) => l.map((a) => (a.id === id ? { ...a, progresso: 1, pronto: ready } : a)));
            void playSound("approve", "interface");
          })
          .catch((e: Error) => {
            setList((l) => l.filter((a) => a.id !== id));
            const reason = (["grande", "tipo", "leitura"].includes(e.message) ? e.message : "leitura") as FailureAttachment;
            onError(messageRead(e, file.name) ?? T.chat.anexos[reason](file.name));
            void playSound("error", "avisos");
          });
      }
    },
    [onError],
  );

  return {
    lista: list,
    adicionar: add,
    remover: (id: string) => setList((l) => l.filter((a) => a.id !== id)),
    limpar: () => setList([]),
    carregando: list.some((a) => !a.pronto),
    prontos: () => list.flatMap((a) => (a.pronto ? [a.pronto] : [])),
  };
}

export function useDragFiles(target: React.RefObject<HTMLElement | null>, onRelease: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      counter.current += 1;
      if (counter.current === 1) {
        setDragging(true);
        void playSound("peek", "interface");
      }
    };
    const about = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const exit = (e: DragEvent) => {
      if (!hasFile(e)) return;
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setDragging(false);
    };
    const release = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      counter.current = 0;
      const files = Array.from(e.dataTransfer?.files ?? []);
      window.setTimeout(() => setDragging(false), 520);
      if (files.length) {
        void playSound("gulp", "interface");
        onRelease(files);
      }
    };
    el.addEventListener("dragenter", enter);
    el.addEventListener("dragover", about);
    el.addEventListener("dragleave", exit);
    el.addEventListener("drop", release);
    return () => {
      el.removeEventListener("dragenter", enter);
      el.removeEventListener("dragover", about);
      el.removeEventListener("dragleave", exit);
      el.removeEventListener("drop", release);
    };
  }, [target, onRelease]);
  return dragging;
}

export function ZoneRelease({ ativo: active, agente: agent, compacta: compact, texto: text = T.chat.anexos.solte, tipos: types = T.chat.anexos.tipos }: { ativo: boolean; agente: AgentId; compacta?: boolean; texto?: string; tipos?: readonly string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const xRaw = useMotionValue(0);
  const x = useSpring(xRaw, { stiffness: 260, damping: 22 });
  const speed = useVelocity(x);
  const tilt = useTransform(speed, [-1200, 0, 1200], [-12, 0, 12], { clamp: true });
  const [near, setNear] = useState(false);
  const [scope, animate] = useAnimate();
  const [swallowed, setSwallowed] = useState(false);

  useEffect(() => {
    if (!active) {
      setSwallowed(false);
      return;
    }
    const el = box.current;
    if (!el) return;
    const move = (e: DragEvent) => {
      const r = el.getBoundingClientRect();
      const middle = r.width / 2;
      const targetX = Math.max(-middle + 50, Math.min(middle - 50, e.clientX - r.left - middle));
      xRaw.set(targetX);
      const distance = Math.hypot(e.clientX - (r.left + middle + targetX), e.clientY - (r.top + r.height * 0.42));
      setNear((p) => (p ? distance < 140 : distance < 90));
    };
    const released = (eventValue: DragEvent) => {
      if (!eventValue.dataTransfer?.files.length || !box.current?.parentElement?.contains(eventValue.target as Node)) return;
      setSwallowed(true);
      if (scope.current) void animate(scope.current, { scaleY: [1, 0.86, 1.12, 0.95, 1], scaleX: [1, 1.14, 0.94, 1.03, 1] }, { duration: 0.5, ease: "easeOut" });
    };
    window.addEventListener("dragover", move);
    window.addEventListener("drop", released);
    return () => {
      window.removeEventListener("dragover", move);
      window.removeEventListener("drop", released);
    };
  }, [active, xRaw, animate, scope]);

  useEffect(() => {
    if (near && scope.current) void animate(scope.current, { y: [0, -8, 0] }, { duration: 0.28, ease: "easeOut" });
  }, [near, animate, scope]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          ref={box}
          className={`zona-soltar${compact ? " zona-soltar-compacta" : ""}`}
          data-perto={near ? "sim" : "nao"}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1, transition: { type: "spring", visualDuration: 0.3, bounce: 0.3 } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
        >
          <svg className="zona-soltar-borda" aria-hidden="true">
            <rect x="1" y="1" rx="18" ry="18" />
          </svg>
          <span className="zona-soltar-brilho" />
          <motion.div className="zona-soltar-boneco" style={{ x, rotate: tilt }}>
            <div ref={scope}>
              <Character agente={agent} estado={swallowed ? "pensando" : near ? "ouvindo" : "pensando"} tamanho={compact ? 54 : 84} interativo={false} halo={false} />
            </div>
          </motion.div>
          <div className="zona-soltar-texto" style={{ opacity: near ? 0.35 : 1 }}>
            <b>{text}</b>
            <span className="zona-soltar-tipos">
              {types.map((t) => <span key={t}>{t}</span>)}
            </span>
          </div>
          {compact && <FilePathAnimation zona={box} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type TypeVisual = "pdf" | "word" | "slides" | "planilha" | "imagem" | "texto" | "codigo";

function visualType(nameValue: string, image: boolean): TypeVisual {
  if (image) return "imagem";
  const e = nameValue.toLowerCase().split(".").pop() ?? "";
  if (e === "pdf") return "pdf";
  if (["docx", "odt", "rtf"].includes(e)) return "word";
  if (["pptx", "odp"].includes(e)) return "slides";
  if (["xlsx", "ods", "csv", "tsv"].includes(e)) return "planilha";
  if (["md", "txt", "log", "json"].includes(e)) return "texto";
  return "codigo";
}

function IconType({ tipo: type }: { tipo: TypeVisual }) {
  if (type === "imagem") return <ImageIcon size={18} />;
  if (type === "slides") return <Presentation size={18} />;
  if (type === "planilha") return <FileSpreadsheet size={18} />;
  if (type === "codigo") return <FileCode2 size={18} />;
  return <FileText size={18} />;
}

function IconAttachment({ a }: { a: AttachmentAtProgress }) {
  if (a.pronto?.anexo.imagem) return <img src={a.pronto.anexo.imagem} alt="" className="anexo-miniatura" />;
  return <IconType tipo={visualType(a.nome, a.tipo === "imagem")} />;
}

export function ChipsAttachments({ lista: list, agente: agent, aoRemover: onRemove }: { lista: AttachmentAtProgress[]; agente: AgentId; aoRemover: (id: string) => void }) {
  if (list.length === 0) return null;
  return (
    <div className="anexos-chips">
      <AnimatePresence initial={false}>
        {list.map((a) => (
          <motion.div
            key={a.id}
            layout
            className="anexo-chip"
            data-pronto={a.pronto ? "sim" : "nao"}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", visualDuration: 0.32, bounce: 0.35 } }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
          >
            <span className="anexo-icone" data-tipo={visualType(a.nome, a.tipo === "imagem")}><IconAttachment a={a} /></span>
            <span className="anexo-info">
              <span className="anexo-nome cortar">{a.nome}</span>
              {a.pronto ? (
                <span className="anexo-sub">{T.chat.anexos.tiposVisuais[visualType(a.nome, a.tipo === "imagem")]} . {formatSize(a.tamanho)}</span>
              ) : (
                <span className="anexo-barra">
                  <motion.span className="anexo-barra-cheia" style={{ width: `${Math.round(a.progresso * 100)}%` }} />
                  <span className="anexo-viajante" style={{ left: `${Math.round(a.progresso * 100)}%` }}>
                    <Character agente={agent} estado="escrevendo" tamanho={16} interativo={false} halo={false} olhar={false} />
                  </span>
                </span>
              )}
            </span>
            {a.pronto ? (
              <motion.span className="anexo-ok" initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} transition={{ duration: 0.3 }}>
                <Check size={11} strokeWidth={3} />
              </motion.span>
            ) : (
              <span className="anexo-pct">{Math.round(a.progresso * 100)}%</span>
            )}
            <button type="button" className="anexo-remover" aria-label={T.chat.anexos.remover(a.nome)} title={T.chat.anexos.remover(a.nome)} onClick={() => onRemove(a.id)}>
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function AttachmentsMessage({ anexos: attachments }: { anexos?: { nome: string; tamanho: number; imagem?: string; texto?: string }[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="anexos-mensagem">
      {attachments.map((a) => (
        <span key={a.nome} className="anexo-chip anexo-chip-enviado" title={a.nome}>
          <span className="anexo-icone" data-tipo={visualType(a.nome, Boolean(a.imagem))}>{a.imagem ? <img src={a.imagem} alt="" className="anexo-miniatura" /> : <IconType tipo={visualType(a.nome, false)} />}</span>
          <span className="anexo-info">
            <span className="anexo-nome cortar">{a.nome}</span>
            <span className="anexo-sub">{T.chat.anexos.tiposVisuais[visualType(a.nome, Boolean(a.imagem))]} . {formatSize(a.tamanho)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
