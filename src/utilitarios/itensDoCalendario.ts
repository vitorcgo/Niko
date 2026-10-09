import { addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import { T } from "../textos/textos";
import { deISO, paraISO } from "./datas";
import { formatarDinheiro } from "./dinheiro";
import type { Evento, Habito, Repeticao, Tarefa } from "../tipos";
import type { useOrganizacao } from "../estado/organizacao";
import type { useRotina } from "../estado/rotina";
import type { useEstudos } from "../estado/estudos";
import type { useFinancas } from "../estado/financas";
import { funcaoLigada, type Funcao } from "./funcoes";

export type FonteDoCalendario = keyof typeof T.calendario.fontes;

export interface ItemDoCalendario {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  fonte: FonteDoCalendario;
  evento?: Evento;
  habito?: Habito;
  tarefa?: Tarefa;
  link?: string;
}

export interface DadosDoCalendario {
  eventos: ReturnType<typeof useOrganizacao.getState>["eventos"];
  metas: ReturnType<typeof useOrganizacao.getState>["metas"];
  tarefas: ReturnType<typeof useRotina.getState>["tarefas"];
  habitos?: ReturnType<typeof useRotina.getState>["habitos"];
  datas: ReturnType<typeof useEstudos.getState>["datas"];
  revisoes: ReturnType<typeof useEstudos.getState>["revisoesConteudo"];
  recorrentes: ReturnType<typeof useFinancas.getState>["recorrentes"];
  contas?: ReturnType<typeof useFinancas.getState>["contas"];
}

export type EscopoDaEdicao = "este" | "todos";
export type DadosDoEvento = Omit<Evento, "id" | "ultimoDisparo" | "excecoes">;

export function podeMarcarFeito(i: ItemDoCalendario): boolean {
  return Boolean(i.evento || i.tarefa || i.habito);
}

export function itemFeito(i: ItemDoCalendario, registros: Record<string, Record<string, number>>): boolean {
  if (i.evento) return (i.evento.feitos ?? []).includes(i.data);
  if (i.tarefa) return i.tarefa.status === "concluida";
  if (i.habito) {
    const valor = registros[i.data]?.[i.habito.id];
    return Boolean(valor) && (i.habito.tipo === "sim_nao" ? valor >= 1 : valor >= i.habito.meta);
  }
  return false;
}

export function repeteTodoDia(i: ItemDoCalendario) {
  return i.evento?.repeticao === "diaria" || Boolean(i.habito);
}

export function ocorrencias(e: Evento, inicio: string, fim: string): string[] {
  if (e.repeticao === "nenhuma") return e.data >= inicio && e.data <= fim ? [e.data] : [];
  const pular = new Set(e.excecoes ?? []);
  const resultado: string[] = [];
  let d = deISO(e.data);
  let protecao = 0;
  while (paraISO(d) <= fim && protecao < 800) {
    const iso = paraISO(d);
    if (iso >= inicio && !pular.has(iso)) resultado.push(iso);
    d = e.repeticao === "diaria" ? addDays(d, 1) : e.repeticao === "semanal" ? addWeeks(d, 1) : addMonths(d, 1);
    protecao++;
  }
  return resultado;
}

export function editarEvento(evento: Evento, ocorrencia: string, novos: DadosDoEvento, escopo: EscopoDaEdicao): { atualizar: Partial<Evento>; criar?: DadosDoEvento } {
  if (evento.repeticao !== "nenhuma" && escopo === "este") {
    return { atualizar: { excecoes: [...new Set([...(evento.excecoes ?? []), ocorrencia])] }, criar: { ...novos, repeticao: "nenhuma" } };
  }
  if (evento.repeticao === "nenhuma" || novos.repeticao === "nenhuma") return { atualizar: { ...novos, excecoes: undefined } };
  const deslocamento = differenceInCalendarDays(deISO(novos.data), deISO(ocorrencia));
  const mover = (iso: string) => paraISO(addDays(deISO(iso), deslocamento));
  return { atualizar: { ...novos, data: mover(evento.data), excecoes: evento.excecoes?.map(mover) } };
}

export function excluirOcorrencia(evento: Evento, ocorrencia: string, escopo: EscopoDaEdicao): Partial<Evento> | "excluir" {
  if (evento.repeticao === "nenhuma" || escopo === "todos") return "excluir";
  return { excecoes: [...new Set([...(evento.excecoes ?? []), ocorrencia])] };
}

const RAPIDO_REPETICAO: [RegExp, Repeticao][] = [
  [/^(todo dia|todos os dias|diariamente)\b/i, "diaria"],
  [/^(toda semana|todas as semanas|semanalmente)\b/i, "semanal"],
  [/^(todo m[eê]s|todos os meses|mensalmente)\b/i, "mensal"],
];

export function extrairRepeticao(texto: string): { repeticao: Repeticao; resto: string } {
  for (const [regra, repeticao] of RAPIDO_REPETICAO) {
    const solta = new RegExp(regra.source.replace(/^\^/, "(?:^|\\s)"), "i");
    if (solta.test(texto)) return { repeticao, resto: texto.replace(solta, " ").replace(/\s+/g, " ").trim() };
  }
  return { repeticao: "nenhuma", resto: texto.trim() };
}

export function lerEventoRapido(texto: string): { titulo: string; hora?: string; repeticao: Repeticao } {
  let resto = texto.trim();
  let repeticao: Repeticao = "nenhuma";
  let hora: string | undefined;
  for (let passo = 0; passo < 2; passo++) {
    const regra = RAPIDO_REPETICAO.find(([r]) => r.test(resto));
    if (regra && repeticao === "nenhuma") {
      repeticao = regra[1];
      resto = resto.replace(regra[0], "").trim();
      continue;
    }
    const m = /^(?:[aà]s\s+)?(\d{1,2})(?:[:h](\d{2}))?h?\s+(.+)$/i.exec(resto);
    if (m && !hora) {
      const candidata = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(candidata)) {
        hora = candidata;
        resto = m[3].trim();
      }
    }
  }
  return { titulo: resto, hora, repeticao };
}

