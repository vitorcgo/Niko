import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDown, ArrowRight, AtSign, BellDot, CalendarClock, Check, CheckCheck, CircleAlert, Clock, Copy, EyeOff, Forward, Ghost, History, LoaderCircle, MessagesSquare,
  PanelRightClose, PanelRightOpen, Paperclip, PencilLine, RotateCw, Search, Send, Settings2, Trash2, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import { T } from "../../textos/textos";
import { useWhatsapp } from "../../estado/whatsapp";
import { useInterface } from "../../estado/interface";
import { tocarSom } from "../../ponte/sons";
import { Marca } from "../../marcas/Marca";
import { Botao, ConfirmarModal, Modal } from "../../componentes/basicos";
import { ConfigWhatsapp, mensagemDoWhatsapp } from "../conexoes/ConexaoWhatsapp";
import {
  corDoNome, numeroDoJid, whatsappPonte, type AgendadaWhatsapp, type ConversaWhatsapp, type EstadoWhatsapp, type MensagemWhatsapp, type RastroWhatsapp, type ReacaoWhatsapp,
} from "../../ponte/whatsapp";
import { filtrarConversas, naoLidasDasConversas, type FiltroDaLista } from "../../utilitarios/conversasWhatsapp";
import { horarioRelativo } from "../../utilitarios/datas";
import { arquivosColados, formatarTamanho } from "../../utilitarios/anexos";
import { Avatar, MidiaDaMensagem, Previa, PreviaDoArquivo, diaDaMensagem, horaDaMensagem, rotuloDaMidia } from "./pecasDoWhatsapp";

const W = T.whatsapp;
const P = W.pagina;
const ESTADO_MS = 2500;
const AGENDADAS_MS = 30_000;
const EDITAVEL_MS = 15 * 60_000;
const APAGAVEL_MS = 48 * 3600_000;
const PERTO_DO_FIM_PX = 120;

type AbaDoPainel = "contato" | "rastros" | "agendadas";

function usarVisivel(): boolean {
  const [visivel, setVisivel] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const mudar = () => setVisivel(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", mudar);
    return () => document.removeEventListener("visibilitychange", mudar);
  }, []);
  return visivel;
}

function dataCompleta(iso: string): string {
  return format(new Date(iso), "d 'de' MMM, HH:mm", { locale: ptBR });
}

function paraCampoDeData(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

export default function Whatsapp() {
  const estado = useWhatsapp((s) => s.estado);
  const carregar = useWhatsapp((s) => s.carregar);
  const definir = useWhatsapp((s) => s.definir);
  const visivel = usarVisivel();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [abertaBase, setAbertaBase] = useState<ConversaWhatsapp | null>(null);
  const [painelAberto, setPainelAberto] = useState(true);
  const [aba, setAba] = useState<AbaDoPainel>("rastros");
  const [config, setConfig] = useState(false);
  const [filtro, setFiltro] = useState<FiltroDaLista>("todas");
  const [rastros, setRastros] = useState<RastroWhatsapp[]>([]);
  const [agendadas, setAgendadas] = useState<AgendadaWhatsapp[]>([]);
  const abertaRef = useRef<string | null>(null);
  const conectado = Boolean(estado?.ligado && estado.vinculo === "conectado");
  const totalDeRastros = estado?.rastros ?? 0;

  useEffect(() => {
    if (!visivel) return;
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ESTADO_MS);
    return () => window.clearInterval(relogio);
  }, [visivel, carregar]);

  useEffect(() => () => {
    if (abertaRef.current) void whatsappPonte.fechar().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!conectado) return;
    void whatsappPonte.rastros().then((r) => setRastros(r.rastros)).catch(() => undefined);
  }, [conectado, totalDeRastros]);

  const atualizarAgendadas = useCallback(() => whatsappPonte.agendadas().then((r) => setAgendadas(r.agendadas)).catch(() => undefined), []);

  useEffect(() => {
    if (!conectado || !visivel) return;
    void atualizarAgendadas();
    const relogio = window.setInterval(() => void atualizarAgendadas(), AGENDADAS_MS);
    return () => window.clearInterval(relogio);
  }, [conectado, visivel, atualizarAgendadas]);

  const rastrosPorConversa = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const r of rastros) contagem[r.conversa] = (contagem[r.conversa] ?? 0) + 1;
    return contagem;
  }, [rastros]);

  const abrir = useCallback(async (id: string) => {
    abertaRef.current = id;
    setAbertaId(id);
    setAba((a) => (a === "rastros" || a === "agendadas" ? a : "contato"));
    const completa = await whatsappPonte.abrir(id).catch(() => null);
    if (completa && abertaRef.current === id) setAbertaBase(completa);
    void carregar();
  }, [carregar]);

  const fechar = () => {
    abertaRef.current = null;
    setAbertaId(null);
    setAbertaBase(null);
    void whatsappPonte.fechar().catch(() => undefined);
  };

  const mostrarNoPainel = (a: AbaDoPainel) => {
    setAba(a);
    setPainelAberto(true);
  };

  if (!estado) return <div className="wpp-tela wpp-tela-carregando" aria-busy="true"><LoaderCircle size={22} className="girando" /></div>;

  if (!conectado) {
    return (
      <div className="wpp-tela wpp-tela-desconectada">
        <div className="wpp-desconectado">
          <span className="wpp-logo-grande"><Marca marca="whatsapp" tamanho={34} /></span>
          <h1>{P.desconectadoTitulo}</h1>
          <p>{estado.ligado ? W.vinculos[estado.vinculo] : P.desconectadoTexto}</p>
          <Botao variante="primario" icone={<Settings2 size={14} />} onClick={() => setConfig(true)}>{W.configurar}</Botao>
        </div>
        <ConfigWhatsapp aberto={config} aoFechar={() => setConfig(false)} />
      </div>
    );
  }

  const viva = abertaId ? (estado.aberta?.id === abertaId ? estado.aberta : estado.conversas.find((c) => c.id === abertaId)) ?? null : null;
  const aberta = viva ?? (abertaBase?.id === abertaId ? abertaBase : null);
  const digitando = estado.digitando ?? {};
  const fantasma = !estado.filtros.lerAoAbrir;

  const alternarFantasma = () => void whatsappPonte.filtros({ lerAoAbrir: fantasma }).then(definir).catch(() => undefined);

  const painel = (mensagens: MensagemWhatsapp[]) =>
    painelAberto ? (
      <PainelLateral
        aba={aba}
        aoAba={setAba}
        aoFechar={() => setPainelAberto(false)}
        conversa={aberta}
        mensagens={mensagens}
        rastros={rastros}
        agendadas={agendadas}
        aoAbrir={(id) => void abrir(id)}
        aoLimparRastros={() => void whatsappPonte.limparRastros().then((r) => setRastros(r.rastros)).then(() => carregar())}
        aoCancelarAgendada={(id) => whatsappPonte.cancelarAgendada(id).then((r) => setAgendadas(r.agendadas))}
        fantasma={fantasma}
        aoFantasma={alternarFantasma}
        aoEsconder={(id) => {
          void whatsappPonte.ignorar(id, true).then(definir);
          fechar();
        }}
      />
    ) : null;

  return (
    <div className="wpp-tela" data-painel={painelAberto ? "aberto" : "fechado"} data-conversa={aberta ? "aberta" : "nenhuma"}>
      <ListaDeConversas
        estado={estado}
        abertaId={abertaId}
        filtro={filtro}
        aoFiltro={setFiltro}
        aoAbrir={(c) => void abrir(c.id)}
        aoConfigurar={() => setConfig(true)}
        rastrosPorConversa={rastrosPorConversa}
        agendadas={agendadas.filter((a) => a.situacao === "active" || a.situacao === "paused").length}
        aoMostrar={mostrarNoPainel}
      />
      {aberta ? (
        <Conversa
          key={aberta.id}
          conversa={aberta}
          digitando={digitando[aberta.id]}
          fantasma={fantasma}
          painelAberto={painelAberto}
          aoAlternarPainel={() => setPainelAberto((v) => !v)}
          aoVoltar={fechar}
          aoAgendou={setAgendadas}
          painel={painel}
        />
      ) : (
        <>
          <BoasVindas fantasma={fantasma} aoFantasma={alternarFantasma} rastros={rastros.length} aoMostrar={mostrarNoPainel} painelAberto={painelAberto} aoAlternarPainel={() => setPainelAberto((v) => !v)} />
          {painel([])}
        </>
      )}
      <ConfigWhatsapp aberto={config} aoFechar={() => setConfig(false)} />
    </div>
  );
}

