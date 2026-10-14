import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, ArrowUp, Download, Trash2, Copy, Check, BrainCircuit, FileText, SquareSlash, Terminal, Square, Settings2, RotateCcw, Play, AlertTriangle, Paperclip, Lightbulb, ListChecks, ScanText, MessagesSquare, X, CircleCheck, type LucideIcon } from "lucide-react";
import { TextoRico } from "../../componentes/TextoRico";
import { CartoesDaMensagem } from "../../componentes/CartaoAcao";
import { EscolhaDoAgente } from "../../componentes/EscolhaDoAgente";
import { AnexosDaMensagem, ChipsAnexos, ZonaDeSoltar, useAnexos, useArrastarArquivos } from "../../componentes/AnexosChat";
import { Personagem } from "../../personagens/Personagem";
import { Botao } from "../../componentes/basicos";
import { Marca, type MarcaId } from "../../marcas/Marca";
import { useComunicacao } from "../../estado/comunicacao";
import { useAgentes, AGENTES } from "../../estado/agentes";
import { useConfig } from "../../estado/configuracoes";
import { comandoDisponivel } from "../../utilitarios/funcoes";
import { useInterface } from "../../estado/interface";
import { useConversando, enviarAoTime, pararResposta, tentarDeNovo, usarSugestao } from "../../estado/conversando";
import { T } from "../../textos/textos";
import { formatar } from "../../utilitarios/datas";
import { contem, normalizarTexto } from "../../utilitarios/basicos";
import { exportarArquivo } from "../../ponte/exportacao";
import { provedoresEmOrdem, escolherAgente, type ProvedorEmUso } from "../../utilitarios/assistente";
import { catalogoPelaUrl } from "../../dados/provedoresIa";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { AgenteId, Conversa, Mensagem } from "../../tipos";
import type { AcaoAnexo } from "../../utilitarios/recursosChat";

const ICONES_ACAO_ANEXO: Record<AcaoAnexo, LucideIcon> = { resumir: FileText, explicar: Lightbulb, perguntas: ListChecks, extrair: ScanText };

const MARCA_DO_CATALOGO: Partial<Record<string, MarcaId>> = {
  anthropic: "anthropic",
  nvidia: "nvidia",
  opencode: "opencode",
  qwen: "qwen",
  gemini: "gemini",
  openrouter: "openrouter",
  mistral: "mistral",
  huggingface: "huggingface",
  github: "github",
  deepseek: "deepseek",
  ollama: "ollama",
  lmstudio: "lmstudio",
};

function LogoDoProvedor({ uso }: { uso: ProvedorEmUso }) {
  const catalogo = uso.provedor.catalogo ?? catalogoPelaUrl(uso.provedor.urlBase)?.id;
  const marca = catalogo ? MARCA_DO_CATALOGO[catalogo] : undefined;
  return marca ? <Marca marca={marca} tamanho={14} /> : <BrainCircuit size={14} />;
}

function grupoDaData(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return T.chat.hoje;
  const ontem = new Date(hoje.getTime() - 86400000);
  if (d.toDateString() === ontem.toDateString()) return T.chat.ontem;
  return T.chat.antes;
}

function horaDaConversa(iso: string): string {
  return new Date(iso).toDateString() === new Date().toDateString() ? formatar(iso, "HH:mm") : formatar(iso, "dd/MM");
}

const COMANDO_SUGERIDO = /(?:^|[\s`"'(])(\/(?:tarefa|gasto|receita|lembrete|compra|dividir|pomodoro|link|lembrar)\s[^`"'\n)]{2,160})/gi;

function comandosSugeridos(texto: string): string[] {
  return [...new Set([...texto.matchAll(COMANDO_SUGERIDO)].map((m) => m[1].trim().replace(/[.,;:]+$/, "")))].slice(0, 4);
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="chat-msg-acao"
      aria-label={copiado ? T.chat.copiado : T.chat.copiar}
      title={copiado ? T.chat.copiado : T.chat.copiar}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1400);
        } catch {
          return;
        }
      }}
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

