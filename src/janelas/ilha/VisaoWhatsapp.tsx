import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, AtSign, BellDot, Check, CheckCheck, CircleAlert, Clock, EyeOff, Forward, MessagesSquare, Paperclip, PencilLine, RotateCw, Search, Send, Settings2, Trash2, Users, X,
  type LucideIcon,
} from "lucide-react";
import { T } from "../../textos/textos";
import { useWhatsapp } from "../../estado/whatsapp";
import { avisoLigado, useIlha } from "../../estado/ilha";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { tocarSom } from "../../ponte/sons";
import { corDoNome, numeroDoJid, whatsappPonte, type ConversaWhatsapp, type NovidadeWhatsapp } from "../../ponte/whatsapp";
import { horarioRelativo } from "../../utilitarios/datas";
import { arquivosColados, formatarTamanho } from "../../utilitarios/anexos";
import { mensagemDoWhatsapp } from "../../modulos/conexoes/ConexaoWhatsapp";
import { Avatar, MidiaDaMensagem, Previa, PreviaDoArquivo, diaDaMensagem, horaDaMensagem } from "../../modulos/whatsapp/pecasDoWhatsapp";
import { filtrarConversas, naoLidasDasConversas, type FiltroDaLista } from "../../utilitarios/conversasWhatsapp";

const W = T.whatsapp;
const NOVIDADES_MS = 4000;
const ESTADO_MS = 30_000;

function anunciar(itens: NovidadeWhatsapp[]) {
  if (itens.length === 0 || useConfig.getState().naoPerturbe || !avisoLigado("conexoes")) return;
  const ilha = useIlha.getState();
  if (ilha.estado === "expandida" && ilha.aba === "whatsapp") return;
  const nomes = [...new Set(itens.map((i) => i.nome))];
  const texto = nomes.length === 1 ? W.mensagemDe(nomes[0]) : W.mensagensDe(nomes.slice(0, 3).join(", "));
  if (ilha.revelar({ texto, tipo: "info", marca: "whatsapp", aba: "whatsapp", categoria: "conexoes" }, 4000, "normal")) void tocarSom("pop", "avisos");
}

export function usarAvisosDoWhatsapp(): boolean {
  const ligado = useWhatsapp((s) => Boolean(s.estado?.ligado));
  useEffect(() => {
    let vivo = true;
    let relogio: number | undefined;
    let seq = -1;
    let ultimaLeituraDoEstado = 0;
    const passo = async () => {
      let espera = ESTADO_MS;
      try {
        let estado = useWhatsapp.getState().estado;
        const precisaLer = !estado || Date.now() - ultimaLeituraDoEstado >= (estado.ligado && estado.vinculo !== "conectado" ? NOVIDADES_MS : ESTADO_MS);
        if (precisaLer) {
          estado = await useWhatsapp.getState().carregar();
          ultimaLeituraDoEstado = Date.now();
        }
        if (estado?.ligado && estado.vinculo === "conectado") {
          espera = NOVIDADES_MS;
          const novas = await whatsappPonte.novidades(seq < 0 ? estado.seq : seq);
          if (seq >= 0 && novas.itens.length > 0) {
            anunciar(novas.itens);
            void useWhatsapp.getState().carregar();
          }
          seq = novas.seq;
        } else if (estado?.ligado) espera = NOVIDADES_MS;
      } catch {
        espera = ESTADO_MS;
      }
      if (vivo) relogio = window.setTimeout(() => void passo(), espera);
    };
    void passo();
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
    };
  }, []);
  return ligado;
}

interface Pendente {
  chave: string;
  texto: string;
  estado: "enviando" | "falhou";
  erro?: string;
}

function assinaturaDaConversa(c: ConversaWhatsapp): string {
  return `${c.foto ?? ""}|${c.mensagens.map((m) => `${m.id}:${m.data}:${m.apagada ?? ""}:${m.editada ?? ""}:${m.entrega ?? ""}:${m.reacoes?.length ?? 0}`).join(",")}`;
}

