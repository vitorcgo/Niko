import { useOrganization } from "../state/organization";
import { useRoutine } from "../state/routine";
import type { ItemCalendar } from "./calendarItems";

export function markItemDone(i: ItemCalendar, done: boolean) {
  if (i.evento) useOrganization.getState().markEventDone(i.evento.id, i.data, done);
  else if (i.tarefa) useRoutine.getState().changeStatus(i.tarefa.id, done ? "concluida" : "a_fazer");
  else if (i.habito) useRoutine.getState().registerHabit(i.data, i.habito.id, done ? (i.habito.tipo === "sim_nao" ? 1 : i.habito.meta) : 0);
}
