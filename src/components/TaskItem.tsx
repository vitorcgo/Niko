import { useEffect, useRef, useState } from "react";
import { Circle, CircleDot, CheckCircle2, CalendarClock, XCircle, CirclePause, Trash2, Flag, type LucideIcon } from "lucide-react";
import type { TaskStatus, Task } from "../types";
import { useRoutine } from "../state/routine";
import { useInterface } from "../state/interface";
import { useAgents } from "../state/agents";
import { T } from "../i18n/ptBR";
import { playSound } from "../bridge/sounds";

export const ICON_STATUS: Record<TaskStatus, LucideIcon> = {
  a_fazer: Circle,
  em_andamento: CircleDot,
  concluida: CheckCircle2,
  reagendada: CalendarClock,
  cancelada: XCircle,
  em_aguardo: CirclePause,
};

export const ORDER_STATUS: TaskStatus[] = ["a_fazer", "em_andamento", "concluida", "reagendada", "em_aguardo", "cancelada"];

export function SelectorStatus({ status, aoMudar: onChange }: { status: TaskStatus; aoMudar: (s: TaskStatus) => void }) {
  const [isOpen, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const Icon = ICON_STATUS[status];

  useEffect(() => {
    if (!isOpen) return;
    const closeValue = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeValue);
    return () => window.removeEventListener("pointerdown", closeValue);
  }, [isOpen]);

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        className={`seletor-status status-${status}`}
        aria-label={T.status[status]}
        title={T.geral.dicaStatus(T.status[status])}
        aria-haspopup="menu"
        onClick={() => onChange(status === "concluida" ? "a_fazer" : "concluida")}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon size={17} />
      </button>
      {isOpen && (
        <div className="menu-flutuante" role="menu" style={{ top: 30, left: 0 }}>
          {ORDER_STATUS.map((s) => {
            const I = ICON_STATUS[s];
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === status}
                className="menu-item"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                <I size={14} className={`status-${s}`} />
                {T.status[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskItem({ tarefa: task, mostrarData: showData, extra }: { tarefa: Task; mostrarData?: boolean; extra?: React.ReactNode }) {
  const changeStatus = useRoutine((s) => s.changeStatus);
  const update = useRoutine((s) => s.updateTask);
  const remove = useRoutine((s) => s.deleteTask);
  const restore = useRoutine((s) => s.restoreTask);
  const notify = useInterface((s) => s.notify);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.titulo);

  const saveTitle = () => {
    const clean = title.trim();
    if (clean && clean !== task.titulo) update(task.id, { titulo: clean.slice(0, 200) });
    else setTitle(task.titulo);
    setEditing(false);
  };

  return (
    <div className="item-tarefa">
      <SelectorStatus
        status={task.status}
        aoMudar={(s) => {
          changeStatus(task.id, s);
          if (s === "concluida") {
            void playSound("finish", "personagens");
            useAgents.getState().register("organizador", `${T.geral.concluir}: ${task.titulo}`);
          }
        }}
      />
      <div className="lista-item-principal">
        {editing ? (
          <input
            className="campo"
            style={{ height: 30 }}
            value={title}
            autoFocus
            maxLength={200}
            aria-label={T.geral.editar}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setTitle(task.titulo);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`lista-item-titulo privado ${task.status === "concluida" || task.status === "cancelada" ? "riscado" : ""}`}
            style={{ textAlign: "left" }}
            onDoubleClick={() => setEditing(true)}
            onKeyDown={(e) => e.key === "F2" && setEditing(true)}
            title={T.geral.editar}
          >
            {task.titulo}
          </button>
        )}
        {(showData || task.hora || task.checklist.length > 0) && (
          <span className="lista-item-sub numero">
            {[task.hora, showData && task.data ? task.data.split("-").reverse().slice(0, 2).join("/") : "", task.checklist.length > 0 ? `${task.checklist.filter((c) => c.feito).length}/${task.checklist.length}` : ""]
              .filter(Boolean)
              .join(" . ")}
          </span>
        )}
      </div>
      {task.prioridade === "alta" && <Flag size={13} color="var(--erro)" aria-label={T.prioridade.alta} />}
      {extra}
      <div className="lista-item-acoes">
        <button
          type="button"
          className="botao botao-fantasma botao-pequeno botao-icone"
          aria-label={T.geral.excluir}
          title={T.geral.excluir}
          onClick={() => {
            const removed = remove(task.id);
            if (removed) notify(T.geral.excluido, () => restore(removed));
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
