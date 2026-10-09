import { useState } from "react";
import { Code2, FolderOpen, SquareTerminal, X, Pencil, Activity, FileText, ListChecks, Bot } from "lucide-react";
import type { SessaoClaude, PedidoDePermissao, PassoClaude } from "../../estado/claudeCode";
import { nomeDoModelo } from "../../estado/claudeCode";
import { claudeCode } from "../../ponte/claudeCode";
import { T } from "../../textos/textos";
import { Marca } from "../../marcas/Marca";
import { MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "../../janelas/ilha/claude/ferramentas";
import { indicadorDePermissoes } from "../../janelas/ilha/claude/indicadorDePermissoes";
import { PedidoDeCodigo } from "../../janelas/ilha/claude/VisaoClaude";
import { DiffCompacto } from "../../janelas/ilha/claude/DiffCompacto";
import { TextoRico } from "../../componentes/TextoRico";
import { mascararSegredos } from "./detalhesDaSessao";
import { minutosDaSessao } from "./sessoesDoEscritorio";
import { AtualizacaoDasMetricas } from "./AtualizacaoDasMetricas";
const E = T.escritorio.ias;

export function LinhaDeAtividade({ passo: p, ocultar = false }: { passo: PassoClaude; ocultar?: boolean }) {
  const alteracao = p.alteracao ? { ...p.alteracao, arquivo: mascararSegredos(p.alteracao.arquivo), trechos: p.alteracao.trechos.map((t) => ({ antes: mascararSegredos(t.antes), depois: mascararSegredos(t.depois) })) } : undefined;
  return <div className="ei-linha-atividade" data-tipo={p.tipo}>
    <time dateTime={p.hora}>{Number.isFinite(Date.parse(p.hora)) ? new Date(p.hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
    <div><b>{ocultar ? E.tipos[p.tipo] : mascararSegredos(p.rotulo)}</b>{p.resultado && <small>{p.resultado === "concluido" ? E.chamadaConcluida : E.chamadaFalhou}{p.duracaoMs !== undefined && ` · ${Math.round(p.duracaoMs)} ms`}</small>}
      {!ocultar && (p.detalhe || alteracao) && <details><summary>{E.detalhesPasso}</summary>{alteracao ? <div className="ias vsc"><DiffCompacto alteracao={alteracao} /></div> : <pre>{mascararSegredos(p.detalhe ?? "")}</pre>}</details>}
    </div>
  </div>;
}

export function PainelDaSessao({ sessao, nome, pedido, demonstracao, ocultar, agora, aoFechar, aoRenomear, aoMostrarPedido }: {
  sessao: SessaoClaude; nome: string; pedido?: PedidoDePermissao; demonstracao: boolean; ocultar: boolean; agora: number; aoFechar: () => void; aoRenomear: (nome: string) => void; aoMostrarPedido?: () => void;
}) {
  const [aba, setAba] = useState<"atividade" | "resposta" | "tarefas">("atividade");
  const [mais, setMais] = useState(false);
  const [tipo, setTipo] = useState("todos");
  const [editando, setEditando] = useState(false);
  const [novoNome, setNovoNome] = useState(nome);
  const [erro, setErro] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const indicador = indicadorDePermissoes(sessao, agora);
  const executar = async (acao: () => Promise<unknown>) => { if (demonstracao || ocupado) return; setOcupado(true); setErro(false); try { await acao(); } catch { setErro(true); } finally { setOcupado(false); } };
  const passos = [...sessao.passos].reverse().filter((p) => tipo === "todos" || p.tipo === tipo);
  return <aside className="ei-inspecao" aria-label={E.detalhes}>
    <header><div><Marca marca={MARCA_DA_FERRAMENTA[sessao.ferramenta]} tamanho={18} /><b>{nome}</b></div><button type="button" className="ei-icone" aria-label={E.fecharDetalhes} onClick={aoFechar}><X size={16} /></button></header>
    <div className="ei-inspecao-corpo">
      <div className="ei-sessao-identidade"><span className="privado">{sessao.projeto}</span><small>{nomeDaFerramenta(sessao.ferramenta)} · {T.ilha.claude.estados[sessao.estado]}</small>{!ocultar && <code className="privado">{sessao.cwd}</code>}</div>
      <dl className="ei-metadados"><div><dt>{E.tempo}</dt><dd>{E.minutos(minutosDaSessao(sessao.iniciadaEm, agora))}</dd></div><div><dt>{E.acoes}</dt><dd>{sessao.ferramentasUsadas}</dd></div><div><dt>{E.modelo}</dt><dd>{sessao.modelo ? nomeDoModelo(sessao.modelo) : E.naoInformado}</dd></div><div title={indicador.dica}><dt>{E.seguranca}</dt><dd>{indicador.texto}</dd></div></dl>
      {!demonstracao && <div className="ei-sessao-acoes"><button type="button" className="ei-botao" disabled={ocupado || !sessao.cwd} onClick={() => void executar(() => claudeCode.abrir(sessao.cwd, "pasta"))}><FolderOpen size={13} />{E.abrirPasta}</button><button type="button" className="ei-icone" disabled={ocupado || !sessao.cwd} aria-label={E.abrirEditor} onClick={() => void executar(() => claudeCode.abrir(sessao.cwd, "vscode"))}><Code2 size={15} /></button><button type="button" className="ei-icone" disabled={ocupado} aria-label={E.terminal} onClick={() => void executar(() => claudeCode.terminal(sessao.id))}><SquareTerminal size={15} /></button></div>}
      {erro && <p role="alert" className="ei-aviso">{E.acaoFalhou}</p>}
      {sessao.metricas && <><dl className="ei-metadados"><div><dt>{E.entrada}</dt><dd>{sessao.metricas.entrada?.toLocaleString("pt-BR") ?? E.naoInformado}</dd></div><div><dt>{E.saida}</dt><dd>{sessao.metricas.saida?.toLocaleString("pt-BR") ?? E.naoInformado}</dd></div><div><dt>{E.custo}</dt><dd>{sessao.metricas.custoUSD !== undefined ? sessao.metricas.custoUSD.toLocaleString("pt-BR", { style: "currency", currency: "USD" }) : E.naoInformado}</dd></div><div><dt>{E.contexto}</dt><dd>{sessao.metricas.contexto !== undefined ? `${sessao.metricas.contexto.toLocaleString("pt-BR")}%` : E.naoInformado}</dd></div></dl><p className="ei-nota">{E.metricasDica}</p></>}
      {demonstracao && <p className="ei-aviso">{E.demoDica}</p>}
      {sessao.metricas && <AtualizacaoDasMetricas metricas={sessao.metricas} agora={agora} />}
      {pedido && !demonstracao && (ocultar ? <div className="ei-aviso"><span>{E.pedidoOculto}</span>{aoMostrarPedido && <button type="button" className="ei-botao" onClick={aoMostrarPedido}>{E.mostrarPedido}</button>}</div> : <div className="ei-permissao ias vsc"><PedidoDeCodigo pedido={pedido} /></div>)}
      {!ocultar && sessao.pedido && <details className="ei-pedido"><summary>{E.pedidoAtual}</summary><pre>{mascararSegredos(sessao.pedido)}</pre></details>}
      <div className="ei-abas" role="tablist" aria-label={E.detalhes}>{([["atividade", E.atividade, Activity], ["resposta", E.resposta, FileText], ["tarefas", E.tarefas, ListChecks]] as const).map(([id, rotulo, Icone]) => <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}><Icone size={13} />{rotulo}</button>)}</div>
      {aba === "atividade" && <><select aria-label={E.filtroTipo} value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="todos">{E.todosTipos}</option>{Object.entries(E.tipos).map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select><div className="ei-timeline">{passos.slice(0, mais ? 80 : 12).map((p) => <LinhaDeAtividade key={p.id} passo={p} ocultar={ocultar} />)}{!passos.length && <p className="ei-vazio-texto">{E.semAtividade}</p>}</div>{passos.length > 12 && <button type="button" className="ei-botao" onClick={() => setMais((v) => !v)}>{mais ? E.menosAtividade : E.maisAtividade}</button>}<h3><Bot size={14} />{E.subagentes}</h3>{sessao.subagentes?.length ? sessao.subagentes.map((a) => <p key={a.id} className="ei-subagente"><b>{a.tipo || E.naoInformado}</b><span>{T.ilha.claude.estados[a.estado]}</span></p>) : <p className="ei-vazio-texto">{E.semSubagentes}</p>}</>}
      {aba === "resposta" && (ocultar ? <p className="ei-vazio-texto">{E.oculto}</p> : sessao.resposta ? <div className="ei-texto-resposta privado"><TextoRico texto={mascararSegredos(sessao.resposta)} /></div> : <p className="ei-vazio-texto">{E.naoInformado}</p>)}
      {aba === "tarefas" && <>{sessao.tarefas?.length ? <ul className="ei-tarefas">{sessao.tarefas.map((t) => <li key={t.id}><span>{ocultar ? E.oculto : mascararSegredos(t.titulo)}</span><small>{E.tarefaEstados[t.estado]}</small></li>)}</ul> : <p className="ei-vazio-texto">{E.semTarefas}</p>}</>}
    </div>
    <footer className="ei-nome-editar">{editando ? <form onSubmit={(e) => { e.preventDefault(); const n = novoNome.trim(); if (n && n.length <= 40) aoRenomear(n); setEditando(false); }}><label>{E.nomePersonagem}<input autoFocus value={novoNome} maxLength={40} onChange={(e) => setNovoNome(e.target.value)} /></label><button type="submit" disabled={!novoNome.trim()}>{E.salvarNome}</button><button type="button" aria-label={E.cancelar} onClick={() => setEditando(false)}><X size={13} /></button></form> : <button type="button" onClick={() => setEditando(true)}><Pencil size={13} />{E.renomear}</button>}<small>{E.nomeDica}</small></footer>
  </aside>;
}