const MensagemChat = memo(function MensagemChat({ conversaId, m, nome, cargo, ultima, dia }: { conversaId: string; m: Mensagem; nome: string; cargo: string; ultima: boolean; dia?: string }) {
  const ocupado = useConversando((s) => s.fase !== null);
  const doAgente = m.autor === "agente";
  const sugeridos = doAgente ? comandosSugeridos(m.texto) : [];
  const hora = formatar(m.criadaEm, "HH:mm");
  return (
    <motion.div className="chat-msg-bloco" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {dia && <div className="chat-dia"><span>{dia}</span></div>}
      <div className={`chat-msg chat-msg-${m.autor}`} data-agente={m.agenteId}>
        {doAgente && (
          <span className="chat-msg-avatar">
            <Personagem agente={m.agenteId} estado="ocioso" tamanho={46} interativo={false} halo={false} olhar={false} />
          </span>
        )}
        <div className="chat-msg-corpo">
          {doAgente && (
            <div className="chat-msg-cabeca">
              <b>{nome}</b>
              <span className="chat-msg-cargo">{cargo}</span>
              <span className="chat-msg-hora">{hora}</span>
            </div>
          )}
          {!doAgente && <AnexosDaMensagem anexos={m.anexos} />}
          {m.texto && (
            <div className={`chat-msg-texto privado${m.erro ? " chat-msg-erro" : ""}`}>
              {m.erro && <AlertTriangle size={14} className="chat-msg-erro-icone" />}
              {doAgente ? <TextoRico texto={m.texto} /> : m.texto}
            </div>
          )}
          {m.detalhe && (
            <details className="chat-msg-detalhe">
              <summary>{T.chat.detalheTecnico}</summary>
              <code>{m.detalhe}</code>
            </details>
          )}
          {m.acoes && m.acoes.length > 0 && (
            <ul className="chat-feitos">
              {m.acoes.map((a) => (
                <li key={a}>
                  <CircleCheck size={15} />
                  <span className="chat-feitos-texto">{a}</span>
                  <span className="etiqueta etiqueta-sucesso">{T.chat.acoesFeitas}</span>
                </li>
              ))}
            </ul>
          )}
          <CartoesDaMensagem conversaId={conversaId} mensagem={m} atalhos={ultima} />
          {sugeridos.length > 0 && (
            <div className="chat-sugeridos-nova">
              {sugeridos.map((cmd) => (
                <button key={cmd} type="button" className="chat-sugerido-nova" disabled={ocupado} onClick={() => void usarSugestao(conversaId, cmd)} title={T.chat.usarComando}>
                  <Play size={11} />
                  <code className="cortar">{cmd}</code>
                </button>
              ))}
            </div>
          )}
          {m.incompleta && <span className="etiqueta etiqueta-alerta chat-msg-selo">{T.chat.incompleta}</span>}
          {m.repetir && (
            <Botao pequeno className="chat-msg-selo" icone={<RotateCcw size={13} />} disabled={ocupado} onClick={() => void tentarDeNovo(conversaId, m)}>
              {T.chat.tentarDeNovo}
            </Botao>
          )}
          <div className="chat-msg-acoes">
            <BotaoCopiar texto={m.texto} />
            {!doAgente && <span className="chat-msg-hora">{hora}</span>}
            {m.origem && <span className="chat-msg-origem cortar" title={m.origem}>{m.origem}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

function RespostaAoVivo({ conversaId }: { conversaId: string }) {
  const doChat = useConversando((s) => s.conversaId === conversaId);
  const parcial = useConversando((s) => s.parcial);
  const agente = useConversando((s) => s.agente);
  const fase = useConversando((s) => s.fase);
  const nomes = useConfig((s) => s.agentes.nomes);
  if (!doChat || !agente) return null;
  if (!parcial || fase !== "respondendo") return <div className="chat-msg-roleta"><EscolhaDoAgente /></div>;
  return (
    <div className="chat-msg chat-msg-agente chat-msg-viva" data-agente={agente}>
      <span className="chat-msg-avatar">
        <Personagem agente={agente} estado="escrevendo" tamanho={46} interativo={false} halo={false} />
      </span>
      <div className="chat-msg-corpo">
        <div className="chat-msg-cabeca">
          <b>{nomes[agente]}</b>
          <span className="chat-msg-cargo chat-msg-respondendo">{T.chat.estaRespondendo}</span>
        </div>
        <div className="chat-msg-texto"><TextoRico texto={parcial} /></div>
      </div>
    </div>
  );
}

function RolarParaFim({ alvo, conversaId, quantidade }: { alvo: React.RefObject<HTMLDivElement | null>; conversaId?: string; quantidade: number }) {
  const parcial = useConversando((s) => s.parcial.length);
  const fase = useConversando((s) => s.fase);
  useEffect(() => {
    const el = alvo.current;
    const caixa = el?.closest(".chat-rolagem");
    if (!el || !caixa) return;
    const perto = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 220;
    if (perto || parcial === 0) el.scrollIntoView({ block: "end" });
  }, [alvo, conversaId, quantidade, parcial, fase]);
  return null;
}

function previaDaConversa(c: Conversa, nomes: Record<AgenteId, string>): string {
  const ultima = c.mensagens[c.mensagens.length - 1];
  if (!ultima) return "";
  const texto = (ultima.texto || ultima.anexos?.map((a) => a.nome).join(", ") || "").replace(/\s+/g, " ").trim();
  return ultima.autor === "agente" ? `${nomes[ultima.agenteId]}: ${texto}` : texto;
}

function agenteDaConversa(c: Conversa): AgenteId {
  for (let i = c.mensagens.length - 1; i >= 0; i -= 1) if (c.mensagens[i].autor === "agente") return c.mensagens[i].agenteId;
  return c.agenteId;
}

export default function Chat() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const irPara = useInterface((s) => s.irPara);
  const conversas = useComunicacao((s) => s.conversas);
  const criar = useComunicacao((s) => s.criarConversa);
  const excluir = useComunicacao((s) => s.excluirConversa);
  const restaurar = useComunicacao((s) => s.restaurarConversa);
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const ia = useConfig((s) => s.ia);
  const ouvir = useAgentes((s) => s.ouvir);
  const fase = useConversando((s) => s.fase);
  const [atualId, setAtualId] = useState<string | undefined>(parametros.conversa || conversas[0]?.id);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [historicoEnvio, setHistoricoEnvio] = useState<string[]>([]);
  const [fila, setFila] = useState<ProvedorEmUso[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const atual = conversas.find((c) => c.id === atualId);
  const provedor = fila[0];
  const favorito = useConfig((s) => s.agentes.favorito);
  const principal = useRef<HTMLElement>(null);
  const seletorArquivo = useRef<HTMLInputElement>(null);
  const anexos = useAnexos(avisar);
  const arrastando = useArrastarArquivos(principal, anexos.adicionar);
  const mascote = texto.trim() ? escolherAgente(texto) : favorito;

  useEffect(() => {
    void provedoresEmOrdem().then(setFila);
  }, [ia]);

  useEffect(() => {
    if (parametros.conversa) setAtualId(parametros.conversa);
    if (parametros.agente) {
      setAtualId(undefined);
      setTexto(`@${nomes[parametros.agente as AgenteId] ?? ""} `);
      campo.current?.focus();
    }
  }, [parametros, nomes]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "chat") {
        setAtualId(undefined);
        campo.current?.focus();
      }
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  useEffect(() => {
    if (!gavetaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGavetaAberta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gavetaAberta]);

  const digitandoAlgo = texto.length > 0;
  useEffect(() => {
    AGENTES.forEach((a) => ouvir(a, digitandoAlgo));
    return () => AGENTES.forEach((a) => ouvir(a, false));
  }, [digitandoAlgo, ouvir]);

  const [ativoMencao, setAtivoMencao] = useState(0);
  const mencoes = useMemo(() => {
    const m = /(^|\s)@([\p{L}\d]*)$/u.exec(texto);
    if (!m) return [];
    const alvo = normalizarTexto(m[2]);
    return AGENTES.filter((a) => normalizarTexto(nomes[a]).startsWith(alvo) || normalizarTexto(cargos[a]).includes(alvo));
  }, [texto, nomes, cargos]);

  useEffect(() => setAtivoMencao(0), [mencoes.length]);

  const escolherMencao = (a: AgenteId) => {
    setTexto((t) => t.replace(/@([\p{L}\d]*)$/u, `@${nomes[a]} `));
    campo.current?.focus();
  };

  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const sugestoes = useMemo(() => {
    if (!texto.startsWith("/") || texto.includes(" ")) return [];
    return T.chat.ajuda.filter((c) => c.startsWith(texto.split(" ")[0]) && comandoDisponivel(c, desligadas)).slice(0, 6);
  }, [texto, desligadas]);

  const enviar = (acaoAnexo?: AcaoAnexo) => {
    const limpo = texto.trim();
    if ((!limpo && anexos.lista.length === 0) || fase || anexos.carregando) return;
    const prontos = anexos.prontos();
    let conversa = atual;
    if (!conversa) {
      conversa = criar("organizador");
      setAtualId(conversa.id);
    }
    setHistoricoEnvio((h) => [limpo, ...h].slice(0, 20));
    setTexto("");
    anexos.limpar();
    void enviarAoTime(conversa.id, limpo, prontos, { acaoAnexo });
  };

  const consultar = (pedido: string) => {
    if (fase) return;
    const conversa = atual ?? criar("organizador");
    setAtualId(conversa.id);
    void enviarAoTime(conversa.id, pedido);
  };

  const exportar = () => {
    if (!atual) return;
    const md = [`# ${atual.titulo || T.chat.novaConversa}`, "", ...atual.mensagens.map((m) => `**${m.autor === "usuario" ? T.barraLateral.perfil : nomes[m.agenteId]}** (${formatar(m.criadaEm, "dd/MM HH:mm")})\n\n${m.texto}\n`)].join("\n");
    void exportarArquivo(`conversa-${atual.id.slice(0, 8)}.md`, md, { tipo: "text/markdown" });
  };

  const novaConversa = () => {
    setAtualId(undefined);
    setGavetaAberta(false);
    campo.current?.focus();
  };

  const abrirConversa = (id: string) => {
    setAtualId(id);
    setGavetaAberta(false);
  };

  const inserirNoCampo = (simbolo: "/" | "@") => {
    if (simbolo === "/") setTexto((t) => (t.trim() ? t : "/"));
    else setTexto((t) => (!t || /\s$/.test(t) ? `${t}@` : `${t} @`));
    campo.current?.focus();
  };

  const filtradas = conversas.filter((c) => !busca || contem(c.titulo, busca) || c.mensagens.some((m) => contem(m.texto, busca)));
  const grupos = filtradas.reduce<Record<string, Conversa[]>>((acc, c) => {
    (acc[grupoDaData(c.atualizadaEm)] ??= []).push(c);
    return acc;
  }, {});

  const podeAcoesDeAnexo = anexos.lista.length > 0 && anexos.lista.every((a) => a.tipo === "texto" || a.tipo === "imagem");
  const mostrarRecursos = anexos.lista.length === 0 && !atual?.mensagens.length;
  const tituloIa = provedor ? fila.map((p) => `${p.provedor.nome} . ${p.modelo}`).join("\n") : T.chat.configurarIa;

  return (
    <div className="chat-tela" data-gaveta={gavetaAberta ? "aberta" : "fechada"}>
      {gavetaAberta && <div className="chat-gaveta-fundo" onClick={() => setGavetaAberta(false)} />}
      <aside className="chat-conversas" aria-label={T.chat.conversas}>
        <div className="chat-conversas-topo">
          <div className="chat-conversas-linha">
            <span className="chat-conversas-titulo">
              <button type="button" className="chat-fechar-gaveta" aria-label={T.chat.fecharConversas} title={T.chat.fecharConversas} onClick={() => setGavetaAberta(false)}>
                <X size={14} />
              </button>
              <h1>{T.chat.titulo}</h1>
            </span>
            <Botao variante="primario" className="chat-nova" icone={<Plus size={13} />} onClick={novaConversa}>{T.chat.novaConversa}</Botao>
          </div>
          <label className="chat-busca">
            <Search size={13} />
            <input value={busca} maxLength={80} placeholder={T.chat.buscar} aria-label={T.chat.buscar} onChange={(e) => setBusca(e.target.value)} />
          </label>
        </div>
        <div className="chat-conversas-lista">
          {filtradas.length === 0 ? (
            <span className="chat-conversas-vazio">{T.chat.semConversas}</span>
          ) : (
            [T.chat.hoje, T.chat.ontem, T.chat.antes].filter((g) => grupos[g]).map((g) => (
              <div key={g} className="chat-grupo">
                <span className="chat-grupo-rotulo">{g}</span>
                {grupos[g].map((c) => (
                  <button key={c.id} type="button" className="chat-conversa" aria-current={c.id === atualId} onClick={() => abrirConversa(c.id)}>
                    <span className="chat-conversa-avatar">
                      <Personagem agente={agenteDaConversa(c)} estado="ocioso" tamanho={34} interativo={false} halo={false} olhar={false} />
                    </span>
                    <span className="chat-conversa-texto">
                      <span className="chat-conversa-linha">
                        <span className="chat-conversa-titulo">{c.titulo || T.chat.novaConversa}</span>
                        <span className="chat-conversa-hora">{horaDaConversa(c.atualizadaEm)}</span>
                      </span>
                      <span className="chat-conversa-previa privado">{previaDaConversa(c, nomes)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
      <section className="chat-area" ref={principal}>
        <ZonaDeSoltar ativo={arrastando} agente={mascote} />
        <header className="chat-cabecalho">
          <div className="chat-cabecalho-info">
            <button type="button" className="chat-botao-conversas" onClick={() => setGavetaAberta(true)} aria-expanded={gavetaAberta}>
              <MessagesSquare size={15} />
              {T.chat.conversas}
              <span className="chat-contador">{conversas.length}</span>
            </button>
            <div className="chat-avatares">
              {AGENTES.map((a) => (
                <span key={a} className="chat-avatar">
                  <Personagem agente={a} tamanho={38} halo={false} rotulo={nomes[a]} />
                </span>
              ))}
            </div>
            <div className="chat-cabecalho-texto">
              <b className="cortar">{atual?.titulo || T.chat.tituloTime}</b>
              <span className="chat-cabecalho-sub">{T.chat.listaNomes(AGENTES.map((a) => nomes[a]))} · {T.chat.funcionaSemIa}</span>
            </div>
          </div>
          {atual && (
            <span className="chat-cabecalho-acoes">
              <Botao soIcone variante="fantasma" icone={<Download size={14} />} aria-label={T.chat.exportar} title={T.chat.exportar} onClick={exportar} />
              <Botao
                soIcone
                variante="fantasma"
                icone={<Trash2 size={14} />}
                aria-label={T.chat.excluirConversa}
                title={T.chat.excluirConversa}
                onClick={() => {
                  const r = excluir(atual.id);
                  setAtualId(undefined);
                  if (r) avisar(T.geral.excluido, () => { restaurar(r); setAtualId(r.id); });
                }}
              />
            </span>
          )}
          <div className="chat-ia" data-estado={provedor ? "conectada" : "comandos"} title={tituloIa}>
            <span className="chat-ia-logo">
              {provedor ? <LogoDoProvedor uso={provedor} /> : <Terminal size={13} />}
              <span className="chat-ia-ponto" />
            </span>
            <span className="chat-ia-texto">
              <span className="chat-ia-nome">
                <span className="cortar">{provedor ? provedor.provedor.nome : T.chat.modoComandos}</span>
                <span className="chat-ia-estado">{provedor ? T.chat.iaConectada : T.chat.semIa}</span>
              </span>
              {provedor && (
                <span className="chat-ia-modelo">
                  <span className="cortar">{provedor.modelo}</span>
                  {fila.length > 1 && <span className="chat-ia-reservas">+{fila.length - 1}</span>}
                </span>
              )}
            </span>
            <span className="chat-ia-divisor" />
            <button type="button" className="chat-ia-config" aria-label={T.chat.configurarIa} title={T.chat.configurarIa} onClick={() => irPara("ia")}>
              <Settings2 size={14} />
            </button>
          </div>
        </header>
        <div className="chat-rolagem">
          <div className="chat-fio">
            {!atual || atual.mensagens.length === 0 ? (
              <div className="chat-inicio">
                <div className="chat-inicio-time">
                  {AGENTES.map((a, i) => (
                    <motion.div key={a} className="chat-inicio-agente" data-agente={a} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}>
                      <Personagem agente={a} tamanho={84} rotulo={nomes[a]} />
                      <b>{nomes[a]}</b>
                      <span>{cargos[a]}</span>
                    </motion.div>
                  ))}
                </div>
                <p className="chat-inicio-texto">{provedor ? T.chat.boasVindasIa : T.chat.boasVindasSemIa}</p>
                {!provedor && (
                  <Botao pequeno icone={<Settings2 size={13} />} onClick={() => irPara("ia")}>{T.chat.configurarIa}</Botao>
                )}
                <div className="chat-inicio-exemplos">
                  {T.chat.exemplosNaturais.map((c) => (
                    <button key={c} type="button" className="pilula" onClick={() => { setTexto(c); campo.current?.focus(); }}>{c}</button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {atual.mensagens.map((m, i) => {
                  const diaAtual = formatar(m.criadaEm, "yyyy-MM-dd");
                  const novoDia = i === 0 || formatar(atual.mensagens[i - 1].criadaEm, "yyyy-MM-dd") !== diaAtual;
                  return (
                    <MensagemChat
                      key={m.id}
                      conversaId={atual.id}
                      m={m}
                      nome={nomes[m.agenteId]}
                      cargo={cargos[m.agenteId]}
                      ultima={i === atual.mensagens.length - 1}
                      dia={novoDia ? formatar(m.criadaEm, "EEEE, d 'de' MMMM") : undefined}
                    />
                  );
                })}
              </AnimatePresence>
            )}
            {atual && <RespostaAoVivo conversaId={atual.id} />}
            <div ref={fim} />
            <RolarParaFim alvo={fim} conversaId={atualId} quantidade={atual?.mensagens.length ?? 0} />
          </div>
        </div>
        <div className="chat-compositor">
          <div className="chat-compositor-coluna">
            {mencoes.length > 0 && (
              <div className="chat-sugestoes-nova" role="listbox" aria-label={T.chat.mencionar}>
                {mencoes.map((a, i) => (
                  <button key={a} type="button" role="option" aria-selected={i === ativoMencao} className="chat-sugestao" onPointerMove={() => setAtivoMencao(i)} onClick={() => escolherMencao(a)}>
                    <Personagem agente={a} tamanho={26} interativo={false} halo={false} olhar={false} />
                    <b>{nomes[a]}</b>
                    <span className="cortar">{cargos[a]}: {T.agentes.areas[a]}</span>
                  </button>
                ))}
              </div>
            )}
            {sugestoes.length > 0 && (
              <div className="chat-sugestoes-nova" role="listbox" aria-label={T.chat.comandos}>
                {sugestoes.map((s) => (
                  <button key={s} type="button" role="option" aria-selected="false" className="chat-sugestao" onClick={() => { setTexto(`${s.split(" ")[0]} `); campo.current?.focus(); }}>
                    <SquareSlash size={13} />
                    <code>{s.split(" ")[0]}</code>
                    <span className="cortar">{s.split(" ").slice(1).join(" ")}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="chat-caixa-nova">
              {(anexos.lista.length > 0 || mostrarRecursos) && (
                <div className="chat-caixa-topo">
                  {anexos.lista.length > 0 ? (
                    <>
                      <div className="chat-caixa-chips" role="group" aria-label={T.chat.anexos.painelTitulo(anexos.lista.length)}>
                        <ChipsAnexos lista={anexos.lista} agente={mascote} aoRemover={anexos.remover} />
                        {podeAcoesDeAnexo &&
                          (Object.keys(T.chat.anexos.acoes) as AcaoAnexo[]).map((acao) => {
                            const Icone = ICONES_ACAO_ANEXO[acao];
                            return (
                              <button
                                key={acao}
                                type="button"
                                className="chat-chip-acao"
                                data-local={acao === "extrair" || undefined}
                                title={T.chat.anexos.oQueFazer}
                                disabled={fase !== null || anexos.carregando || !anexos.prontos().some((a) => a.anexo.texto?.trim() || a.imagemCompleta)}
                                onClick={() => enviar(acao)}
                              >
                                <Icone size={12} />
                                {T.chat.anexos.acoes[acao]}
                              </button>
                            );
                          })}
                      </div>
                      {podeAcoesDeAnexo && <span className="chat-caixa-dica">{T.chat.anexos.ouPergunte} {T.chat.anexos.dicaAcoes}</span>}
                    </>
                  ) : (
                    <div className="chat-caixa-chips" aria-label={T.chat.recursos.capacidades}>
                      {([["/capacidades", T.chat.recursos.capacidades], ["/relatorio", T.chat.recursos.relatorio], ["/pomodoro status", T.chat.recursos.timer]] as const).map(([pedido, rotulo]) => (
                        <button key={pedido} type="button" className="chat-chip-acao" disabled={fase !== null} onClick={() => consultar(pedido)}>{rotulo}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <textarea
                ref={campo}
                className="chat-campo"
                value={texto}
                rows={1}
                maxLength={4000}
                placeholder={atual?.mensagens.length ? T.chat.continuar : T.chat.mensagemTime}
                aria-label={T.chat.mensagemTime}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (mencoes.length > 0 && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
                    e.preventDefault();
                    if (e.key === "ArrowDown") setAtivoMencao((i) => (i + 1) % mencoes.length);
                    else if (e.key === "ArrowUp") setAtivoMencao((i) => (i - 1 + mencoes.length) % mencoes.length);
                    else if (e.key === "Escape") setTexto((t) => t.replace(/@([\p{L}\d]*)$/u, ""));
                    else escolherMencao(mencoes[ativoMencao] ?? mencoes[0]);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                  if (e.key === "ArrowUp" && !texto && historicoEnvio[0]) {
                    e.preventDefault();
                    setTexto(historicoEnvio[0]);
                  }
                  if (e.ctrlKey && e.key === ".") pararResposta();
                }}
              />
              <div className="chat-caixa-barra">
                <input
                  ref={seletorArquivo}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    anexos.adicionar(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <button type="button" className="chat-barra-botao chat-barra-icone" aria-label={T.chat.anexos.anexar} title={T.chat.anexos.anexar} onClick={() => seletorArquivo.current?.click()}>
                  <Paperclip size={14} />
                </button>
                <button type="button" className="chat-barra-botao" title={T.chat.comandos} onClick={() => inserirNoCampo("/")}>{T.chat.botaoComandos}</button>
                <button type="button" className="chat-barra-botao" title={T.chat.mencionar} onClick={() => inserirNoCampo("@")}>{T.chat.botaoAgente}</button>
                {!provedor && (
                  <>
                    <span className="chat-barra-divisor" />
                    <span className="chat-barra-modo">
                      <Terminal size={12} />
                      {T.chat.modoComandos}
                    </span>
                  </>
                )}
                <span className="chat-barra-dica">{T.chat.dicaEnter}</span>
                {fase === "respondendo" ? (
                  <button type="button" className="chat-enviar chat-parar" aria-label={T.chat.parar} title={T.chat.parar} onClick={pararResposta}>
                    <Square size={13} />
                  </button>
                ) : (
                  <button type="button" className="chat-enviar" aria-label={T.chat.enviar} title={T.chat.enviar} disabled={(!texto.trim() && anexos.lista.length === 0) || anexos.carregando || fase !== null} onClick={() => enviar()}>
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
