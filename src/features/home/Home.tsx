import { useEffect, useMemo, useRef, useState } from "react";
import { FeaturePanel } from "./FeaturePanel";
import { blockEnabled, achievementEnabled, functionEnabled } from "../../utils/features";
import { Plus, Timer, Wallet, Plug, Layers, Gauge, Trophy, CalendarDays, Users, ListTodo, SlidersHorizontal, ToggleRight, GripVertical, ChevronRight, Cpu, Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import { useMasonry } from "../../components/useMasonry";
import { summaryByAgent } from "../../utils/aiContext";
import { readUsage, type Usage } from "../../bridge/localBridge";
import { missingTo, levelUsage, labelWindow } from "../../utils/usage";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, Button, Modal, Toggle, Progress, Empty } from "../../components/basics";
import { TaskItem } from "../../components/TaskItem";
import { Heatmap } from "../../components/Heatmap";
import { BarsHorizontal, BarsVertical, Ring } from "../../components/Charts";
import { Character } from "../../characters/Character";
import { Brand } from "../../brands/Brand";
import { useConfig, type BlockStart } from "../../state/settings";
import { useRoutine, tasksDay, habitCompleted } from "../../state/routine";
import { useStudies, reviewsToToday, cardsOverdue } from "../../state/studies";
import { usePomodoro, remainingCurrent, formatClock } from "../../state/pomodoro";
import type { PomodoroStage } from "../../types";
import { useFinances, expenseByCategory, incomeMonth, expensesMonth, partUser, balanceAccount } from "../../state/finances";
import { useCommunication } from "../../state/communication";
import { useAgents, AGENTS, stateAgent, COLOR_STATE } from "../../state/agents";
import { useAchievements, ACHIEVEMENTS } from "../../state/achievements";
import { useInterface } from "../../state/interface";
import { T } from "../../i18n/ptBR";
import { todayISO, greeting, formatDate, nowNiko, describeDistance, toISO, formatDateString, scheduleRelative, dayMoment } from "../../utils/dates";
import { formatMoney } from "../../utils/money";
import { sumBy } from "../../utils/basics";
import { minutesStudyByDay, sequenceDays } from "../../utils/statistics";
import { addDays } from "date-fns";

function extra(i: number, base: number) {
  return i >= base ? "item-extra" : "";
}

const numberShort =new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dollar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

const ICONS: Record<BlockStart, React.ReactNode> = {
  time: <Users size={16} />,
  hoje: <ListTodo size={16} />,
  foco: <Timer size={16} />,
  financas: <Wallet size={16} />,
  conexoes: <Plug size={16} />,
  revisoes: <Layers size={16} />,
  consumo: <Gauge size={16} />,
  mapa: <CalendarDays size={16} />,
  conquistas: <Trophy size={16} />,
};

const WIDTH: Record<BlockStart, string> = {
  time: "bento-12",
  hoje: "bento-4",
  foco: "bento-4",
  financas: "bento-4",
  conexoes: "bento-4",
  revisoes: "bento-4",
  consumo: "bento-4",
  conquistas: "bento-12",
  mapa: "bento-12",
};

const TITLE: Record<BlockStart, string> = {
  time: T.inicio.time,
  hoje: T.inicio.hoje,
  foco: T.inicio.foco,
  financas: T.inicio.financas,
  conexoes: T.inicio.conexoes,
  revisoes: T.inicio.revisoes,
  consumo: T.inicio.consumo,
  mapa: T.inicio.mapa,
  conquistas: T.inicio.conquistas,
};

