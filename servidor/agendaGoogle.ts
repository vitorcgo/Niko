import { apiGoogle, lerCredencialGmail, type CredencialGmail } from "./gmail";

const BASE_AGENDA = "https://www.googleapis.com/calendar/v3";
const DIAS_MAXIMOS_DA_AGENDA = 62;
const DIAS_DO_RESUMO = 7;

export interface EventoGoogle {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  link?: string;
}

interface EventoDaApi {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function converterEventosGoogle(itens: EventoDaApi[], de: string, ate: string): EventoGoogle[] {
  const lista: EventoGoogle[] = [];
  for (const e of itens) {
    if (e.status === "cancelled" || !e.start) continue;
    const titulo = (e.summary ?? "").trim().slice(0, 120) || "(sem título)";
    const link = e.htmlLink?.startsWith("https://www.google.com/calendar/") || e.htmlLink?.startsWith("https://calendar.google.com/") ? e.htmlLink : undefined;
    if (e.start.dateTime) {
      const inicio = new Date(e.start.dateTime);
      if (Number.isNaN(inicio.getTime())) continue;
      const data = dataLocal(inicio);
      if (data >= de && data <= ate) lista.push({ id: `${e.id}-${data}`, titulo, data, hora: `${String(inicio.getHours()).padStart(2, "0")}:${String(inicio.getMinutes()).padStart(2, "0")}`, link });
      continue;
    }
    if (!e.start.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.start.date)) continue;
    const fim = e.end?.date && /^\d{4}-\d{2}-\d{2}$/.test(e.end.date) ? e.end.date : e.start.date;
    const dia = new Date(`${e.start.date}T12:00:00`);
    for (let n = 0; n < DIAS_MAXIMOS_DA_AGENDA; n++) {
      const data = dataLocal(dia);
      if (n > 0 && data >= fim) break;
      if (data >= de && data <= ate) lista.push({ id: `${e.id}-${data}`, titulo, data, link });
      dia.setDate(dia.getDate() + 1);
    }
  }
  return lista;
}

async function eventosDoPeriodo(c: CredencialGmail, de: string, ate: string): Promise<EventoGoogle[]> {
  const inicio = new Date(`${de}T00:00:00`);
  const fim = new Date(`${ate}T23:59:59`);
  const parametros = new URLSearchParams({ timeMin: inicio.toISOString(), timeMax: fim.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  try {
    const r = await apiGoogle<{ items?: EventoDaApi[] }>(c, `/calendars/primary/events?${parametros}`, undefined, BASE_AGENDA);
    return converterEventosGoogle(r.items ?? [], de, ate);
  } catch (e) {
    const m = (e as Error).message;
    if (/^http_403/.test(m) && /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(m)) throw new Error("agenda_sem_permissao");
    if (/^http_403/.test(m) && /SERVICE_DISABLED|accessNotConfigured|has not been used/i.test(m)) throw new Error("agenda_api_desativada");
    throw e;
  }
}

export async function lerAgendaGoogle(texto: string, de: string, ate: string): Promise<EventoGoogle[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) throw new Error("periodo_invalido");
  if ((new Date(`${ate}T23:59:59`).getTime() - new Date(`${de}T00:00:00`).getTime()) / 86400000 > DIAS_MAXIMOS_DA_AGENDA) throw new Error("periodo_invalido");
  return eventosDoPeriodo(lerCredencialGmail(texto), de, ate);
}

export async function resumoDaAgenda(texto: string) {
  const hoje = new Date();
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + DIAS_DO_RESUMO - 1);
  const de = dataLocal(hoje);
  const proximos = await eventosDoPeriodo(lerCredencialGmail(texto), de, dataLocal(fim));
  return { hoje: proximos.filter((e) => e.data === de).length, proximos: proximos.slice(0, 30) };
}
