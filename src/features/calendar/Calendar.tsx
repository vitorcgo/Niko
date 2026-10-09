import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EventPointer } from "react";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Download, Upload, BellRing, CalendarDays, Trash2, Repeat, CornerDownLeft, Check, X, RefreshCw } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { NoticeBanner, Card, Button, Field, Modal, Segmented, Empty } from "../../components/basics";
import { openLink } from "../../desktop/desktop";
import { useGoogleCalendar } from "./useGoogleCalendar";
import { useCommunication } from "../../state/communication";
import { Brand } from "../../brands/Brand";
import { useOrganization } from "../../state/organization";
import { useRoutine } from "../../state/routine";
import { useStudies } from "../../state/studies";
import { useFinances } from "../../state/finances";
import { useInterface } from "../../state/interface";
import { T } from "../../i18n/ptBR";
import { isValidDate, fromISO, formatDateString, formatDate, todayISO, isValidTime, toISO } from "../../utils/dates";
import { downloadFile, readFileText } from "../../utils/basics";
import { EVENT_NEW } from "../../windows/desktop/useShortcuts";
import type { EventType, Recurrence, Route } from "../../types";
import { markItemDone } from "../../utils/markDone";
import { editEvent, deleteOccurrence, itemDone, itemsCalendar, readEventQuick, canMarkDone, repeatsTodoDay, type DataEvent, type ScopeEditing, type SourceCalendar, type ItemCalendar } from "../../utils/calendarItems";
import { useConfig } from "../../state/settings";
import { functionEnabled, type Feature } from "../../utils/features";

type Source = SourceCalendar;
type View = "mes" | "semana" | "agenda";
type Item = ItemCalendar;
type Editing = { evento: EventType; ocorrencia: string };
type RequestScope = { texto: string; aoEscolher: (scope: ScopeEditing) => void };

const COLOR_SOURCE: Record<Source, string> = {
  eventos: "#3b6fe0",
  tarefas: "#2f9e6b",
  habitos: "#14a3a3",
  estudos: "#a855f7",
  financas: "#d9922b",
  metas: "#e05a8a",
  google: "#4285f4",
};

const SOURCES = Object.keys(T.calendario.fontes) as Source[];
const FUNCTION_SOURCE: Record<Source, Feature> = { eventos: "calendario", tarefas: "journal", habitos: "journal", estudos: "estudos", financas: "financas", metas: "metas", google: "calendario" };
const ROUTE_SOURCE: Record<Exclude<Source, "eventos" | "google">, Route> = { tarefas: "journal", habitos: "journal", estudos: "estudos", financas: "financas", metas: "metas" };
const DISTANCE_TO_DRAG = 6;

