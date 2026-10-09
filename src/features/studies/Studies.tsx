import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  Plus, FileText, Kanban, CalendarClock, Layers, Link2, BarChart3, Trash2, CheckCircle2, GraduationCap, ExternalLink, Pencil, BookCheck, Flag, ListChecks, LayoutDashboard, ChevronDown, Timer, FolderOpen, Ellipsis, Search,
} from "lucide-react";
import { addDays } from "date-fns";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Field, Modal, Empty, ConfirmModal, BoxMark, Pills, NoticeBanner } from "../../components/basics";
import { Editor } from "../../components/Editor";
import { BarsHorizontal, BarsVertical } from "../../components/Charts";
import { useStudies, cardsOverdue } from "../../state/studies";
import { useRoutine } from "../../state/routine";
import { usePomodoro } from "../../state/pomodoro";
import { useInterface } from "../../state/interface";
import { useAgents } from "../../state/agents";
import { T } from "../../i18n/ptBR";
import { isValidDate, describeDistance, formatDateString, todayISO, toISO } from "../../utils/dates";
import { generateId, urlSafe } from "../../utils/basics";
import { minutesStudyByDay, sequenceDays } from "../../utils/statistics";
import { playSound } from "../../bridge/sounds";
import { EVENT_NEW } from "../../windows/desktop/useShortcuts";
import { deleteFilesSubject } from "../../bridge/files";
import { Files } from "./Files";
import type { LinkState, Subject, Priority, Task, AreaType, ImportantDateType } from "../../types";

type Tab = keyof typeof T.estudos.abas;

const ICONS_TAB: Record<Tab, React.ReactNode> = {
  anotacoes: <FileText size={14} />,
  quadro: <Kanban size={14} />,
  datas: <CalendarClock size={14} />,
  revisoes: <Layers size={14} />,
  links: <Link2 size={14} />,
  arquivos: <FolderOpen size={14} />,
  estatisticas: <BarChart3 size={14} />,
};

function NewArea({ aberto: isOpen, aoFechar: onClose }: { aberto: boolean; aoFechar: () => void }) {
  const createArea = useStudies((s) => s.createArea);
  const [nameValue, setName] = useState("");
  const [type, setType] = useState<AreaType>("faculdade");
  const [error, setError] = useState("");
  useEffect(() => {
    if (isOpen) {
      setName("");
      setError("");
    }
  }, [isOpen]);
  return (
    <Modal aberto={isOpen} titulo={T.estudos.novaArea} aoFechar={onClose}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameValue.trim()) return setError(T.validacao.obrigatorio);
          createArea(nameValue, type);
          onClose();
        }}
      >
        <Field id="a-nome" rotulo={T.estudos.nomeArea} obrigatorio erro={error}>
          <input id="a-nome" className="campo" value={nameValue} maxLength={60} aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(""); }} />
        </Field>
        <Field id="a-tipo" rotulo={T.estudos.tipoArea} dica={T.estudos.colunasDica}>
          <select id="a-tipo" className="seletor" value={type} onChange={(e) => setType(e.target.value as AreaType)}>
            {(Object.keys(T.estudos.tipos) as AreaType[]).map((t) => <option key={t} value={t}>{T.estudos.tipos[t]}</option>)}
          </select>
        </Field>
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

