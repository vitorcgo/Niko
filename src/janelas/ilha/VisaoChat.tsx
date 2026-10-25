import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Plus, Send, Square } from "lucide-react";
import { useComunicacao } from "../../estado/comunicacao";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { useConversando, enviarAoTime, pararResposta } from "../../estado/conversando";
import { Personagem } from "../../personagens/Personagem";
import { TextoRico } from "../../componentes/TextoRico";
import { CartoesDaMensagem } from "../../componentes/CartaoAcao";
import { EscolhaDoAgente } from "../../componentes/EscolhaDoAgente";
import { AnexosDaMensagem, ChipsAnexos, ZonaDeSoltar, useAnexos, useArrastarArquivos } from "../../componentes/AnexosChat";
import { arquivosColados } from "../../utilitarios/anexos";
import { T } from "../../textos/textos";
import { useArquivosSoltos } from "../../estado/arquivosSoltos";
import { IaConectada } from "./IaConectada";

let conversaRapidaId: string | null = null;

export function VisaoChat() {
  const conversas = useComunicacao((s) => s.conversas);
  const criar = useComunicacao((s) => s.criarConversa);
  const nomes = useConfig((s) => s.agentes.nomes);
  const irPara = useInterface((s) => s.irPara);
  const fase = useConversando((s) => s.fase);
  const doChat = useConversando((s) => s.conversaId);
  const parcial = useConversando((s) => s.parcial);
  const agente = useConversando((s) => s.agente);
  const [id, setId] = useState<string | null>(() => (conversaRapidaId && conversas.some((c) => c.id === conversaRapidaId) ? conversaRapidaId : null));
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const favorito = useConfig((s) => s.agentes.favorito);
  const [aviso, setAviso] = useState("");
  const anexos = useAnexos(setAviso);
  const arrastando = useArrastarArquivos(raiz, anexos.adicionar);
  const soltosParaOChat = useArquivosSoltos((s) => s.paraOChat.length);
  useEffect(() => {
    if (soltosParaOChat > 0) anexos.adicionar(useArquivosSoltos.getState().retirarDoChat());
  }, [soltosParaOChat, anexos.adicionar]);
  const campo = useRef<HTMLInputElement>(null);
  const conversa = conversas.find((c) => c.id === id);
  const mensagens = conversa?.mensagens.slice(-12) ?? [];
  const aoVivo = fase !== null && doChat === id;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, parcial.length, fase]);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const enviar = () => {
    const limpo = texto.trim();
    if ((!limpo && anexos.lista.length === 0) || fase || anexos.carregando) return;
    const prontos = anexos.prontos();
    let alvo = conversa?.id;
    if (!alvo) {
      alvo = criar("organizador").id;
      conversaRapidaId = alvo;
      setId(alvo);
    }
    setTexto("");
    setAviso("");
    anexos.limpar();
    void enviarAoTime(alvo, limpo, prontos);
  };

  return (
    <div className="ilha-chat" ref={raiz}>
      <ZonaDeSoltar ativo={arrastando} agente={favorito} compacta />
      <div className="ilha-chat-lista">
        {mensagens.length === 0 && !aoVivo ? (
          <div className="ilha-chat-vazio">
            <span className="ilha-sub">{T.ilha.chatRapido.vazio}</span>
            <div className="ilha-chat-exemplos">
              {T.ilha.chatRapido.exemplos.map((e) => (
                <button key={e} type="button" className="ilha-pilula" onClick={() => { setTexto(e); campo.current?.focus(); }}>{e}</button>
              ))}
            </div>
          </div>
        ) : (
          mensagens.map((m) =>
            m.autor === "usuario" ? (
              <div key={m.id} className="ilha-chat-eu-grupo">
                <AnexosDaMensagem anexos={m.anexos} />
                <div className="ilha-chat-eu">{m.texto}</div>
              </div>
            ) : (
              <div key={m.id} className="ilha-chat-agente">
                <Personagem agente={m.agenteId} estado="ocioso" tamanho={22} interativo={false} halo={false} olhar={false} />
                <div className="ilha-chat-bolha">
                  <span className="ilha-chat-nome">{nomes[m.agenteId]}</span>
                  {m.texto && <div className="ilha-chat-texto"><TextoRico texto={m.texto} /></div>}
                  {conversa && <CartoesDaMensagem conversaId={conversa.id} mensagem={m} compacto />}
                </div>
              </div>
            ),
          )
        )}
        {aoVivo && agente && (parcial && fase === "respondendo" ? (
          <div className="ilha-chat-agente">
            <Personagem agente={agente} estado="escrevendo" tamanho={22} interativo={false} halo={false} />
            <div className="ilha-chat-bolha">
              <span className="ilha-chat-nome">{nomes[agente]}</span>
              <div className="ilha-chat-texto"><TextoRico texto={parcial} /></div>
            </div>
          </div>
        ) : (
          <EscolhaDoAgente tamanho={20} />
        ))}
        <div ref={fim} />
      </div>
      {aviso && <span className="ilha-erro" role="status">{aviso}</span>}
      <ChipsAnexos lista={anexos.lista} agente={favorito} aoRemover={anexos.remover} />
      <div className="ilha-chat-entrada">
        <IaConectada />
        <div className="ilha-campo" style={{ flex: 1 }}>
          <input
            ref={campo}
            value={texto}
            maxLength={2000}
            aria-label={T.ilha.chatRapido.campo}
            placeholder={T.ilha.chatRapido.campo}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar();
              if (e.ctrlKey && e.key === ".") pararResposta();
            }}
            onPaste={(e) => {
              const colados = arquivosColados(e.clipboardData);
              if (!colados.length) return;
              e.preventDefault();
              anexos.adicionar(colados);
            }}
          />
        </div>
        {fase === "respondendo" && aoVivo ? (
          <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.chat.parar} title={T.chat.parar} onClick={pararResposta}><Square size={13} /></button>
        ) : (
          <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.chat.enviar} title={T.chat.enviar} disabled={(!texto.trim() && anexos.lista.length === 0) || anexos.carregando || fase !== null} onClick={enviar}><Send size={13} /></button>
        )}
        {conversa && (
          <>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.ilha.chatRapido.novaConversa} title={T.ilha.chatRapido.novaConversa} disabled={fase !== null} onClick={() => { conversaRapidaId = null; setId(null); campo.current?.focus(); }}><Plus size={13} /></button>
            <button type="button" className="ilha-botao ilha-botao-icone" aria-label={T.ilha.chatRapido.abrirNoChat} title={T.ilha.chatRapido.abrirNoChat} onClick={() => irPara("chat", { conversa: conversa.id })}><ArrowUpRight size={13} /></button>
          </>
        )}
      </div>
    </div>
  );
}