function Conversa({ conversa, aoVoltar, aoAtualizar }: { conversa: ConversaWhatsapp; aoVoltar: () => void; aoAtualizar: (c: ConversaWhatsapp) => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const lista = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fila = useRef<Pendente[]>([]);
  const jaVistas = useRef(new Set(conversa.mensagens.map((m) => m.id)));
  const recemEnviados = useRef(new Set<string>());
  const [voando, setVoando] = useState(0);
  const processando = useRef(false);
  const montada = useRef(true);
  const atualizar = useRef(aoAtualizar);
  atualizar.current = aoAtualizar;

  useEffect(() => {
    montada.current = true;
    campo.current?.focus();
    return () => {
      montada.current = false;
    };
  }, []);

  const processarFila = async () => {
    if (processando.current) return;
    processando.current = true;
    while (fila.current.length) {
      const p = fila.current[0];
      try {
        const atualizada = await whatsappPonte.enviar(conversa.id, p.texto);
        if (atualizada && montada.current) atualizar.current(atualizada);
        recemEnviados.current.add(p.texto);
        setPendentes((l) => l.filter((x) => x.chave !== p.chave));
        void tocarSom("send", "interface");
      } catch (e) {
        setPendentes((l) => l.map((x) => (x.chave === p.chave ? { ...x, estado: "falhou", erro: mensagemDoWhatsapp(e) } : x)));
        void tocarSom("error", "avisos");
      }
      fila.current.shift();
    }
    processando.current = false;
  };

  const enfileirar = (p: Pendente) => {
    fila.current.push(p);
    void processarFila();
  };

  const escolherArquivo = (f: File | undefined) => {
    if (!f) return;
    setErro("");
    if (f.size > 16 * 1024 * 1024) {
      setErro(W.erros.arquivo_grande_demais);
      return;
    }
    setArquivo(f);
  };

  const enviarArquivo = async () => {
    if (!arquivo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const atualizada = await whatsappPonte.enviarArquivo(conversa.id, arquivo, texto.trim());
      if (atualizada) aoAtualizar(atualizada);
      setArquivo(null);
      setTexto("");
      void tocarSom("send", "interface");
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    } finally {
      setEnviando(false);
    }
  };

  const ultimaMensagem = conversa.mensagens[conversa.mensagens.length - 1]?.id;
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ultimaMensagem, pendentes.length]);

  useEffect(() => {
    for (const m of conversa.mensagens) {
      jaVistas.current.add(m.id);
      if (m.minha) recemEnviados.current.delete(m.texto);
    }
  }, [conversa.mensagens]);

  const enviar = () => {
    const limpo = texto.trim();
    if (!limpo) return;
    setErro("");
    setVoando((v) => v + 1);
    const p: Pendente = { chave: `${Date.now()}-${Math.random().toString(36).slice(2)}`, texto: limpo, estado: "enviando" };
    setPendentes((l) => [...l, p]);
    setTexto("");
    enfileirar(p);
  };

  const tentarDeNovo = (p: Pendente) => {
    const novo: Pendente = { ...p, estado: "enviando", erro: undefined };
    setPendentes((l) => l.map((x) => (x.chave === p.chave ? novo : x)));
    enfileirar(novo);
  };

  const subtitulo = conversa.grupo ? W.grupo : numeroDoJid(conversa.id);

  return (
    <div className="ilha-chat whatsapp-conversa">
      <div className="linha-entre whatsapp-topo">
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.voltar} title={W.voltar} onClick={aoVoltar}><ArrowLeft size={14} /></button>
        <Avatar nome={conversa.nome} foto={conversa.foto} tamanho={30} grupo={conversa.grupo} />
        <span className="coluna whatsapp-topo-textos">
          <span className="ilha-titulo cortar privado">{conversa.nome}</span>
          <span className="whatsapp-topo-sub cortar privado">{conversa.grupo && <Users size={10} />}{subtitulo}</span>
        </span>
        <button
          type="button"
          className="ilha-botao ilha-botao-icone"
          aria-label={W.ignorar}
          title={`${W.ignorar}. ${W.ignorarDica}`}
          onClick={() => {
            void whatsappPonte.ignorar(conversa.id, true).then((e) => useWhatsapp.getState().definir(e));
            aoVoltar();
          }}
        >
          <EyeOff size={14} />
        </button>
      </div>
      <div ref={lista} className="ilha-chat-lista whatsapp-mensagens">
        {conversa.mensagens.map((m, i) => {
          const dia = diaDaMensagem(m.data);
          const novoDia = i === 0 || diaDaMensagem(conversa.mensagens[i - 1].data) !== dia;
          return (
            <Fragment key={m.id}>
              {novoDia && <span className="whatsapp-dia">{dia}</span>}
              <div className="whatsapp-mensagem" data-minha={m.minha ? "sim" : "nao"} data-mencao={m.mencionaMe || undefined} data-nova={(!jaVistas.current.has(m.id) && !(m.minha && recemEnviados.current.has(m.texto))) || undefined}>
                {conversa.grupo && !m.minha && m.nomeRemetente && <span className="whatsapp-remetente privado" style={{ color: corDoNome(m.nomeRemetente) }}>{m.nomeRemetente}</span>}
                {m.encaminhada && <span className="whatsapp-encaminhada"><Forward size={10} /> {W.encaminhada}</span>}
                {m.midia !== "nenhuma" && <MidiaDaMensagem jid={conversa.id} m={m} />}
                {m.texto && <span className="whatsapp-texto privado">{m.texto}</span>}
                {m.apagada && <span className="whatsapp-selo" data-tipo="apagada"><Trash2 size={10} /> {m.minha ? W.pagina.voceApagou : W.pagina.apagadaAs(horaDaMensagem(m.apagada))}</span>}
                {m.editada && m.textoOriginal && <span className="whatsapp-selo privado" data-tipo="editada" title={m.textoOriginal}><PencilLine size={10} /> {W.pagina.editada}: {m.textoOriginal}</span>}
                <span className="whatsapp-hora" title={new Date(m.data).toLocaleString("pt-BR")}>
                  {horaDaMensagem(m.data)}
                  {m.minha && (m.entrega ? <CheckCheck size={12} data-lida={m.entrega === "lida" || undefined} aria-label={W.pagina.entrega[m.entrega]} /> : <Check size={11} aria-label={W.enviada} />)}
                </span>
              </div>
            </Fragment>
          );
        })}
        {pendentes.map((p) => (
          <div key={p.chave} className="whatsapp-mensagem" data-minha="sim" data-pendente={p.estado}>
            <span className="whatsapp-texto privado">{p.texto}</span>
            {p.estado === "falhou" ? (
              <span className="whatsapp-falhou" role="status">
                <CircleAlert size={11} /> {p.erro || W.naoEnviou}
                <button type="button" onClick={() => tentarDeNovo(p)}><RotateCw size={10} /> {W.tentarDeNovo}</button>
                <button type="button" aria-label={W.descartar} title={W.descartar} onClick={() => setPendentes((l) => l.filter((x) => x.chave !== p.chave))}><X size={10} /></button>
              </span>
            ) : (
              <span className="whatsapp-hora"><Clock size={11} aria-label={W.enviandoMensagem} /></span>
            )}
          </div>
        ))}
      </div>
      {erro && <span className="ilha-erro" role="status">{erro}</span>}
      {arquivo && (
        <div className="whatsapp-confirmar-arquivo" role="group">
          <PreviaDoArquivo arquivo={arquivo} tamanho={42} />
          <span className="coluna" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <span className="cortar">{W.confirmarArquivo(arquivo.name, formatarTamanho(arquivo.size))}</span>
            <span className="ilha-mini">{W.legendaDoArquivo}</span>
          </span>
          <button type="button" className="ilha-pilula" disabled={enviando} onClick={() => setArquivo(null)}>{W.cancelarArquivo}</button>
          <button type="button" className="ilha-pilula" data-forte disabled={enviando} onClick={() => void enviarArquivo()}>{W.enviarArquivo}</button>
        </div>
      )}
      <div className="ilha-chat-entrada">
        <input ref={seletor} type="file" hidden onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.anexar} title={W.anexar} disabled={enviando} onClick={() => seletor.current?.click()}><Paperclip size={13} /></button>
        <div className="ilha-campo" style={{ flex: 1 }}>
          <textarea
            ref={campo}
            className="whatsapp-resposta"
            rows={Math.min(4, texto.split("\n").length)}
            value={texto}
            maxLength={4096}
            aria-label={W.responder}
            placeholder={W.responder}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const [colado] = arquivosColados(e.clipboardData);
              if (!colado) return;
              e.preventDefault();
              escolherArquivo(colado);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                aoVoltar();
              }
            }}
          />
        </div>
        <button type="button" className="ilha-botao ilha-botao-icone whatsapp-enviar" aria-label={W.enviar} title={W.enviar} disabled={!texto.trim()} onClick={enviar}><Send key={voando} size={13} data-voou={voando > 0 || undefined} /></button>
      </div>
    </div>
  );
}

