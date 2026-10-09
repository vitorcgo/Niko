import { useEffect, useMemo, useState } from "react";
import { ChartNoAxesColumn, Clock, ShieldAlert, ListChecks, CircleX } from "lucide-react";
import { T } from "../../textos/textos";
import { Marca } from "../../marcas/Marca";
import { useConfig } from "../../estado/configuracoes";
import { lerConsumo, lerUsoOficial, type Consumo } from "../../ponte/ponteLocal";
import { nomeDaFerramenta, MARCA_DA_FERRAMENTA, COR_DA_FERRAMENTA } from "../../janelas/ilha/claude/ferramentas";
import { FERRAMENTAS_DE_CODIGO, type FerramentaDeCodigo } from "../../ponte/claudeCode";
import { analiseDoEscritorio, diaDoEscritorio, type RegistroEscritorio } from "./dadosDoEscritorio";
import type { SessaoClaude } from "../../estado/claudeCode";
import { nomeDoPersonagem } from "./sessoesDoEscritorio";
import { AtualizacaoDasMetricas } from "./AtualizacaoDasMetricas";
const E = T.escritorio.ias;
const CORES = { trabalho: "var(--destaque)", espera: "var(--alerta)", ocioso: "var(--texto-3)", erro: "var(--erro)" };
const ROTULOS = { trabalho: E.trabalho, espera: E.espera, ocioso: E.ocioso, erro: E.erro };
const ESTADOS = ["trabalho", "espera", "ocioso", "erro"] as const;
export const formatarTempoEscritorio = (ms: number) => ms < 60000 ? `${Math.round(ms / 1000)} s` : ms < 3600000 ? `${Math.round(ms / 60000)} min` : `${(ms / 3600000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

function LimitesDasFerramentas() {
  const lerPlanos = useConfig((s) => s.consumo.lerPlanos);
  const [dados, setDados] = useState<Consumo | null>(null);
  useEffect(() => {
    let vivo = true;
    let t: number | undefined;
    const ler = () => {
      window.clearTimeout(t);
      if (document.hidden || !vivo) return;
      void (lerPlanos ? lerConsumo() : lerUsoOficial()).then((r) => { if (vivo && !document.hidden) setDados(r); }).catch(() => undefined).finally(() => { if (vivo && !document.hidden) t = window.setTimeout(ler, 60000); });
    };
    document.addEventListener("visibilitychange", ler); ler();
    return () => { vivo = false; window.clearTimeout(t); document.removeEventListener("visibilitychange", ler); };
  }, [lerPlanos]);
  const disponiveis = dados?.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length) ?? [];
  return <section className="ei-grafico"><header><h3>{E.limites}</h3><p>{E.limitesDica}</p></header>{!disponiveis.length ? <p className="ei-vazio-texto">{E.limitesVazio}</p> : <div className="ei-limites">{disponiveis.map((f) => <div key={f.id}><b><Marca marca={MARCA_DA_FERRAMENTA[f.id]} tamanho={15} />{nomeDaFerramenta(f.id)}</b>{f.janelas.map((j) => <label key={j.id}>{j.rotulo}<span>{Math.max(0, Math.min(100, j.usado)).toFixed(0)}%</span><meter min={0} max={100} value={Math.max(0, Math.min(100, j.usado))} /></label>)}</div>)}</div>}</section>;
}

export function AnalisesDoEscritorio({ registros, demonstracao, sessoes = [], agora = Date.now() }: { registros: RegistroEscritorio[]; demonstracao: boolean; sessoes?: SessaoClaude[]; agora?: number }) {
  const hoje = diaDoEscritorio(Date.now());
  const [dia, setDia] = useState(hoje);
  const [ferramenta, setFerramenta] = useState<FerramentaDeCodigo | "todas">("todas");
  const [tabela, setTabela] = useState(false);
  const a = useMemo(() => analiseDoEscritorio(registros, dia, ferramenta), [registros, dia, ferramenta]);
  const dias = [...new Set([hoje, ...registros.map((r) => diaDoEscritorio(r.em))])].sort().reverse();
  const max = Math.max(1, ...a.horas.map((h) => ESTADOS.reduce((s, e) => s + h[e], 0)));
  const total = Object.values(a.estados).reduce((s, v) => s + v, 0);
  const maxProjeto = Math.max(1, ...a.projetos.map((p) => p.trabalho + p.espera));
  return <div className="ei-analises"><div className="ei-analises-topo"><div><h2><ChartNoAxesColumn size={18} />{E.analises}</h2><p>{demonstracao ? E.demoDica : E.fonte}</p></div><div><select aria-label={E.periodo} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map((d) => <option key={d} value={d}>{new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR")}</option>)}</select><select aria-label={E.filtroFerramenta} value={ferramenta} onChange={(e) => setFerramenta(e.target.value as FerramentaDeCodigo | "todas")}><option value="todas">{E.todas}</option>{FERRAMENTAS_DE_CODIGO.filter((f) => registros.some((r) => r.ferramenta === f)).map((f) => <option key={f} value={f}>{nomeDaFerramenta(f)}</option>)}</select></div></div>
    <div className="ei-indicadores">{([[E.trabalho, formatarTempoEscritorio(a.estados.trabalho), Clock], [E.espera, formatarTempoEscritorio(a.estados.espera), ShieldAlert], [E.acoesObservadas, a.acoes, ListChecks], [E.falhas, a.falhas, CircleX]] as const).map(([rotulo, valor, Icone]) => <div key={rotulo}><span><Icone size={14} />{rotulo}</span><strong>{valor}</strong></div>)}</div>
    {!a.sessoes && <p className="ei-aviso">{E.semDados}</p>}
    <div className="ei-analises-grade"><section className="ei-grafico ei-grafico-horas"><header><h3>{E.porHora}</h3><button type="button" className="ei-botao" aria-pressed={tabela} onClick={() => setTabela((v) => !v)}>{tabela ? E.grafico : E.tabela}</button></header><div className="ei-legenda">{ESTADOS.map((e) => <span key={e}><i style={{ background: CORES[e] }} />{ROTULOS[e]}</span>)}</div>
      {tabela ? <div className="ei-tabela"><table><caption>{E.porHora}</caption><thead><tr><th>{E.hora}</th>{ESTADOS.map((e) => <th key={e}>{ROTULOS[e]}</th>)}<th>{E.acoesObservadas}</th></tr></thead><tbody>{a.horas.map((h) => <tr key={h.hora}><th>{h.hora}h</th>{ESTADOS.map((e) => <td key={e}>{formatarTempoEscritorio(h[e])}</td>)}<td>{h.acoes}</td></tr>)}</tbody></table></div> : <div className="ei-colunas" role="list" aria-label={E.porHora}>{a.horas.map((h) => <div key={h.hora} role="listitem" tabIndex={0} aria-label={`${h.hora}h. ${ESTADOS.map((e) => `${ROTULOS[e]}: ${formatarTempoEscritorio(h[e])}`).join(". ")}`} title={`${h.hora}h. ${E.trabalho}: ${formatarTempoEscritorio(h.trabalho)}. ${E.espera}: ${formatarTempoEscritorio(h.espera)}`}><div className="ei-coluna">{ESTADOS.map((e) => <span key={e} style={{ height: `${h[e] / max * 100}%`, background: CORES[e] }} />)}</div><small>{h.hora % 3 === 0 ? `${h.hora}h` : ""}</small></div>)}</div>}
    </section><section className="ei-grafico"><header><h3>{E.distribuicao}</h3></header><div className="ei-distribuicao"><svg viewBox="0 0 100 100" role="img" aria-label={E.distribuicao}><circle cx="50" cy="50" r="36" fill="none" stroke="var(--borda)" strokeWidth="12" />{ESTADOS.map((e, i) => <circle key={e} cx="50" cy="50" r="36" fill="none" stroke={CORES[e]} strokeWidth="12" pathLength={100} strokeDasharray={`${total ? a.estados[e] / total * 100 : 0} 100`} strokeDashoffset={-ESTADOS.slice(0, i).reduce((s, id) => s + (total ? a.estados[id] / total * 100 : 0), 0)} transform="rotate(-90 50 50)" />)}</svg><dl>{ESTADOS.map((e) => <div key={e}><dt><i style={{ background: CORES[e] }} />{ROTULOS[e]}</dt><dd>{formatarTempoEscritorio(a.estados[e])}</dd></div>)}</dl></div></section>
      <section className="ei-grafico"><header><h3>{E.porProjeto}</h3></header>{a.projetos.length ? a.projetos.map((p) => <div className="ei-barra-projeto" key={p.id}><div><b className="privado">{p.nome || E.semNome}</b><span>{formatarTempoEscritorio(p.trabalho + p.espera)}</span></div><div className="ei-barra-trilho" role="img" aria-label={`${p.nome}. ${E.trabalho}: ${formatarTempoEscritorio(p.trabalho)}. ${E.espera}: ${formatarTempoEscritorio(p.espera)}`}><span style={{ width: `${p.trabalho / maxProjeto * 100}%`, background: CORES.trabalho }} /><span style={{ width: `${p.espera / maxProjeto * 100}%`, background: CORES.espera }} /></div><small>{E.acoesObservadas}: {p.acoes} · {E.falhas}: {p.falhas}</small></div>) : <p className="ei-vazio-texto">{E.semDados}</p>}</section>
      <section className="ei-grafico"><header><h3>{E.porFerramenta}</h3></header>{a.ferramentas.length ? a.ferramentas.map((f) => <div className="ei-ferramenta-estatistica" key={f.id}><span><Marca marca={MARCA_DA_FERRAMENTA[f.id]} tamanho={18} /><b>{nomeDaFerramenta(f.id)}</b></span><strong style={{ color: COR_DA_FERRAMENTA[f.id] }}>{formatarTempoEscritorio(f.trabalho)}</strong><small>{E.espera}: {formatarTempoEscritorio(f.espera)} · {E.acoesObservadas}: {f.acoes}</small></div>) : <p className="ei-vazio-texto">{E.semDados}</p>}</section>
      <section className="ei-grafico"><header><h3>{E.maioresEsperas}</h3></header>{a.esperas.length ? <ol className="ei-esperas">{a.esperas.map((e, i) => <li key={`${e.em}:${i}`}><span className="privado">{e.projeto || E.semNome}<small>{nomeDaFerramenta(e.ferramenta)} · {new Date(e.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span><b>{formatarTempoEscritorio(e.ms)}</b></li>)}</ol> : <p className="ei-vazio-texto">{E.semDados}</p>}</section>
      <section className="ei-grafico"><header><h3>{E.tokens} / {E.custo}</h3><p>{E.sessoesAtuais}</p></header>{sessoes.filter((s) => s.metricas && (ferramenta === "todas" || s.ferramenta === ferramenta)).map((s) => <div key={s.id} className="ei-barra-projeto"><b>{nomeDoPersonagem(s.id)} · {s.projeto}</b><dl className="ei-metadados"><div><dt>{E.entrada}</dt><dd>{s.metricas?.entrada?.toLocaleString("pt-BR") ?? E.naoInformado}</dd></div><div><dt>{E.saida}</dt><dd>{s.metricas?.saida?.toLocaleString("pt-BR") ?? E.naoInformado}</dd></div><div><dt>{E.custo}</dt><dd>{s.metricas?.custoUSD !== undefined ? s.metricas.custoUSD.toLocaleString("pt-BR", { style: "currency", currency: "USD" }) : E.naoInformado}</dd></div><div><dt>{E.contexto}</dt><dd>{s.metricas?.contexto !== undefined ? `${s.metricas.contexto.toLocaleString("pt-BR")}%` : E.naoInformado}</dd></div></dl>{s.metricas && <AtualizacaoDasMetricas metricas={s.metricas} agora={agora} />}</div>)}{!sessoes.some((s) => s.metricas && (ferramenta === "todas" || s.ferramenta === ferramenta)) && <><p>{E.naoInformado}</p><p className="ei-vazio-texto">{E.indisponivelDica}</p></>}<p className="ei-nota">{E.metricasDica}</p></section>
    </div>
    {!demonstracao && <LimitesDasFerramentas />}
    <p className="ei-nota">{E.notaAnalises}</p>
  </div>;
}
