import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getDaysInMonth, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Undo2, Redo2, Printer, Laugh, Smile, Meh, Frown, Moon, Repeat, ListTodo, PenLine, CalendarRange, Archive, Check, Minus, Pencil } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Field, Modal, Segmented, Empty } from "../../components/basics";
import { TaskItem } from "../../components/TaskItem";
import { Editor } from "../../components/Editor";
import { BarsVertical } from "../../components/Charts";
import { useRoutine, tasksDay, habitCompleted, DAY_EMPTY } from "../../state/routine";
import { usePomodoro } from "../../state/pomodoro";
import { useInterface } from "../../state/interface";
import { useConfig } from "../../state/settings";
import { T } from "../../i18n/ptBR";
import { fromISO, formatDateString, formatDate, todayISO, toISO, isValidDate, dayMoment, isValidTime } from "../../utils/dates";
import { interpretWhen } from "../../utils/language";
import { sequenceHabit } from "../../utils/statistics";
import { EVENT_NEW } from "../../windows/desktop/useShortcuts";
import type { Habit, Mood, HabitType } from "../../types";
import { sumBy } from "../../utils/basics";
import { WaterGlass } from "./WaterGlass";
import { printMonth } from "./printing";

const ICON_MOOD: Record<Mood, React.ReactNode> = {
  otimo: <Laugh size={16} />,
  bom: <Smile size={16} />,
  neutro: <Meh size={16} />,
  dificil: <Frown size={16} />,
};

