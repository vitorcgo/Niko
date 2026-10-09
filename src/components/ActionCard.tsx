import { useEffect } from "react";
import { motion } from "motion/react";
import { Check, ShieldCheck, X } from "lucide-react";
import type { CardConfirmation, Message } from "../types";
import { missingCategory, linesConfirmation, typeCategoryCard } from "../utils/commands";
import { changeDataCard, decideCard } from "../state/chatting";
import { useConfig } from "../state/settings";
import { useFinances } from "../state/finances";
import { T } from "../i18n/ptBR";
import { CategoryPicker } from "./CategoryPicker";

function typingAtField(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
}

function Card({ cartao: card, aoDecidir: onDecide, aoSempre: onSempre, aoMudarDados: onChangeData, compacto: compact, atalhos: shortcuts, agenteNome: agentName }: { cartao: CardConfirmation; aoDecidir: (accept: boolean) => void; aoSempre: () => void; aoMudarDados: (payload: CardConfirmation["dados"]) => void; compacto?: boolean; atalhos: boolean; agenteNome: string }) {
  const pending = card.situacao === "pendente";
  useFinances((s) => s.categorias);
  const typeCategory = typeCategoryCard(card);
  const withoutCategory = missingCategory(card);
  const lines = linesConfirmation(card).filter(([k]) => !(pending && typeCategory && k === T.chat.rotulos.categoria));

  useEffect(() => {
    if (!pending || !shortcuts) return;
    const onPress = (e: KeyboardEvent) => {
      if (typingAtField(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "y" || e.key === "Y" || e.key === "s" || e.key === "S") onDecide(true);
      if (e.key === "n" || e.key === "N") onDecide(false);
    };
    window.addEventListener("keydown", onPress);
    return () => window.removeEventListener("keydown", onPress);
  }, [pending, shortcuts, onDecide]);

  return (
    <motion.div
      className={`chat-confirmacao cartao-permissao${compact ? " chat-confirmacao-compacta" : ""}`}
      data-situacao={card.situacao}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", visualDuration: 0.3, bounce: 0.3 }}
    >
      <span className="permissao-lavagem" aria-hidden="true" />
      <div className="permissao-quem">
        <span className="permissao-ponto" />
        <b>{agentName}</b>
        <span>{pending ? T.chat.permissao.precisa : card.situacao === "confirmado" ? T.chat.confirmado : T.chat.cancelado}</span>
      </div>
      <code className="permissao-codigo">{T.chat.permissao.acoes[card.tipo]} · {lines[0]?.[1] ?? ""}</code>
      {lines.length > 1 && (
        <dl>
          {lines.slice(1).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="privado">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {pending && typeCategory && (
        <div className="permissao-categoria" data-falta={withoutCategory || undefined}>
          {withoutCategory ? T.financas.categoriaObrigatoria : T.chat.rotulos.categoria}
          <CategoryPicker
            tipo={typeCategory}
            categoriaId={String(card.dados.categoriaId ?? "")}
            novaCategoria={String(card.dados.novaCategoria ?? "")}
            invalido={withoutCategory}
            aoMudar={(categoryId, newCategory) => onChangeData({ categoriaId: categoryId, novaCategoria: newCategory })}
          />
        </div>
      )}
      {pending && (
        <div className="permissao-botoes">
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => onDecide(false)}>
            <X size={13} />
            {T.chat.permissao.recusar}
            {shortcuts && <kbd>N</kbd>}
          </button>
          <button type="button" className="botao botao-primario botao-pequeno" disabled={withoutCategory} title={withoutCategory ? T.financas.categoriaObrigatoria : undefined} onClick={() => onDecide(true)}>
            <Check size={13} />
            {T.chat.permissao.permitir}
            {shortcuts && <kbd>Y</kbd>}
          </button>
          <button type="button" className="botao botao-fantasma botao-pequeno" title={withoutCategory ? T.financas.categoriaObrigatoria : T.chat.permissao.sempreDica} disabled={withoutCategory} onClick={onSempre}>
            <ShieldCheck size={13} />
            {T.chat.permissao.sempre}
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function CardsMessage({ conversaId: conversationId, mensagem: message, compacto: compact, atalhos: shortcuts = false }: { conversaId: string; mensagem: Message; compacto?: boolean; atalhos?: boolean }) {
  const nameValue = useConfig((s) => s.agentes.nomes[message.agenteId]);
  const always = (card: CardConfirmation, index: number | null) => {
    const ai = useConfig.getState().ia;
    if (!ai.autoAprovar.includes(card.tipo)) useConfig.getState().set({ ia: { ...ai, autoAprovar: [...ai.autoAprovar, card.tipo] } });
    decideCard(conversationId, message, index, true);
  };
  const firstPending = message.confirmacao?.situacao === "pendente" ? -1 : message.confirmacoes?.findIndex((c) => c.situacao === "pendente") ?? -2;
  return (
    <>
      {message.confirmacao && <Card cartao={message.confirmacao} agenteNome={nameValue} compacto={compact} atalhos={shortcuts && firstPending === -1} aoSempre={() => always(message.confirmacao!, null)} aoDecidir={(a) => decideCard(conversationId, message, null, a)} aoMudarDados={(d) => changeDataCard(conversationId, message, null, d)} />}
      {message.confirmacoes?.map((c, i) => (
        <Card key={i} cartao={c} agenteNome={nameValue} compacto={compact} atalhos={shortcuts && firstPending === i} aoSempre={() => always(c, i)} aoDecidir={(a) => decideCard(conversationId, message, i, a)} aoMudarDados={(d) => changeDataCard(conversationId, message, i, d)} />
      ))}
    </>
  );
}
