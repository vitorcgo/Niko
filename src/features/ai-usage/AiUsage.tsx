import { useCallback, useEffect, useState } from "react";
import { addDays } from "date-fns";
import { Gauge, Bot, Cpu, CalendarDays, TriangleAlert, RefreshCw, Clock, FolderOpen, Activity } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Progress, Empty, NoticeBanner } from "../../components/basics";
import { BarsHorizontal, BarsVertical } from "../../components/Charts";
import { Brand } from "../../brands/Brand";
import { useCommunication } from "../../state/communication";
import { useConfig } from "../../state/settings";
import { AGENTS } from "../../state/agents";
import { T } from "../../i18n/ptBR";
import { todayISO, toISO, scheduleRelative } from "../../utils/dates";
import { sumBy } from "../../utils/basics";
import { readUsage, type Usage } from "../../bridge/localBridge";
import { missingTo, levelUsage } from "../../utils/usage";

const number = new Intl.NumberFormat("pt-BR");
const dollar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

const level = levelUsage;

function PlansAndSession() {
  const cfg = useConfig((s) => s.consumo);
  const set = useConfig((s) => s.set);
  const [payload, setData] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setData(await readUsage(force));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cfg.lerPlanos) return;
    void update();
    const t = window.setInterval(() => !document.hidden && void update(), 5 * 60000);
    return () => window.clearInterval(t);
  }, [cfg.lerPlanos, update]);

  if (!cfg.lerPlanos)
    return (
      <Card>
        <div className="coluna" style={{ gap: 12 }}>
          <NoticeBanner tipo="alerta">
            <ul style={{ paddingLeft: 16 }}>{T.consumo.parte2Aviso.map((a) => <li key={a}>{a}</li>)}</ul>
          </NoticeBanner>
          <Button variante="primario" onClick={() => set({ consumo: { ...cfg, lerPlanos: true } })}>{T.consumo.ligarParte2}</Button>
        </div>
      </Card>
    );

  if (error && !payload) return <NoticeBanner tipo="alerta">{T.consumo.ponteFora}</NoticeBanner>;
  if (!payload) return <Card><p className="texto-3">{T.geral.carregando}</p></Card>;

  const session = payload.sessao;
  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div className="linha-entre">
        <span className="texto-3" style={{ fontSize: 12 }}>{T.conexoes.atualizado(scheduleRelative(payload.atualizadoEm))}</span>
        <Button pequeno icone={<RefreshCw size={13} className={loading ? "girando" : ""} />} disabled={loading} onClick={() => void update(true)}>{T.janelaConexao.atualizar}</Button>
      </div>
      {session && (
        <Card titulo={T.consumo.sessaoClaude} icone={<Activity size={16} />} acoes={<span className="etiqueta etiqueta-sucesso">{T.consumo.ativaHa(scheduleRelative(session.ultimaAtividade))}</span>}>
          <div className="linha texto-2" style={{ fontSize: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <FolderOpen size={13} />
            <span className="cortar">{session.projeto}</span>
            {session.modelo && <code>{session.modelo}</code>}
            {session.inicio && <span className="linha"><Clock size={12} />{T.consumo.iniciada(scheduleRelative(session.inicio))}</span>}
          </div>
          <div className="grade-metricas">
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.mensagens}</span><span className="numero-grande">{number.format(session.mensagens)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.entrada}</span><span className="numero-grande">{number.format(session.entrada)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.saida}</span><span className="numero-grande">{number.format(session.saida)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.cacheLido}</span><span className="numero-grande">{number.format(session.cacheLido)}</span></div>
            <div className="metrica cartao"><span className="rotulo-secao">{T.consumo.cacheCriado}</span><span className="numero-grande">{number.format(session.cacheCriado)}</span></div>
          </div>
        </Card>
      )}
      <div className="grade">
        {payload.ferramentas.map((f) => (
          <Card key={f.id} className="col-6" titulo={f.nome} icone={f.id === "claude" ? <Brand marca="anthropic" tamanho={16} /> : <Cpu size={16} />} acoes={f.plano ? <span className="etiqueta">{f.plano}</span> : undefined}>
            {f.situacao === "ok" ? (
              <div className="coluna" style={{ gap: 14 }}>
                {f.janelas.length === 0 && <p className="texto-3">{T.consumo.semJanelas}</p>}
                {f.janelas.map((j) => (
                  <div key={j.id} className="coluna" style={{ gap: 6 }}>
                    <div className="linha-entre">
                      <span>{T.consumo.janelas[j.rotulo as keyof typeof T.consumo.janelas] ?? j.rotulo}</span>
                      <span className="numero" style={{ fontWeight: 600 }}>{Math.round(j.usado)}%</span>
                    </div>
                    <Progress valor={j.usado / 100} nivel={level(j.usado)} rotulo={j.rotulo} />
                    <span className="texto-3" style={{ fontSize: 11 }}>{missingTo(j.reiniciaEm)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="texto-3">{T.consumo.situacoes[f.situacao]}{f.nota ? ` (${f.nota})` : ""}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AiUsage() {
  const usage = useCommunication((s) => s.usoIa);
  const setUsage = useCommunication((s) => s.setUsageAi);
  const usageStats = useConfig((s) => s.consumo);
  const names = useConfig((s) => s.agentes.nomes);
  const month = todayISO().slice(0, 7);
  const fromMonth = usage.filter((u) => u.data.startsWith(month));
  const hasPrice = usageStats.precoEntrada + usageStats.precoSaida > 0;
  const cost = sumBy(fromMonth, (u) => (u.entrada * usageStats.precoEntrada + u.saida * usageStats.precoSaida) / 1e6);
  const p = usageStats.limiteMensal > 0 ? cost / usageStats.limiteMensal : 0;
  const byModel = new Map<string, typeof usage>();
  for (const u of fromMonth) byModel.set(`${u.provedor} . ${u.modelo}`, [...(byModel.get(`${u.provedor} . ${u.modelo}`) ?? []), u]);
  const days = Array.from({ length: 30 }, (_, i) => toISO(addDays(new Date(), i - 29)));
  const totalTokens = (l: typeof usage) => sumBy(l, (u) => u.entrada + u.saida);

  return (
    <>
      <TabHeader titulo={T.consumo.titulo} subtitulo={T.consumo.subtitulo} agente="operador" />
      <h2 className="titulo-secao">{T.consumo.parte2}</h2>
      <PlansAndSession />
      <div className="linha-entre">
        <h2 className="titulo-secao">{T.consumo.parte1}</h2>
        {usage.length > 0 && <Button pequeno variante="fantasma" onClick={() => setUsage([])}>{T.consumo.limparDemo}</Button>}
      </div>
      {usage.length === 0 ? (
        <Card><Empty icone={<Gauge size={28} />} titulo={T.consumo.semUso} texto={T.consumo.semUsoDica} /></Card>
      ) : (
        <div className="grade">
          <Card className="col-3"><span className="rotulo-secao">{T.consumo.entrada}</span><div className="numero-grande">{number.format(sumBy(fromMonth, (u) => u.entrada))}</div></Card>
          <Card className="col-3"><span className="rotulo-secao">{T.consumo.saida}</span><div className="numero-grande">{number.format(sumBy(fromMonth, (u) => u.saida))}</div></Card>
          <Card className="col-3"><span className="rotulo-secao">{T.consumo.mensagens}</span><div className="numero-grande">{fromMonth.length}</div></Card>
          <Card className="col-3"><span className="rotulo-secao">{T.consumo.custo}</span><div className="numero-grande">{hasPrice ? dollar.format(cost) : "--"}</div></Card>
          {!hasPrice && <div className="col-12"><NoticeBanner>{T.consumo.semPreco}</NoticeBanner></div>}
          {hasPrice && (
            <Card className="col-12" titulo={T.consumo.limite} icone={<Gauge size={16} />}>
              <Progress valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : undefined} rotulo={T.consumo.limite} />
              <div className="linha-entre" style={{ marginTop: 6 }}>
                <span className="campo-dica">{T.consumo.limiteDica}</span>
                <span className="numero texto-2">{dollar.format(cost)} / {dollar.format(usageStats.limiteMensal)}</span>
              </div>
              {p >= 0.8 && <NoticeBanner tipo={p >= 1 ? "erro" : "alerta"}><span className="linha"><TriangleAlert size={13} />{T.consumo.pertoLimite(Math.round(p * 100))}</span></NoticeBanner>}
            </Card>
          )}
          <Card className="col-6" titulo={T.consumo.porModelo} icone={<Cpu size={16} />}>
            <BarsHorizontal formatar={(v) => number.format(v)} barras={[...byModel].map(([k, l]) => ({ rotulo: k, valor: totalTokens(l) }))} />
          </Card>
          <Card className="col-6" titulo={T.consumo.porAgente} icone={<Bot size={16} />}>
            <BarsHorizontal formatar={(v) => number.format(v)} barras={AGENTS.map((a) => ({ rotulo: names[a], valor: totalTokens(fromMonth.filter((u) => u.agenteId === a)) }))} />
          </Card>
          <Card className="col-12" titulo={T.consumo.porDia} icone={<CalendarDays size={16} />}>
            <BarsVertical formatar={(v) => number.format(v)} barras={days.map((d) => ({ rotulo: d.slice(8), valor: totalTokens(usage.filter((u) => u.data === d)) }))} />
          </Card>
        </div>
      )}
    </>
  );
}
