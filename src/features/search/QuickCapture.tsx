import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { useInterface } from "../../state/interface";
import { captureFree } from "../../utils/capture";
import { confirmCommand, missingCategory, typeCategoryCard } from "../../utils/commands";
import { CategoryPicker } from "../../components/CategoryPicker";
import { T } from "../../i18n/ptBR";
import { Button } from "../../components/basics";
import { formatMoney } from "../../utils/money";
import { playSound } from "../../bridge/sounds";
import type { CardConfirmation } from "../../types";

export function QuickCapture() {
  const isOpen = useInterface((s) => s.capturaAberta);
  const openValue = useInterface((s) => s.openCapture);
  const notify = useInterface((s) => s.notify);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<CardConfirmation | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setText("");
    setError("");
    setConfirmation(null);
    window.setTimeout(() => field.current?.focus(), 20);
  }, [isOpen]);

  const closeValue = () => openValue(false);

  const send = () => {
    if (!text.trim()) {
      setError(T.validacao.obrigatorio);
      return;
    }
    const r = captureFree(text);
    if (r.confirmacao) {
      setConfirmation(r.confirmacao);
      return;
    }
    if (!r.ok) {
      setError(r.resposta);
      return;
    }
    void playSound("pop");
    notify(r.resposta);
    closeValue();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="sobreposicao sobreposicao-centro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onPointerDown={(e) => e.target === e.currentTarget && closeValue()}>
          <motion.div
            className="paleta captura"
            role="dialog"
            aria-modal="true"
            aria-label={T.captura.titulo}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.2 }}
            onKeyDown={(e) => e.key === "Escape" && closeValue()}
          >
            <div className="paleta-campo">
              <Zap size={16} />
              {confirmation ? (
                <div className="linha" style={{ flex: 1, flexWrap: "wrap" }}>
                  <span className="privado"><b>{formatMoney(Number(confirmation.dados.valor))}</b></span>
                  <span className="texto-2">{String(confirmation.dados.descricao)}</span>
                  {typeCategoryCard(confirmation) && (
                    <span style={{ minWidth: 180, flex: "0 1 220px" }}>
                      <CategoryPicker
                        tipo={typeCategoryCard(confirmation)!}
                        categoriaId={String(confirmation.dados.categoriaId ?? "")}
                        novaCategoria={String(confirmation.dados.novaCategoria ?? "")}
                        invalido={missingCategory(confirmation)}
                        aoMudar={(categoryId, newCategory) => setConfirmation({ ...confirmation, dados: { ...confirmation.dados, categoriaId: categoryId, novaCategoria: newCategory } })}
                      />
                    </span>
                  )}
                  <span className="empurrar linha">
                    <Button pequeno onClick={() => setConfirmation(null)}>{T.geral.cancelar}</Button>
                    <Button
                      pequeno
                      variante="primario"
                      disabled={missingCategory(confirmation)}
                      title={missingCategory(confirmation) ? T.financas.categoriaObrigatoria : undefined}
                      autoFocus
                      onClick={() => {
                        void Promise.resolve(confirmCommand(confirmation)).then(notify);
                        void playSound("approve");
                        closeValue();
                      }}
                    >
                      {T.geral.confirmar}
                    </Button>
                  </span>
                </div>
              ) : (
                <input
                  ref={field}
                  value={text}
                  maxLength={300}
                  aria-label={T.captura.titulo}
                  aria-invalid={error ? "true" : "false"}
                  placeholder={T.captura.placeholder}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                />
              )}
            </div>
            <div className="paleta-rodape">
              {error ? (
                <span className="campo-erro"><AlertCircle size={12} />{error}</span>
              ) : (
                <span className="texto-3 linha"><CheckCircle2 size={12} />{T.captura.dica}</span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