export function VisaoWhatsapp() {
  const estado = useWhatsapp((s) => s.estado);
  const carregar = useWhatsapp((s) => s.carregar);
  const irPara = useInterface((s) => s.irPara);
  const pedidoEm = useWhatsapp((s) => s.pedidoEm);
  const [aberta, setAberta] = useState<ConversaWhatsapp | null>(null);
  const abertaRef = useRef<string | null>(null);
  const aplicadaEm = useRef(0);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), 3000);
    return () => {
      window.clearInterval(relogio);
      if (abertaRef.current) void whatsappPonte.fechar().catch(() => undefined);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aberta || pedidoEm <= aplicadaEm.current) return;
    const atual = estado?.aberta?.id === aberta.id ? estado.aberta : estado?.conversas.find((c) => c.id === aberta.id);
    if (atual && assinaturaDaConversa(atual) !== assinaturaDaConversa(aberta)) setAberta(atual);
  }, [estado, pedidoEm, aberta]);

  const atualizarAberta = (c: ConversaWhatsapp) => {
    aplicadaEm.current = Date.now();
    setAberta(c);
  };

  const abrir = async (c: ConversaWhatsapp) => {
    abertaRef.current = c.id;
    setAberta(c);
    const completa = await whatsappPonte.abrir(c.id).catch(() => null);
    if (completa && abertaRef.current === c.id) atualizarAberta(completa);
    void carregar();
  };

  const voltar = () => {
    abertaRef.current = null;
    setAberta(null);
    void whatsappPonte.fechar().catch(() => undefined);
  };

  if (!estado?.ligado || estado.vinculo !== "conectado") {
    return (
      <div className="ilha-chat-vazio">
        <span className="ilha-sub">{estado?.ligado ? W.vinculos[estado.vinculo] : W.naoConectadoIlha}</span>
        <button type="button" className="ilha-pilula" onClick={() => irPara("conexoes", { servico: "whatsapp" })}><Settings2 size={12} /> {W.abrirConfiguracao}</button>
      </div>
    );
  }

  if (aberta) return <Conversa key={aberta.id} conversa={aberta} aoVoltar={voltar} aoAtualizar={atualizarAberta} />;

  return <ListaDeConversas conversas={estado.conversas} naoLidas={naoLidasDasConversas(estado.conversas)} aoAbrir={(c) => void abrir(c)} aoOpcoes={() => irPara("conexoes", { servico: "whatsapp" })} />;
}