const FILTROS: { id: FiltroDaLista; icone: LucideIcon }[] = [
  { id: "todas", icone: MessagesSquare },
  { id: "naoLidas", icone: BellDot },
  { id: "grupos", icone: Users },
];

function ListaDeConversas({
  estado, abertaId, filtro, aoFiltro, aoAbrir, aoConfigurar, rastrosPorConversa, agendadas, aoMostrar,
}: {
  estado: EstadoWhatsapp;
  abertaId: string | null;
  filtro: FiltroDaLista;
  aoFiltro: (f: FiltroDaLista) => void;
  aoAbrir: (c: ConversaWhatsapp) => void;
  aoConfigurar: () => void;
  rastrosPorConversa: Record<string, number>;
  agendadas: number;
  aoMostrar: (a: AbaDoPainel) => void;
}) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => filtrarConversas(estado.conversas, filtro, busca), [estado.conversas, filtro, busca]);
  const naoLidas = naoLidasDasConversas(estado.conversas);
  const digitando = estado.digitando ?? {};

  return (
    <aside className="wpp-lista" aria-label={P.conversas}>
      <header className="wpp-lista-topo">
        <span className="wpp-logo"><Marca marca="whatsapp" tamanho={18} /></span>
        <span className="wpp-lista-titulo">
          <b>{W.nome}</b>
          <span className="privado">{estado.eu ? numeroDoJid(estado.eu) : W.vinculos.conectado}</span>
        </span>
        <button type="button" className="wpp-icone" aria-label={W.opcoes} title={W.opcoes} onClick={aoConfigurar}><Settings2 size={15} /></button>
      </header>
      <div className="wpp-resumo">
        <button type="button" className="wpp-resumo-item" data-ativo={naoLidas > 0 || undefined} onClick={() => aoFiltro("naoLidas")}>
          <BellDot size={14} />
          <b className="numero">{naoLidas}</b>
          <span>{P.resumo.naoLidas}</span>
        </button>
        <button type="button" className="wpp-resumo-item" data-ativo={(estado.rastros ?? 0) > 0 || undefined} onClick={() => aoMostrar("rastros")}>
          <History size={14} />
          <b className="numero">{estado.rastros ?? 0}</b>
          <span>{P.resumo.rastros}</span>
        </button>
        <button type="button" className="wpp-resumo-item" data-ativo={agendadas > 0 || undefined} onClick={() => aoMostrar("agendadas")}>
          <CalendarClock size={14} />
          <b className="numero">{agendadas}</b>
          <span>{P.resumo.agendadas}</span>
        </button>
      </div>
      <label className="wpp-busca">
        <Search size={14} aria-hidden="true" />
        <input value={busca} placeholder={W.buscar} aria-label={W.buscar} maxLength={60} onChange={(e) => setBusca(e.target.value)} />
        {busca && <button type="button" aria-label={T.geral.fechar} onClick={() => setBusca("")}><X size={13} /></button>}
      </label>
      <div className="wpp-filtros" role="tablist" aria-label={P.conversas}>
        {FILTROS.map(({ id, icone: Icone }) => (
          <button key={id} type="button" role="tab" aria-selected={filtro === id} className="wpp-filtro" onClick={() => aoFiltro(id)}>
            <Icone size={13} />
            {W.filtrosDaLista[id]}
            {id === "naoLidas" && naoLidas > 0 && <span className="wpp-filtro-numero numero">{naoLidas}</span>}
          </button>
        ))}
      </div>
      <div className="wpp-lista-itens">
        {visiveis.length === 0 && <p className="wpp-lista-vazia">{busca.trim() ? W.vazioDoFiltro.busca : W.vazioDoFiltro[filtro]}</p>}
        {visiveis.map((c, indice) => {
          const ultima = c.mensagens[c.mensagens.length - 1];
          const mencao = c.grupo && c.mensagens.some((m) => m.mencionaMe && !m.minha);
          const quem = digitando[c.id];
          const comRastros = rastrosPorConversa[c.id] ?? 0;
          return (
            <button
              key={c.id}
              type="button"
              className="wpp-item"
              aria-current={abertaId === c.id ? "true" : undefined}
              data-nao-lida={c.naoLidas > 0 || undefined}
              style={{ ["--ordem" as string]: Math.min(indice, 10) }}
              onClick={() => aoAbrir(c)}
            >
              <Avatar nome={c.nome} foto={c.foto} tamanho={42} grupo={c.grupo} />
              <span className="wpp-item-textos">
                <span className="wpp-item-linha">
                  <span className="wpp-item-nome cortar privado">{c.nome}</span>
                  <span className="wpp-item-hora numero">{horarioRelativo(c.ultimaAtividade)}</span>
                </span>
                <span className="wpp-item-linha">
                  {quem ? <span className="wpp-digitando cortar">{quem.audio ? P.gravando : P.digitando}</span> : <Previa m={ultima} />}
                  <span className="wpp-item-sinais">
                    {comRastros > 0 && <span className="wpp-item-rastro" title={P.rastrosNaConversa(comRastros)}><History size={11} /></span>}
                    {mencao && <span className="wpp-item-mencao" title={W.mencao}><AtSign size={11} /></span>}
                    {c.naoLidas > 0 && <span key={c.naoLidas} className="wpp-item-nao-lidas numero">{c.naoLidas > 99 ? "99+" : c.naoLidas}</span>}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

const TRUQUES: { id: "apagadas" | "edicoes" | "fantasma" | "agendar" | "entrega"; icone: LucideIcon }[] = [
  { id: "apagadas", icone: Trash2 },
  { id: "edicoes", icone: PencilLine },
  { id: "fantasma", icone: Ghost },
  { id: "agendar", icone: CalendarClock },
  { id: "entrega", icone: CheckCheck },
];

function BoasVindas({ fantasma, aoFantasma, rastros, aoMostrar, painelAberto, aoAlternarPainel }: { fantasma: boolean; aoFantasma: () => void; rastros: number; aoMostrar: (a: AbaDoPainel) => void; painelAberto: boolean; aoAlternarPainel: () => void }) {
  return (
    <section className="wpp-conversa wpp-boas-vindas">
      <div className="wpp-conversa-topo wpp-boas-vindas-topo">
        <span />
        <button type="button" className="wpp-icone" aria-label={painelAberto ? P.fecharPainel : P.abrirPainel} title={painelAberto ? P.fecharPainel : P.abrirPainel} onClick={aoAlternarPainel}>
          {painelAberto ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>
      <div className="wpp-boas-vindas-corpo">
        <span className="wpp-logo-grande"><Marca marca="whatsapp" tamanho={34} /></span>
        <h1>{P.boasVindasTitulo}</h1>
        <p>{P.boasVindasTexto}</p>
        <div className="wpp-truques">
          {TRUQUES.map(({ id, icone: Icone }, i) => {
            const t = P.truques[id];
            const ligado = id === "fantasma" ? fantasma : undefined;
            const acao = id === "fantasma" ? aoFantasma : id === "apagadas" || id === "edicoes" ? () => aoMostrar("rastros") : id === "agendar" ? () => aoMostrar("agendadas") : undefined;
            const conteudo = (
              <>
                <span className="wpp-truque-icone"><Icone size={16} /></span>
                <span className="wpp-truque-textos">
                  <b>{t.titulo}</b>
                  <span>{t.texto}</span>
                </span>
                {ligado !== undefined && <span className="wpp-truque-estado" data-ligado={ligado || undefined}>{ligado ? P.ligado : P.desligado}</span>}
                {id === "apagadas" && rastros > 0 && <span className="wpp-truque-estado" data-ligado>{rastros}</span>}
              </>
            );
            return acao ? (
              <button key={id} type="button" className="wpp-truque" style={{ ["--ordem" as string]: i }} role={ligado !== undefined ? "switch" : undefined} aria-checked={ligado} onClick={acao}>{conteudo}</button>
            ) : (
              <div key={id} className="wpp-truque" style={{ ["--ordem" as string]: i }}>{conteudo}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface Pendente {
  chave: string;
  texto: string;
  estado: "enviando" | "falhou";
  erro?: string;
}

function mesclarMensagens(antigas: MensagemWhatsapp[], vivas: MensagemWhatsapp[], trocadas: Record<string, MensagemWhatsapp>): MensagemWhatsapp[] {
  const porId = new Map<string, MensagemWhatsapp>();
  for (const m of antigas) porId.set(m.id, m);
  for (const m of vivas) porId.set(m.id, m);
  for (const [id, m] of Object.entries(trocadas)) if (porId.has(id)) porId.set(id, m);
  return [...porId.values()].sort((a, b) => a.data.localeCompare(b.data));
}

function Conversa({
  conversa, digitando, fantasma, painelAberto, aoAlternarPainel, aoVoltar, aoAgendou, painel,
}: {
  conversa: ConversaWhatsapp;
  digitando?: { nome: string; audio: boolean };
  fantasma: boolean;
  painelAberto: boolean;
  aoAlternarPainel: () => void;
  aoVoltar: () => void;
  aoAgendou: (a: AgendadaWhatsapp[]) => void;
  painel: (mensagens: MensagemWhatsapp[]) => ReactNode;
}) {
  const avisar = useInterface((s) => s.avisar);
  const [antigas, setAntigas] = useState<MensagemWhatsapp[]>([]);
  const [deslocamento, setDeslocamento] = useState(0);
  const [fim, setFim] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [trocadas, setTrocadas] = useState<Record<string, MensagemWhatsapp>>({});
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [editando, setEditando] = useState<MensagemWhatsapp | null>(null);
  const [apagando, setApagando] = useState<MensagemWhatsapp | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [agendando, setAgendando] = useState(false);
  const [quando, setQuando] = useState(() => paraCampoDeData(new Date(Date.now() + 3600_000)));
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<MensagemWhatsapp[] | null>(null);
  const [originais, setOriginais] = useState<Set<string>>(() => new Set());
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const [voando, setVoando] = useState(0);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const fila = useRef<Pendente[]>([]);
  const processando = useRef(false);
  const montada = useRef(true);
  const pertoDoFim = useRef(true);
  const alturaAntes = useRef<number | null>(null);
  const jaVistas = useRef<Set<string> | null>(null);

  const mensagens = useMemo(() => mesclarMensagens(antigas, conversa.mensagens, trocadas), [antigas, conversa.mensagens, trocadas]);

  useEffect(() => {
    montada.current = true;
    campo.current?.focus();
    let vivo = true;
    whatsappPonte
      .historico(conversa.id, 0)
      .then((r) => {
        if (!vivo) return;
        setAntigas(r.mensagens);
        setDeslocamento(r.mensagens.length);
        setFim(r.fim);
      })
      .catch(() => vivo && setFim(true))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
      montada.current = false;
    };
  }, [conversa.id]);

  useEffect(() => {
    if (carregando) return;
    if (!jaVistas.current) jaVistas.current = new Set(mensagens.map((m) => m.id));
  }, [carregando, mensagens]);

  const ultimaId = mensagens[mensagens.length - 1]?.id;

  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    if (alturaAntes.current !== null) {
      el.scrollTop += el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
      return;
    }
    const ultima = mensagens[mensagens.length - 1];
    if (pertoDoFim.current || ultima?.minha || pendentes.length) {
      el.scrollTop = el.scrollHeight;
      setNovasAbaixo(0);
    } else if (ultima) setNovasAbaixo((n) => n + 1);
  }, [ultimaId, pendentes.length, carregando]);

  const aoRolar = () => {
    const el = lista.current;
    if (!el) return;
    pertoDoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM_PX;
    if (pertoDoFim.current && novasAbaixo) setNovasAbaixo(0);
  };

  const irParaOFim = () => {
    const el = lista.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNovasAbaixo(0);
  };

  const carregarAntigas = async () => {
    if (carregando || fim) return;
    setCarregando(true);
    try {
      const r = await whatsappPonte.historico(conversa.id, deslocamento);
      if (!montada.current) return;
      alturaAntes.current = lista.current?.scrollHeight ?? null;
      setAntigas((a) => mesclarMensagens(r.mensagens, a, {}));
      setDeslocamento((d) => d + r.mensagens.length);
      setFim(r.fim);
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
    } finally {
      if (montada.current) setCarregando(false);
    }
  };

  useEffect(() => {
    if (!buscando || termo.trim().length < 2) {
      setAchadas(null);
      return;
    }
    let vivo = true;
    const espera = window.setTimeout(() => {
      whatsappPonte.historico(conversa.id, 0, termo.trim()).then((r) => vivo && setAchadas([...r.mensagens].reverse())).catch(() => vivo && setAchadas([]));
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [buscando, termo, conversa.id]);

  const irParaMensagem = (id: string) => {
    const alvo = lista.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!alvo) return false;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    alvo.dataset.destaque = "sim";
    window.setTimeout(() => delete alvo.dataset.destaque, 1600);
    return true;
  };

  const processarFila = async () => {
    if (processando.current) return;
    processando.current = true;
    while (fila.current.length) {
      const p = fila.current[0];
      try {
        await whatsappPonte.enviar(conversa.id, p.texto);
        void useWhatsapp.getState().carregar();
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

  const salvarEdicao = async (m: MensagemWhatsapp, novo: string) => {
    try {
      const atualizada = await whatsappPonte.editar(conversa.id, m.id, novo);
      if (atualizada) setTrocadas((t) => ({ ...t, [m.id]: atualizada }));
      void useWhatsapp.getState().carregar();
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    }
  };

  const enviar = () => {
    const limpo = texto.trim();
    if (!limpo) return;
    setErro("");
    setTexto("");
    if (editando) {
      const alvo = editando;
      setEditando(null);
      if (limpo !== alvo.texto) void salvarEdicao(alvo, limpo);
      return;
    }
    setVoando((v) => v + 1);
    pertoDoFim.current = true;
    const p: Pendente = { chave: `${Date.now()}-${Math.random().toString(36).slice(2)}`, texto: limpo, estado: "enviando" };
    setPendentes((l) => [...l, p]);
    enfileirar(p);
  };

  const tentarDeNovo = (p: Pendente) => {
    const novo: Pendente = { ...p, estado: "enviando", erro: undefined };
    setPendentes((l) => l.map((x) => (x.chave === p.chave ? novo : x)));
    enfileirar(novo);
  };

  const agendar = async () => {
    const limpo = texto.trim();
    if (!limpo) return;
    setErro("");
    try {
      const r = await whatsappPonte.agendar(conversa.id, limpo, new Date(quando).toISOString());
      aoAgendou(r.agendadas);
      setTexto("");
      setAgendando(false);
      avisar(P.agendadaPara(dataCompleta(new Date(quando).toISOString())));
      void tocarSom("send", "interface");
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    }
  };

  const enviarArquivo = async () => {
    if (!arquivo || enviandoArquivo) return;
    setEnviandoArquivo(true);
    setErro("");
    try {
      await whatsappPonte.enviarArquivo(conversa.id, arquivo, texto.trim());
      setArquivo(null);
      setTexto("");
      void useWhatsapp.getState().carregar();
      void tocarSom("send", "interface");
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const escolherArquivo = (f: File) => {
    setErro("");
    if (f.size > 16 * 1024 * 1024) setErro(W.erros.arquivo_grande_demais);
    else setArquivo(f);
  };

  const apagar = async (m: MensagemWhatsapp) => {
    try {
      const atualizada = await whatsappPonte.apagar(conversa.id, m.id);
      if (atualizada) setTrocadas((t) => ({ ...t, [m.id]: atualizada }));
      void useWhatsapp.getState().carregar();
    } catch (e) {
      setErro(mensagemDoWhatsapp(e));
      void tocarSom("error", "avisos");
    }
  };

  const copiar = (m: MensagemWhatsapp) => {
    void navigator.clipboard.writeText(m.texto).then(() => avisar(P.copiada)).catch(() => undefined);
  };

  const comecarEdicao = (m: MensagemWhatsapp) => {
    setEditando(m);
    setTexto(m.texto);
    setAgendando(false);
    window.requestAnimationFrame(() => campo.current?.focus());
  };

  const alternarOriginal = (id: string) => setOriginais((s) => {
    const novo = new Set(s);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  });

  const quemDigita = digitando ? (conversa.grupo && digitando.nome ? P.alguemDigitando(digitando.nome, digitando.audio) : digitando.audio ? P.gravando : P.digitando) : null;
  const minimoDoAgendamento = paraCampoDeData(new Date(Date.now() + 2 * 60_000));
  const agendamentoValido = Date.parse(quando) > Date.now() + 60_000;

  return (
    <>
      <section className="wpp-conversa" aria-label={conversa.nome}>
        <header className="wpp-conversa-topo">
          <button type="button" className="wpp-icone wpp-so-estreito" aria-label={W.voltar} title={W.voltar} onClick={aoVoltar}><X size={16} /></button>
          <Avatar nome={conversa.nome} foto={conversa.foto} tamanho={40} grupo={conversa.grupo} />
          <span className="wpp-conversa-titulo">
            <b className="cortar privado">{conversa.nome}</b>
            {quemDigita ? <span className="wpp-digitando">{quemDigita}</span> : <span className="cortar privado">{conversa.grupo ? W.grupo : numeroDoJid(conversa.id)}</span>}
          </span>
          {fantasma && <span className="wpp-etiqueta-fantasma" title={P.fantasmaDica}><Ghost size={12} /> {P.fantasma}</span>}
          <button type="button" className="wpp-icone" aria-pressed={buscando} aria-label={P.buscarNaConversa} title={P.buscarNaConversa} onClick={() => setBuscando((b) => !b)}><Search size={16} /></button>
          <button type="button" className="wpp-icone" aria-label={painelAberto ? P.fecharPainel : P.abrirPainel} title={painelAberto ? P.fecharPainel : P.abrirPainel} onClick={aoAlternarPainel}>
            {painelAberto ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </header>
        {buscando && (
          <div className="wpp-busca-conversa">
            <label className="wpp-busca">
              <Search size={14} aria-hidden="true" />
              <input autoFocus value={termo} placeholder={P.buscarNaConversa} aria-label={P.buscarNaConversa} maxLength={80} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setBuscando(false)} />
              {termo && <button type="button" aria-label={T.geral.fechar} onClick={() => setTermo("")}><X size={13} /></button>}
            </label>
            {achadas && (
              <div className="wpp-achadas">
                <span className="wpp-achadas-total">{P.achadas(achadas.length)}</span>
                {achadas.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="wpp-achada"
                    onClick={() => {
                      if (!irParaMensagem(m.id)) setAntigas((a) => mesclarMensagens([m], a, {}));
                      window.setTimeout(() => irParaMensagem(m.id), 60);
                    }}
                  >
                    <span className="wpp-achada-quem">{m.minha ? W.voce : m.nomeRemetente || conversa.nome} · {dataCompleta(m.data)}</span>
                    <span className="wpp-achada-texto privado">{m.texto || rotuloDaMidia(m)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={lista} className="wpp-mensagens" onScroll={aoRolar}>
          {!fim && (
            <button type="button" className="wpp-mais-antigas" disabled={carregando} onClick={() => void carregarAntigas()}>
              {carregando ? <LoaderCircle size={13} className="girando" /> : <History size={13} />}
              {P.maisAntigas}
            </button>
          )}
          {carregando && mensagens.length === 0 && <span className="wpp-carregando-conversa"><LoaderCircle size={18} className="girando" /></span>}
          {mensagens.map((m, i) => {
            const dia = diaDaMensagem(m.data);
            const novoDia = i === 0 || diaDaMensagem(mensagens[i - 1].data) !== dia;
            const mesmoAutor = i > 0 && !novoDia && mensagens[i - 1].minha === m.minha && mensagens[i - 1].remetente === m.remetente;
            return (
              <Fragment key={m.id}>
                {novoDia && <span className="wpp-dia"><span>{dia}</span></span>}
                <Bolha
                  m={m}
                  conversa={conversa}
                  continuacao={mesmoAutor}
                  nova={Boolean(jaVistas.current && !jaVistas.current.has(m.id))}
                  mostrarOriginal={originais.has(m.id)}
                  aoOriginal={() => alternarOriginal(m.id)}
                  aoCopiar={() => copiar(m)}
                  aoEditar={() => comecarEdicao(m)}
                  aoApagar={() => setApagando(m)}
                  aoAmpliar={setAmpliada}
                />
              </Fragment>
            );
          })}
          {pendentes.map((p) => (
            <div key={p.chave} className="wpp-msg" data-minha="sim" data-pendente={p.estado}>
              <div className="wpp-bolha">
                <p className="wpp-texto privado">{p.texto}</p>
                {p.estado === "falhou" ? (
                  <span className="wpp-falhou" role="status">
                    <CircleAlert size={12} /> {p.erro || W.naoEnviou}
                    <button type="button" onClick={() => tentarDeNovo(p)}><RotateCw size={11} /> {W.tentarDeNovo}</button>
                    <button type="button" aria-label={W.descartar} title={W.descartar} onClick={() => setPendentes((l) => l.filter((x) => x.chave !== p.chave))}><X size={11} /></button>
                  </span>
                ) : (
                  <span className="wpp-rodape"><Clock size={12} aria-label={W.enviandoMensagem} /></span>
                )}
              </div>
            </div>
          ))}
          {quemDigita && (
            <div className="wpp-msg wpp-msg-digitando" data-minha="nao" aria-live="polite">
              <div className="wpp-bolha"><span className="wpp-pontinhos" aria-label={quemDigita}><i /><i /><i /></span></div>
            </div>
          )}
        </div>
        {novasAbaixo > 0 && (
          <button type="button" className="wpp-ir-fim" onClick={irParaOFim}>
            <ArrowDown size={14} /> {P.novasAbaixo(novasAbaixo)}
          </button>
        )}
        {erro && <p className="wpp-erro" role="status"><CircleAlert size={13} /> {erro}<button type="button" aria-label={T.geral.fechar} onClick={() => setErro("")}><X size={12} /></button></p>}
        {editando && (
          <div className="wpp-faixa-compositor">
            <PencilLine size={14} />
            <span className="coluna" style={{ minWidth: 0, flex: 1, gap: 1 }}>
              <b>{P.editando}</b>
              <span className="cortar privado">{editando.texto}</span>
            </span>
            <button type="button" className="wpp-icone" aria-label={T.geral.cancelar} onClick={() => { setEditando(null); setTexto(""); }}><X size={14} /></button>
          </div>
        )}
        {arquivo && (
          <div className="wpp-faixa-compositor wpp-faixa-arquivo">
            <PreviaDoArquivo arquivo={arquivo} tamanho={64} />
            <span className="coluna" style={{ minWidth: 0, flex: 1, gap: 1 }}>
              <b className="cortar">{W.confirmarArquivo(arquivo.name, formatarTamanho(arquivo.size))}</b>
              <span>{W.legendaDoArquivo}</span>
            </span>
            <Botao pequeno disabled={enviandoArquivo} onClick={() => setArquivo(null)}>{W.cancelarArquivo}</Botao>
            <Botao pequeno variante="primario" disabled={enviandoArquivo} onClick={() => void enviarArquivo()}>{W.enviarArquivo}</Botao>
          </div>
        )}
        {agendando && (
          <div className="wpp-agendar">
            <CalendarClock size={15} />
            <label className="wpp-agendar-campo">
              <span>{P.enviarEm}</span>
              <input type="datetime-local" value={quando} min={minimoDoAgendamento} onChange={(e) => setQuando(e.target.value)} />
            </label>
            <div className="wpp-agendar-atalhos">
              <button type="button" onClick={() => setQuando(paraCampoDeData(new Date(Date.now() + 3600_000)))}>{P.emUmaHora}</button>
              <button
                type="button"
                onClick={() => {
                  const amanha = new Date();
                  amanha.setDate(amanha.getDate() + 1);
                  amanha.setHours(9, 0, 0, 0);
                  setQuando(paraCampoDeData(amanha));
                }}
              >
                {P.amanhaCedo}
              </button>
            </div>
            <span className="wpp-agendar-dica">{P.agendarDica}</span>
            <Botao pequeno variante="primario" disabled={!texto.trim() || !agendamentoValido} onClick={() => void agendar()}>{P.agendar}</Botao>
          </div>
        )}
        <div className="wpp-compositor">
          <input ref={seletor} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolherArquivo(f); }} />
          <button type="button" className="wpp-icone" aria-label={W.anexar} title={W.anexar} disabled={Boolean(editando)} onClick={() => seletor.current?.click()}><Paperclip size={17} /></button>
          <textarea
            ref={campo}
            className="wpp-campo"
            rows={Math.min(6, Math.max(1, texto.split("\n").length))}
            value={texto}
            maxLength={4096}
            aria-label={editando ? P.editando : W.responder}
            placeholder={editando ? P.editando : P.escreva}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const [colado] = arquivosColados(e.clipboardData);
              if (!colado || editando) return;
              e.preventDefault();
              escolherArquivo(colado);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (arquivo) void enviarArquivo();
                else enviar();
              } else if (e.key === "Escape" && (editando || agendando || arquivo)) {
                setArquivo(null);
                e.preventDefault();
                setEditando(null);
                setAgendando(false);
              }
            }}
          />
          <button type="button" className="wpp-icone" aria-pressed={agendando} aria-label={P.agendar} title={P.agendar} disabled={Boolean(editando)} onClick={() => setAgendando((a) => !a)}><CalendarClock size={17} /></button>
          <button type="button" className="wpp-enviar" aria-label={editando ? P.salvarEdicao : W.enviar} title={editando ? P.salvarEdicao : W.enviar} disabled={!texto.trim()} onClick={enviar}>
            {editando ? <Check size={17} /> : <Send key={voando} size={16} data-voou={voando > 0 || undefined} />}
          </button>
        </div>
        <ConfirmarModal
          aberto={Boolean(apagando)}
          titulo={P.apagarParaTodos}
          texto={P.apagarConfirmar}
          rotuloConfirmar={P.apagarParaTodos}
          aoFechar={() => setApagando(null)}
          aoConfirmar={() => apagando && void apagar(apagando)}
        />
        <Modal aberto={Boolean(ampliada)} titulo={W.midias.imagem} aoFechar={() => setAmpliada(null)} largo>
          {ampliada && <img className="wpp-imagem-ampliada" src={ampliada} alt={W.midias.imagem} />}
        </Modal>
      </section>
      {painel(mensagens)}
    </>
  );
}

function agruparReacoes(reacoes: ReacaoWhatsapp[]): { emoji: string; quem: string[] }[] {
  const grupos = new Map<string, string[]>();
  for (const r of reacoes) grupos.set(r.emoji, [...(grupos.get(r.emoji) ?? []), r.minha ? W.voce : r.nome || numeroDoJid(r.de)]);
  return [...grupos.entries()].map(([emoji, quem]) => ({ emoji, quem }));
}

function Bolha({
  m, conversa, continuacao, nova, mostrarOriginal, aoOriginal, aoCopiar, aoEditar, aoApagar, aoAmpliar,
}: {
  m: MensagemWhatsapp;
  conversa: ConversaWhatsapp;
  continuacao: boolean;
  nova: boolean;
  mostrarOriginal: boolean;
  aoOriginal: () => void;
  aoCopiar: () => void;
  aoEditar: () => void;
  aoApagar: () => void;
  aoAmpliar: (url: string) => void;
}) {
  const idade = Date.now() - Date.parse(m.data);
  const podeEditar = m.minha && !m.apagada && m.midia === "nenhuma" && Boolean(m.texto) && idade < EDITAVEL_MS;
  const podeApagar = m.minha && !m.apagada && idade < APAGAVEL_MS;
  const reacoes = m.reacoes?.length ? agruparReacoes(m.reacoes) : [];
  const Entrega = m.entrega ? CheckCheck : Check;
  return (
    <div className="wpp-msg" data-id={m.id} data-minha={m.minha ? "sim" : "nao"} data-continuacao={continuacao || undefined} data-apagada={m.apagada ? "sim" : undefined} data-nova={nova || undefined} data-mencao={m.mencionaMe || undefined}>
      <div className="wpp-bolha">
        {conversa.grupo && !m.minha && !continuacao && m.nomeRemetente && <span className="wpp-remetente privado" style={{ color: corDoNome(m.nomeRemetente) }}>{m.nomeRemetente}</span>}
        {m.encaminhada && <span className="wpp-encaminhada"><Forward size={11} /> {W.encaminhada}</span>}
        {m.midia !== "nenhuma" && <MidiaDaMensagem jid={conversa.id} m={m} aoAmpliar={aoAmpliar} />}
        {m.texto && <p className="wpp-texto privado">{m.texto}</p>}
        {m.apagada && (
          <span className="wpp-selo wpp-selo-apagada" title={dataCompleta(m.apagada)}>
            <Trash2 size={11} /> {m.minha ? P.voceApagou : P.apagadaAs(horaDaMensagem(m.apagada))}
          </span>
        )}
        {m.editada && m.textoOriginal && (
          <button type="button" className="wpp-selo wpp-selo-editada" aria-expanded={mostrarOriginal} onClick={aoOriginal}>
            <PencilLine size={11} /> {mostrarOriginal ? P.esconderOriginal : P.editadaVerOriginal}
          </button>
        )}
        {mostrarOriginal && m.textoOriginal && <p className="wpp-original privado">{m.textoOriginal}</p>}
        <span className="wpp-rodape" title={new Date(m.data).toLocaleString("pt-BR")}>
          {m.editada && <span className="wpp-rodape-editada">{P.editada}</span>}
          {horaDaMensagem(m.data)}
          {m.minha && !m.apagada && <Entrega size={14} className="wpp-entrega" data-lida={m.entrega === "lida" || undefined} aria-label={m.entrega ? P.entrega[m.entrega] : W.enviada} />}
        </span>
      </div>
      {reacoes.length > 0 && (
        <div className="wpp-reacoes">
          {reacoes.map((r) => (
            <span key={r.emoji} className="wpp-reacao" title={r.quem.join(", ")}>
              {r.emoji}
              {r.quem.length > 1 && <b className="numero">{r.quem.length}</b>}
            </span>
          ))}
        </div>
      )}
      {!m.apagada && (m.texto || podeApagar) && (
        <div className="wpp-acoes" role="toolbar" aria-label={P.acoesDaMensagem}>
          {m.texto && <button type="button" aria-label={P.copiar} title={P.copiar} onClick={aoCopiar}><Copy size={13} /></button>}
          {podeEditar && <button type="button" aria-label={P.editar} title={P.editar} onClick={aoEditar}><PencilLine size={13} /></button>}
          {podeApagar && <button type="button" data-perigo aria-label={P.apagarParaTodos} title={P.apagarParaTodos} onClick={aoApagar}><Trash2 size={13} /></button>}
        </div>
      )}
    </div>
  );
}

const ABAS_DO_PAINEL: { id: AbaDoPainel; icone: LucideIcon }[] = [
  { id: "contato", icone: UserRound },
  { id: "rastros", icone: History },
  { id: "agendadas", icone: CalendarClock },
];

function PainelLateral({
  aba, aoAba, aoFechar, conversa, mensagens, rastros, agendadas, aoAbrir, aoLimparRastros, aoCancelarAgendada, fantasma, aoFantasma, aoEsconder,
}: {
  aba: AbaDoPainel;
  aoAba: (a: AbaDoPainel) => void;
  aoFechar: () => void;
  conversa: ConversaWhatsapp | null;
  mensagens: MensagemWhatsapp[];
  rastros: RastroWhatsapp[];
  agendadas: AgendadaWhatsapp[];
  aoAbrir: (id: string) => void;
  aoLimparRastros: () => void;
  aoCancelarAgendada: (id: string) => Promise<void>;
  fantasma: boolean;
  aoFantasma: () => void;
  aoEsconder: (id: string) => void;
}) {
  const atual = aba === "contato" && !conversa ? "rastros" : aba;
  return (
    <aside className="wpp-painel" aria-label={P.painel}>
      <header className="wpp-painel-topo">
        <div className="wpp-painel-abas" role="tablist" aria-label={P.painel}>
          {ABAS_DO_PAINEL.map(({ id, icone: Icone }) => (
            <button key={id} type="button" role="tab" aria-selected={atual === id} disabled={id === "contato" && !conversa} className="wpp-painel-aba" onClick={() => aoAba(id)}>
              <Icone size={13} /> {P.abas[id]}
            </button>
          ))}
        </div>
        <button type="button" className="wpp-icone" aria-label={P.fecharPainel} title={P.fecharPainel} onClick={aoFechar}><X size={15} /></button>
      </header>
      <div className="wpp-painel-corpo" key={atual}>
        {atual === "contato" && conversa && <PainelDoContato conversa={conversa} mensagens={mensagens} rastros={rastros} fantasma={fantasma} aoFantasma={aoFantasma} aoEsconder={() => aoEsconder(conversa.id)} />}
        {atual === "rastros" && <PainelDeRastros rastros={rastros} conversa={conversa} aoAbrir={aoAbrir} aoLimpar={aoLimparRastros} />}
        {atual === "agendadas" && <PainelDeAgendadas agendadas={agendadas} aoAbrir={aoAbrir} aoCancelar={aoCancelarAgendada} />}
      </div>
    </aside>
  );
}

function PainelDoContato({ conversa, mensagens, rastros, fantasma, aoFantasma, aoEsconder }: { conversa: ConversaWhatsapp; mensagens: MensagemWhatsapp[]; rastros: RastroWhatsapp[]; fantasma: boolean; aoFantasma: () => void; aoEsconder: () => void }) {
  const numeros = useMemo(() => {
    const porHora = Array.from({ length: 24 }, () => 0);
    let minhas = 0;
    let midias = 0;
    for (const m of mensagens) {
      porHora[new Date(m.data).getHours()] += 1;
      if (m.minha) minhas += 1;
      if (m.midia !== "nenhuma") midias += 1;
    }
    const maior = Math.max(1, ...porHora);
    const pico = porHora.indexOf(Math.max(...porHora));
    return { porHora, maior, pico, minhas, delas: mensagens.length - minhas, midias, desde: mensagens[0]?.data };
  }, [mensagens]);
  const daConversa = rastros.filter((r) => r.conversa === conversa.id);
  const apagadas = daConversa.filter((r) => r.tipo === "apagada").length;
  const editadas = daConversa.length - apagadas;
  const total = mensagens.length;
  const parteMinha = total ? Math.round((numeros.minhas / total) * 100) : 0;

  return (
    <div className="wpp-contato">
      <div className="wpp-contato-cartao">
        <Avatar nome={conversa.nome} foto={conversa.foto} tamanho={84} grupo={conversa.grupo} />
        <b className="privado">{conversa.nome}</b>
        <span className="privado">{conversa.grupo ? W.grupo : numeroDoJid(conversa.id)}</span>
      </div>
      <div className="wpp-numeros">
        <div><b className="numero">{total}</b><span>{P.numeros.carregadas}</span></div>
        <div><b className="numero">{numeros.midias}</b><span>{P.numeros.midias}</span></div>
        <div><b className="numero">{apagadas}</b><span>{P.numeros.apagadas}</span></div>
        <div><b className="numero">{editadas}</b><span>{P.numeros.editadas}</span></div>
      </div>
      {total > 0 && (
        <section className="wpp-bloco">
          <h3>{P.quemFalaMais}</h3>
          <div className="wpp-balanca" role="img" aria-label={P.balanca(parteMinha)}>
            <span style={{ width: `${parteMinha}%` }} />
          </div>
          <div className="wpp-balanca-legenda">
            <span>{W.voce} <b className="numero">{numeros.minhas}</b></span>
            <span>{conversa.grupo ? P.outros : conversa.nome.split(" ")[0]} <b className="numero">{numeros.delas}</b></span>
          </div>
        </section>
      )}
      {total > 0 && (
        <section className="wpp-bloco">
          <h3>{P.horarios}</h3>
          <div className="wpp-horas" role="img" aria-label={P.picoAs(numeros.pico)}>
            {numeros.porHora.map((n, h) => (
              <span key={h} data-pico={h === numeros.pico || undefined} title={P.mensagensAs(n, h)} style={{ height: `${Math.max(4, (n / numeros.maior) * 100)}%` }} />
            ))}
          </div>
          <div className="wpp-horas-legenda"><span>0h</span><span>12h</span><span>23h</span></div>
          <p className="wpp-nota">{P.picoAs(numeros.pico)}{numeros.desde ? `. ${P.desde(dataCompleta(numeros.desde))}` : ""}</p>
        </section>
      )}
      <section className="wpp-bloco">
        <button type="button" className="wpp-linha-acao" role="switch" aria-checked={fantasma} onClick={aoFantasma}>
          <Ghost size={15} />
          <span className="coluna" style={{ gap: 1, flex: 1, minWidth: 0 }}>
            <b>{P.truques.fantasma.titulo}</b>
            <span>{P.fantasmaDica}</span>
          </span>
          <span className="wpp-truque-estado" data-ligado={fantasma || undefined}>{fantasma ? P.ligado : P.desligado}</span>
        </button>
        <button type="button" className="wpp-linha-acao" onClick={aoEsconder}>
          <EyeOff size={15} />
          <span className="coluna" style={{ gap: 1, flex: 1, minWidth: 0 }}>
            <b>{W.ignorar}</b>
            <span>{W.ignorarDica}</span>
          </span>
        </button>
      </section>
    </div>
  );
}

function PainelDeRastros({ rastros, conversa, aoAbrir, aoLimpar }: { rastros: RastroWhatsapp[]; conversa: ConversaWhatsapp | null; aoAbrir: (id: string) => void; aoLimpar: () => void }) {
  const [soDestaConversa, setSoDestaConversa] = useState(false);
  const [tipo, setTipo] = useState<"todos" | RastroWhatsapp["tipo"]>("todos");
  const [limpando, setLimpando] = useState(false);
  const lista = rastros.filter((r) => (tipo === "todos" || r.tipo === tipo) && (!soDestaConversa || r.conversa === conversa?.id));

  return (
    <div className="wpp-rastros">
      <p className="wpp-nota">{P.rastrosExplicacao}</p>
      <div className="wpp-filtros">
        {(["todos", "apagada", "editada"] as const).map((t) => (
          <button key={t} type="button" className="wpp-filtro" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{P.tiposDeRastro[t]}</button>
        ))}
        {conversa && <button type="button" className="wpp-filtro" aria-pressed={soDestaConversa} onClick={() => setSoDestaConversa((v) => !v)}>{P.soDestaConversa}</button>}
      </div>
      {lista.length === 0 ? (
        <div className="wpp-painel-vazio">
          <History size={22} />
          <b>{P.semRastros}</b>
          <span>{P.semRastrosDica}</span>
        </div>
      ) : (
        <div className="wpp-rastros-lista">
          {lista.map((r, i) => (
            <article key={`${r.tipo}-${r.id}-${r.quando}`} className="wpp-rastro" data-tipo={r.tipo} style={{ ["--ordem" as string]: Math.min(i, 10) }}>
              <header>
                {r.tipo === "apagada" ? <Trash2 size={12} /> : <PencilLine size={12} />}
                <b>{P.tiposDeRastro[r.tipo]}</b>
                <span className="numero">{horarioRelativo(r.quando)}</span>
              </header>
              <button type="button" className="wpp-rastro-conversa privado" onClick={() => aoAbrir(r.conversa)}>
                {r.nomeDaConversa}
                {r.grupo && r.nomeRemetente ? ` · ${r.nomeRemetente}` : ""}
                <ArrowRight size={11} />
              </button>
              <p className="wpp-rastro-texto privado">{r.texto || rotuloDaMidia(r)}</p>
              {r.textoNovo !== undefined && <p className="wpp-rastro-novo privado"><ArrowRight size={11} /> {r.textoNovo}</p>}
              <footer>{P.enviadaEm(dataCompleta(r.data))}</footer>
            </article>
          ))}
        </div>
      )}
      {rastros.length > 0 && <Botao pequeno variante="fantasma" icone={<Trash2 size={13} />} onClick={() => setLimpando(true)}>{P.limparRastros}</Botao>}
      <ConfirmarModal aberto={limpando} titulo={P.limparRastros} texto={P.limparRastrosConfirmar} rotuloConfirmar={P.limparRastros} aoFechar={() => setLimpando(false)} aoConfirmar={aoLimpar} />
    </div>
  );
}

const SITUACOES_ATIVAS = new Set(["active", "paused", "running"]);

function PainelDeAgendadas({ agendadas, aoAbrir, aoCancelar }: { agendadas: AgendadaWhatsapp[]; aoAbrir: (id: string) => void; aoCancelar: (id: string) => Promise<void> }) {
  const [erro, setErro] = useState("");
  const [cancelando, setCancelando] = useState<string | null>(null);
  const ordenadas = [...agendadas].sort((a, b) => Number(SITUACOES_ATIVAS.has(b.situacao)) - Number(SITUACOES_ATIVAS.has(a.situacao)) || (a.proxima ?? a.quando).localeCompare(b.proxima ?? b.quando));
  return (
    <div className="wpp-agendadas">
      <p className="wpp-nota">{P.agendadasExplicacao}</p>
      {erro && <p className="wpp-erro" role="status"><CircleAlert size={13} /> {erro}</p>}
      {ordenadas.length === 0 ? (
        <div className="wpp-painel-vazio">
          <CalendarClock size={22} />
          <b>{P.semAgendadas}</b>
          <span>{P.semAgendadasDica}</span>
        </div>
      ) : (
        ordenadas.map((a, i) => (
          <article key={a.id} className="wpp-agendada" data-situacao={a.situacao} style={{ ["--ordem" as string]: Math.min(i, 10) }}>
            <header>
              <button type="button" className="wpp-rastro-conversa privado" onClick={() => aoAbrir(a.jid)}>{a.nome}<ArrowRight size={11} /></button>
              <span className="wpp-agendada-situacao">{P.situacoes[a.situacao] ?? a.situacao}</span>
            </header>
            <p className="wpp-rastro-texto privado">{a.resumo}</p>
            <footer>
              <Clock size={11} /> {a.proxima || a.quando ? dataCompleta(a.proxima ?? a.quando) : ""}
              {(a.situacao === "active" || a.situacao === "paused") && (
                <button
                  type="button"
                  disabled={cancelando === a.id}
                  onClick={() => {
                    setErro("");
                    setCancelando(a.id);
                    aoCancelar(a.id).catch((e) => setErro(mensagemDoWhatsapp(e))).finally(() => setCancelando(null));
                  }}
                >
                  {P.cancelarAgendada}
                </button>
              )}
            </footer>
            {a.erro && <p className="wpp-erro"><CircleAlert size={12} /> {a.erro}</p>}
          </article>
        ))
      )}
    </div>
  );
}