function escapeIcs(t: string) {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function color(source: Source): CSSProperties {
  return { "--cor": COLOR_SOURCE[source] } as CSSProperties;
}

function changedSomething(e: EventType, occurrence: string, newItems: DataEvent) {
  return e.titulo !== newItems.titulo || occurrence !== newItems.data || (e.hora ?? "") !== (newItems.hora ?? "") || e.tipo !== newItems.tipo || e.repeticao !== newItems.repeticao;
}

function FormEvent({ aberto: isOpen, dataInicial: dataInitial, edicao: editing, aoSalvar: onSave, aoFechar: onClose }: { aberto: boolean; dataInicial: string; edicao: Editing | null; aoSalvar: (payload: DataEvent) => void; aoFechar: () => void }) {
  const [title, setTitle] = useState("");
  const [data, setData] = useState(dataInitial);
  const [time, setTime] = useState("");
  const [type, setType] = useState<"evento" | "lembrete">("evento");
  const [recurrence, setRecurrence] = useState<Recurrence>("nenhuma");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setTitle(editing?.evento.titulo ?? "");
    setData(editing?.ocorrencia ?? dataInitial);
    setTime(editing?.evento.hora ?? "");
    setType(editing?.evento.tipo ?? "evento");
    setRecurrence(editing?.evento.repeticao ?? "nenhuma");
    setErrors({});
  }, [isOpen, dataInitial, editing]);

  return (
    <Modal aberto={isOpen} titulo={editing ? T.calendario.editarEvento : T.calendario.novoEvento} aoFechar={onClose}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const newItems: Record<string, string> = {};
          if (!title.trim()) newItems.titulo = T.validacao.obrigatorio;
          if (!isValidDate(data)) newItems.data = T.validacao.dataInvalida;
          if (time && !isValidTime(time)) newItems.hora = T.validacao.horaInvalida;
          if (type === "lembrete" && !time) newItems.hora = T.calendario.lembreteHora;
          setErrors(newItems);
          if (Object.keys(newItems).length) return;
          onSave({ titulo: title.trim().slice(0, 120), data, hora: time || undefined, tipo: type, repeticao: recurrence });
          if (type === "lembrete" && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
        }}
      >
        <Segmented rotulo={T.calendario.tipo} valor={type} aoMudar={setType} opcoes={[{ valor: "evento", rotulo: T.calendario.evento, icone: <CalendarDays size={13} /> }, { valor: "lembrete", rotulo: T.calendario.lembrete, icone: <BellRing size={13} /> }]} />
        <Field id="ev-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={errors.titulo}>
          <input id="ev-titulo" className="campo" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="formulario-linha">
          <Field id="ev-data" rotulo={T.financas.data} obrigatorio erro={errors.data}>
            <input id="ev-data" type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <Field id="ev-hora" rotulo={T.calendario.hora} obrigatorio={type === "lembrete"} erro={errors.hora}>
            <input id="ev-hora" type="time" className="campo" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field id="ev-rep" rotulo={T.calendario.repeticao}>
            <select id="ev-rep" className="seletor" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {(Object.keys(T.calendario.repeticoes) as Recurrence[]).map((r) => <option key={r} value={r}>{T.calendario.repeticoes[r]}</option>)}
            </select>
          </Field>
        </div>
        {type === "lembrete" && <p className="campo-dica">{T.calendario.lembreteDica}</p>}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{editing ? T.geral.salvar : T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

function SelectionScope({ pedido: request, aoFechar: onClose }: { pedido: RequestScope | null; aoFechar: () => void }) {
  const select = (scope: ScopeEditing) => {
    request?.aoEscolher(scope);
    onClose();
  };
  return (
    <Modal aberto={Boolean(request)} titulo={T.calendario.escopoTitulo} aoFechar={onClose}>
      <p className="texto-2">{request?.texto}</p>
      <div className="formulario-acoes">
        <Button onClick={onClose}>{T.geral.cancelar}</Button>
        <Button onClick={() => select("todos")}>{T.calendario.emTodos}</Button>
        <Button variante="primario" onClick={() => select("este")}>{T.calendario.soNesteDia}</Button>
      </div>
    </Modal>
  );
}

function Chip({ i, feito: done, aoAbrir: onOpen, aoIniciarArraste: onStartDrag }: { i: Item; feito?: boolean; aoAbrir?: () => void; aoIniciarArraste?: (e: EventPointer<HTMLSpanElement>) => void }) {
  return (
    <span
      className="cal-chip"
      data-feito={done ? "sim" : undefined}
      style={color(i.fonte)}
      title={i.hora ? `${i.hora} ${i.titulo}` : i.titulo}
      data-editavel={onOpen ? "sim" : undefined}
      onPointerDown={onStartDrag}
      onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
    >
      {i.hora && <span className="cal-chip-hora numero">{i.hora}</span>}
      <span className="cortar privado">{i.titulo}</span>
    </span>
  );
}

function LineDay({ i, aoAbrir: onOpen, rotuloAbrir: labelOpen, aoExcluir: onDelete, feito: done, aoMarcar: onMark }: { i: Item; aoAbrir?: () => void; rotuloAbrir?: string; aoExcluir?: () => void; feito?: boolean; aoMarcar?: () => void }) {
  const text = (
    <>
      <span className="cortar privado">{i.titulo}</span>
      <span className="texto-3">{[T.calendario.fontes[i.fonte], i.evento && i.evento.repeticao !== "nenhuma" ? T.calendario.repeticoes[i.evento.repeticao] : ""].filter(Boolean).join(" . ")}</span>
    </>
  );
  return (
    <div className="cal-linha" style={color(i.fonte)} data-feito={done ? "sim" : undefined}>
      <span className="cal-linha-hora numero">{i.hora ?? ""}</span>
      <span className="cal-linha-barra" />
      {onOpen ? (
        <button type="button" className="cal-linha-texto cal-linha-abrir" title={labelOpen} aria-label={labelOpen ? `${labelOpen}: ${i.titulo}` : undefined} onClick={onOpen}>{text}</button>
      ) : (
        <div className="cal-linha-texto">{text}</div>
      )}
      {onMark && (
        <button type="button" className="cal-linha-check" aria-pressed={Boolean(done)} aria-label={done ? T.calendario.desmarcarFeito(i.titulo) : T.calendario.marcarFeito(i.titulo)} title={done ? T.calendario.desmarcarFeito(i.titulo) : T.calendario.marcarFeito(i.titulo)} onClick={onMark}>
          {done && <Check size={13} />}
        </button>
      )}
      {onDelete && <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={onDelete} />}
    </div>
  );
}

type Drag = { item: Item; inicioX: number; inicioY: number; x: number; y: number; ativo: boolean; alvo: string | null };

export default function Calendar() {
  const parameters = useInterface((s) => s.parametros);
  const notify = useInterface((s) => s.notify);
  const navigateTo = useInterface((s) => s.navigateTo);
  const events = useOrganization((s) => s.eventos);
  const goals = useOrganization((s) => s.metas);
  const createEvent = useOrganization((s) => s.createEvent);
  const updateEvent = useOrganization((s) => s.updateEvent);
  const deleteEvent = useOrganization((s) => s.deleteEvent);
  const restoreEvent = useOrganization((s) => s.restoreEvent);
  const tasks = useRoutine((s) => s.tarefas);
  const habits = useRoutine((s) => s.habitos);
  const records = useRoutine((s) => s.registros);
  const dates = useStudies((s) => s.datas);
  const reviews = useStudies((s) => s.revisoesConteudo);
  const recurring = useFinances((s) => s.recorrentes);
  const [view, setView] = useState<View>("mes");
  const [focusValue, setFocus] = useState(parameters.data && isValidDate(parameters.data) ? parameters.data : todayISO());
  const [sources, setSources] = useState<Record<Source, boolean>>({ eventos: true, tarefas: true, habitos: true, estudos: true, financas: true, metas: true, google: true });
  const [newItem, setNew] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [scope, setScope] = useState<RequestScope | null>(null);
  const [daySelected, setDaySelected] = useState(focusValue);
  const [quick, setQuick] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const endedDrag = useRef(false);
  const dragCurrent = useRef<Drag | null>(null);

  useEffect(() => {
    if (parameters.data && isValidDate(parameters.data)) {
      setFocus(parameters.data);
      setDaySelected(parameters.data);
    }
  }, [parameters.data]);

  useEffect(() => {
    const onNew = (e: Event) => {
      if ((e as CustomEvent).detail === "calendario") setNew(true);
    };
    window.addEventListener(EVENT_NEW, onNew);
    return () => window.removeEventListener(EVENT_NEW, onNew);
  }, []);

  const base = fromISO(focusValue);
  const today = todayISO();
  const interval = view === "mes"
    ? { inicio: startOfWeek(startOfMonth(base), { weekStartsOn: 1 }), fim: endOfWeek(endOfMonth(base), { weekStartsOn: 1 }) }
    : view === "semana"
      ? { inicio: startOfWeek(base, { weekStartsOn: 1 }), fim: endOfWeek(base, { weekStartsOn: 1 }) }
      : { inicio: base, fim: addDays(base, 30) };
  const startISO = toISO(interval.inicio);
  const endISO = toISO(interval.fim);

  const disabled = useConfig((s) => s.funcoesDesligadas);
  const endNext = toISO(addDays(fromISO(today), 6));
  const suggestionGoogle = useConfig((s) => s.sugestaoAgendaGoogle);
  const setConfig = useConfig((s) => s.set);
  const agendaConnected = useCommunication((s) => Boolean(s.conexoes.find((c) => c.id === "agenda")?.chaveSalva));
  const suggestGoogle = suggestionGoogle && !agendaConnected && functionEnabled("calendario", disabled);
  const agendaGoogle = useGoogleCalendar(functionEnabled("calendario", disabled) ? [[startISO, endISO], [today, endNext]] : []);
  const generate = useMemo(() => (from: string, until: string) => {
    const local = itemsCalendar({ eventos: events, tarefas: tasks, habitos: habits, datas: dates, revisoes: reviews, metas: goals, recorrentes: recurring }, from, until);
    const google: Item[] = agendaGoogle.eventos.filter((e) => e.data >= from && e.data <= until).map((e) => ({ id: `google-${e.id}`, titulo: e.titulo, data: e.data, hora: e.hora, fonte: "google", link: e.link }));
    return [...local, ...google].filter((i) => sources[i.fonte]).sort((a, b) => `${a.data}${a.hora ?? "99"}`.localeCompare(`${b.data}${b.hora ?? "99"}`));
  }, [events, tasks, habits, dates, reviews, goals, recurring, sources, disabled, agendaGoogle.eventos]);
  const items = useMemo(() => generate(startISO, endISO), [generate, startISO, endISO]);
  const nextAll = useMemo(() => generate(today, endNext), [generate, today, endNext]);
  const next = nextAll.filter((i) => !repeatsTodoDay(i));
  const journalsNext = [...new Map(nextAll.filter(repeatsTodoDay).map((i) => [i.evento?.id ?? i.habito?.id, i])).values()];
  const fromDaySelected = useMemo(() => generate(daySelected, daySelected), [generate, daySelected]);

  const hideJournals = view !== "semana";
  const byDay: Record<string, Item[]> = {};
  const journalsByDay: Record<string, number> = {};
  for (const i of items) {
    if (hideJournals && repeatsTodoDay(i)) journalsByDay[i.data] = (journalsByDay[i.data] ?? 0) + 1;
    else (byDay[i.data] ??= []).push(i);
  }
  const journalsDay = fromDaySelected.filter(repeatsTodoDay);
  const dailyItems = fromDaySelected.filter((i) => !repeatsTodoDay(i));
  const dayTodo = dailyItems.filter((i) => !i.hora);
  const hasTime = dailyItems.filter((i) => i.hora);

  const move = (n: number) => {
    const d = view === "mes" ? addMonths(base, n) : view === "semana" ? addWeeks(base, n) : addDays(base, n * 30);
    setFocus(toISO(d));
  };

  const goToToday = () => {
    setFocus(today);
    setDaySelected(today);
  };

  const exportIcs = () => {
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const rule: Record<Recurrence, string> = { nenhuma: "", diaria: "RRULE:FREQ=DAILY", semanal: "RRULE:FREQ=WEEKLY", mensal: "RRULE:FREQ=MONTHLY" };
    const body = events.map((e) => {
      const data = e.data.replace(/-/g, "");
      const start = e.hora ? `DTSTART:${data}T${e.hora.replace(":", "")}00` : `DTSTART;VALUE=DATE:${data}`;
      const exceptions = e.repeticao !== "nenhuma" ? (e.excecoes ?? []).map((x) => (e.hora ? `EXDATE:${x.replace(/-/g, "")}T${e.hora.replace(":", "")}00` : `EXDATE;VALUE=DATE:${x.replace(/-/g, "")}`)) : [];
      return ["BEGIN:VEVENT", `UID:${e.id}@niko`, `DTSTAMP:${now}`, start, `SUMMARY:${escapeIcs(e.titulo)}`, rule[e.repeticao], ...exceptions, "END:VEVENT"].filter(Boolean).join("\r\n");
    });
    downloadFile("niko-calendario.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Niko//PT-BR", ...body, "END:VCALENDAR"].join("\r\n"), "text/calendar");
  };

  const importIcs = async (file: File) => {
    try {
      const text = await readFileText(file, 2 * 1024 * 1024);
      const blocks = text.replace(/\r\n[ \t]/g, "").split("BEGIN:VEVENT").slice(1, 500);
      let n = 0;
      for (const b of blocks) {
        const summary = /SUMMARY[^:]*:(.*)/.exec(b)?.[1]?.trim().replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
        const start = /DTSTART[^:]*:(\d{8})(T(\d{4}))?/.exec(b);
        if (!summary || !start) continue;
        const data = `${start[1].slice(0, 4)}-${start[1].slice(4, 6)}-${start[1].slice(6, 8)}`;
        if (!isValidDate(data)) continue;
        const rr = /RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)/.exec(b)?.[1];
        const exceptions = [...b.matchAll(/EXDATE[^:]*:([\d,TZ]+)/g)].flatMap((m) => m[1].split(",")).map((x) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`).filter(isValidDate);
        const created = createEvent({ titulo: summary.slice(0, 120), data, hora: start[3] ? `${start[3].slice(0, 2)}:${start[3].slice(2)}` : undefined, tipo: "evento", repeticao: rr === "DAILY" ? "diaria" : rr === "WEEKLY" ? "semanal" : rr === "MONTHLY" ? "mensal" : "nenhuma" });
        if (rr && exceptions.length) updateEvent(created.id, { excecoes: exceptions.slice(0, 400) });
        n++;
      }
      notify(n ? T.calendario.importadosIcs(n) : T.validacao.arquivoInvalido);
    } catch {
      notify(T.validacao.arquivoInvalido);
    }
  };

  const createQuick = () => {
    const { titulo: title, hora: time, repeticao: recurrence } = readEventQuick(quick);
    if (!title) return;
    createEvent({ titulo: title.slice(0, 120), data: daySelected, hora: time, tipo: "evento", repeticao: recurrence });
    setQuick("");
    notify(T.calendario.criado(title));
  };

  const applyEditing = (target: Editing, newItems: DataEvent, selection: ScopeEditing, notice: string) => {
    const current = useOrganization.getState().eventos.find((e) => e.id === target.evento.id);
    if (!current) return;
    const r = editEvent(current, target.ocorrencia, newItems, selection);
    updateEvent(current.id, r.atualizar);
    if (r.criar) createEvent(r.criar);
    notify(notice);
  };

  const requestOrApply = (target: Editing, newItems: DataEvent, text: string, notice: string) => {
    if (target.evento.repeticao === "nenhuma") applyEditing(target, newItems, "todos", notice);
    else setScope({ texto: text, aoEscolher: (selection) => applyEditing(target, newItems, selection, notice) });
  };

  const saveForm = (newItems: DataEvent) => {
    const target = editing;
    closeForm();
    if (!target) {
      createEvent(newItems);
      return;
    }
    if (!changedSomething(target.evento, target.ocorrencia, newItems)) return;
    requestOrApply(target, newItems, T.calendario.escopoEditar(target.evento.titulo), T.calendario.atualizado(newItems.titulo));
  };

  const closeForm = () => {
    setNew(false);
    setEditing(null);
  };

  const openEditing = (i: Item) => {
    if (!i.evento) return;
    setDaySelected(i.data);
    setEditing({ evento: i.evento, ocorrencia: i.data });
  };

  const moveToValue = (i: Item, destination: string) => {
    if (!i.evento || destination === i.data) return;
    const e = i.evento;
    requestOrApply({ evento: e, ocorrencia: i.data }, { titulo: e.titulo, data: destination, hora: e.hora, tipo: e.tipo, repeticao: e.repeticao }, T.calendario.escopoMover(e.titulo), T.calendario.movido(e.titulo));
    setDaySelected(destination);
  };

  const remove = (i: Item) => {
    if (!i.evento) return undefined;
    const e = i.evento;
    const execute = (selection: ScopeEditing) => {
      const current = useOrganization.getState().eventos.find((x) => x.id === e.id);
      if (!current) return;
      const r = deleteOccurrence(current, i.data, selection);
      if (r === "excluir") {
        const removed = deleteEvent(current.id);
        if (removed) notify(T.geral.excluido, () => restoreEvent(removed));
        return;
      }
      const previous = current.excecoes;
      updateEvent(current.id, r);
      notify(T.geral.excluido, () => updateEvent(current.id, { excecoes: previous }));
    };
    return () => {
      if (e.repeticao === "nenhuma") execute("todos");
      else setScope({ texto: T.calendario.escopoExcluir(e.titulo), aoEscolher: execute });
    };
  };

  const openModule = (i: Item) => {
    if (i.fonte === "google") return i.link ? { rotulo: T.calendario.abrirNoGoogle, abrir: () => openLink(i.link!) } : undefined;
    if (i.fonte === "eventos") return undefined;
    const route = ROUTE_SOURCE[i.fonte];
    return { rotulo: T.calendario.abrirEm(T.rotas[route]), abrir: () => navigateTo(route, route === "journal" ? { data: i.data } : undefined) };
  };

  const propsLine = (i: Item) => {
    const moduleValue = i.evento ? { abrir: () => openEditing(i), rotulo: T.geral.editar } : openModule(i);
    const props: Parameters<typeof LineDay>[0] = { i, aoAbrir: moduleValue?.abrir, rotuloAbrir: moduleValue?.rotulo, aoExcluir: i.evento ? remove(i) : undefined };
    if (canMarkDone(i)) {
      const done = itemDone(i, records);
      props.feito = done;
      props.aoMarcar = i.habito && i.data > today ? undefined : () => markItemDone(i, !done);
    }
    return props;
  };

  const startDrag = (i: Item) => (e: EventPointer<HTMLSpanElement>) => {
    if (!i.evento || e.button !== 0) return;
    setDrag({ item: i, inicioX: e.clientX, inicioY: e.clientY, x: e.clientX, y: e.clientY, ativo: false, alvo: null });
  };

  dragCurrent.current = drag;
  const moveToCurrent = useRef(moveToValue);
  moveToCurrent.current = moveToValue;

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const a = dragCurrent.current;
      if (!a) return;
      const active = a.ativo || Math.hypot(e.clientX - a.inicioX, e.clientY - a.inicioY) > DISTANCE_TO_DRAG;
      if (!active) return;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-dia]") as HTMLElement | null;
      setDrag({ ...a, x: e.clientX, y: e.clientY, ativo: active, alvo: under?.dataset.dia ?? null });
    };
    const onRelease = () => {
      const a = dragCurrent.current;
      if (a?.ativo) {
        endedDrag.current = true;
        window.setTimeout(() => (endedDrag.current = false), 0);
        if (a.alvo) moveToCurrent.current(a.item, a.alvo);
      }
      setDrag(null);
    };
    const onCancel = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
    };
  }, [Boolean(drag)]);

  const openChip = (i: Item) => (i.evento ? () => { if (!endedDrag.current) openEditing(i); } : undefined);

  const selectDay = (iso: string) => {
    if (endedDrag.current) return;
    setDaySelected(iso);
    if (view === "mes" && !isSameMonth(fromISO(iso), base)) setFocus(iso);
  };

  const titlePeriod = view === "mes"
    ? { principal: formatDate(base, "MMMM"), secundario: formatDate(base, "yyyy") }
    : { principal: `${formatDateString(startISO, "d MMM")} . ${formatDateString(endISO, "d MMM")}`, secundario: formatDate(interval.fim, "yyyy") };

  const days = eachDayOfInterval({ start: interval.inicio, end: interval.fim });
  const weeksMonth = Math.ceil(days.length / 7);

  const groupedAgenda = Object.entries(byDay);
  const journalsPeriod = [...new Map(items.filter(repeatsTodoDay).map((i) => [i.evento?.id ?? i.habito?.id, i])).values()];
  const targetDrag = drag?.ativo ? drag.alvo : null;

  return (
    <>
      <TabHeader
        titulo={T.calendario.titulo}
        subtitulo={T.calendario.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Button pequeno variante="primario" icone={<Plus size={13} />} onClick={() => setNew(true)}>{T.calendario.novoEvento}</Button>
            <Button pequeno icone={<Download size={13} />} onClick={exportIcs} disabled={events.length === 0}>{T.calendario.exportarIcs}</Button>
            <label className="botao botao-secundario botao-pequeno" style={{ cursor: "pointer" }}>
              <Upload size={13} />
              {T.calendario.importarIcs}
              <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importIcs(f); e.target.value = ""; }} />
            </label>
          </>
        }
      />

      <div className="cal-barra">
        <div className="cal-periodo">
          <h2><span>{titlePeriod.principal}</span> <span className="texto-3">{titlePeriod.secundario}</span></h2>
          <div className="cal-navegar">
            <Button pequeno soIcone variante="fantasma" icone={<ChevronLeft size={15} />} aria-label={T.geral.anterior} onClick={() => move(-1)} />
            <Button pequeno variante="fantasma" onClick={goToToday}>{T.geral.hoje}</Button>
            <Button pequeno soIcone variante="fantasma" icone={<ChevronRight size={15} />} aria-label={T.geral.proximo} onClick={() => move(1)} />
          </div>
        </div>
        <Segmented<View> rotulo={T.calendario.titulo} valor={view} aoMudar={setView} opcoes={(Object.keys(T.calendario.vistas) as View[]).map((v) => ({ valor: v, rotulo: T.calendario.vistas[v] }))} />
        <div className="cal-filtros" role="group" aria-label={T.calendario.mostrar}>
          {SOURCES.filter((f) => functionEnabled(FUNCTION_SOURCE[f], disabled)).filter((f) => f !== "habitos" || habits.some((h) => !h.arquivado && h.hora)).filter((f) => f !== "google" || agendaGoogle.situacao !== "desligada").map((f) => (
            <button key={f} type="button" className="cal-filtro" style={color(f)} aria-pressed={sources[f]} onClick={() => setSources({ ...sources, [f]: !sources[f] })}>
              <span className="cal-filtro-ponto" />
              {T.calendario.fontes[f]}
            </button>
          ))}
          {agendaGoogle.situacao !== "desligada" && (
            <Button
              pequeno
              soIcone
              variante="fantasma"
              icone={<RefreshCw size={14} className={agendaGoogle.situacao === "carregando" ? "atualizacao-girando" : undefined} />}
              aria-label={T.calendario.atualizarGoogle}
              title={T.calendario.atualizarGoogle}
              disabled={agendaGoogle.situacao === "carregando"}
              onClick={agendaGoogle.atualizar}
            />
          )}
        </div>
      </div>

      {(agendaGoogle.situacao === "semPermissao" || agendaGoogle.situacao === "apiDesativada" || agendaGoogle.situacao === "erro") && (
        <NoticeBanner>{agendaGoogle.situacao === "semPermissao" ? T.calendario.googleSemPermissao : agendaGoogle.situacao === "apiDesativada" ? T.calendario.googleApiDesativada : T.calendario.googleErro}</NoticeBanner>
      )}

      <div className="cal-layout" data-arrastando={drag?.ativo ? "sim" : undefined}>
        <div className="cal-principal">
          {view === "mes" && (
            <div className="cal-mes" style={{ gridTemplateRows: `auto repeat(${weeksMonth}, minmax(118px, 1fr))` }}>
              {T.calendario.diasSemana.map((d, n) => <div key={d} className="cal-mes-cabecalho" data-fds={n >= 5 ? "sim" : "nao"}>{d}</div>)}
              {days.map((d, n) => {
                const iso = toISO(d);
                const list = byDay[iso] ?? [];
                const journals = journalsByDay[iso] ?? 0;
                const limit = 3;
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cal-dia"
                    data-dia={iso}
                    data-alvo={targetDrag === iso ? "sim" : undefined}
                    data-fora={!isSameMonth(d, base) ? "sim" : "nao"}
                    data-hoje={iso === today ? "sim" : "nao"}
                    data-fds={n % 7 >= 5 ? "sim" : "nao"}
                    data-passado={iso < today ? "sim" : "nao"}
                    aria-pressed={iso === daySelected}
                    aria-label={`${formatDateString(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(list.length + journals)}`}
                    onClick={() => selectDay(iso)}
                    onDoubleClick={() => { setDaySelected(iso); setNew(true); }}
                  >
                    <span className="cal-dia-topo">
                      <span className="cal-dia-numero numero">{d.getDate()}</span>
                      <span className="linha" style={{ gap: 4 }}>
                        {journals > 0 && <span className="cal-dia-diarios" title={T.calendario.diariosNoDia(journals)}><Repeat size={10} />{journals}</span>}
                        {list.length > limit && <span className="cal-dia-mais">{T.calendario.mais(list.length - limit)}</span>}
                      </span>
                    </span>
                    {list.slice(0, limit).map((i) => <Chip key={i.id} i={i} feito={itemDone(i, records)} aoAbrir={openChip(i)} aoIniciarArraste={i.evento ? startDrag(i) : undefined} />)}
                  </button>
                );
              })}
            </div>
          )}

          {view === "semana" && (
            <div className="cal-semana">
              {days.map((d, n) => {
                const iso = toISO(d);
                const list = byDay[iso] ?? [];
                return (
                  <button
                    key={iso}
                    type="button"
                    className="cal-semana-dia"
                    data-dia={iso}
                    data-alvo={targetDrag === iso ? "sim" : undefined}
                    data-hoje={iso === today ? "sim" : "nao"}
                    data-fds={n >= 5 ? "sim" : "nao"}
                    aria-pressed={iso === daySelected}
                    aria-label={`${formatDateString(iso, "d 'de' MMMM")}, ${T.calendario.itensNoDia(list.length)}`}
                    onClick={() => selectDay(iso)}
                    onDoubleClick={() => { setDaySelected(iso); setNew(true); }}
                  >
                    <span className="cal-semana-cabecalho">
                      <span className="rotulo-secao">{T.calendario.diasSemana[n]}</span>
                      <span className="cal-dia-numero numero">{d.getDate()}</span>
                    </span>
                    <span className="cal-semana-lista">
                      {list.map((i) => <Chip key={i.id} i={i} feito={itemDone(i, records)} aoAbrir={openChip(i)} aoIniciarArraste={i.evento ? startDrag(i) : undefined} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {view === "agenda" && (
            <div className="cal-agenda">
              {journalsPeriod.length > 0 && (
                <div className="cal-agenda-diarios">
                  <span className="linha texto-2" style={{ gap: 6, fontSize: 12 }}><Repeat size={13} />{T.calendario.todoDia}</span>
                  <div className="cal-agenda-chips">{journalsPeriod.map((i) => <Chip key={i.id} i={i} feito={itemDone(i, records)} aoAbrir={openChip(i)} />)}</div>
                </div>
              )}
              {groupedAgenda.length === 0 ? (
                <Card><Empty icone={<CalendarDays size={28} />} titulo={T.calendario.semItens} /></Card>
              ) : groupedAgenda.map(([day, list]) => (
                <div key={day} className="cal-agenda-dia" data-hoje={day === today ? "sim" : "nao"} data-selecionado={day === daySelected ? "sim" : "nao"}>
                  <button type="button" className="cal-agenda-data" onClick={() => setDaySelected(day)}>
                    <span className="cal-agenda-numero numero">{formatDateString(day, "d")}</span>
                    <span className="texto-2" style={{ textTransform: "capitalize" }}>{formatDateString(day, "EEE")}</span>
                    <span className="texto-3" style={{ fontSize: 11, textTransform: "capitalize" }}>{formatDateString(day, "MMM")}</span>
                  </button>
                  <div className="cal-agenda-itens">
                    {list.map((i) => <LineDay key={i.id} {...propsLine(i)} i={i} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="cal-lateral">
          {suggestGoogle && (
            <div className="cal-integracao">
              <Brand marca="agenda" tamanho={22} />
              <div className="coluna" style={{ gap: 2, minWidth: 0 }}>
                <b>{T.conexoes.servicos.agenda.nome}</b>
                <span className="texto-3">{T.calendario.integracaoTexto}</span>
              </div>
              <Button pequeno variante="primario" onClick={() => navigateTo("conexoes", { servico: "agenda" })}>{T.calendario.integracaoConectar}</Button>
              <Button pequeno soIcone variante="fantasma" icone={<X size={14} />} aria-label={T.calendario.integracaoEsconder} title={T.calendario.integracaoEsconder} onClick={() => setConfig({ sugestaoAgendaGoogle: false })} />
            </div>
          )}
          <Card className="cal-painel">
            <div className="cal-painel-topo">
              <div className="cal-painel-data">
                <span className="cal-painel-numero numero">{formatDateString(daySelected, "d")}</span>
                <div className="coluna" style={{ gap: 0 }}>
                  <b style={{ textTransform: "capitalize" }}>{formatDateString(daySelected, "EEEE")}</b>
                  <span className="texto-3" style={{ fontSize: 12, textTransform: "capitalize" }}>{formatDateString(daySelected, "MMMM yyyy")}</span>
                </div>
              </div>
              <div className="linha" style={{ gap: 6 }}>
                {daySelected === today && <span className="etiqueta etiqueta-destaque">{T.geral.hoje}</span>}
                <Button pequeno soIcone icone={<Plus size={14} />} aria-label={T.calendario.novoEvento} onClick={() => setNew(true)} />
              </div>
            </div>

            <form className="cal-rapido" onSubmit={(e) => { e.preventDefault(); createQuick(); }}>
              <input className="campo" value={quick} maxLength={140} placeholder={T.calendario.rapido} aria-label={T.calendario.rapidoRotulo} onChange={(e) => setQuick(e.target.value)} />
              <Button type="submit" pequeno soIcone variante="fantasma" icone={<CornerDownLeft size={14} />} aria-label={T.geral.criar} disabled={!quick.trim()} />
            </form>

            {dailyItems.length === 0 && journalsDay.length === 0 ? (
              <p className="texto-3 cal-painel-vazio">{T.calendario.diaLivre}</p>
            ) : (
              <div className="coluna" style={{ gap: 14 }}>
                {dayTodo.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao">{T.calendario.diaTodo}</span>
                    {dayTodo.map((i) => <LineDay key={i.id} {...propsLine(i)} i={i} />)}
                  </div>
                )}
                {hasTime.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao">{T.calendario.comHorario}</span>
                    {hasTime.map((i) => <LineDay key={i.id} {...propsLine(i)} i={i} />)}
                  </div>
                )}
                {journalsDay.length > 0 && (
                  <div className="coluna" style={{ gap: 6 }}>
                    <span className="rotulo-secao linha" style={{ gap: 6 }}><Repeat size={12} />{T.calendario.todoDia}</span>
                    {journalsDay.map((i) => <LineDay key={i.id} {...propsLine(i)} i={i} />)}
                  </div>
                )}
              </div>
            )}
            <p className="campo-dica">{T.calendario.dicaDuplo}</p>
          </Card>

          <Card titulo={T.calendario.proximos} icone={<CalendarDays size={16} />}>
            {next.length === 0 && journalsNext.length === 0 ? <p className="texto-3">{T.calendario.semProximos}</p> : (
              <div className="cal-proximos">
                {journalsNext.length > 0 && (
                  <div className="cal-proximos-diarios">
                    <Repeat size={12} />
                    <span className="cortar privado">{journalsNext.map((i) => (i.hora ? `${i.hora} ${i.titulo}` : i.titulo)).join(", ")}</span>
                  </div>
                )}
                {next.slice(0, 8).map((i) => (
                  <button key={i.id} type="button" className="cal-proximo" data-feito={itemDone(i, records) ? "sim" : undefined} style={color(i.fonte)} onClick={() => { setFocus(i.data); setDaySelected(i.data); }}>
                    <span className="cal-proximo-dia">
                      <span className="numero">{formatDateString(i.data, "d")}</span>
                      <span>{formatDateString(i.data, "EEE")}</span>
                    </span>
                    <span className="cal-linha-barra" />
                    <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
                      <span className="cortar privado">{i.titulo}</span>
                      <span className="texto-3" style={{ fontSize: 11 }}>{[i.data === today ? T.geral.hoje : "", i.hora, T.calendario.fontes[i.fonte]].filter(Boolean).join(" . ")}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
      {drag?.ativo && (
        <div className="cal-chip cal-chip-fantasma" style={{ ...color(drag.item.fonte), left: drag.x + 10, top: drag.y + 10 }} aria-hidden="true">
          {drag.item.hora && <span className="cal-chip-hora numero">{drag.item.hora}</span>}
          <span className="cortar privado">{drag.item.titulo}</span>
        </div>
      )}
      <FormEvent aberto={newItem || Boolean(editing)} dataInicial={daySelected} edicao={editing} aoSalvar={saveForm} aoFechar={closeForm} />
      <SelectionScope pedido={scope} aoFechar={() => setScope(null)} />
    </>
  );
}