function NewSubject({ areaId, aberto: isOpen, aoFechar: onClose, aoCriar: onCreate }: { areaId?: string; aberto: boolean; aoFechar: () => void; aoCriar: (m: Subject) => void }) {
  const areas = useStudies((s) => s.areas);
  const create = useStudies((s) => s.createSubject);
  const [nameValue, setName] = useState("");
  const [area, setArea] = useState(areaId ?? "");
  const [semester, setSemester] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isOpen) {
      setName("");
      setSemester("");
      setArea(areaId ?? areas[0]?.id ?? "");
      setErrors({});
    }
  }, [isOpen, areaId, areas]);
  const type = areas.find((a) => a.id === area)?.tipo;
  return (
    <Modal aberto={isOpen} titulo={T.estudos.novaMateria} aoFechar={onClose}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const newItems: Record<string, string> = {};
          if (!nameValue.trim()) newItems.nome = T.validacao.obrigatorio;
          if (!area) newItems.area = T.validacao.obrigatorio;
          setErrors(newItems);
          if (Object.keys(newItems).length) return;
          onCreate(create(area, nameValue, semester.trim() || undefined));
          onClose();
        }}
      >
        <Field id="m-nome" rotulo={T.estudos.nomeMateria} obrigatorio erro={errors.nome}>
          <input id="m-nome" className="campo" value={nameValue} maxLength={80} aria-invalid={!!errors.nome} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="m-area" rotulo={T.estudos.areas} obrigatorio erro={errors.area}>
          <select id="m-area" className="seletor" value={area} onChange={(e) => setArea(e.target.value)}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Field>
        {type === "faculdade" && (
          <Field id="m-sem" rotulo={T.estudos.semestre}>
            <input id="m-sem" className="campo" value={semester} maxLength={12} placeholder="2026.2" onChange={(e) => setSemester(e.target.value)} />
          </Field>
        )}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Notes({ materia: subject, paginaInicial: pageInitial }: { materia: Subject; paginaInicial?: string }) {
  const pages = useStudies((s) => s.paginas).filter((p) => p.materiaId === subject.id);
  const create = useStudies((s) => s.createPage);
  const update = useStudies((s) => s.updatePage);
  const remove = useStudies((s) => s.deletePage);
  const markStudied = useStudies((s) => s.markStudied);
  const [current, setCurrent] = useState<string | undefined>(pageInitial ?? pages[0]?.id);
  const [confirmValue, setConfirm] = useState(false);
  const page = pages.find((p) => p.id === current) ?? pages[0];

  useEffect(() => {
    if (pageInitial) setCurrent(pageInitial);
  }, [pageInitial]);

  const tree = (parentId: string | undefined, level: number): React.ReactNode =>
    pages
      .filter((p) => p.paiId === parentId)
      .map((p) => (
        <div key={p.id}>
          <button type="button" className="lista-lateral-item" aria-current={page?.id === p.id} style={{ paddingLeft: 8 + level * 14 }} onClick={() => setCurrent(p.id)}>
            <FileText size={13} />
            <span className="cortar">{p.titulo || T.estudos.semTitulo}</span>
            {p.estudadaEm && <BookCheck size={12} className="empurrar" color="var(--sucesso)" />}
          </button>
          {tree(p.id, level + 1)}
        </div>
      ));

  return (
    <div className="duas-colunas" style={{ gridTemplateColumns: "220px minmax(0, 1fr)" }}>
      <div className="coluna" style={{ gap: 8 }}>
        <Button pequeno icone={<Plus size={13} />} onClick={() => setCurrent(create(subject.id).id)}>{T.estudos.novaPagina}</Button>
        <div className="lista-lateral">{tree(undefined, 0)}</div>
      </div>
      {!page ? (
        <Empty icone={<FileText size={28} />} titulo={T.estudos.semPaginas} acao={<Button variante="primario" onClick={() => setCurrent(create(subject.id).id)}>{T.estudos.novaPagina}</Button>} />
      ) : (
        <div className="coluna">
          <div className="linha" style={{ flexWrap: "wrap" }}>
            <input
              key={page.id}
              className="campo campo-titulo"
              defaultValue={page.titulo}
              maxLength={120}
              placeholder={T.estudos.semTitulo}
              aria-label={T.estudos.tituloPagina}
              onBlur={(e) => e.target.value !== page.titulo && update(page.id, { titulo: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <Button pequeno icone={<Plus size={13} />} onClick={() => setCurrent(create(subject.id, page.id).id)}>{T.estudos.subpagina}</Button>
            <Button
              pequeno
              variante={page.estudadaEm ? "secundario" : "primario"}
              icone={<BookCheck size={13} />}
              onClick={() => {
                markStudied(page.id);
                void playSound("proud", "personagens");
                void useAgents.getState().trabalhar("tutor", T.estudos.revisoesAgendadas, 400);
              }}
            >
              {T.estudos.marcarEstudada}
            </Button>
            <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={14} />} aria-label={T.geral.excluir} onClick={() => setConfirm(true)} />
          </div>
          {page.estudadaEm && <span className="campo-dica">{T.estudos.estudadaEm(formatDateString(page.estudadaEm, "d/MM"))}</span>}
          <Editor chave={page.id} conteudo={page.conteudo} aoMudar={(html) => update(page.id, { conteudo: html })} placeholder={T.estudos.paginaVazia} />
          <ConfirmModal
            aberto={confirmValue}
            titulo={T.geral.confirmarExclusao}
            texto={T.estudos.excluirPagina}
            aoFechar={() => setConfirm(false)}
            aoConfirmar={() => {
              remove(page.id);
              setCurrent(undefined);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CardKanban({ tarefa: task, aoAbrir: onOpen }: { tarefa: Task; aoAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const done = task.checklist.filter((c) => c.feito).length;
  return (
    <div
      ref={setNodeRef}
      className="kanban-cartao"
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.7 : 1, zIndex: isDragging ? 10 : undefined }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
        listeners?.onKeyDown?.(e);
      }}
    >
      <span className={task.status === "concluida" ? "riscado" : ""}>{task.titulo}</span>
      <div className="linha" style={{ flexWrap: "wrap", gap: 6 }}>
        {task.prioridade === "alta" && <span className="etiqueta etiqueta-erro"><Flag size={10} />{T.prioridade.alta}</span>}
        {task.data && <span className="etiqueta"><CalendarClock size={10} />{describeDistance(task.data)}</span>}
        {task.checklist.length > 0 && <span className="etiqueta"><ListChecks size={10} />{done}/{task.checklist.length}</span>}
        {task.estimativaPomodoros ? <span className="etiqueta">{task.estimativaPomodoros} x 25 min</span> : null}
      </div>
    </div>
  );
}

function KanbanColumn({ id, nome: nameValue, conclui: completes, quantidade: quantity, children, aoNovo: onNew, aoRenomear: onRename, aoExcluir: onDelete }: { id: string; nome: string; conclui: boolean; quantidade: number; children: React.ReactNode; aoNovo: () => void; aoRenomear: () => void; aoExcluir?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="kanban-coluna" data-sobre={isOver ? "sim" : "nao"}>
      <div className="linha-entre kanban-coluna-topo">
        <span className="linha" style={{ fontWeight: 500 }}>
          {completes && <CheckCircle2 size={13} color="var(--sucesso)" />}
          {nameValue}
          <span className="texto-3 numero">{quantity}</span>
        </span>
        <span className="linha" style={{ gap: 0 }}>
          <Button pequeno soIcone variante="fantasma" icone={<Pencil size={12} />} aria-label={T.geral.editar} onClick={onRename} />
          {onDelete && <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={onDelete} />}
          <Button pequeno soIcone variante="fantasma" icone={<Plus size={13} />} aria-label={T.estudos.novoCartao} onClick={onNew} />
        </span>
      </div>
      <div className="kanban-lista">{children}</div>
    </div>
  );
}

function EditCard({ tarefa: task, materia: subject, aoFechar: onClose }: { tarefa: Task | null; materia: Subject; aoFechar: () => void }) {
  const update = useRoutine((s) => s.updateTask);
  const remove = useRoutine((s) => s.deleteTask);
  const restore = useRoutine((s) => s.restoreTask);
  const notify = useInterface((s) => s.notify);
  const [payload, setData] = useState<Task | null>(task);
  const [newItem, setNewItem] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setData(task);
    setErrors({});
    setNewItem("");
  }, [task]);
  if (!payload) return <Modal aberto={false} titulo="" aoFechar={onClose}>{null}</Modal>;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const newItems: Record<string, string> = {};
    if (!payload.titulo.trim()) newItems.titulo = T.validacao.obrigatorio;
    if (payload.data && !isValidDate(payload.data)) newItems.data = T.validacao.dataInvalida;
    if (payload.estimativaPomodoros != null && (payload.estimativaPomodoros < 0 || payload.estimativaPomodoros > 40)) newItems.estimativa = T.validacao.entre(0, 40);
    setErrors(newItems);
    if (Object.keys(newItems).length) return;
    const column = subject.colunas.find((c) => c.id === payload.colunaId);
    update(payload.id, { ...payload, titulo: payload.titulo.trim(), status: column?.conclui ? "concluida" : payload.status === "concluida" ? "a_fazer" : payload.status });
    onClose();
  };

  return (
    <Modal aberto={!!task} titulo={T.estudos.cartao} aoFechar={onClose} largo>
      <form className="formulario" onSubmit={save} noValidate>
        <Field id="k-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={errors.titulo}>
          <input id="k-titulo" className="campo" value={payload.titulo} maxLength={200} aria-invalid={!!errors.titulo} onChange={(e) => setData({ ...payload, titulo: e.target.value })} />
        </Field>
        <Field id="k-desc" rotulo={T.financas.descricao}>
          <textarea id="k-desc" className="area-texto" value={payload.descricao} maxLength={2000} onChange={(e) => setData({ ...payload, descricao: e.target.value })} />
        </Field>
        <div className="formulario-linha">
          <Field id="k-coluna" rotulo={T.estudos.coluna}>
            <select id="k-coluna" className="seletor" value={payload.colunaId ?? subject.colunas[0]?.id} onChange={(e) => setData({ ...payload, colunaId: e.target.value })}>
              {subject.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field id="k-prazo" rotulo={T.estudos.prazo} erro={errors.data} dica={T.estudos.prazoDica}>
            <input id="k-prazo" type="date" className="campo" value={payload.data ?? ""} aria-invalid={!!errors.data} onChange={(e) => setData({ ...payload, data: e.target.value || undefined })} />
          </Field>
          <Field id="k-prioridade" rotulo={T.estudos.prioridade}>
            <select id="k-prioridade" className="seletor" value={payload.prioridade} onChange={(e) => setData({ ...payload, prioridade: e.target.value as Priority })}>
              {(Object.keys(T.prioridade) as Priority[]).map((p) => <option key={p} value={p}>{T.prioridade[p]}</option>)}
            </select>
          </Field>
          <Field id="k-est" rotulo={T.estudos.estimativa} erro={errors.estimativa}>
            <input id="k-est" className="campo" inputMode="numeric" value={payload.estimativaPomodoros ?? ""} aria-invalid={!!errors.estimativa} onChange={(e) => setData({ ...payload, estimativaPomodoros: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : undefined })} />
          </Field>
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.estudos.checklist}</span>
          {payload.checklist.map((item) => (
            <div key={item.id} className="linha">
              <BoxMark marcada={item.feito} rotulo={item.texto} aoMudar={(v) => setData({ ...payload, checklist: payload.checklist.map((c) => (c.id === item.id ? { ...c, feito: v } : c)) })} />
              <span className={`cortar ${item.feito ? "riscado" : ""}`} style={{ flex: 1 }}>{item.texto}</span>
              <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => setData({ ...payload, checklist: payload.checklist.filter((c) => c.id !== item.id) })} />
            </div>
          ))}
          <div className="linha">
            <input
              className="campo"
              value={newItem}
              maxLength={120}
              placeholder={T.estudos.novoItem}
              aria-label={T.estudos.novoItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!newItem.trim()) return;
                  setData({ ...payload, checklist: [...payload.checklist, { id: generateId(), texto: newItem.trim(), feito: false }] });
                  setNewItem("");
                }
              }}
            />
          </div>
        </div>
        <div className="formulario-acoes" style={{ justifyContent: "space-between" }}>
          <Button
            variante="perigo"
            icone={<Trash2 size={14} />}
            onClick={() => {
              const r = remove(payload.id);
              if (r) notify(T.geral.excluido, () => restore(r));
              onClose();
            }}
          >
            {T.geral.excluir}
          </Button>
          <span className="linha">
            <Button onClick={onClose}>{T.geral.cancelar}</Button>
            <Button type="submit" variante="primario">{T.geral.salvar}</Button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function Board({ materia: subject }: { materia: Subject }) {
  const tasks = useRoutine((s) => s.tarefas).filter((t) => t.materiaId === subject.id);
  const create = useRoutine((s) => s.createTask);
  const updateTask = useRoutine((s) => s.updateTask);
  const updateSubject = useStudies((s) => s.updateSubject);
  const [isOpen, setOpen] = useState<Task | null>(null);
  const [rename, setRename] = useState<{ id: string | null; nome: string; conclui: boolean } | null>(null);
  const [errorColumn, setErrorColumn] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const first = subject.colunas[0]?.id;

  const onRelease = (e: DragEndEvent) => {
    if (!e.over) return;
    const column = subject.colunas.find((c) => c.id === e.over?.id);
    const task = tasks.find((t) => t.id === e.active.id);
    if (!column || !task || (task.colunaId ?? first) === column.id) return;
    updateTask(task.id, {
      colunaId: column.id,
      status: column.conclui ? "concluida" : task.status === "concluida" ? "a_fazer" : task.status,
      concluidaEm: column.conclui ? new Date().toISOString() : undefined,
    });
    void playSound(column.conclui ? "finish" : "blip", column.conclui ? "personagens" : "interface");
  };

  const saveColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rename) return;
    const nameValue = rename.nome.trim();
    if (!nameValue) return setErrorColumn(T.validacao.obrigatorio);
    const columns = rename.id
      ? subject.colunas.map((c) => (c.id === rename.id ? { ...c, nome: nameValue, conclui: rename.conclui } : c))
      : [...subject.colunas, { id: generateId(), nome: nameValue, conclui: rename.conclui }];
    updateSubject(subject.id, { colunas: columns });
    setRename(null);
  };

  return (
    <>
      <div className="linha-entre">
        <span className="campo-dica">{T.estudos.quadroDica}</span>
        <Button pequeno icone={<Plus size={13} />} onClick={() => { setErrorColumn(""); setRename({ id: null, nome: "", conclui: false }); }}>{T.estudos.novaColuna}</Button>
      </div>
      <DndContext sensors={sensors} onDragEnd={onRelease}>
        <div className="kanban">
          {subject.colunas.map((c) => {
            const fromColumn = tasks.filter((t) => (t.colunaId ?? first) === c.id).sort((a, b) => a.ordem - b.ordem);
            return (
              <KanbanColumn
                key={c.id}
                id={c.id}
                nome={c.nome}
                conclui={c.conclui}
                quantidade={fromColumn.length}
                aoNovo={() => setOpen(create({ titulo: T.estudos.novoCartao, materiaId: subject.id, colunaId: c.id, status: c.conclui ? "concluida" : "a_fazer" }))}
                aoRenomear={() => { setErrorColumn(""); setRename({ id: c.id, nome: c.nome, conclui: c.conclui }); }}
                aoExcluir={
                  subject.colunas.length > 1
                    ? () => {
                        const destination = subject.colunas.find((x) => x.id !== c.id)!.id;
                        fromColumn.forEach((t) => updateTask(t.id, { colunaId: destination }));
                        updateSubject(subject.id, { colunas: subject.colunas.filter((x) => x.id !== c.id) });
                      }
                    : undefined
                }
              >
                {fromColumn.map((t) => <CardKanban key={t.id} tarefa={t} aoAbrir={() => setOpen(t)} />)}
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>
      <EditCard tarefa={isOpen} materia={subject} aoFechar={() => setOpen(null)} />
      <Modal aberto={!!rename} titulo={rename?.id ? T.geral.editar : T.estudos.novaColuna} aoFechar={() => setRename(null)}>
        {rename && (
          <form className="formulario" onSubmit={saveColumn} noValidate>
            <Field id="c-nome" rotulo={T.estudos.nomeColuna} obrigatorio erro={errorColumn}>
              <input id="c-nome" className="campo" value={rename.nome} maxLength={40} onChange={(e) => { setRename({ ...rename, nome: e.target.value }); setErrorColumn(""); }} />
            </Field>
            <label className="linha">
              <BoxMark marcada={rename.conclui} rotulo={T.estudos.colunaConclui} aoMudar={(v) => setRename({ ...rename, conclui: v })} />
              <span>{T.estudos.colunaConclui}</span>
            </label>
            <div className="formulario-acoes">
              <Button onClick={() => setRename(null)}>{T.geral.cancelar}</Button>
              <Button type="submit" variante="primario">{T.geral.salvar}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function Dates({ materia: subject }: { materia: Subject }) {
  const dates = useStudies((s) => s.datas).filter((d) => d.materiaId === subject.id).sort((a, b) => a.data.localeCompare(b.data));
  const create = useStudies((s) => s.createDate);
  const update = useStudies((s) => s.updateDate);
  const remove = useStudies((s) => s.deleteDate);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ImportantDateType>("prova");
  const [data, setData] = useState(toISO(addDays(new Date(), 7)));
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <div className="coluna">
      <form
        className="formulario-linha"
        style={{ alignItems: "end" }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const newItems: Record<string, string> = {};
          if (!title.trim()) newItems.titulo = T.validacao.obrigatorio;
          if (!isValidDate(data)) newItems.data = T.validacao.dataInvalida;
          setErrors(newItems);
          if (Object.keys(newItems).length) return;
          create({ materiaId: subject.id, titulo: title, tipo: type, data });
          setTitle("");
          void playSound("pop");
        }}
      >
        <Field id="d-titulo" rotulo={T.estudos.tituloData} obrigatorio erro={errors.titulo}>
          <input id="d-titulo" className="campo" value={title} maxLength={120} aria-invalid={!!errors.titulo} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id="d-tipo" rotulo={T.calendario.tipo}>
          <select id="d-tipo" className="seletor" value={type} onChange={(e) => setType(e.target.value as ImportantDateType)}>
            {(Object.keys(T.estudos.tiposData) as ImportantDateType[]).map((t) => <option key={t} value={t}>{T.estudos.tiposData[t]}</option>)}
          </select>
        </Field>
        <Field id="d-data" rotulo={T.financas.data} obrigatorio erro={errors.data}>
          <input id="d-data" type="date" className="campo" value={data} aria-invalid={!!errors.data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Button type="submit" variante="primario" icone={<Plus size={14} />}>{T.estudos.novaData}</Button>
      </form>
      {dates.length === 0 ? (
        <Empty icone={<CalendarClock size={28} />} titulo={T.estudos.semDatas} />
      ) : (
        <div className="lista">
          {dates.map((d) => {
            const days = Math.round((new Date(d.data).getTime() - new Date(todayISO()).getTime()) / 86400000);
            return (
              <div key={d.id} className="lista-item">
                <BoxMark marcada={d.concluida} rotulo={d.titulo} aoMudar={(v) => { update(d.id, { concluida: v }); if (v) void playSound("proud", "personagens"); }} />
                <div className="lista-item-principal">
                  <span className={`lista-item-titulo ${d.concluida ? "riscado" : ""}`}>{d.titulo}</span>
                  <span className="lista-item-sub">{T.estudos.tiposData[d.tipo]} . {formatDateString(d.data, "EEEE, d 'de' MMMM")}</span>
                </div>
                {!d.concluida && <span className={`etiqueta ${days <= 3 ? "etiqueta-erro" : days <= 7 ? "etiqueta-alerta" : ""}`}>{describeDistance(d.data)}</span>}
                <div className="lista-item-acoes">
                  <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => remove(d.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionReview({ materiaId: subjectId, aoFim: onEnd }: { materiaId?: string; aoFim: () => void }) {
  const cards = useStudies((s) => s.cartoes);
  const evaluate = useStudies((s) => s.evaluateCard);
  const subjects = useStudies((s) => s.materias);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(0);
  const queue = cardsOverdue(cards).filter((c) => !subjectId || c.materiaId === subjectId);
  const current = queue[0];

  useEffect(() => {
    const onPress = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!current) return;
      if (e.code === "Space" && !show) {
        e.preventDefault();
        setShow(true);
      }
      if (show && ["1", "2", "3", "4"].includes(e.key)) {
        evaluate(current.id, Number(e.key) as 1 | 2 | 3 | 4);
        setShow(false);
        setDone((f) => f + 1);
      }
    };
    window.addEventListener("keydown", onPress);
    return () => window.removeEventListener("keydown", onPress);
  }, [current, show, evaluate]);

  if (!current)
    return (
      <Empty
        icone={<CheckCircle2 size={28} color="var(--sucesso)" />}
        titulo={done > 0 ? T.estudos.fimSessao : T.estudos.semRevisoes}
        texto={done > 0 ? T.estudos.revisados(done) : undefined}
        acao={<Button onClick={onEnd}>{T.geral.voltar}</Button>}
      />
    );

  return (
    <div className="sessao-revisao">
      <div className="linha-entre texto-3" style={{ fontSize: 12 }}>
        <span>{subjects.find((m) => m.id === current.materiaId)?.nome}</span>
        <span className="numero">{T.estudos.restantes(queue.length)}</span>
      </div>
      <div className="sessao-revisao-cartao">
        <p className="sessao-revisao-frente">{current.frente}</p>
        {show && <p className="sessao-revisao-verso">{current.verso}</p>}
      </div>
      <div className="linha" style={{ justifyContent: "center", flexWrap: "wrap" }}>
        {!show ? (
          <Button variante="primario" onClick={() => setShow(true)}>{T.estudos.mostrarResposta} <span className="tecla">Espaço</span></Button>
        ) : (
          ([1, 2, 3, 4] as const).map((n) => (
            <Button
              key={n}
              variante={n === 3 ? "primario" : n === 1 ? "perigo" : "secundario"}
              onClick={() => {
                evaluate(current.id, n);
                setShow(false);
                setDone((f) => f + 1);
                void playSound(n === 1 ? "blip" : "pop");
              }}
            >
              {T.estudos.notas[n]} <span className="tecla">{n}</span>
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

function Reviews({ materia: subject, sessaoInicial: sessionInitial }: { materia?: Subject; sessaoInicial: boolean }) {
  const cards = useStudies((s) => s.cartoes).filter((c) => !subject || c.materiaId === subject.id);
  const create = useStudies((s) => s.createCard);
  const remove = useStudies((s) => s.deleteCard);
  const reviewsContent = useStudies((s) => s.revisoesConteudo);
  const pages = useStudies((s) => s.paginas);
  const completeReview = useStudies((s) => s.completeReviewContent);
  const [session, setSession] = useState(sessionInitial);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const overdue = cardsOverdue(cards);
  const today = todayISO();
  const content = reviewsContent.filter((r) => !r.feita && r.data <= today && (!subject || pages.find((p) => p.id === r.paginaId)?.materiaId === subject.id));

  if (session) return <SessionReview materiaId={subject?.id} aoFim={() => setSession(false)} />;

  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div className="linha-entre">
        <span className="texto-2">{T.estudos.cartoesDaMateria(cards.length)}</span>
        <Button variante="primario" icone={<Layers size={14} />} disabled={overdue.length === 0} onClick={() => setSession(true)}>
          {overdue.length ? T.estudos.revisarAgora(overdue.length) : T.estudos.semRevisoes}
        </Button>
      </div>
      {content.length > 0 && (
        <div className="coluna" style={{ gap: 4 }}>
          <span className="rotulo-secao">{T.estudos.revisoesConteudo}</span>
          {content.map((r) => (
            <div key={r.id} className="lista-item">
              <BookCheck size={14} />
              <span className="lista-item-principal">{pages.find((p) => p.id === r.paginaId)?.titulo || T.estudos.semTitulo}</span>
              <Button pequeno onClick={() => completeReview(r.id)}>{T.estudos.revisaoFeita}</Button>
            </div>
          ))}
        </div>
      )}
      {subject && (
        <form
          className="formulario-linha"
          style={{ alignItems: "end" }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const newItems: Record<string, string> = {};
            if (!front.trim()) newItems.frente = T.validacao.obrigatorio;
            if (!back.trim()) newItems.verso = T.validacao.obrigatorio;
            setErrors(newItems);
            if (Object.keys(newItems).length) return;
            create(subject.id, front, back);
            setFront("");
            setBack("");
            document.getElementById("r-frente")?.focus();
          }}
        >
          <Field id="r-frente" rotulo={T.estudos.frente} obrigatorio erro={errors.frente}>
            <input id="r-frente" className="campo" value={front} maxLength={500} aria-invalid={!!errors.frente} onChange={(e) => setFront(e.target.value)} />
          </Field>
          <Field id="r-verso" rotulo={T.estudos.verso} obrigatorio erro={errors.verso}>
            <input id="r-verso" className="campo" value={back} maxLength={2000} aria-invalid={!!errors.verso} onChange={(e) => setBack(e.target.value)} />
          </Field>
          <Button type="submit" icone={<Plus size={14} />}>{T.estudos.novoCartaoRevisao}</Button>
        </form>
      )}
      <div className="lista">
        {cards.map((c) => (
          <div key={c.id} className="lista-item">
            <div className="lista-item-principal">
              <span className="lista-item-titulo">{c.frente}</span>
              <span className="lista-item-sub">{c.verso}</span>
            </div>
            <span className="etiqueta">{new Date(c.vencimento) <= new Date() ? T.datas.hoje : describeDistance(toISO(new Date(c.vencimento)))}</span>
            <div className="lista-item-acoes">
              <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => remove(c.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Links({ materia: subject }: { materia?: Subject }) {
  const links = useStudies((s) => s.links).filter((l) => !subject || l.materiaId === subject.id);
  const save = useStudies((s) => s.saveLink);
  const update = useStudies((s) => s.updateLink);
  const remove = useStudies((s) => s.deleteLink);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [filter, setFilter] = useState<LinkState | "todos">("todos");
  const [error, setError] = useState("");

  const list = links.filter((l) => filter === "todos" || l.estado === filter);

  return (
    <div className="coluna">
      <NoticeBanner>{T.estudos.aviso_meta}</NoticeBanner>
      <form
        className="formulario-linha"
        style={{ alignItems: "end" }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const u = urlSafe(url);
          if (!u) return setError(T.validacao.urlInvalida);
          save({
            url: u.href,
            titulo: title.trim().slice(0, 120) || u.hostname.replace(/^www\./, ""),
            nota: "",
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
            materiaId: subject?.id,
            estado: "para_ler",
          });
          setUrl("");
          setTitle("");
          setTags("");
          setError("");
          void playSound("gulp");
        }}
      >
        <Field id="l-url" rotulo={T.estudos.url} obrigatorio erro={error}>
          <input id="l-url" className="campo" value={url} type="url" inputMode="url" placeholder="https://" aria-invalid={!!error} onChange={(e) => { setUrl(e.target.value); setError(""); }} />
        </Field>
        <Field id="l-titulo" rotulo={T.estudos.tituloLink}>
          <input id="l-titulo" className="campo" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id="l-tags" rotulo={T.estudos.tags} dica={T.estudos.tagsDica}>
          <input id="l-tags" className="campo" value={tags} maxLength={120} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Button type="submit" variante="primario" icone={<Plus size={14} />}>{T.estudos.novoLink}</Button>
      </form>
      <Pills<LinkState | "todos">
        rotulo={T.estudos.abas.links}
        valor={filter}
        aoMudar={setFilter}
        opcoes={[{ valor: "todos", rotulo: T.geral.todos }, ...(Object.keys(T.estudos.estadosLink) as LinkState[]).map((e) => ({ valor: e, rotulo: T.estudos.estadosLink[e] }))]}
      />
      {list.length === 0 ? (
        <Empty icone={<Link2 size={28} />} titulo={T.estudos.semLinks} />
      ) : (
        <div className="lista">
          {list.map((l) => (
            <div key={l.id} className="lista-item">
              <Link2 size={14} />
              <div className="lista-item-principal">
                <a className="lista-item-titulo" href={l.url} target="_blank" rel="noopener noreferrer">{l.titulo}</a>
                <span className="lista-item-sub">{l.url}</span>
              </div>
              {l.tags.map((t) => <span key={t} className="etiqueta">{t}</span>)}
              <select className="seletor" style={{ width: 130, height: 28 }} value={l.estado} aria-label={T.estudos.estadoLink} onChange={(e) => update(l.id, { estado: e.target.value as LinkState })}>
                {(Object.keys(T.estudos.estadosLink) as LinkState[]).map((e) => <option key={e} value={e}>{T.estudos.estadosLink[e]}</option>)}
              </select>
              <a className="botao botao-fantasma botao-pequeno botao-icone" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={T.estudos.abrirLink}><ExternalLink size={13} /></a>
              <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => remove(l.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Statistics() {
  const subjects = useStudies((s) => s.materias);
  const dates = useStudies((s) => s.datas);
  const record = useStudies((s) => s.registroRevisoes);
  const sessions = usePomodoro((s) => s.sessoes);
  const bySubject = new Map<string, number>();
  for (const s of sessions) if (s.etapa === "foco" && s.situacao === "concluida" && s.materiaId) bySubject.set(s.materiaId, (bySubject.get(s.materiaId) ?? 0) + s.minutos);
  const last = Array.from({ length: 14 }, (_, i) => toISO(addDays(new Date(), i - 13)));
  const minutes = minutesStudyByDay(sessions);
  const sequence = sequenceDays(new Set([...minutes.keys(), ...record.filter((r) => r.quantidade > 0).map((r) => r.data)]));
  const today = todayISO();
  const exams = dates.filter((d) => d.tipo === "prova" && !d.concluida && d.data >= today).sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="grade">
      <Card className="col-6" titulo={T.estudos.horasPorMateria}>
        {bySubject.size === 0 ? <p className="texto-3">{T.estudos.semHoras}</p> : (
          <BarsHorizontal formatar={(v) => `${(v / 60).toFixed(1).replace(".", ",")} h`} barras={[...bySubject].map(([id, v]) => ({ rotulo: subjects.find((m) => m.id === id)?.nome ?? "", valor: v })).sort((a, b) => b.valor - a.valor)} />
        )}
      </Card>
      <Card className="col-6" titulo={T.estudos.revisadosPorDia}>
        <BarsVertical altura={120} formatar={(v) => `${v}`} barras={last.map((d) => ({ rotulo: d.slice(8), valor: record.find((r) => r.data === d)?.quantidade ?? 0 }))} />
      </Card>
      <Card className="col-6">
        <span className="numero-grande">{sequence}</span>
        <p className="texto-2">{T.estudos.sequenciaEstudo(sequence)}</p>
      </Card>
      <Card className="col-6" titulo={T.estudos.proximasProvas}>
        {exams.length === 0 ? <p className="texto-3">{T.estudos.semDatas}</p> : exams.map((p) => (
          <div key={p.id} className="linha-entre" style={{ padding: "4px 0" }}>
            <span>{p.titulo}</span>
            <span className="etiqueta etiqueta-alerta">{describeDistance(p.data)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function NavSubjects({ materiaId: subjectId, aoEscolher: onSelect, aoNovaMateria: onNewSubject, aoNovaArea: onNewArea, aoExcluirArea: onDeleteArea }: { materiaId?: string; aoEscolher: (id?: string) => void; aoNovaMateria: (areaId?: string) => void; aoNovaArea: () => void; aoExcluirArea: (id: string) => void }) {
  const areas = useStudies((s) => s.areas);
  const subjects = useStudies((s) => s.materias);
  const cards = useStudies((s) => s.cartoes);
  const dates = useStudies((s) => s.datas);
  const [areaId, setAreaId] = useState(subjects.find((m) => m.id === subjectId)?.areaId);
  const [search, setSearch] = useState("");
  const [width, setWidth] = useState(0);
  const navigation = useRef<HTMLElement>(null);
  const lineSubjects = useRef<HTMLDivElement>(null);
  const areaSubject = subjects.find((m) => m.id === subjectId)?.areaId;
  const area = areas.find((a) => a.id === (areaSubject ?? areaId));
  const list = subjects.filter((m) => m.areaId === area?.id);
  const capacity = Math.max(1, Math.floor((width - 110) / 174));
  const visible = list.slice(0, capacity);
  const selected = list.find((m) => m.id === subjectId);
  if (selected && !visible.includes(selected)) visible[visible.length - 1] = selected;
  const term = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const results = list.filter((m) => m.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(term));
  const overdue = cardsOverdue(cards);
  const today = todayISO();
  const totalToday = overdue.length;

  useEffect(() => {
    if (areaSubject) setAreaId(areaSubject);
  }, [areaSubject]);

  useEffect(() => {
    const line = lineSubjects.current;
    if (!line) return;
    const observer = new ResizeObserver(([input]) => setWidth(input.contentRect.width));
    observer.observe(line);
    return () => observer.disconnect();
  }, [area?.id]);

  useEffect(() => {
    const closeMenus = (e: PointerEvent) => {
      navigation.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => {
        if (e.target instanceof Node && !menu.contains(e.target)) menu.open = false;
      });
    };
    const onPress = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const menu = navigation.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (!menu) return;
      e.stopPropagation();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", onPress, true);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("keydown", onPress, true);
    };
  }, []);

  const closeMenus = () => navigation.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => { menu.open = false; });
  const selectSubject = (id: string) => {
    closeMenus();
    setSearch("");
    onSelect(id);
  };

  const buttonSubject = (m: Subject) => {
    const pendingRequests = overdue.filter((c) => c.materiaId === m.id).length;
    const exam = dates.filter((d) => d.materiaId === m.id && !d.concluida && d.data >= today).sort((x, y) => x.data.localeCompare(y.data))[0];
    return (
      <button key={m.id} type="button" className="estudos-nav-item" aria-current={m.id === subjectId} title={m.nome} onClick={() => selectSubject(m.id)}>
        <span className="coluna" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="cortar">{m.nome}</span>
          {exam && <span className="estudos-nav-prova cortar"><Flag size={10} />{describeDistance(exam.data)}</span>}
        </span>
        {pendingRequests > 0 && <span className="estudos-badge" title={T.estudos.revisarAgora(pendingRequests)}>{pendingRequests}</span>}
      </button>
    );
  };

  return (
    <nav ref={navigation} className="estudos-nav" aria-label={T.estudos.areas} style={{ ["--cor-area" as string]: area?.cor ?? "var(--destaque)" }}>
      <div className="estudos-nav-topo">
        <div className="estudos-nav-areas">
          <button type="button" className="estudos-nav-item estudos-nav-geral" aria-current={!area && !subjectId} onClick={() => { closeMenus(); setAreaId(undefined); onSelect(undefined); }}>
            <LayoutDashboard size={15} />
            <span>{T.estudos.visaoGeral}</span>
            {totalToday > 0 && <span className="estudos-badge">{totalToday}</span>}
          </button>
          {areas.map((a) => (
            <button key={a.id} type="button" className="estudos-nav-item estudos-nav-area-nome" aria-current={a.id === area?.id} title={a.nome} style={{ ["--cor-area" as string]: a.cor }} onClick={() => {
              closeMenus();
              setSearch("");
              setAreaId(a.id);
              if (areaSubject !== a.id) onSelect(subjects.find((m) => m.areaId === a.id)?.id);
            }}>
              <span className="ponto-cor" style={{ background: a.cor }} />
              <span className="cortar">{a.nome}</span>
            </button>
          ))}
        </div>
        <Button pequeno soIcone variante="fantasma" icone={<Plus size={15} />} aria-label={T.estudos.novaArea} title={T.estudos.novaArea} onClick={onNewArea} />
        {area && (
          <details className="estudos-menu" key={area.id}>
            <summary className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.estudos.acoesArea} title={T.estudos.acoesArea}><Ellipsis size={17} /></summary>
            <div className="estudos-menu-painel estudos-menu-acoes">
              <button type="button" onClick={() => { closeMenus(); onNewSubject(area.id); }}><Plus size={14} />{T.estudos.novaMateria}</button>
              <button type="button" className="estudos-menu-excluir" onClick={() => { closeMenus(); onDeleteArea(area.id); }}><Trash2 size={14} />{T.estudos.excluirAreaRotulo}</button>
            </div>
          </details>
        )}
      </div>
      {area && (
        <div ref={lineSubjects} className="estudos-nav-materias">
          {list.length === 0 ? (
            <button type="button" className="estudos-nav-vazio" onClick={() => onNewSubject(area.id)}><Plus size={13} />{T.estudos.novaMateria}</button>
          ) : visible.map(buttonSubject)}
          {list.length > capacity && (
            <details className="estudos-menu estudos-menu-mais" key={area.id}>
              <summary className="botao botao-secundario botao-pequeno">{T.estudos.maisMaterias(list.length - visible.length)}<ChevronDown size={13} /></summary>
              <div className="estudos-menu-painel">
                <label className="estudos-nav-busca"><Search size={14} /><input className="campo" value={search} placeholder={T.estudos.buscarMateria} aria-label={T.estudos.buscarMateria} onChange={(e) => setSearch(e.target.value)} /></label>
                <div className="estudos-menu-resultados">
                  {results.map(buttonSubject)}
                  {results.length === 0 && <p className="texto-3">{T.estudos.semResultadoBusca}</p>}
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </nav>
  );
}

function HeaderSubject({ materia: subject, aba: tab, aoAba: onTab, aoExcluir: onDelete }: { materia: Subject; aba: Tab; aoAba: (a: Tab) => void; aoExcluir: () => void }) {
  const area = useStudies((s) => s.areas.find((a) => a.id === subject.areaId));
  const pages = useStudies((s) => s.paginas).filter((p) => p.materiaId === subject.id).length;
  const cards = useStudies((s) => s.cartoes).filter((c) => c.materiaId === subject.id);
  const dates = useStudies((s) => s.datas).filter((d) => d.materiaId === subject.id && !d.concluida && d.data >= todayISO()).sort((a, b) => a.data.localeCompare(b.data));
  const tasks = useRoutine((s) => s.tarefas).filter((t) => t.materiaId === subject.id && t.status !== "concluida" && t.status !== "cancelada").length;
  const sessions = usePomodoro((s) => s.sessoes);
  const running = usePomodoro((s) => s.rodando);
  const link = usePomodoro((s) => s.materiaId);
  const minutes = sessions.filter((x) => x.materiaId === subject.id && x.etapa === "foco" && x.situacao === "concluida").reduce((a, x) => a + x.minutos, 0);
  const pendingRequests = cardsOverdue(cards).length;
  const color = area?.cor ?? "var(--destaque)";
  const studyingHere = running && link === subject.id;

  const study = () => {
    const p = usePomodoro.getState();
    if (studyingHere) return p.toggle();
    p.selectStage("foco");
    p.setLink(subject.id);
    p.start();
    void playSound("work", "pomodoro");
    void useAgents.getState().trabalhar("tutor", T.estudos.estudando(subject.nome), 600);
  };

  return (
    <header className="materia-cabecalho" style={{ ["--cor-area" as string]: color }}>
      <div className="materia-cabecalho-topo">
        <div className="coluna" style={{ gap: 2, minWidth: 0 }}>
          <span className="rotulo-pequeno" style={{ color: color }}>{area?.nome}{subject.semestre ? ` . ${subject.semestre}` : ""}</span>
          <h2 className="materia-nome">{subject.nome}</h2>
          <div className="materia-numeros">
            <span><b className="numero">{pages}</b> {T.estudos.numeros.paginas}</span>
            <span><b className="numero">{tasks}</b> {T.estudos.numeros.tarefas}</span>
            <span><b className="numero">{(minutes / 60).toFixed(1).replace(".", ",")} h</b> {T.estudos.numeros.horas}</span>
            {dates[0] && <span className="materia-prova"><CalendarClock size={12} />{dates[0].titulo} {describeDistance(dates[0].data)}</span>}
          </div>
        </div>
        <div className="materia-acoes">
          <Button variante={studyingHere ? "secundario" : "primario"} icone={<Timer size={14} />} onClick={study}>{studyingHere ? T.pomodoro.pausar : T.estudos.estudarAgora}</Button>
          <Button icone={<Layers size={14} />} disabled={pendingRequests === 0} onClick={() => onTab("revisoes")}>{pendingRequests > 0 ? T.estudos.revisarAgora(pendingRequests) : T.estudos.semRevisoes}</Button>
          <Button soIcone variante="fantasma" icone={<Trash2 size={14} />} aria-label={T.estudos.excluirMateriaRotulo} title={T.estudos.excluirMateriaRotulo} onClick={onDelete} />
        </div>
      </div>
      <div className="abas-linha" role="tablist" aria-label={subject.nome}>
        {TABS_SUBJECT.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={tab === a} className="aba-linha" onClick={() => onTab(a)}>
            {ICONS_TAB[a]}
            {T.estudos.abas[a]}
            {a === "revisoes" && pendingRequests > 0 && <span className="estudos-badge">{pendingRequests}</span>}
          </button>
        ))}
      </div>
    </header>
  );
}

const TABS_SUBJECT: Tab[] = ["anotacoes", "quadro", "datas", "revisoes", "arquivos", "links"];
const TABS_GENERAL: Tab[] = ["estatisticas", "revisoes", "links"];

export default function Studies() {
  const parameters = useInterface((s) => s.parametros);
  const areas = useStudies((s) => s.areas);
  const subjects = useStudies((s) => s.materias);
  const deleteSubject = useStudies((s) => s.deleteSubject);
  const deleteArea = useStudies((s) => s.deleteArea);
  const [subjectId, setSubjectId] = useState<string | undefined>(parameters.materia || undefined);
  const [tab, setTab] = useState<Tab>((parameters.aba as Tab) || (parameters.materia ? "anotacoes" : "estatisticas"));
  const [creatingArea, setCreatingArea] = useState(false);
  const [creatingSubject, setCreatingSubject] = useState<string | undefined | null>(null);
  const [confirmValue, setConfirm] = useState<{ tipo: "area" | "materia"; id: string } | null>(null);
  const subject = subjects.find((m) => m.id === subjectId);
  const sessionInitial = parameters.sessao === "1";

  useEffect(() => {
    if (parameters.materia !== undefined) setSubjectId(parameters.materia || undefined);
    if (parameters.aba) setTab(parameters.aba as Tab);
  }, [parameters]);

  useEffect(() => {
    const onNew = (e: Event) => {
      if ((e as CustomEvent).detail === "estudos") setCreatingSubject(undefined);
    };
    window.addEventListener(EVENT_NEW, onNew);
    return () => window.removeEventListener(EVENT_NEW, onNew);
  }, []);

  const select = (id?: string) => {
    setSubjectId(id);
    setTab((a) => (id ? (TABS_SUBJECT.includes(a) && a !== "revisoes" && a !== "links" ? a : "anotacoes") : TABS_GENERAL.includes(a) ? a : "estatisticas"));
  };

  const tabValid = subject ? (TABS_SUBJECT.includes(tab) ? tab : "anotacoes") : TABS_GENERAL.includes(tab) ? tab : "estatisticas";

  const content = useMemo(() => {
    switch (tabValid) {
      case "anotacoes":
        return subject && <Notes materia={subject} paginaInicial={parameters.pagina} />;
      case "quadro":
        return subject && <Board materia={subject} />;
      case "datas":
        return subject && <Dates materia={subject} />;
      case "revisoes":
        return <Reviews materia={subject} sessaoInicial={sessionInitial} key={`${subject?.id}-${sessionInitial}`} />;
      case "arquivos":
        return subject && <Files materia={subject} />;
      case "links":
        return <Links materia={subject} />;
      case "estatisticas":
        return <Statistics />;
    }
  }, [tabValid, subject, parameters.pagina, sessionInitial]);

  return (
    <>
      <div className="estudos-cabecalho">
        <TabHeader titulo={T.estudos.titulo} subtitulo={T.estudos.subtitulo} agente="tutor" />
      </div>
      {areas.length === 0 ? (
        <Card>
          <Empty icone={<GraduationCap size={28} />} titulo={T.estudos.semMaterias} texto={T.estudos.semMateriasDica} acao={<Button variante="primario" onClick={() => setCreatingArea(true)}>{T.estudos.novaArea}</Button>} />
        </Card>
      ) : (
        <div className="estudos-layout">
          <NavSubjects materiaId={subjectId} aoEscolher={select} aoNovaMateria={(id) => setCreatingSubject(id)} aoNovaArea={() => setCreatingArea(true)} aoExcluirArea={(id) => setConfirm({ tipo: "area", id })} />
          <section className="estudos-area">
            {subject ? (
              <HeaderSubject materia={subject} aba={tabValid} aoAba={setTab} aoExcluir={() => setConfirm({ tipo: "materia", id: subject.id })} />
            ) : (
              <header className="materia-cabecalho">
                <div className="materia-cabecalho-topo">
                  <div className="coluna" style={{ gap: 2 }}>
                    <span className="rotulo-pequeno">{T.estudos.todasMaterias}</span>
                    <h2 className="materia-nome">{T.estudos.visaoGeral}</h2>
                  </div>
                </div>
                <div className="abas-linha" role="tablist" aria-label={T.estudos.visaoGeral}>
                  {TABS_GENERAL.map((a) => (
                    <button key={a} type="button" role="tab" aria-selected={tabValid === a} className="aba-linha" onClick={() => setTab(a)}>
                      {ICONS_TAB[a]}
                      {T.estudos.abas[a]}
                    </button>
                  ))}
                </div>
              </header>
            )}
            <div className="estudos-conteudo">{content}</div>
          </section>
        </div>
      )}
      <NewArea aberto={creatingArea} aoFechar={() => setCreatingArea(false)} />
      <NewSubject aberto={creatingSubject !== null} areaId={creatingSubject ?? undefined} aoFechar={() => setCreatingSubject(null)} aoCriar={(m) => select(m.id)} />
      <ConfirmModal
        aberto={!!confirmValue}
        titulo={T.geral.confirmarExclusao}
        texto={confirmValue?.tipo === "area" ? T.estudos.excluirArea : T.estudos.excluirMateria}
        aoFechar={() => setConfirm(null)}
        aoConfirmar={() => {
          if (!confirmValue) return;
          const subjectsDeleted = confirmValue.tipo === "area" ? subjects.filter((m) => m.areaId === confirmValue.id).map((m) => m.id) : [confirmValue.id];
          if (confirmValue.tipo === "area") deleteArea(confirmValue.id);
          else deleteSubject(confirmValue.id);
          for (const id of subjectsDeleted) void deleteFilesSubject(id).catch(() => undefined);
          if (confirmValue.id === subjectId || (confirmValue.tipo === "area" && subject?.areaId === confirmValue.id)) select(undefined);
        }}
      />
    </>
  );
}
