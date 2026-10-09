import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, Send, Download, Trash2, Copy, Check, BrainCircuit, FileText, SquareSlash, Terminal, Square, Settings2, Info, RotateCcw, Play, Zap, AlertTriangle, Paperclip, Lightbulb, ListChecks, ScanText, type LucideIcon } from "lucide-react";
import { RichText } from "../../components/RichText";
import { CardsMessage } from "../../components/ActionCard";
import { AgentPicker } from "../../components/AgentPicker";
import { AttachmentsMessage, ChipsAttachments, ZoneRelease, useAttachments, useDragFiles } from "../../components/ChatAttachments";
import { Character } from "../../characters/Character";
import { Button, Key } from "../../components/basics";
import { useCommunication } from "../../state/communication";
import { useAgents, AGENTS } from "../../state/agents";
import { useConfig } from "../../state/settings";
import { commandAvailable } from "../../utils/features";
import { useInterface } from "../../state/interface";
import { useChatting, sendToTeam, stopResponse, tryNew, useSuggestion } from "../../state/chatting";
import { T } from "../../i18n/ptBR";
import { formatDateString } from "../../utils/dates";
import { downloadFile, contains, normalizeText } from "../../utils/basics";
import { providersAtOrder, selectAgent, type ProviderAtUsage } from "../../utils/assistant";
import { EVENT_NEW } from "../../windows/desktop/useShortcuts";
import type { AgentId, Conversation, Message } from "../../types";
import type { ActionAttachment } from "../../utils/chatFeatures";

const ICONS_ACTION_ATTACHMENT: Record<ActionAttachment, LucideIcon> = { resumir: FileText, explicar: Lightbulb, perguntas: ListChecks, extrair: ScanText };

function groupData(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return T.chat.hoje;
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return T.chat.ontem;
  return T.chat.antes;
}