function BlockTime() {
  const agents = useAgents();
  const names = useConfig((s) => s.agentes.nomes);
  const roles = useConfig((s) => s.agentes.cargos);
  const navigateTo = useInterface((s) => s.navigateTo);
  const tasks = useRoutine((s) => s.tarefas);
  const studies = useStudies();
  const fin = useFinances();
  const today = todayISO();
  const openItems = tasksDay(tasks, today).filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;
  const reviews = reviewsToToday(studies);
  const exam = studies.datas.filter((d) => !d.concluida && d.data >= today).sort((a, b) => a.data.localeCompare(b.data))[0];
  const expense = sumBy(expensesMonth(fin, today.slice(0, 7)), (t) => partUser(t, fin.divisoes));
  const failure = agents.alertas.find((a) => a.agenteId === "operador");

  const disabled = useConfig((s) => s.funcoesDesligadas);
  const hasTasks = functionEnabled("journal", disabled);
  const hasStudies = functionEnabled("estudos", disabled);
  const hasFinances = functionEnabled("financas", disabled);
  const dialogue = {
    organizador: hasTasks && openItems > 0 ? T.falas.organizador.bomDia(openItems) : T.falas.organizador.livre,
    tutor: !hasStudies ? T.falas.tutor.semFuncao : reviews > 0 ? T.falas.tutor.revisoes(reviews) : exam ? T.falas.tutor.prova(exam.titulo, describeDistance(exam.data)) : T.falas.tutor.livre,
    operador: failure ? failure.texto : !hasFinances ? T.falas.operador.semFuncao : expense > 0 ? T.falas.operador.gasto(formatMoney(expense)) : T.falas.operador.livre,
    java: summaryByAgent().java,
  };

  const nameValue = useConfig((s) => s.nome);
  const data = formatDate(nowNiko(), "EEEE, d 'de' MMMM");
  return (
    <div className="inicio-hero">
      <div className="coluna" style={{ gap: 2 }}>
        <span className="rotulo-pequeno">{T.inicio.rotulo}</span>
        <h1 className="titulo-pagina">{T.inicio.titulo(greeting(), nameValue || T.barraLateral.perfil)}</h1>
        <span className="texto-2" style={{ textTransform: "capitalize" }}>{data}</span>
      </div>
      <div className="inicio-time">
        {AGENTS.map((a) => {
          const state = stateAgent(agents, a);
          return (
            <button key={a} type="button" className="inicio-agente" onClick={() => navigateTo("chat", { agente: a })}>
              <Character agente={a} tamanho={52} interativo={false} halo={false} />
              <div className="inicio-agente-texto">
                <b className="cortar">{names[a]}</b>
                <span className="inicio-agente-cargo">
                  <span className="texto-3">{roles[a]}</span>
                  <span className="inicio-agente-estado cortar" style={{ ["--cor" as string]: COLOR_STATE[state] }}>{T.agentes.estados[state]}</span>
                </span>
                <span className="texto-2 privado inicio-fala">{dialogue[a]}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function BlockToday() {
  const tasks = useRoutine((s) => s.tarefas);
  const habits = useRoutine((s) => s.habitos);
  const records = useRoutine((s) => s.registros);
  const dates = useStudies((s) => s.datas);
  const openCapture = useInterface((s) => s.openCapture);
  const navigateTo = useInterface((s) => s.navigateTo);
  const today = todayISO();
  const dailyItems = tasksDay(tasks, today).filter((t) => t.status !== "cancelada");
  const pendingRequests = habits.filter((h) => !h.arquivado && !habitCompleted(h, records[today]?.[h.id]));
  const next = dates.filter((d) => !d.concluida && d.data >= today).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  const endWeek = toISO(addDays(new Date(), 7));
  const nextDays = tasks
    .filter((t) => t.data && t.data > today && t.data <= endWeek && t.status !== "concluida" && t.status !== "cancelada")
    .sort((a, b) => `${a.data}${a.hora ?? ""}`.localeCompare(`${b.data}${b.hora ?? ""}`))
    .slice(0, 8);

  if (dailyItems.length === 0 && pendingRequests.length === 0 && next.length === 0)
    return <Empty titulo={T.inicio.nadaHoje} acao={<Button variante="primario" icone={<Plus size={14} />} onClick={() => openCapture(true)}>{T.inicio.novaTarefa}</Button>} />;

  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div>
        <div className="linha-entre" style={{ marginBottom: 4 }}>
          <span className="rotulo-secao">{T.inicio.tarefasHoje}</span>
          <Button pequeno variante="fantasma" icone={<Plus size={13} />} onClick={() => openCapture(true)}>{T.inicio.novaTarefa}</Button>
        </div>
        {dailyItems.map((t) => <TaskItem key={t.id} tarefa={t} />)}
      </div>
      {pendingRequests.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.habitosPendentes}</span>
          <div className="pilulas">
            {pendingRequests.map((h) => (
              <button key={h.id} type="button" className="pilula" onClick={() => navigateTo("journal")}>{h.nome}</button>
            ))}
          </div>
        </div>
      )}
      {next.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.proximasDatas}</span>
          {next.map((d, i) => (
            <button key={d.id} type="button" className={`linha-entre lista-lateral-item ${extra(i, 3)}`} onClick={() => navigateTo("estudos", { materia: d.materiaId, aba: "datas" })}>
              <span className="cortar">{d.titulo}</span>
              <span className="etiqueta etiqueta-alerta">{describeDistance(d.data)}</span>
            </button>
          ))}
        </div>
      )}
      {nextDays.length > 0 && (
        <div className="coluna secao-extra" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.proximosDias}</span>
          {nextDays.map((t) => (
            <button key={t.id} type="button" className="linha-entre inicio-linha inicio-linha-botao item-extra" onClick={() => navigateTo("journal", { data: t.data ?? today })}>
              <span className="cortar">{t.titulo}</span>
              <span className="texto-3 numero" style={{ flex: "0 0 auto", fontSize: 12 }}>{[describeDistance(t.data!), t.hora].filter(Boolean).join(" . ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockFocus() {
  const sessions = usePomodoro((s) => s.sessoes);
  const subjects = useStudies((s) => s.materias);
  const hasStudies = useConfig((s) => functionEnabled("estudos", s.funcoesDesligadas));
  const today = todayISO();
  const dailyItems = sessions.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && dayMoment(s.inicio) === today);
  const minutes = sumBy(dailyItems, (s) => s.minutos);
  const bySubject = new Map<string, number>();
  for (const s of dailyItems) bySubject.set(s.materiaId ?? "", (bySubject.get(s.materiaId ?? "") ?? 0) + s.minutos);
  const week = Array.from({ length: 7 }, (_, i) => toISO(addDays(new Date(), i - 6)));
  const minutesDay = new Map<string, number>();
  for (const s of sessions) if (s.etapa === "foco" && s.situacao === "concluida") minutesDay.set(dayMoment(s.inicio), (minutesDay.get(dayMoment(s.inicio)) ?? 0) + s.minutos);

  return (
    <div className="coluna">
      <Stopwatch />
      <div className="foco-numeros">
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-medio">{dailyItems.length}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.pomodorosHoje}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-medio">{minutes}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.minutosFoco}</span>
        </div>
      </div>
      {hasStudies && bySubject.size > 0 && (
        <BarsHorizontal
          formatar={(v) => `${v} min`}
          barras={[...bySubject].map(([id, v]) => ({ rotulo: subjects.find((m) => m.id === id)?.nome ?? T.pomodoro.semMateria, valor: v }))}
        />
      )}
      <div className="coluna secao-extra" style={{ gap: 4 }}>
        <span className="rotulo-secao">{T.inicio.focoSemana}</span>
        <div className="item-extra">
          <BarsVertical altura={64} formatar={(v) => `${v} min`} barras={week.map((d) => ({ rotulo: formatDateString(d, "EEEEE"), valor: minutesDay.get(d) ?? 0 }))} />
        </div>
      </div>
    </div>
  );
}

const STAGES: PomodoroStage[] = ["foco", "pausa_curta", "pausa_longa"];

function Stopwatch() {
  const p = usePomodoro();
  const subjects = useStudies((s) => s.materias);
  const hasStudies = useConfig((s) => functionEnabled("estudos", s.funcoesDesligadas));
  const cycles = useConfig((s) => s.pomodoro.ciclos);
  const [now, setNow] = useState(() => Date.now());
  const started = p.rodando || p.restanteMs != null;

  useEffect(() => {
    if (!p.rodando) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [p.rodando]);

  const remaining = remainingCurrent(p, now);
  const progress = p.duracaoMs > 0 ? 1 - remaining / p.duracaoMs : 0;
  const color = p.etapa === "foco" ? "var(--destaque)" : "var(--sucesso)";

  return (
    <div className="foco-cronometro" data-rodando={p.rodando ? "sim" : "nao"}>
      <div className="foco-anel">
        <Ring progresso={started ? progress : 0} tamanho={132} espessura={8} cor={color} />
        <div className="foco-anel-centro">
          <span className="foco-relogio">{formatClock(remaining)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.pomodoro.etapas[p.etapa]}</span>
          {p.etapa === "foco" && <span className="texto-3" style={{ fontSize: 10 }}>{T.pomodoro.ciclo(p.ciclo, cycles)}</span>}
        </div>
      </div>
      <div className="foco-lado">
        <div className="segmentado foco-etapas" role="tablist">
          {STAGES.map((e) => (
            <button key={e} type="button" role="tab" aria-selected={p.etapa === e} disabled={started && p.etapa !== e} onClick={() => p.selectStage(e)}>
              {T.pomodoro.etapasCurtas[e]}
            </button>
          ))}
        </div>
        {p.etapa === "foco" && hasStudies && (
          <select className="seletor" aria-label={T.pomodoro.materia} value={p.materiaId ?? ""} onChange={(e) => p.setLink(e.target.value || undefined, p.tarefaId)}>
            <option value="">{T.pomodoro.semMateria}</option>
            {subjects.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}
        <div className="linha" style={{ gap: 6 }}>
          <Button variante={p.rodando ? "secundario" : "primario"} icone={p.rodando ? <Pause size={14} /> : <Play size={14} />} onClick={p.toggle} style={{ flex: 1 }}>
            {p.rodando ? T.pomodoro.pausar : p.restanteMs != null ? T.pomodoro.continuar : T.pomodoro.iniciar}
          </Button>
          {started && <Button soIcone icone={<RotateCcw size={14} />} aria-label={T.pomodoro.reiniciar} title={T.pomodoro.reiniciar} onClick={p.restart} />}
          <Button soIcone icone={<SkipForward size={14} />} aria-label={T.pomodoro.pular} title={T.pomodoro.pular} onClick={p.skip} />
        </div>
      </div>
    </div>
  );
}

function BlockFinances() {
  const fin = useFinances();
  const navigateTo = useInterface((s) => s.navigateTo);
  const month = todayISO().slice(0, 7);
  const expenses = expenseByCategory(fin, month);
  const inputs = sumBy(incomeMonth(fin, month), (t) => t.valor);
  const outputs = sumBy([...expenses.values()], (v) => v);
  const hasBudget = fin.categorias
    .filter((c) => c.tipo === "despesa" && c.orcamento > 0)
    .map((c) => ({ c, gasto: expenses.get(c.id) ?? 0 }))
    .sort((x, y) => y.gasto / y.c.orcamento - x.gasto / x.c.orcamento)
    .slice(0, 8);
  const last = [...fin.transacoes].filter((t) => t.data <= todayISO()).sort((x, y) => y.data.localeCompare(x.data) || y.criadaEm.localeCompare(x.criadaEm)).slice(0, 14);
  const todayDay = new Date().getDate();
  const next = fin.recorrentes.filter((r) => r.ativa).map((r) => ({ ...r, falta: (r.dia - todayDay + 31) % 31 })).sort((x, y) => x.falta - y.falta).slice(0, 6);

  return (
    <div className="coluna" style={{ gap: 14 }}>
      <div className="linha" style={{ gap: 20, flexWrap: "wrap" }}>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-grande privado" style={{ color: inputs - outputs >= 0 ? "var(--sucesso)" : "var(--erro)" }}>{formatMoney(inputs - outputs)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.saldoMes}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="privado numero">{formatMoney(inputs)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.financas.entradas}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="privado numero">{formatMoney(outputs)}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.financas.saidas}</span>
        </div>
      </div>
      {fin.contas.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.financas.abas.contas}</span>
          {fin.contas.filter((c) => !c.arquivada).slice(0, 8).map((c, i) => {
            const s = balanceAccount(fin, c.id);
            return (
              <div key={c.id} className={`linha-entre inicio-linha ${extra(i, 4)}`}>
                <span className="linha"><span className="ponto-cor" style={{ background: c.cor }} />{c.nome}</span>
                <span className="numero privado" style={{ color: s < 0 ? "var(--erro)" : undefined }}>{formatMoney(s)}</span>
              </div>
            );
          })}
        </div>
      )}
      {hasBudget.length > 0 && (
        <div className="coluna" style={{ gap: 8 }}>
          <span className="rotulo-secao">{T.financas.abas.orcamento}</span>
          {hasBudget.map(({ c, gasto: expense }, i) => {
            const p = expense / c.orcamento;
            return (
              <div key={c.id} className={`coluna ${extra(i, 3)}`} style={{ gap: 4 }}>
                <div className="linha-entre" style={{ fontSize: 12 }}>
                  <span>{c.nome}</span>
                  <span className="texto-2 numero privado">{formatMoney(expense)} / {formatMoney(c.orcamento)}</span>
                </div>
                <Progress valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso"} rotulo={c.nome} />
              </div>
            );
          })}
        </div>
      )}
      {last.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.ultimosLancamentos}</span>
          {last.map((x, i) => (
            <div key={x.id} className={`linha-entre inicio-linha ${extra(i, 4)}`}>
              <span className="cortar">{x.descricao}</span>
              <span className="numero privado" style={{ color: x.tipo === "receita" ? "var(--sucesso)" : undefined, flex: "0 0 auto" }}>{x.tipo === "receita" ? "+" : x.tipo === "despesa" ? "-" : ""}{formatMoney(x.valor)}</span>
            </div>
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.proximasContas}</span>
          {next.map((r, i) => (
            <div key={r.id} className={`linha-entre inicio-linha ${extra(i, 2)}`}>
              <span>{r.descricao}</span>
              <span className="texto-2 numero privado">{formatMoney(r.valor)} . {r.falta === 0 ? T.datas.hoje : T.datas.emDias(r.falta)}</span>
            </div>
          ))}
        </div>
      )}
      <Button pequeno variante="fantasma" onClick={() => navigateTo("financas")} icone={<ChevronRight size={13} />}>{T.rotas.financas}</Button>
    </div>
  );
}
function BlockConnections() {
  const connections = useCommunication((s) => s.conexoes);
  const openWindow = useInterface((s) => s.openWindowConnection);
  const navigateTo = useInterface((s) => s.navigateTo);
  const events = useCommunication((s) => s.eventosConexao).slice(0, 8);
  const active = connections.filter((c) => c.ligada);
  if (active.length === 0) return <Empty titulo={T.ilha.semConexoes} acao={<Button onClick={() => navigateTo("conexoes")}>{T.rotas.conexoes}</Button>} />;
  return (
    <div className="coluna" style={{ gap: 14 }}>
      <div className="lista">
        {active.map((c) => (
          <button key={c.id} type="button" className="lista-item" style={{ textAlign: "left" }} onClick={() => openWindow(c.id)}>
            <Brand marca={c.id} />
            <div className="lista-item-principal">
              <span className="lista-item-titulo">{T.conexoes.servicos[c.id].nome}</span>
              <span className="lista-item-sub privado">{c.resumo || T.conexoes.status[c.status]}</span>
            </div>
            <span className={`etiqueta ${c.status === "conectado" ? "etiqueta-sucesso" : c.status === "erro" ? "etiqueta-erro" : ""}`}>{T.conexoes.status[c.status]}</span>
          </button>
        ))}
      </div>
      {events.length > 0 && (
        <div className="coluna secao-extra" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.conexoes.eventos}</span>
          {events.map((e) => (
            <div key={e.id} className="linha inicio-linha item-extra" style={{ gap: 8 }}>
              <span className="ponto-cor" style={{ background: e.tipo === "falha" ? "var(--erro)" : e.tipo === "sucesso" ? "var(--sucesso)" : "var(--texto-3)" }} />
              <span className="cortar privado" style={{ flex: 1 }}>{e.texto}</span>
              <span className="texto-3" style={{ fontSize: 11, flex: "0 0 auto" }}>{scheduleRelative(e.data)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockReviews() {
  const studies = useStudies();
  const sessions = usePomodoro((s) => s.sessoes);
  const navigateTo = useInterface((s) => s.navigateTo);
  const n = reviewsToToday(studies);
  const overdue = cardsOverdue(studies.cartoes);
  const bySubject = studies.materias.map((m) => ({ m, q: overdue.filter((c) => c.materiaId === m.id).length })).filter((x) => x.q > 0).sort((a, b) => b.q - a.q).slice(0, 10);
  const today = todayISO();
  const content = studies.revisoesConteudo.filter((r) => !r.feita && r.data <= today).length;
  const exam = studies.datas.filter((d) => !d.concluida && d.data >= today).sort((a, b) => a.data.localeCompare(b.data))[0];
  const last = Array.from({ length: 7 }, (_, i) => toISO(addDays(new Date(), i - 6)));
  const minutes = minutesStudyByDay(sessions);
  const sequence = sequenceDays(new Set([...minutes.keys(), ...studies.registroRevisoes.filter((r) => r.quantidade > 0).map((r) => r.data)]));

  return (
    <div className="coluna" style={{ gap: 14 }}>
      <div className="linha" style={{ gap: 20 }}>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-grande">{n}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.revisoesHoje}</span>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="numero-grande">{sequence}</span>
          <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.diasSeguidos}</span>
        </div>
      </div>
      {bySubject.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.inicio.porMateria}</span>
          {bySubject.map(({ m, q }, i) => (
            <button key={m.id} type="button" className={`linha-entre inicio-linha inicio-linha-botao ${extra(i, 4)}`} onClick={() => navigateTo("estudos", { materia: m.id, aba: "revisoes" })}>
              <span className="cortar">{m.nome}</span>
              <span className="etiqueta">{q}</span>
            </button>
          ))}
        </div>
      )}
      {content > 0 && <span className="texto-2" style={{ fontSize: 12 }}>{T.inicio.conteudoPendente(content)}</span>}
      {exam && (
        <div className="linha-entre inicio-linha">
          <span className="cortar">{exam.titulo}</span>
          <span className="etiqueta etiqueta-alerta">{describeDistance(exam.data)}</span>
        </div>
      )}
      <div className="coluna inicio-revisoes-grafico">
        <span className="rotulo-secao">{T.inicio.ultimos7}</span>
        <BarsVertical altura="auto" formatar={(v) => `${v}`} barras={last.map((d) => ({ rotulo: formatDateString(d, "EEEEE"), valor: (studies.registroRevisoes.find((r) => r.data === d)?.quantidade ?? 0) + Math.round((minutes.get(d) ?? 0) / 25), detalhe: `${studies.registroRevisoes.find((r) => r.data === d)?.quantidade ?? 0} cartões, ${minutes.get(d) ?? 0} min` }))} />
      </div>
      <Button variante={n > 0 ? "primario" : "secundario"} disabled={n === 0} onClick={() => navigateTo("estudos", { aba: "revisoes", sessao: "1" })}>{T.inicio.revisar}</Button>
    </div>
  );
}
function LimitsPlans() {
  const [payload, setData] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      readUsage()
        .then((d) => alive && (setData(d), setFailed(false)))
        .catch(() => alive && setFailed(true));
    };
    read();
    const t = window.setInterval(read, 5 * 60000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  if (failed && !payload) return <span className="texto-3" style={{ fontSize: 12 }}>{T.consumo.ponteFora}</span>;
  if (!payload) return <span className="texto-3" style={{ fontSize: 12 }}>{T.geral.carregando}</span>;
  const tools = payload.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0);

  return (
    <div className="inicio-planos">
      {payload.sessao && <span className="texto-2 cortar" style={{ fontSize: 12 }}>{T.inicio.sessaoAgora(payload.sessao.projeto, payload.sessao.mensagens)}</span>}
      {tools.map((f) => (
        <div key={f.id} className="inicio-plano">
          <div className="linha-entre">
            <span className="linha" style={{ gap: 6 }}>{f.id === "claude" ? <Brand marca="anthropic" tamanho={14} /> : <Cpu size={14} />}<b>{f.nome}</b></span>
            {f.plano && <span className="etiqueta">{f.plano}</span>}
          </div>
          {f.janelas.slice(0, 2).map((j) => (
            <div key={j.id} className="inicio-plano-janela">
              <div className="linha-entre" style={{ fontSize: 12 }}>
                <span className="cortar">{labelWindow(j.rotulo)}</span>
                <span className="numero" style={{ fontWeight: 600 }}>{Math.round(j.usado)}%</span>
              </div>
              <Progress valor={j.usado / 100} nivel={levelUsage(j.usado)} rotulo={labelWindow(j.rotulo)} />
              <span className="texto-3" style={{ fontSize: 11 }}>{missingTo(j.reiniciaEm)}</span>
            </div>
          ))}
        </div>
      ))}
      {tools.length === 0 && <span className="texto-3" style={{ fontSize: 12 }}>{T.consumo.semJanelas}</span>}
    </div>
  );
}

function BlockUsage() {
  const usage = useCommunication((s) => s.usoIa);
  const usageStats = useConfig((s) => s.consumo);
  const names = useConfig((s) => s.agentes.nomes);
  const navigateTo = useInterface((s) => s.navigateTo);
  const month = todayISO().slice(0, 7);
  const fromMonth = usage.filter((u) => u.data.startsWith(month));
  const tokens = sumBy(fromMonth, (u) => u.entrada + u.saida);
  const hasPrice = usageStats.precoEntrada + usageStats.precoSaida > 0;
  const cost = sumBy(fromMonth, (u) => (u.entrada * usageStats.precoEntrada + u.saida * usageStats.precoSaida) / 1e6);
  const byModelMap = new Map<string, number>();
  for (const u of fromMonth) byModelMap.set(u.modelo, (byModelMap.get(u.modelo) ?? 0) + u.entrada + u.saida);
  const byModel = [...byModelMap].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const byAgent = AGENTS.map((a) => ({ rotulo: names[a], valor: sumBy(fromMonth.filter((u) => u.agenteId === a), (u) => u.entrada + u.saida) })).filter((b) => b.valor > 0);

  return (
    <div className="coluna" style={{ gap: 14 }}>
      {usageStats.lerPlanos ? (
        <div className="coluna" style={{ gap: 6 }}>
          <span className="rotulo-secao">{T.inicio.limitesPlanos}</span>
          <LimitsPlans />
        </div>
      ) : (
        <div className="inicio-plano">
          <span className="texto-2" style={{ fontSize: 12 }}>{T.inicio.limitesDesligados}</span>
          <Button pequeno onClick={() => navigateTo("consumo")}>{T.consumo.ligarParte2}</Button>
        </div>
      )}
      {fromMonth.length > 0 ? (
        <>
          <div className="linha" style={{ gap: 20, flexWrap: "wrap" }}>
            <div className="coluna" style={{ gap: 0 }}>
              <span className="numero-grande">{numberShort.format(tokens)}</span>
              <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.tokensMes}</span>
            </div>
            {hasPrice && (
              <div className="coluna" style={{ gap: 0 }}>
                <span className="numero-grande">{dollar.format(cost)}</span>
                <span className="texto-3" style={{ fontSize: 11 }}>{T.inicio.custoMes}</span>
              </div>
            )}
          </div>
          {byAgent.length > 0 && (
            <div className="coluna" style={{ gap: 6 }}>
              <span className="rotulo-secao">{T.inicio.porAgente}</span>
              <BarsHorizontal formatar={(v) => numberShort.format(v)} barras={byAgent} />
            </div>
          )}
          {byModel.length > 0 && (
            <div className="coluna secao-extra" style={{ gap: 4 }}>
              <span className="rotulo-secao">{T.inicio.porModelo}</span>
              {byModel.map(([m, v]) => (
                <div key={m} className="linha-entre inicio-linha item-extra">
                  <span className="cortar">{m}</span>
                  <span className="numero texto-2" style={{ flex: "0 0 auto" }}>{numberShort.format(v)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="texto-3" style={{ fontSize: 12 }}>{T.inicio.semUsoInicio}</span>
      )}
      <Button pequeno variante="fantasma" icone={<ChevronRight size={13} />} onClick={() => navigateTo("consumo")}>{T.rotas.consumo}</Button>
    </div>
  );
}

function BlockAchievements() {
  const allReached = useAchievements((s) => s.alcancadas);
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const reached = allReached.filter((a) => achievementEnabled(a.codigo, disabled));
  const navigateTo = useInterface((s) => s.navigateTo);
  const recentItems = [...reached].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  const next = ACHIEVEMENTS.filter((c) => achievementEnabled(c.codigo, disabled) && !reached.some((a) => a.codigo === c.codigo)).slice(0, 10);
  return (
    <div className="coluna" style={{ gap: 8 }}>
      {recentItems.map((a, i) => (
        <div key={`${a.codigo}-${a.nivel}`} className={`linha ${extra(i, 3)}`}>
          <Trophy size={14} color="var(--alerta)" />
          <span className="cortar">{T.conquistas.itens[a.codigo]?.nome}</span>
          <span className="etiqueta empurrar">{T.conquistas.nivel(a.nivel)}</span>
        </div>
      ))}
      {next.length > 0 && <span className="rotulo-secao" style={{ marginTop: 6 }}>{T.inicio.proximasConquistas}</span>}
      <div className="conquistas-grade">
        {next.map((c, i) => (
          <div key={c.codigo} className={`linha texto-3 conquista-proxima ${extra(i, 6)}`} title={T.conquistas.itens[c.codigo]?.regra}>
            <Trophy size={14} style={{ flex: "0 0 auto" }} />
            <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
              <span className="cortar" style={{ color: "var(--texto-2)" }}>{T.conquistas.itens[c.codigo]?.nome}</span>
              <span className="cortar" style={{ fontSize: 11 }}>{T.conquistas.itens[c.codigo]?.regra}</span>
            </span>
          </div>
        ))}
      </div>
      <Button pequeno variante="fantasma" icone={<ChevronRight size={13} />} onClick={() => navigateTo("conquistas")}>{T.rotas.conquistas}</Button>
    </div>
  );
}

const COMPONENT: Record<BlockStart, () => React.JSX.Element> = {
  time: BlockTime,
  hoje: BlockToday,
  foco: BlockFocus,
  financas: BlockFinances,
  conexoes: BlockConnections,
  revisoes: BlockReviews,
  consumo: BlockUsage,
  mapa: () => <Heatmap />,
  conquistas: BlockAchievements,
};

function LineSortable({ id, visivel: visible, aoMudar: onChange }: { id: BlockStart; visivel: boolean; aoMudar: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} className="lista-item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: "var(--superficie)" }}>
      <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={TITLE[id]} {...attributes} {...listeners} style={{ cursor: "grab" }}>
        <GripVertical size={14} />
      </button>
      {ICONS[id]}
      <span className="lista-item-principal">{TITLE[id]}</span>
      <Toggle ligado={visible} aoMudar={onChange} rotulo={TITLE[id]} />
    </div>
  );
}

export default function Home() {
  const allTheBlocks = useConfig((s) => s.blocosInicio);
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const blocks = useMemo(() => allTheBlocks.filter((b) => blockEnabled(b.id, disabled)), [allTheBlocks, disabled]);
  const set = useConfig((s) => s.set);
  const [personalizing, setPersonalizing] = useState(false);
  const [selectingFunctions, setSelectingFunctions] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  useMasonry(grid, blocks.filter((b) => b.visivel).map((b) => b.id).join());

  const onDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = allTheBlocks.findIndex((b) => b.id === e.active.id);
    const to = allTheBlocks.findIndex((b) => b.id === e.over?.id);
    set({ blocosInicio: arrayMove(allTheBlocks, from, to) });
  };

  return (
    <>
      <div className="bento" ref={grid}>
        {blocks
          .filter((b) => b.visivel)
          .map((b) => {
            const Component = COMPONENT[b.id];
            return (
              <Card key={b.id} titulo={b.id === "time" ? undefined : TITLE[b.id]} icone={ICONS[b.id]} className={`${WIDTH[b.id]} bento-cartao`} acoes={
                  b.id === "time" ? (
                    <div className="linha" style={{ gap: 4 }}>
                      <Button pequeno variante="fantasma" icone={<ToggleRight size={13} />} onClick={() => setSelectingFunctions(true)}>{T.funcoes.botao}</Button>
                      <Button pequeno variante="fantasma" icone={<SlidersHorizontal size={13} />} onClick={() => setPersonalizing(true)}>{T.inicio.personalizar}</Button>
                    </div>
                  ) : undefined
                }>
                <Component />
              </Card>
            );
          })}
      </div>
      <Modal aberto={personalizing} titulo={T.inicio.personalizarTitulo} aoFechar={() => setPersonalizing(false)}>
        <p className="campo-dica" style={{ marginBottom: 12 }}>{T.inicio.personalizarDica}</p>
        <DndContext collisionDetection={closestCenter} onDragEnd={onDrag}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="lista">
              {blocks.map((b) => (
                <LineSortable key={b.id} id={b.id} visivel={b.visivel} aoMudar={(v) => set({ blocosInicio: allTheBlocks.map((x) => (x.id === b.id ? { ...x, visivel: v } : x)) })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </Modal>
      <FeaturePanel aberto={selectingFunctions} aoFechar={() => setSelectingFunctions(false)} />
    </>
  );
}