const FILTROS: { id: FiltroDaLista; icone: LucideIcon }[] = [
  { id: "todas", icone: MessagesSquare },
  { id: "naoLidas", icone: BellDot },
  { id: "grupos", icone: Users },
];

function ListaDeConversas({ conversas, naoLidas, aoAbrir, aoOpcoes }: { conversas: ConversaWhatsapp[]; naoLidas: number; aoAbrir: (c: ConversaWhatsapp) => void; aoOpcoes: () => void }) {
  const [filtro, setFiltro] = useState<FiltroDaLista>("todas");
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => filtrarConversas(conversas, filtro, busca), [conversas, filtro, busca]);
  const contagem: Record<FiltroDaLista, ReactNode> = {
    todas: null,
    naoLidas: naoLidas > 0 ? <span className="ilha-chip-numero numero">{naoLidas}</span> : null,
    grupos: null,
  };

  return (
    <div className="whatsapp-painel">
      <div className="whatsapp-barra">
        <label className="ilha-campo whatsapp-busca">
          <Search size={13} aria-hidden="true" />
          <input value={busca} placeholder={W.buscar} aria-label={W.buscar} maxLength={60} onChange={(e) => setBusca(e.target.value)} />
          {busca && <button type="button" className="whatsapp-limpar" aria-label={T.geral.fechar} onClick={() => setBusca("")}><X size={12} /></button>}
        </label>
        <div className="ilha-chips" role="tablist" aria-label={W.aba}>
          {FILTROS.map(({ id, icone: Icone }) => (
            <button key={id} type="button" role="tab" className="ilha-chip" aria-pressed={filtro === id} aria-selected={filtro === id} onClick={() => setFiltro(id)}>
              <Icone size={12} />
              {W.filtrosDaLista[id]}
              {contagem[id]}
            </button>
          ))}
        </div>
        <button type="button" className="ilha-botao ilha-botao-icone" aria-label={W.opcoes} title={W.opcoes} onClick={aoOpcoes}><Settings2 size={13} /></button>
      </div>
      <div className="ilha-chat whatsapp-lista">
        {visiveis.length === 0 && <span className="ilha-sub whatsapp-vazio">{busca.trim() ? W.vazioDoFiltro.busca : W.vazioDoFiltro[filtro]}</span>}
        {visiveis.map((c, indice) => {
          const ultima = c.mensagens[c.mensagens.length - 1];
          const mencao = c.grupo && c.mensagens.some((m) => m.mencionaMe && !m.minha);
          return (
            <div key={c.id} className="whatsapp-item-linha" style={{ ["--ordem" as string]: Math.min(indice, 8) }}>
              <button type="button" className="whatsapp-item" data-nao-lida={c.naoLidas > 0 || undefined} onClick={() => aoAbrir(c)}>
                <Avatar nome={c.nome} foto={c.foto} tamanho={36} grupo={c.grupo} />
                <span className="whatsapp-item-textos">
                  <span className="whatsapp-item-nome cortar privado">{c.nome}</span>
                  <Previa m={ultima} />
                </span>
                <span className="whatsapp-item-lado">
                  <span className="ilha-mini numero whatsapp-item-hora">{horarioRelativo(c.ultimaAtividade)}</span>
                  <span className="linha" style={{ gap: 4 }}>
                    {mencao && <span className="whatsapp-mencao" title={W.mencao}><AtSign size={10} /></span>}
                    {c.naoLidas > 0 && <span key={c.naoLidas} className="whatsapp-nao-lidas numero">{c.naoLidas > 99 ? "99+" : c.naoLidas}</span>}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="whatsapp-item-esconder"
                aria-label={`${W.ignorar}: ${c.nome}`}
                title={`${W.ignorar}. ${W.ignorarDica}`}
                onClick={() => void whatsappPonte.ignorar(c.id, true).then((e) => useWhatsapp.getState().definir(e))}
              >
                <EyeOff size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
