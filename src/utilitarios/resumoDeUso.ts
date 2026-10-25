import type { Conversa, Habito, RegistroRevisao, SessaoPomodoro, Tarefa } from "../tipos";
import { diaDoMomento } from "./datas";
import { habitoCumprido } from "../estado/rotina";

export interface DadosDoResumoDeUso {
  tarefas: Tarefa[];
  habitos: Habito[];
  registros: Record<string, Record<string, number>>;
  sessoes: SessaoPomodoro[];
  registroRevisoes: RegistroRevisao[];
  conversas: Conversa[];
  conquistas: number;
}

export interface ResumoDeUso {
  tarefasConcluidas: number;
  minutosDeFoco: number;
  habitosCumpridos: number;
  cartoesRevisados: number;
  mensagensAoTime: number;
  conquistas: number;
  diasAtivos: number;
  desde: string | null;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function resumoDeUso(d: DadosDoResumoDeUso): ResumoDeUso {
  const dias = new Set<string>();
  const datas: string[] = [];
  const anotar = (dia: string, ativo: boolean) => {
    if (!DATA_ISO.test(dia)) return;
    datas.push(dia);
    if (ativo) dias.add(dia);
  };

  let tarefasConcluidas = 0;
  for (const t of d.tarefas) {
    if (t.criadaEm) anotar(diaDoMomento(t.criadaEm), false);
    if (t.status !== "concluida") continue;
    tarefasConcluidas += 1;
    if (t.concluidaEm) anotar(diaDoMomento(t.concluidaEm), true);
  }

  let minutosDeFoco = 0;
  for (const s of d.sessoes) {
    if (s.etapa !== "foco" || s.situacao !== "concluida") continue;
    minutosDeFoco += Math.max(0, s.minutos);
    anotar(diaDoMomento(s.inicio), true);
  }

  const porId = new Map(d.habitos.map((h) => [h.id, h]));
  let habitosCumpridos = 0;
  for (const [dia, valores] of Object.entries(d.registros)) {
    let cumpridosNoDia = 0;
    for (const [id, valor] of Object.entries(valores)) {
      const h = porId.get(id);
      if (h && habitoCumprido(h, valor)) cumpridosNoDia += 1;
    }
    habitosCumpridos += cumpridosNoDia;
    if (cumpridosNoDia) anotar(dia, true);
  }

  let cartoesRevisados = 0;
  for (const r of d.registroRevisoes) {
    cartoesRevisados += Math.max(0, r.quantidade);
    if (r.quantidade > 0) anotar(r.data, true);
  }

  let mensagensAoTime = 0;
  for (const c of d.conversas) {
    for (const m of c.mensagens) {
      if (m.autor !== "usuario") continue;
      mensagensAoTime += 1;
      anotar(diaDoMomento(m.criadaEm), true);
    }
  }

  return {
    tarefasConcluidas,
    minutosDeFoco,
    habitosCumpridos,
    cartoesRevisados,
    mensagensAoTime,
    conquistas: d.conquistas,
    diasAtivos: dias.size,
    desde: datas.length ? datas.reduce((menor, x) => (x < menor ? x : menor)) : null,
  };
}

export function temUso(r: ResumoDeUso): boolean {
  return r.tarefasConcluidas + r.minutosDeFoco + r.habitosCumpridos + r.cartoesRevisados + r.mensagensAoTime + r.conquistas > 0;
}
