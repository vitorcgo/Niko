import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Plus, Send, Square } from "lucide-react";
import { useCommunication } from "../../state/communication";
import { useConfig } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { useChatting, sendToTeam, stopResponse } from "../../state/chatting";
import { Character } from "../../characters/Character";
import { RichText } from "../../components/RichText";
import { CardsMessage } from "../../components/ActionCard";
import { AgentPicker } from "../../components/AgentPicker";
import { AttachmentsMessage, ChipsAttachments, ZoneRelease, useAttachments, useDragFiles } from "../../components/ChatAttachments";
import { T } from "../../i18n/ptBR";

let conversationQuickId: string | null = null;

export function ChatView() {
  const conversations = useCommunication((s) => s.conversas);
  const create = useCommunication((s) => s.createConversation);
  const names = useConfig((s) => s.agentes.nomes);
  const navigateTo = useInterface((s) => s.navigateTo);
  const phase = useChatting((s) => s.fase);
  const fromChat = useChatting((s) => s.conversaId);
  const partial = useChatting((s) => s.parcial);
  const agent = useChatting((s) => s.agente);
  const [id, setId] = useState<string | null>(() => (conversationQuickId && conversations.some((c) => c.id === conversationQuickId) ? conversationQuickId : null));
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const favorite = useConfig((s) => s.agentes.favorito);
  const [notice, setNotice] = useState("");
  const attachments = useAttachments(setNotice);
  const dragging = useDragFiles(root, attachments.adicionar);
  const field = useRef<HTMLInputElement>(null);
  const conversation = conversations.find((c) => c.id === id);
  const messages = conversation?.mensagens.slice(-12) ?? [];
  const onAlive = phase !== null && fromChat === id;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, partial.length, phase]);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const send = () => {
    const clean = text.trim();
    if ((!clean && attachments.lista.length === 0) || phase || attachments.carregando) return;
    const ready = attachments.prontos();
    let target = conversation?.id;
    if (!target) {
      target = create("organizador").id;
      conversationQuickId = target;
      setId(target);
    }
    setText("");
    setNotice("");
    attachments.limpar();
    void sendToTeam(target, clean, ready);
  };

  return (
    <div className="ilha-chat" ref={root}>
      <ZoneRelease ativo={dragging} agente={favorite} compacta />
      <div className="ilha-chat-lista">
        {messages.length === 0 && !onAlive ? (
          <div className="ilha-chat-vazio">
            <span className="ilha-sub">{T.ilha.chatRapido.vazio}</span>
            <div className="ilha-chat-exemplos">
              {T.ilha.chatRapido.exemplos.map((e) => (
                <button key={e} type="button" className="ilha-pilula" onClick={() => { setText(e); field.current?.focus(); }}>{e}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.autor === "usuario" ? (
              <div key={m.id} className="ilha-chat-eu-grupo">
                <AttachmentsMessage anexos={m.anexos} />
                <div className="ilha-chat-eu">{m.texto}</div>
              </div>
            ) : (
              <div key={m.id} className="ilha-chat-agente">
                <Character agente={m.agenteId} estado="ocioso" tamanho={22} interativo={false} halo={false} olhar={false} />
                <div className="ilha-chat-bolha">
                  <span className="ilha-chat-nome">{names[m.agenteId]}</span>
                  {m.texto && <div className="ilha-chat-texto"><RichText texto={m.texto} /></div>}
                  {conversation && <CardsMessage conversaId={conversation.id} mensagem={m} compacto />}
                </div>
              </div>
            ),
          )
        )}
        {onAlive && agent && (partial && phase === "respondendo" ? (
          <div className="ilha-chat-agente">
            <Character agente={agent} estado="escrevendo" tamanho={22} interativo={false} halo={false} />
            <div className="ilha-chat-bolha">
              <span className="ilha-chat-nome">{names[agent]}</span>
              <div className="ilha-chat-texto"><RichText texto={partial} /></div>
            </div>
          </div>
        ) : (
          <AgentPicker tamanho={20} />
        ))}
        <div ref={end} />
      </div>
      {notice && <span className="ilha-erro" role="status">{notice}</span>}
      <ChipsAttachments lista={attachments.lista} agente={favorite} aoRemover={attachments.remover} />
      <div className="ilha-chat-entrada">
        <div className="ilha-campo" style={{ flex: 1 }}>
          <input
            ref={field}
            value={text}
            maxLength={2000}
            aria-label={T.ilha.chatRapido.campo}
            placeholder={T.ilha.chatRapido.campo}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
              if (e.ctrlKey && e.key === ".") stopResponse();
            }}
          />
        </div>
        {phase === "respondendo" && onAlive ? (
          <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.chat.parar} title={T.chat.parar} onClick={stopResponse}><Square size={13} /></button>
        ) : (
          <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.chat.enviar} title={T.chat.enviar} disabled={(!text.trim() && attachments.lista.length === 0) || attachments.carregando || phase !== null} onClick={send}><Send size={13} /></button>
        )}
        {conversation && (
          <>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.ilha.chatRapido.novaConversa} title={T.ilha.chatRapido.novaConversa} disabled={phase !== null} onClick={() => { conversationQuickId = null; setId(null); field.current?.focus(); }}><Plus size={13} /></button>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.ilha.chatRapido.abrirNoChat} title={T.ilha.chatRapido.abrirNoChat} onClick={() => navigateTo("chat", { conversa: conversation.id })}><ArrowUpRight size={13} /></button>
          </>
        )}
      </div>
    </div>
  );
}