function MiniCalendar({ data, aoEscolher: onSelect }: { data: string; aoEscolher: (d: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(fromISO(data)));
  const tasks = useRoutine((s) => s.tarefas);
  const days = useRoutine((s) => s.dias);
  useEffect(() => setMonth(startOfMonth(fromISO(data))), [data]);
  const grid = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const today = todayISO();
  const hasContent = new Set([...tasks.filter((t) => t.data).map((t) => t.data as string), ...Object.entries(days).filter(([, d]) => d.diario || d.nota || d.humor).map(([k]) => k)]);

  return (
    <div className="mini-calendario">
      <div className="linha-entre">
        <Button pequeno soIcone variante="fantasma" icone={<ChevronLeft size={14} />} aria-label={T.geral.anterior} onClick={() => setMonth(addMonths(month, -1))} />
        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{formatDate(month, "MMMM yyyy")}</span>
        <Button pequeno soIcone variante="fantasma" icone={<ChevronRight size={14} />} aria-label={T.geral.proximo} onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div className="mini-calendario-grade" role="grid">
        {T.calendario.diasSemana.map((d) => (
          <span key={d} className="mini-calendario-cabecalho">{d.slice(0, 1)}</span>
        ))}
        {grid.map((d) => {
          const iso = toISO(d);
          return (
            <button
              key={iso}
              type="button"
              className="mini-calendario-dia"
              data-fora={isSameMonth(d, month) ? "nao" : "sim"}
              data-hoje={iso === today ? "sim" : "nao"}
              aria-pressed={iso === data}
              aria-label={formatDateString(iso, "d 'de' MMMM")}
              onClick={() => onSelect(iso)}
            >
              {d.getDate()}
              {hasContent.has(iso) && <span className="mini-calendario-ponto" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GridHabits({ data }: { data: string }) {
  const habits = useRoutine((s) => s.habitos).filter((h) => !h.arquivado);
  const records = useRoutine((s) => s.registros);
  const register = useRoutine((s) => s.registerHabit);
  const update = useRoutine((s) => s.updateHabit);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const month = startOfMonth(fromISO(data));
  const days = Array.from({ length: getDaysInMonth(month) }, (_, i) => toISO(addDays(month, i)));
  const today = todayISO();

  return (
    <Card
      titulo={T.journal.habitos}
      icone={<Repeat size={16} />}
      className="col-12"
      acoes={<Button pequeno icone={<Plus size={13} />} onClick={() => setCreating(true)}>{T.journal.novoHabito}</Button>}
    >
      {habits.length === 0 ? (
        <Empty titulo={T.journal.semHabitos} texto={T.journal.semHabitosDica} acao={<Button variante="primario" onClick={() => setCreating(true)}>{T.journal.novoHabito}</Button>} />
      ) : (
        <div className="tabela-rolagem">
          <table className="grade-habitos">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d} data-hoje={d === today ? "sim" : "nao"} data-selecionado={d === data ? "sim" : "nao"}>{Number(d.slice(8))}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const completed = days.filter((d) => d <= today && habitCompleted(h, records[d]?.[h.id])).length;
                const past = days.filter((d) => d <= today).length;
                return (
                  <tr key={h.id}>
                    <th className="grade-habitos-nome">
                      <div className="coluna" style={{ gap: 0 }}>
                        <span className="cortar">{h.hora ? `${h.hora} ${h.nome}` : h.nome}</span>
                        <span className="texto-3" style={{ fontSize: 10, fontWeight: 400 }}>
                          {T.journal.sequencia(sequenceHabit(h, records))} . {T.journal.doMes(past ? Math.round((completed / past) * 100) : 0)}
                        </span>
                      </div>
                    </th>
                    {days.map((d) => {
                      const value = records[d]?.[h.id] ?? 0;
                      const done = habitCompleted(h, value);
                      const future = d > today;
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            className="celula-habito"
                            data-feito={done ? "sim" : value > 0 ? "parcial" : "nao"}
                            disabled={future}
                            aria-label={`${h.nome} ${formatDateString(d, "d/MM")}${h.tipo === "quantidade" ? `: ${value} de ${h.meta}` : ""}`}
                            title={h.tipo === "quantidade" ? `${value}/${h.meta} ${h.unidade}` : undefined}
                            onClick={() => register(d, h.id, h.tipo === "sim_nao" ? (done ? 0 : 1) : value >= h.meta ? 0 : value + 1)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (h.tipo === "quantidade") register(d, h.id, value - 1);
                            }}
                          >
                            {done ? <Check size={11} strokeWidth={3} /> : h.tipo === "quantidade" && value > 0 ? value : ""}
                          </button>
                        </td>
                      );
                    })}
                    <td>
                      <div className="linha" style={{ gap: 0, flexWrap: "nowrap" }}>
                        <Button pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.journal.editarHabito} title={T.journal.editarHabito} onClick={() => setEditing(h)} />
                        <Button pequeno soIcone variante="fantasma" icone={<Archive size={13} />} aria-label={T.journal.arquivar} title={T.journal.arquivar} onClick={() => update(h.id, { arquivado: true })} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <NewHabit aberto={creating || Boolean(editing)} habito={editing} aoFechar={() => { setCreating(false); setEditing(null); }} />
    </Card>
  );
}

function NewHabit({ aberto: isOpen, habito: habit, aoFechar: onClose }: { aberto: boolean; habito?: Habit | null; aoFechar: () => void }) {
  const create = useRoutine((s) => s.createHabit);
  const update = useRoutine((s) => s.updateHabit);
  const habits = useRoutine((s) => s.habitos);
  const [nameValue, setName] = useState("");
  const [type, setType] = useState<HabitType>("sim_nao");
  const [goal, setGoal] = useState("8");
  const [unit, setUnit] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setName(habit?.nome ?? "");
      setType(habit?.tipo ?? "sim_nao");
      setGoal(habit && habit.tipo === "quantidade" ? String(habit.meta) : "8");
      setUnit(habit?.unidade ?? "");
      setTime(habit?.hora ?? "");
      setErrors({});
    }
  }, [isOpen, habit]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const newItems: Record<string, string> = {};
    const clean = nameValue.trim();
    if (!clean) newItems.nome = T.validacao.obrigatorio;
    else if (habits.some((h) => !h.arquivado && h.id !== habit?.id && h.nome.toLowerCase() === clean.toLowerCase())) newItems.nome = T.validacao.duplicado;
    const n = Number(goal);
    if (type === "quantidade" && (!Number.isInteger(n) || n < 1 || n > 1000)) newItems.meta = T.validacao.entre(1, 1000);
    if (time && !isValidTime(time)) newItems.hora = T.validacao.horaInvalida;
    setErrors(newItems);
    if (Object.keys(newItems).length) return;
    const payload = { nome: clean.slice(0, 60), tipo: type, meta: type === "quantidade" ? n : 1, unidade: unit.trim().slice(0, 20), hora: time || undefined };
    if (habit) update(habit.id, payload);
    else create(payload);
    onClose();
  };

  return (
    <Modal aberto={isOpen} titulo={habit ? T.journal.editarHabito : T.journal.novoHabito} aoFechar={onClose}>
      <form className="formulario" onSubmit={save} noValidate>
        <Field id="h-nome" rotulo={T.journal.nomeHabito} obrigatorio erro={errors.nome}>
          <input id="h-nome" className="campo" value={nameValue} maxLength={60} aria-invalid={!!errors.nome} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="h-hora" rotulo={T.journal.horaHabito} dica={T.journal.horaHabitoDica} erro={errors.hora}>
          <input id="h-hora" type="time" className="campo" value={time} aria-invalid={!!errors.hora} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.journal.tipoHabito}</span>
          <Segmented<HabitType> rotulo={T.journal.tipoHabito} valor={type} aoMudar={setType} opcoes={[{ valor: "sim_nao", rotulo: T.journal.simNao }, { valor: "quantidade", rotulo: T.journal.quantidade }]} />
        </div>
        {type === "quantidade" && (
          <div className="formulario-linha">
            <Field id="h-meta" rotulo={T.journal.meta} obrigatorio erro={errors.meta}>
              <input id="h-meta" className="campo" inputMode="numeric" value={goal} aria-invalid={!!errors.meta} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field id="h-unidade" rotulo={T.journal.unidade} dica={T.journal.unidadeExemplo}>
              <input id="h-unidade" className="campo" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{habit ? T.geral.salvar : T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Journal() {
  const parameters = useInterface((s) => s.parametros);
  const notify = useInterface((s) => s.notify);
  const [data, setData] = useState(parameters.data && /^\d{4}-\d{2}-\d{2}$/.test(parameters.data) ? parameters.data : todayISO());
  const tasks = useRoutine((s) => s.tarefas);
  const days = useRoutine((s) => s.dias);
  const createTask = useRoutine((s) => s.createTask);
  const updateDay = useRoutine((s) => s.updateDay);
  const undo = useRoutine((s) => s.undo);
  const redo = useRoutine((s) => s.redo);
  const canUndo = useRoutine((s) => s.passado.length > 0);
  const canRedo = useRoutine((s) => s.futuro.length > 0);
  const sessions = usePomodoro((s) => s.sessoes);
  const rollover = useConfig((s) => s.viradaAs4h);
  const [newTask, setNewTask] = useState("");
  const [errorTask, setErrorTask] = useState("");
  const [saved, setSaved] = useState(false);
  const day = days[data] ?? DAY_EMPTY;
  const dailyItems = tasksDay(tasks, data);
  const pomodoros = sessions.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && dayMoment(s.inicio) === data);
  const [viewWeek, setViewWeek] = useState<"dia" | "semana">("dia");

  useEffect(() => {
    if (parameters.data && /^\d{4}-\d{2}-\d{2}$/.test(parameters.data)) setData(parameters.data);
  }, [parameters.data]);

  useEffect(() => {
    const onNew = (e: Event) => {
      if ((e as CustomEvent).detail === "journal") document.getElementById("j-nova")?.focus();
    };
    window.addEventListener(EVENT_NEW, onNew);
    return () => window.removeEventListener(EVENT_NEW, onNew);
  }, []);

  const markSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const changeDay = (partial: Partial<typeof day>) => {
    updateDay(data, partial);
    markSaved();
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTask.trim();
    if (!clean) {
      setErrorTask(T.validacao.obrigatorio);
      return;
    }
    const q = interpretWhen(clean);
    createTask({ titulo: q.resto || clean, data: q.data ?? data, hora: q.hora });
    setNewTask("");
    setErrorTask("");
  };

  const month = startOfMonth(fromISO(data));
  const sleepMonth = useMemo(() => {
    const list = Array.from({ length: getDaysInMonth(month) }, (_, i) => toISO(addDays(month, i)));
    return list.map((d) => ({ rotulo: d.slice(8), valor: days[d]?.sono ?? 0, detalhe: `${formatDateString(d, "d/MM")}: ${days[d]?.sono ?? 0} h` }));
  }, [days, month]);
  const hasSleep = sleepMonth.filter((s) => s.valor > 0);
  const media = hasSleep.length ? (sumBy(hasSleep, (s) => s.valor) / hasSleep.length).toFixed(1).replace(".", ",") : "0";
  const week = eachDayOfInterval({ start: startOfWeek(fromISO(data), { weekStartsOn: 1 }), end: endOfWeek(fromISO(data), { weekStartsOn: 1 }) }).map(toISO);

  return (
    <>
      <TabHeader
        rotulo={formatDateString(data, "EEEE")}
        titulo={formatDateString(data, "d 'de' MMMM 'de' yyyy")}
        subtitulo={T.journal.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Button pequeno icone={<ChevronLeft size={13} />} onClick={() => setData(toISO(addDays(fromISO(data), -1)))}>{T.geral.anterior}</Button>
            <Button pequeno onClick={() => setData(todayISO())} disabled={data === todayISO()}>{T.journal.hoje}</Button>
            <Button pequeno onClick={() => setData(toISO(addDays(fromISO(todayISO()), -1)))}>{T.geral.ontem}</Button>
            <input type="date" className="campo" style={{ width: 160, height: 28 }} value={data} max={todayISO()} aria-label={T.journal.irParaData} onChange={(e) => isValidDate(e.target.value) && setData(e.target.value)} />
            <Button pequeno icone={<ChevronRight size={13} />} onClick={() => setData(toISO(addDays(fromISO(data), 1)))}>{T.geral.proximo}</Button>
            <Button pequeno soIcone variante="fantasma" icone={<Undo2 size={14} />} aria-label={T.geral.desfazer} title={`${T.geral.desfazer} (Ctrl + Z)`} disabled={!canUndo} onClick={undo} />
            <Button pequeno soIcone variante="fantasma" icone={<Redo2 size={14} />} aria-label={T.geral.refazer} title={`${T.geral.refazer} (Ctrl + Shift + Z)`} disabled={!canRedo} onClick={redo} />
            <Button pequeno variante="fantasma" icone={<Printer size={13} />} onClick={() => printMonth(month, () => notify(T.journal.impressao.falhou))}>{T.journal.imprimirMes}</Button>
            {rollover && <span className="etiqueta">{T.journal.viradaAtiva}</span>}
            <span className="etiqueta etiqueta-sucesso" style={{ opacity: saved ? 1 : 0, transition: "opacity 0.3s" }} aria-live="polite">{T.geral.salvo}</span>
          </>
        }
      />
      <div className="grade">
        <Card className="col-4">
          <MiniCalendar data={data} aoEscolher={setData} />
        </Card>
        <Card
          className="col-8"
          titulo={T.journal.tarefas}
          icone={<ListTodo size={16} />}
          acoes={pomodoros.length > 0 ? <span className="etiqueta">{T.journal.pomodorosDoDia(pomodoros.length, sumBy(pomodoros, (p) => p.minutos))}</span> : undefined}
        >
          {dailyItems.length === 0 ? <p className="texto-3" style={{ padding: "8px 0" }}>{T.journal.semTarefas}</p> : dailyItems.map((t) => <TaskItem key={t.id} tarefa={t} />)}
          <form onSubmit={add} className="linha" style={{ marginTop: 8, alignItems: "flex-start" }} noValidate>
            <div className="campo-grupo" style={{ flex: 1 }}>
              <input
                id="j-nova"
                className="campo"
                value={newTask}
                maxLength={200}
                placeholder={T.journal.novaTarefa}
                aria-label={T.journal.novaTarefa}
                aria-invalid={!!errorTask}
                onChange={(e) => {
                  setNewTask(e.target.value);
                  setErrorTask("");
                }}
              />
              {errorTask && <span className="campo-erro">{errorTask}</span>}
            </div>
            <Button type="submit" variante="primario" icone={<Plus size={14} />}>{T.geral.adicionar}</Button>
          </form>
        </Card>

        <Card className="col-4" titulo={T.journal.humor} icone={<Smile size={16} />}>
          <div className="segmentado" role="radiogroup" aria-label={T.journal.humor} style={{ width: "100%" }}>
            {(Object.keys(T.humor) as Mood[]).map((h) => (
              <button key={h} type="button" role="radio" aria-checked={day.humor === h} aria-selected={day.humor === h} style={{ flex: 1, justifyContent: "center" }} onClick={() => changeDay({ humor: day.humor === h ? undefined : h })}>
                {ICON_MOOD[h]}
                <span>{T.humor[h]}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="col-8" titulo={T.journal.sono} icone={<Moon size={16} />} acoes={<span className="texto-3" style={{ fontSize: 12 }}>{T.journal.mediaSono(media)}</span>}>
          <div className="linha" style={{ gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="linha">
              <Button pequeno soIcone icone={<Minus size={14} />} aria-label="-0,5" onClick={() => changeDay({ sono: Math.max(0, (day.sono ?? 0) - 0.5) })} />
              <span className="numero-grande" style={{ minWidth: 64, textAlign: "center" }}>{(day.sono ?? 0).toFixed(1).replace(".", ",")}</span>
              <Button pequeno soIcone icone={<Plus size={14} />} aria-label="+0,5" onClick={() => changeDay({ sono: Math.min(16, (day.sono ?? 0) + 0.5) })} />
              <span className="texto-3">{T.journal.horasSono}</span>
            </div>
            <label className="linha texto-2" style={{ fontSize: 12 }}>
              {T.journal.dormiu}
              <input type="time" className="campo" style={{ width: 110, height: 30 }} value={day.dormiu ?? ""} onChange={(e) => changeDay({ dormiu: e.target.value || undefined })} />
            </label>
            <label className="linha texto-2" style={{ fontSize: 12 }}>
              {T.journal.acordou}
              <input type="time" className="campo" style={{ width: 110, height: 30 }} value={day.acordou ?? ""} onChange={(e) => changeDay({ acordou: e.target.value || undefined })} />
            </label>
          </div>
          <BarsVertical barras={sleepMonth} formatar={(v) => `${v} h`} altura={90} aoEscolher={(i) => setData(toISO(addDays(month, i)))} selecionada={Number(data.slice(8)) - 1} />
        </Card>

        <WaterGlass data={data} />
        <Card className="col-8" titulo={T.journal.diario} icone={<PenLine size={16} />}>
          <Editor chave={`diario-${data}`} conteudo={day.diario} placeholder={T.journal.diarioVazio} aoMudar={(html) => changeDay({ diario: html })} />
        </Card>

        <Card
          className="col-12"
          titulo={T.journal.semana}
          icone={<CalendarRange size={16} />}
          acoes={<Segmented rotulo={T.journal.semana} valor={viewWeek} aoMudar={setViewWeek} opcoes={[{ valor: "dia", rotulo: T.journal.vistaDia }, { valor: "semana", rotulo: T.calendario.vistas.semana }]} />}
        >
          <div className="tabela-rolagem">
            <table className="tabela tabela-semana">
              <thead>
                <tr>
                  <th />
                  {(viewWeek === "semana" ? week : [data]).map((d) => (
                    <th key={d} style={{ textTransform: "capitalize" }}>{formatDateString(d, "EEE d")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["manha", "tarde", "noite"] as const).map((p) => (
                  <tr key={p}>
                    <th>{T.journal[p]}</th>
                    {(viewWeek === "semana" ? week : [data]).map((d) => (
                      <td key={d}>
                        <input
                          className="campo"
                          style={{ height: 30, minWidth: 110 }}
                          maxLength={120}
                          aria-label={`${T.journal[p]} ${format(fromISO(d), "dd/MM")}`}
                          value={(days[d] ?? DAY_EMPTY)[p]}
                          onChange={(e) => {
                            updateDay(d, { [p]: e.target.value });
                            markSaved();
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <GridHabits data={data} />
      </div>
    </>
  );
}
