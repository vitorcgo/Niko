import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Activity, FolderOpen, Bell, Play, Plug, SlidersHorizontal, Pencil, ChartNoAxesColumn, Settings, ShieldCheck, Eye, Trash2, RefreshCw, Users } from "lucide-react";
import { atribuirEquipe, ehDaEquipe, IDS_DA_EQUIPE } from "./equipeDoEscritorio";
import { useClaudeCode, type EstadoSessao } from "../../estado/claudeCode";
import { useEscritorioIas } from "../../estado/escritorioIas";
import { useHistoricoCodigo } from "../../estado/historicoCodigo";
import { ouvirClaudeCode, FERRAMENTAS_DE_CODIGO, type FerramentaDeCodigo } from "../../ponte/claudeCode";
import { T } from "../../textos/textos";
import { Marca } from "../../marcas/Marca";
import { COR_DA_FERRAMENTA, MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "../../janelas/ilha/claude/ferramentas";
import { ConfigDasFerramentas } from "../../janelas/ilha/claude/ConfigDasFerramentas";
import { CenaPixelConectada } from "./CenaPixelConectada";
import { RetratoPixel } from "./RetratoPixel";
import { snapshotDoEscritorio } from "./snapshotDoEscritorio";
import { acontecimentosDoEscritorio, agruparSessoesDoEscritorio, filtrarSessoes, nomeDoPersonagem, sessoesDeDemonstracao } from "./sessoesDoEscritorio";
import { PainelDaSessao, LinhaDeAtividade } from "./PainelDaSessao";
import { AnalisesDoEscritorio } from "./AnalisesDoEscritorio";
import { registroDoEscritorio } from "./dadosDoEscritorio";
import { mascararSegredos } from "./detalhesDaSessao";
import { hash32 } from "./motor/shared/hash";
import { configuracaoEscritorioValida, type ConfiguracaoEscritorio } from "./configuracaoDoEscritorio";
import "../../janelas/ilha/claude/claude.css";
import "./escritorioIas.css";

const E = T.escritorio.ias;
const chaveVisual = (id: string) => String(hash32(id));

export function EscritorioIas({ demonstracaoInicial = false }: { demonstracaoInicial?: boolean } = {}) {
  const sessoes = useClaudeCode((s) => s.sessoes);
  const ordem = useClaudeCode((s) => s.ordem);
  const pedidos = useClaudeCode((s) => s.pedidos);
  const configReal = useEscritorioIas((s) => s.config);
  const definirReal = useEscritorioIas((s) => s.definir);
  const registros = useEscritorioIas((s) => s.registros);
  const demonstracao = demonstracaoInicial;
  const [configDemo, setConfigDemo] = useState(configReal);
  const config = demonstracao ? configDemo : configReal;
  const definir = (parcial: Partial<ConfiguracaoEscritorio>) => { if (demonstracao) setConfigDemo((c) => configuracaoEscritorioValida({ ...c, ...parcial })); else definirReal(parcial); };
  const [exemplos] = useState(() => demonstracao ? sessoesDeDemonstracao() : []);
  const [selecionadaId, setSelecionadaId] = useState<string>();
  const [busca, setBusca] = useState("");
  const [ferramenta, setFerramenta] = useState<FerramentaDeCodigo | "todas">("todas");
  const [estado, setEstado] = useState<EstadoSessao | "todos">("todos");
  const [aba, setAba] = useState<"ambiente" | "atividade" | "analises" | "config">("ambiente");
  const [tipoAtividade, setTipoAtividade] = useState("todos");
  const [mais, setMais] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [tentativaConexao, setTentativaConexao] = useState(0);
  const [visivel, setVisivel] = useState(!document.hidden);
  const [agora, setAgora] = useState(Date.now());
  const [nomesDemo, setNomesDemo] = useState<Record<string, string>>({});
  const [salasDemo, setSalasDemo] = useState<Record<string, string>>({});
  const [editandoSala, setEditandoSala] = useState<string>();
  const [novoNomeSala, setNovoNomeSala] = useState("");
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);
  const nomes = demonstracao ? nomesDemo : config.nomes;
  const nomesSalas = demonstracao ? salasDemo : config.salas;
  const todas = useMemo(() => demonstracao ? exemplos : ordem.flatMap((id) => {
    const s = sessoes[id]; return s ? [{ ...s, estado: pedidos.some((p) => p.sessao === id) ? "aprovacao" as const : s.estado }] : [];
  }), [demonstracao, exemplos, sessoes, ordem, pedidos]);
  const todasSalas = useMemo(() => agruparSessoesDoEscritorio(todas), [todas]);
  const equipeAnterior = useRef<Map<string, string>>(new Map());
  const [equipeDesde] = useState(() => Date.now());
  const equipe = useMemo(() => {
    const ordenadas = [...todas].sort((a, b) => a.iniciadaEm.localeCompare(b.iniciadaEm)).map((s) => s.id);
    const nova = atribuirEquipe(equipeAnterior.current, ordenadas);
    equipeAnterior.current = nova;
    return nova;
  }, [todas]);
  const idVisual = (sessao: string) => equipe.get(sessao) ?? sessao;
  const livres = IDS_DA_EQUIPE.filter((id) => ![...equipe.values()].includes(id));
  const filtradas = useMemo(() => agruparSessoesDoEscritorio(filtrarSessoes(todas, ferramenta, estado), busca, nomes, nomesSalas).flatMap((s) => s.sessoes), [todas, ferramenta, estado, busca, nomes, nomesSalas]);
  const salas = useMemo(() => agruparSessoesDoEscritorio(filtradas), [filtradas]);
  const feed = useMemo(() => acontecimentosDoEscritorio(filtradas).filter(({ passo }) => tipoAtividade === "todos" || passo.tipo === tipoAtividade), [filtradas, tipoAtividade]);
  const selecionada = todas.find((s) => s.id === selecionadaId);
  const pendentes = todas.filter((s) => s.estado === "aprovacao");
  const nome = (id: string) => nomes[chaveVisual(id)] || nomeDoPersonagem(equipe.get(id) ?? id);
  const nomeSala = (id: string, padrao: string) => nomesSalas[chaveVisual(id)] || padrao || E.semNome;
  const snapshot = useMemo(() => {
    const visuais = Object.fromEntries(todas.map((s) => [s.id, nomes[chaveVisual(s.id)] || nomeDoPersonagem(equipe.get(s.id) ?? s.id)]));
    const snap = snapshotDoEscritorio(todas, visuais, demonstracao, Date.now(), equipe, equipeDesde);
    snap.rooms = snap.rooms.map((s) => ({ ...s, name: nomesSalas[chaveVisual(s.id)] || s.name, path: config.esconderDetalhes ? "" : s.path }));
    if (config.esconderDetalhes) snap.agents = snap.agents.map((a) => ({ ...a, title: undefined, recent: a.recent.map((p) => ({ ...p, text: p.tool || E.atividade, detail: undefined })), activity: a.activity ? { ...a.activity, text: a.activity.tool || E.atividade, detail: undefined } : undefined }));
    return snap;
  }, [todas, nomes, nomesSalas, demonstracao, config.esconderDetalhes, equipe, equipeDesde]);
  const registrosDemo = useMemo(() => exemplos.flatMap((s) => [
    { id: `${s.id}:inicio`, recebidoEm: s.iniciadaEm, evento: "UserPromptSubmit", sessao: s.id, cwd: s.cwd, ferramenta: s.ferramenta, dados: {} },
    ...s.passos.map((p) => ({ id: p.id, recebidoEm: p.hora, evento: p.tipo === "fim" ? "Stop" : p.tipo === "erro" ? "StopFailure" : s.estado === "aprovacao" && p === s.passos.at(-1) ? "PermissionRequest" : "PreToolUse", sessao: s.id, cwd: s.cwd, ferramenta: s.ferramenta, dados: {} })),
    ...(s.estado === "aprovacao" ? [{ id: `${s.id}:amostra`, recebidoEm: new Date().toISOString(), evento: "PostToolUse", sessao: s.id, cwd: s.cwd, ferramenta: s.ferramenta, dados: {} }] : []),
  ].flatMap((e) => { const r = registroDoEscritorio(e); return r ? [r] : []; })), [exemplos]);

  useEffect(() => {
    let desligar: (() => void) | undefined; let relogio: number | undefined;
    const sincronizar = () => {
      setVisivel(!document.hidden); desligar?.(); desligar = undefined; window.clearInterval(relogio); setConectado(false);
      if (document.hidden) return;
      setAgora(Date.now()); relogio = window.setInterval(() => setAgora(Date.now()), 60_000);
      if (!demonstracao) desligar = ouvirClaudeCode((e) => { useClaudeCode.getState().aplicar(e); useHistoricoCodigo.getState().registrar(e); }, setConectado);
    };
    sincronizar(); document.addEventListener("visibilitychange", sincronizar);
    return () => { desligar?.(); window.clearInterval(relogio); document.removeEventListener("visibilitychange", sincronizar); };
  }, [demonstracao, tentativaConexao]);
  useEffect(() => { if (selecionadaId && !todas.some((s) => s.id === selecionadaId)) setSelecionadaId(undefined); }, [selecionadaId, todas]);
  const escolher = (id: string) => {
    if (ehDaEquipe(id) && ![...equipe.values()].includes(id)) return;
    const agente = snapshot.agents.find((a) => a.id === id);
    setSelecionadaId(agente?.sessionId || agente?.parentId || id);
  };
  const renomear = (n: string) => { if (!selecionada) return; const novos = { ...nomes, [chaveVisual(selecionada.id)]: n }; if (demonstracao) setNomesDemo(novos); else definir({ nomes: novos }); };
  const filtros = <div className="ei-filtros"><label className="ei-busca"><Search size={15} /><input value={busca} onChange={(e) => setBusca(e.target.value)} aria-label={E.buscar} placeholder={E.buscar} /></label><select aria-label={E.filtroFerramenta} value={ferramenta} onChange={(e) => setFerramenta(e.target.value as FerramentaDeCodigo | "todas")}><option value="todas">{E.todas}</option>{FERRAMENTAS_DE_CODIGO.filter((f) => todas.some((s) => s.ferramenta === f)).map((f) => <option key={f} value={f}>{nomeDaFerramenta(f)}</option>)}</select><select aria-label={E.filtroEstado} value={estado} onChange={(e) => setEstado(e.target.value as EstadoSessao | "todos")}><option value="todos">{E.todosEstados}</option>{Object.entries(T.ilha.claude.estados).map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></div>;
  return <section className="escritorio-ias ei" aria-label={E.titulo} hidden={!visivel}>
    <div className="ei-barra"><div className="ei-abas" role="tablist" aria-label={E.titulo}>{([["ambiente", E.visao, FolderOpen], ["atividade", E.atividade, Activity], ["analises", E.analises, ChartNoAxesColumn], ["config", E.configuracoes, Settings]] as const).map(([id, t, Icone]) => <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}><Icone size={14} /><span>{t}</span></button>)}</div><span className="ei-conexao" role="status" data-demo={demonstracao} data-ligado={conectado}><span />{demonstracao ? E.demonstracao : conectado ? E.aoVivo : E.reconectando}{!demonstracao && !conectado && <button type="button" className="ei-conexao-tentar" aria-label={E.tentarNovamente} title={E.tentarNovamente} onClick={() => setTentativaConexao((n) => n + 1)}><RefreshCw size={12} /></button>}</span></div>
    {demonstracao && <p className="ei-demo-aviso"><Play size={14} />{E.demoDica}</p>}
    {(aba === "ambiente" || aba === "atividade") && <div className="ei-resumo">
      <dl className="ei-resumo-dados">
        <div><dt><FolderOpen size={13} aria-hidden="true" />{E.indicadores.projetos}</dt><dd>{todasSalas.length}</dd></div>
        <div><dt><Activity size={13} aria-hidden="true" />{E.indicadores.sessoes}</dt><dd>{todas.length}</dd></div>
        <div data-tipo="trabalho"><dt><span className="ei-ponto-trabalho" />{E.indicadores.trabalhando}</dt><dd>{todas.filter((s) => s.estado === "trabalhando" || s.estado === "pensando").length}</dd></div>
        <div data-tipo="pedido" data-pendente={pendentes.length > 0}><dt><Bell size={13} aria-hidden="true" />{E.indicadores.pedidos}</dt><dd><button type="button" disabled={!pendentes.length} aria-label={E.pendentes(pendentes.length)} onClick={() => { escolher(pendentes[0].id); setAba("ambiente"); }}>{pendentes.length}</button></dd></div>
      </dl><button type="button" className="ei-botao" onClick={() => setAba("config")}><Plug size={13} />{E.conectar}</button>
    </div>}
    <div className="ei-ambiente" hidden={aba !== "ambiente"}>{filtros}<div className="ei-escritorio-conectado" data-inspecao={Boolean(selecionada)}><aside className="ei-lista" aria-label={E.listaProjetos}>
      {!todas.length && <p className="ei-lista-dica">{E.prontoDica}</p>}
      {todas.length > 0 && !salas.length && <p className="ei-vazio-texto">{E.semResultados}</p>}
      {salas.map((sala) => <section key={sala.id} className="ei-projeto"><header onContextMenu={(e) => { e.preventDefault(); setEditandoSala(sala.id); setNovoNomeSala(nomeSala(sala.id, sala.projeto)); }}><FolderOpen size={14} /><h2 className="privado">{nomeSala(sala.id, sala.projeto)}</h2><span>{sala.sessoes.length}</span><button type="button" className="ei-icone" aria-label={`${E.renomearSala}: ${nomeSala(sala.id, sala.projeto)}`} onClick={() => { setEditandoSala(sala.id); setNovoNomeSala(nomeSala(sala.id, sala.projeto)); }}><Pencil size={12} /></button></header>
        {editandoSala === sala.id && <form className="ei-renomear-sala" onSubmit={(e) => { e.preventDefault(); const n = novoNomeSala.trim().slice(0, 40); if (n) { const novas = { ...nomesSalas, [chaveVisual(sala.id)]: n }; if (demonstracao) setSalasDemo(novas); else definir({ salas: novas }); } setEditandoSala(undefined); }}><input autoFocus aria-label={E.nomeSala} maxLength={40} value={novoNomeSala} onChange={(e) => setNovoNomeSala(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditandoSala(undefined); }} /><button type="submit" className="ei-botao">{E.salvarNome}</button></form>}
        {sala.sessoes.map((s) => <button type="button" key={s.id} className="ei-pessoa" data-estado={s.estado} aria-pressed={selecionada?.id === s.id} aria-label={`${nome(s.id)}, ${nomeDaFerramenta(s.ferramenta)}, ${T.ilha.claude.estados[s.estado]}`} onClick={() => escolher(s.id)}><RetratoPixel id={idVisual(s.id)} estilo={config.estilo} cor={COR_DA_FERRAMENTA[s.ferramenta]} /><span><b>{nome(s.id)}</b><small>{T.ilha.claude.estados[s.estado]}</small><small className="privado">{config.esconderDetalhes ? E.oculto : mascararSegredos(s.passos.at(-1)?.rotulo || E.semAtividade)}</small></span><Marca marca={MARCA_DA_FERRAMENTA[s.ferramenta]} tamanho={14} /></button>)}
      </section>)}
      {livres.length > 0 && !busca && <section className="ei-projeto ei-equipe"><header><Users size={14} /><h2>{E.equipe.titulo}</h2><span>{livres.length}</span></header>
        {livres.map((id) => <div key={id} className="ei-pessoa ei-pessoa-livre"><RetratoPixel id={id} estilo={config.estilo} cor="#78b7a1" /><span><b>{nomes[id] || nomeDoPersonagem(id)}</b><small>{E.equipe.livre}</small></span></div>)}
      </section>}
    </aside><CenaPixelConectada key={demonstracao ? "demo" : "real"} snapshot={snapshot} ciclo={config.ciclo} estilo={config.estilo} seguir={config.seguir} selecionada={selecionadaId ? idVisual(selecionadaId) : undefined} demonstracao={demonstracao} ativa={visivel && aba === "ambiente"} aoSelecionar={escolher} aoInteragir={() => { if (config.seguir) definir({ seguir: false }); }} />
    {selecionada && <PainelDaSessao key={selecionada.id} sessao={selecionada} nome={nome(selecionada.id)} pedido={demonstracao || !visivel || aba !== "ambiente" ? undefined : pedidos.find((p) => p.sessao === selecionada.id)} demonstracao={demonstracao} ocultar={config.esconderDetalhes} agora={agora} aoFechar={() => setSelecionadaId(undefined)} aoRenomear={renomear} aoMostrarPedido={() => definir({ esconderDetalhes: false })} />}</div></div>
    {aba === "atividade" && <>{filtros}<section className="ei-atividade"><header><h2><Activity size={16} />{E.atividade}</h2><select aria-label={E.filtroTipo} value={tipoAtividade} onChange={(e) => setTipoAtividade(e.target.value)}><option value="todos">{E.todosTipos}</option>{Object.entries(E.tipos).map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></header>{feed.slice(0, mais ? 120 : 20).map(({ sessao, passo }) => <article key={`${sessao.id}:${passo.id}`}><button type="button" className="ei-atividade-origem" onClick={() => { escolher(sessao.id); setAba("ambiente"); }}><Marca marca={MARCA_DA_FERRAMENTA[sessao.ferramenta]} tamanho={14} /><b>{nome(sessao.id)}</b><span className="privado">{sessao.projeto}</span></button><LinhaDeAtividade passo={passo} ocultar={config.esconderDetalhes} /></article>)}{!feed.length && <p className="ei-vazio-texto">{E.feedVazio}</p>}{feed.length > 20 && <button type="button" className="ei-botao" onClick={() => setMais((v) => !v)}>{mais ? E.menosAtividade : E.maisAtividade}</button>}</section></>}
    {aba === "analises" && <AnalisesDoEscritorio key={demonstracao ? "demo" : "real"} registros={demonstracao ? registrosDemo : registros} demonstracao={demonstracao} sessoes={demonstracao ? [] : todas} agora={agora} />}
    {aba === "config" && <div className="ei-configuracoes"><section className="ei-grafico"><header><h2><SlidersHorizontal size={17} />{E.preferencias}</h2></header><div className="ei-campos"><label>{E.ciclo}<select value={config.ciclo} onChange={(e) => definir({ ciclo: e.target.value as typeof config.ciclo })}><option value="auto">{E.automatico}</option><option value="day">{E.dia}</option><option value="night">{E.noite}</option></select></label><label>{E.aparencia}<select value={config.estilo} onChange={(e) => definir({ estilo: e.target.value as typeof config.estilo })}><option value="niko">{E.estiloNiko}</option><option value="original">{E.estiloOriginal}</option></select></label><label className="ei-check"><input type="checkbox" checked={config.seguir} onChange={(e) => definir({ seguir: e.target.checked })} />{E.seguir}</label></div></section>
      <section className="ei-grafico"><header><h2><ShieldCheck size={17} />{E.seguranca}</h2></header><p className="ei-nota">{E.segurancaDica}</p><label className="ei-check"><Eye size={14} /><input type="checkbox" checked={config.esconderDetalhes} onChange={(e) => definir({ esconderDetalhes: e.target.checked })} />{E.esconderDetalhes}</label><label className="ei-check"><input type="checkbox" checked={config.guardarAnalises} onChange={(e) => definir({ guardarAnalises: e.target.checked })} />{E.guardarAnalises}</label><p className="ei-nota">{E.guardarDica}</p>{confirmarLimpeza && !demonstracao ? <div className="ei-confirmacao" role="alert"><p>{E.confirmarLimpeza}</p><button type="button" className="ei-botao" onClick={() => { useEscritorioIas.getState().limpar(); setConfirmarLimpeza(false); }}>{E.limparAnalises}</button><button type="button" className="ei-botao" onClick={() => setConfirmarLimpeza(false)}>{E.cancelar}</button></div> : <button type="button" className="ei-botao" disabled={demonstracao} onClick={() => setConfirmarLimpeza(true)}><Trash2 size={14} />{E.limparAnalises}</button>}</section>
      <section className="ei-grafico ei-conexoes"><header><h2><Plug size={17} />{E.conexoes}</h2></header>{demonstracao ? <p className="ei-nota">{E.demoDica}</p> : <div className="ias vsc ei-conexoes-corpo"><ConfigDasFerramentas aoFechar={() => setAba("ambiente")} ocultarCaminhos={config.esconderDetalhes} /></div>}</section>
    </div>}
  </section>;
}