export function itensDoCalendario(todos: DadosDoCalendario, de: string, ate: string): ItemDoCalendario[] {
  const ligada = (f: Funcao) => funcaoLigada(f);
  const dados: DadosDoCalendario = {
    eventos: ligada("calendario") ? todos.eventos : [],
    tarefas: ligada("journal") ? todos.tarefas : [],
    habitos: ligada("journal") ? todos.habitos : [],
    datas: ligada("estudos") ? todos.datas : [],
    revisoes: ligada("estudos") ? todos.revisoes : [],
    metas: ligada("metas") ? todos.metas : [],
    recorrentes: ligada("financas") ? todos.recorrentes : [],
  };
  const lista: ItemDoCalendario[] = [];
  for (const e of dados.eventos) for (const d of ocorrencias(e, de, ate)) lista.push({ id: `${e.id}-${d}`, titulo: e.titulo, data: d, hora: e.hora, fonte: "eventos", evento: e });
  for (const t of dados.tarefas) if (t.data && t.data >= de && t.data <= ate && t.status !== "cancelada") lista.push({ id: t.id, titulo: t.titulo, data: t.data, hora: t.hora, fonte: "tarefas", tarefa: t });
  const comHora = (dados.habitos ?? []).filter((h) => !h.arquivado && h.hora);
  if (comHora.length > 0 && de <= ate) {
    for (const dia of eachDayOfInterval({ start: deISO(de), end: deISO(ate) }).slice(0, 800)) {
      const iso = paraISO(dia);
      for (const h of comHora) lista.push({ id: `habito-${h.id}-${iso}`, titulo: h.nome, data: iso, hora: h.hora, fonte: "habitos", habito: h });
    }
  }
  for (const d of dados.datas) if (d.data >= de && d.data <= ate) lista.push({ id: d.id, titulo: `${T.estudos.tiposData[d.tipo]}: ${d.titulo}`, data: d.data, fonte: "estudos" });
  for (const r of dados.revisoes) if (!r.feita && r.data >= de && r.data <= ate) lista.push({ id: r.id, titulo: T.calendario.revisao, data: r.data, fonte: "estudos" });
  for (const m of dados.metas) if (m.prazo && m.prazo >= de && m.prazo <= ate) lista.push({ id: m.id, titulo: m.nome, data: m.prazo, fonte: "metas" });
  for (const r of dados.recorrentes) {
    if (!r.ativa) continue;
    let d = startOfMonth(deISO(de));
    while (paraISO(d) <= ate) {
      const dia = paraISO(new Date(d.getFullYear(), d.getMonth(), Math.min(r.dia, endOfMonth(d).getDate())));
      if (dia >= de && dia <= ate && (r.frequencia === "mensal" || d.getMonth() + 1 === r.mesAnual)) lista.push({ id: `${r.id}-${dia}`, titulo: `${r.descricao} ${formatarDinheiro(r.valor, todos.contas?.find((c) => c.id === r.contaId)?.moeda ?? "BRL")}`, data: dia, fonte: "financas" });
      d = addMonths(d, 1);
    }
  }
  return lista.sort((a, b) => `${a.data}${a.hora ?? "99"}`.localeCompare(`${b.data}${b.hora ?? "99"}`));
}