const COMMAND_SUGGESTED = /(?:^|[\s`"'(])(\/(?:tarefa|gasto|receita|lembrete|compra|dividir|pomodoro|link|lembrar)\s[^`"'\n)]{2,160})/gi;

function commandsSuggested(text: string): string[] {
  return [...new Set([...text.matchAll(COMMAND_SUGGESTED)].map((m) => m[1].trim().replace(/[.,;:]+$/, "")))].slice(0, 4);
}

function ButtonCopy({ texto: text }: { texto: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="chat-acao"
      aria-label={copied ? T.chat.copiado : T.chat.copiar}
      title={copied ? T.chat.copiado : T.chat.copiar}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          return;
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

const MessageChat = memo(function MessageChat({ conversaId: conversationId, m, nome: nameValue, cargo: role, ultima: last }: { conversaId: string; m: Message; nome: string; cargo: string; ultima: boolean }) {
  const busy = useChatting((s) => s.fase !== null);
  const suggested = m.autor === "agente" ? commandsSuggested(m.texto) : [];
  return (
    <motion.div className={`chat-mensagem chat-${m.autor}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {m.autor === "agente" && <Character agente={m.agenteId} estado="ocioso" tamanho={34} interativo={false} halo={false} olhar={false} />}
      <div className="chat-bolha">
        {m.autor === "agente" && (
          <span className="chat-autor">
            {nameValue} <span className="texto-3">{role}</span>
          </span>
        )}
        {m.texto && (
          <div className={`chat-texto privado${m.erro ? " chat-texto-erro" : ""}`}>
            {m.erro && <AlertTriangle size={14} className="chat-erro-icone" />}
            {m.autor === "agente" ? <RichText texto={m.texto} /> : m.texto}
          </div>
        )}
        {m.autor === "usuario" && <AttachmentsMessage anexos={m.anexos} />}
        {m.detalhe && (
          <details className="chat-detalhe">
            <summary>{T.chat.detalheTecnico}</summary>
            <code>{m.detalhe}</code>
          </details>
        )}
        {m.acoes && m.acoes.length > 0 && (
          <div className="chat-feitas">
            {m.acoes.map((a) => (
              <span key={a} className="etiqueta etiqueta-sucesso"><Zap size={11} />{a}</span>
            ))}
          </div>
        )}
        <CardsMessage conversaId={conversationId} mensagem={m} atalhos={last} />
        {suggested.length > 0 && (
          <div className="chat-sugeridos">
            {suggested.map((cmd) => (
              <button key={cmd} type="button" className="chat-sugerido" disabled={busy} onClick={() => void useSuggestion(conversationId, cmd)} title={T.chat.usarComando}>
                <Play size={11} />
                <code className="cortar">{cmd}</code>
              </button>
            ))}
          </div>
        )}
        {m.incompleta && <span className="etiqueta etiqueta-alerta" style={{ alignSelf: "flex-start" }}>{T.chat.incompleta}</span>}
        {m.repetir && (
          <Button pequeno icone={<RotateCcw size={13} />} disabled={busy} onClick={() => void tryNew(conversationId, m)} style={{ alignSelf: "flex-start" }}>
            {T.chat.tentarDeNovo}
          </Button>
        )}
        <div className="chat-acoes">
          <ButtonCopy texto={m.texto} />
          <span className="texto-3" style={{ fontSize: 10 }}>{formatDateString(m.criadaEm, "HH:mm")}</span>
          {m.origem && <span className="texto-3 cortar" style={{ fontSize: 10 }} title={m.origem}>{m.origem}</span>}
        </div>
      </div>
    </motion.div>
  );
});

function ResponseOnAlive({ conversaId: conversationId }: { conversaId: string }) {
  const fromChat = useChatting((s) => s.conversaId === conversationId);
  const partial = useChatting((s) => s.parcial);
  const agent = useChatting((s) => s.agente);
  const phase = useChatting((s) => s.fase);
  if (!fromChat || !agent) return null;
  if (!partial || phase !== "respondendo") return <AgentPicker />;
  return (
    <div className="chat-mensagem chat-agente">
      <Character agente={agent} estado="escrevendo" tamanho={34} interativo={false} halo={false} />
      <div className="chat-bolha">
        <div className="chat-texto"><RichText texto={partial} /></div>
      </div>
    </div>
  );
}

function ScrollToEnd({ alvo: target, conversaId: conversationId, quantidade: quantity }: { alvo: React.RefObject<HTMLDivElement | null>; conversaId?: string; quantidade: number }) {
  const partial = useChatting((s) => s.parcial.length);
  const phase = useChatting((s) => s.fase);
  useEffect(() => {
    const el = target.current;
    const box = el?.closest(".chat-mensagens");
    if (!el || !box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 220;
    if (near || partial === 0) el.scrollIntoView({ block: "end" });
  }, [target, conversationId, quantity, partial, phase]);
  return null;
}

export default function Chat() {
  const parameters = useInterface((s) => s.parametros);
  const notify = useInterface((s) => s.notify);
  const navigateTo = useInterface((s) => s.navigateTo);
  const conversations = useCommunication((s) => s.conversas);
  const create = useCommunication((s) => s.createConversation);
  const remove = useCommunication((s) => s.deleteConversation);
  const restore = useCommunication((s) => s.restoreConversation);
  const names = useConfig((s) => s.agentes.nomes);
  const roles = useConfig((s) => s.agentes.cargos);
  const ai = useConfig((s) => s.ia);
  const listen = useAgents((s) => s.listen);
  const phase = useChatting((s) => s.fase);
  const [currentId, setCurrentId] = useState<string | undefined>(parameters.conversa || conversations[0]?.id);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [historySend, setHistorySend] = useState<string[]>([]);
  const [queue, setQueue] = useState<ProviderAtUsage[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const current = conversations.find((c) => c.id === currentId);
  const provider = queue[0];
  const favorite = useConfig((s) => s.agentes.favorito);
  const primary = useRef<HTMLElement>(null);
  const selectorFile = useRef<HTMLInputElement>(null);
  const attachments = useAttachments(notify);
  const dragging = useDragFiles(primary, attachments.adicionar);
  const mascot = text.trim() ? selectAgent(text) : favorite;

  useEffect(() => {
    void providersAtOrder().then(setQueue);
  }, [ai]);

  useEffect(() => {
    if (parameters.conversa) setCurrentId(parameters.conversa);
    if (parameters.agente) {
      setCurrentId(undefined);
      setText(`@${names[parameters.agente as AgentId] ?? ""} `);
      field.current?.focus();
    }
  }, [parameters, names]);

  useEffect(() => {
    const onNew = (e: Event) => {
      if ((e as CustomEvent).detail === "chat") {
        setCurrentId(undefined);
        field.current?.focus();
      }
    };
    window.addEventListener(EVENT_NEW, onNew);
    return () => window.removeEventListener(EVENT_NEW, onNew);
  }, []);

  const typingSomething = text.length > 0;
  useEffect(() => {
    AGENTS.forEach((a) => listen(a, typingSomething));
    return () => AGENTS.forEach((a) => listen(a, false));
  }, [typingSomething, listen]);

  const [activeMention, setActiveMention] = useState(0);
  const mentions = useMemo(() => {
    const m = /(^|\s)@([\p{L}\d]*)$/u.exec(text);
    if (!m) return [];
    const target = normalizeText(m[2]);
    return AGENTS.filter((a) => normalizeText(names[a]).startsWith(target) || normalizeText(roles[a]).includes(target));
  }, [text, names, roles]);

  useEffect(() => setActiveMention(0), [mentions.length]);

  const selectMention = (a: AgentId) => {
    setText((t) => t.replace(/@([\p{L}\d]*)$/u, `@${names[a]} `));
    field.current?.focus();
  };

  const disabled = useConfig((s) => s.funcoesDesligadas);
  const suggestions = useMemo(() => {
    if (!text.startsWith("/") || text.includes(" ")) return [];
    return T.chat.ajuda.filter((c) => c.startsWith(text.split(" ")[0]) && commandAvailable(c, disabled)).slice(0, 6);
  }, [text, disabled]);

  const send = (actionAttachment?: ActionAttachment) => {
    const clean = text.trim();
    if ((!clean && attachments.lista.length === 0) || phase || attachments.carregando) return;
    const ready = attachments.prontos();
    let conversation = current;
    if (!conversation) {
      conversation = create("organizador");
      setCurrentId(conversation.id);
    }
    setHistorySend((h) => [clean, ...h].slice(0, 20));
    setText("");
    attachments.limpar();
    void sendToTeam(conversation.id, clean, ready, { acaoAnexo: actionAttachment });
  };

  const query = (request: string) => {
    if (phase) return;
    const conversation = current ?? create("organizador");
    setCurrentId(conversation.id);
    void sendToTeam(conversation.id, request);
  };

  const exportData = () => {
    if (!current) return;
    const md = [`# ${current.titulo || T.chat.novaConversa}`, "", ...current.mensagens.map((m) => `**${m.autor === "usuario" ? T.barraLateral.perfil : names[m.agenteId]}** (${formatDateString(m.criadaEm, "dd/MM HH:mm")})\n\n${m.texto}\n`)].join("\n");
    downloadFile(`conversa-${current.id.slice(0, 8)}.md`, md, "text/markdown");
  };

  const filtered = conversations.filter((c) => !search || contains(c.titulo, search) || c.mensagens.some((m) => contains(m.texto, search)));
  const groups = filtered.reduce<Record<string, Conversation[]>>((acc, c) => {
    (acc[groupData(c.atualizadaEm)] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="chat">
      <aside className="chat-historico">
        <Button variante="primario" icone={<Plus size={14} />} onClick={() => { setCurrentId(undefined); field.current?.focus(); }}>{T.chat.novaConversa}</Button>
        <label className="campo-busca" style={{ maxWidth: "none" }}>
          <Search size={14} />
          <input className="campo" value={search} maxLength={80} placeholder={T.chat.buscar} aria-label={T.chat.buscar} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="chat-historico-lista">
          {filtered.length === 0 ? (
            <span className="texto-3" style={{ fontSize: 12, padding: 8 }}>{T.chat.semConversas}</span>
          ) : (
            [T.chat.hoje, T.chat.ontem, T.chat.antes].filter((g) => groups[g]).map((g) => (
              <div key={g} className="coluna" style={{ gap: 2 }}>
                <span className="rotulo-secao" style={{ padding: "12px 8px 4px" }}>{g}</span>
                {groups[g].map((c) => (
                  <button key={c.id} type="button" className="lista-lateral-item" aria-current={c.id === currentId} onClick={() => setCurrentId(c.id)}>
                    <span className="cortar">{c.titulo || T.chat.novaConversa}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
      <section className="chat-principal" ref={primary}>
        <ZoneRelease ativo={dragging} agente={mascot} />
        <header className="chat-topo">
          <div className="chat-time">
            {AGENTS.map((a) => <Character key={a} agente={a} tamanho={30} halo={false} rotulo={names[a]} />)}
          </div>
          <div className="chat-topo-titulo">
            <b className="cortar">{current?.titulo || T.chat.tituloTime}</b>
            <span className="texto-3 cortar" style={{ fontSize: 11 }}>{AGENTS.map((a) => `${names[a]} (${roles[a]})`).join(", ")}</span>
          </div>
          <button type="button" className={`etiqueta chat-topo-ia ${provider ? "etiqueta-sucesso" : ""}`} onClick={() => navigateTo("ia")} title={provider ? queue.map((p) => `${p.provedor.nome} . ${p.modelo}`).join("\n") : T.chat.configurarIa}>
            {provider ? <BrainCircuit size={11} /> : <Terminal size={11} />}
            <span className="cortar">{provider ? `${provider.provedor.nome} . ${provider.modelo}` : T.chat.modoComandos}</span>
            {queue.length > 1 && <span className="chat-topo-reservas">+{queue.length - 1}</span>}
          </button>
          <span className="linha" style={{ flex: "none" }}>
            {current && <Button pequeno soIcone variante="fantasma" icone={<Download size={14} />} aria-label={T.chat.exportar} title={T.chat.exportar} onClick={exportData} />}
            {current && (
              <Button
                pequeno
                soIcone
                variante="fantasma"
                icone={<Trash2 size={14} />}
                aria-label={T.chat.excluirConversa}
                title={T.chat.excluirConversa}
                onClick={() => {
                  const r = remove(current.id);
                  setCurrentId(undefined);
                  if (r) notify(T.geral.excluido, () => { restore(r); setCurrentId(r.id); });
                }}
              />
            )}
          </span>
        </header>
        <div className="chat-mensagens">
          <div className="chat-coluna">
            {!current || current.mensagens.length === 0 ? (
              <div className="chat-boas-vindas">
                <div className="linha" style={{ gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
                  {AGENTS.map((a, i) => (
                    <motion.div key={a} className="coluna" style={{ alignItems: "center", gap: 6 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}>
                      <Character agente={a} tamanho={84} rotulo={names[a]} />
                      <b>{names[a]}</b>
                      <span className="texto-3" style={{ fontSize: 11 }}>{roles[a]}</span>
                    </motion.div>
                  ))}
                </div>
                <p className="texto-2" style={{ textAlign: "center" }}>{provider ? T.chat.boasVindasIa : T.chat.boasVindasSemIa}</p>
                {!provider && (
                  <Button pequeno icone={<Settings2 size={13} />} onClick={() => navigateTo("ia")}>{T.chat.configurarIa}</Button>
                )}
                <div className="pilulas" style={{ justifyContent: "center" }}>
                  {T.chat.exemplosNaturais.map((c) => (
                    <button key={c} type="button" className="pilula" onClick={() => { setText(c); field.current?.focus(); }}>{c}</button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {current.mensagens.map((m, i) => (
                  <MessageChat key={m.id} conversaId={current.id} m={m} nome={names[m.agenteId]} cargo={roles[m.agenteId]} ultima={i === current.mensagens.length - 1} />
                ))}
              </AnimatePresence>
            )}
            {current && <ResponseOnAlive conversaId={current.id} />}
            <div ref={end} />
            <ScrollToEnd alvo={end} conversaId={currentId} quantidade={current?.mensagens.length ?? 0} />
          </div>
        </div>
        <div className="chat-entrada">
          <div className="chat-coluna">
            {mentions.length > 0 && (
              <div className="chat-sugestoes" role="listbox" aria-label={T.chat.mencionar}>
                {mentions.map((a, i) => (
                  <button key={a} type="button" role="option" aria-selected={i === activeMention} className="paleta-item" onPointerMove={() => setActiveMention(i)} onClick={() => selectMention(a)}>
                    <Character agente={a} tamanho={26} interativo={false} halo={false} olhar={false} />
                    <b>{names[a]}</b>
                    <span className="texto-3 cortar">{roles[a]}: {T.agentes.areas[a]}</span>
                  </button>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="chat-sugestoes" role="listbox" aria-label={T.chat.comandos}>
                {suggestions.map((s) => (
                  <button key={s} type="button" role="option" aria-selected="false" className="paleta-item" onClick={() => { setText(`${s.split(" ")[0]} `); field.current?.focus(); }}>
                    <SquareSlash size={13} />
                    <code>{s.split(" ")[0]}</code>
                    <span className="texto-3 cortar">{s.split(" ").slice(1).join(" ")}</span>
                  </button>
                ))}
              </div>
            )}
            {attachments.lista.length > 0 ? (
              <div className="painel-anexos">
                <div className="painel-anexos-topo">
                  <Paperclip size={13} />
                  <span>{T.chat.anexos.painelTitulo(attachments.lista.length)}</span>
                </div>
                <ChipsAttachments lista={attachments.lista} agente={mascot} aoRemover={attachments.remover} />
                {attachments.lista.every((a) => a.tipo === "texto" || a.tipo === "imagem") && (
                  <div className="painel-anexos-acoes" role="group" aria-label={T.chat.anexos.acoesRotulo}>
                    <span className="painel-anexos-pergunta">{T.chat.anexos.oQueFazer}</span>
                    <div className="painel-anexos-botoes">
                      {(Object.keys(T.chat.anexos.acoes) as ActionAttachment[]).map((action) => {
                        const Icon = ICONS_ACTION_ATTACHMENT[action];
                        return (
                          <button
                            key={action}
                            type="button"
                            className="acao-anexo"
                            data-local={action === "extrair" || undefined}
                            disabled={phase !== null || attachments.carregando || !attachments.prontos().some((a) => a.anexo.texto?.trim() || a.imagemCompleta)}
                            onClick={() => send(action)}
                          >
                            <Icon size={15} />
                            {T.chat.anexos.acoes[action]}
                          </button>
                        );
                      })}
                    </div>
                    <span className="texto-3 painel-anexos-dica">{T.chat.anexos.ouPergunte} {T.chat.anexos.dicaAcoes}</span>
                  </div>
                )}
              </div>
            ) : (
              !current?.mensagens.length && (
                <div className="chat-recursos" aria-label={T.chat.recursos.capacidades}>
                  {([["/capacidades", T.chat.recursos.capacidades], ["/relatorio", T.chat.recursos.relatorio], ["/pomodoro status", T.chat.recursos.timer]] as const).map(([request, label]) => (
                    <Button key={request} pequeno variante="fantasma" disabled={phase !== null} onClick={() => query(request)}>{label}</Button>
                  ))}
                </div>
              )
            )}
            <div className="chat-mascote">
            <div className="chat-caixa">
              <textarea
                ref={field}
                value={text}
                rows={1}
                maxLength={4000}
                placeholder={current?.mensagens.length ? T.chat.continuar : T.chat.mensagemTime}
                aria-label={T.chat.mensagemTime}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (mentions.length > 0 && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
                    e.preventDefault();
                    if (e.key === "ArrowDown") setActiveMention((i) => (i + 1) % mentions.length);
                    else if (e.key === "ArrowUp") setActiveMention((i) => (i - 1 + mentions.length) % mentions.length);
                    else if (e.key === "Escape") setText((t) => t.replace(/@([\p{L}\d]*)$/u, ""));
                    else selectMention(mentions[activeMention] ?? mentions[0]);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                  if (e.key === "ArrowUp" && !text && historySend[0]) {
                    e.preventDefault();
                    setText(historySend[0]);
                  }
                  if (e.ctrlKey && e.key === ".") stopResponse();
                }}
              />
              <div className="linha-entre">
                <span className="texto-3 linha" style={{ fontSize: 11 }}>
                  <input
                    ref={selectorFile}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      attachments.adicionar(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <Button pequeno soIcone variante="fantasma" icone={<Paperclip size={14} />} aria-label={T.chat.anexos.anexar} title={T.chat.anexos.anexar} onClick={() => selectorFile.current?.click()} />
                  <Info size={12} />
                  <Key>/</Key>
                  {T.chat.dicaComandos}
                  <Key>@</Key>
                  {T.chat.dicaMencao}
                </span>
                {phase === "respondendo" ? (
                  <Button variante="secundario" soIcone icone={<Square size={14} />} aria-label={T.chat.parar} onClick={stopResponse} />
                ) : (
                  <Button variante="primario" soIcone icone={<Send size={15} />} aria-label={T.chat.enviar} disabled={(!text.trim() && attachments.lista.length === 0) || attachments.carregando || phase !== null} onClick={() => send()} />
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
