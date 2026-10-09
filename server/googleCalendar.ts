import { apiGoogle, authorizeGoogle, readCredentialGmail, type CredentialGmail } from "./gmail";

const SCOPES_AGENDA = ["https://www.googleapis.com/auth/calendar.readonly"];
const BASE_AGENDA = "https://www.googleapis.com/calendar/v3";
const DAYS_MAXIMUM_AGENDA = 62;
const DAYS_SUMMARY = 7;

export interface EventGoogle {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  link?: string;
}

interface EventApi {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function authorizeAgenda(clientId: string, secret: string): Promise<CredentialGmail> {
  return authorizeGoogle(clientId, secret, SCOPES_AGENDA, "Google Agenda");
}

export function convertEventsGoogle(items: EventApi[], from: string, until: string): EventGoogle[] {
  const list: EventGoogle[] = [];
  for (const e of items) {
    if (e.status === "cancelled" || !e.start) continue;
    const title = (e.summary ?? "").trim().slice(0, 120) || "(sem título)";
    const link = e.htmlLink?.startsWith("https://www.google.com/calendar/") || e.htmlLink?.startsWith("https://calendar.google.com/") ? e.htmlLink : undefined;
    if (e.start.dateTime) {
      const start = new Date(e.start.dateTime);
      if (Number.isNaN(start.getTime())) continue;
      const data = localDate(start);
      if (data >= from && data <= until) list.push({ id: `${e.id}-${data}`, titulo: title, data, hora: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`, link });
      continue;
    }
    if (!e.start.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.start.date)) continue;
    const end = e.end?.date && /^\d{4}-\d{2}-\d{2}$/.test(e.end.date) ? e.end.date : e.start.date;
    const day = new Date(`${e.start.date}T12:00:00`);
    for (let n = 0; n < DAYS_MAXIMUM_AGENDA; n++) {
      const data = localDate(day);
      if (n > 0 && data >= end) break;
      if (data >= from && data <= until) list.push({ id: `${e.id}-${data}`, titulo: title, data, link });
      day.setDate(day.getDate() + 1);
    }
  }
  return list;
}

async function eventsPeriod(c: CredentialGmail, from: string, until: string): Promise<EventGoogle[]> {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${until}T23:59:59`);
  const parameters = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  try {
    const r = await apiGoogle<{ items?: EventApi[] }>(c, `/calendars/primary/events?${parameters}`, undefined, BASE_AGENDA);
    return convertEventsGoogle(r.items ?? [], from, until);
  } catch (e) {
    const m = (e as Error).message;
    if (/^http_403/.test(m) && /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(m)) throw new Error("agenda_sem_permissao");
    if (/^http_403/.test(m) && /SERVICE_DISABLED|accessNotConfigured|has not been used/i.test(m)) throw new Error("agenda_api_desativada");
    throw e;
  }
}

export async function readAgendaGoogle(text: string, from: string, until: string): Promise<EventGoogle[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || from > until) throw new Error("periodo_invalido");
  if ((new Date(`${until}T23:59:59`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000 > DAYS_MAXIMUM_AGENDA) throw new Error("periodo_invalido");
  return eventsPeriod(readCredentialGmail(text), from, until);
}

export async function summaryAgenda(text: string) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + DAYS_SUMMARY - 1);
  const from = localDate(today);
  const next = await eventsPeriod(readCredentialGmail(text), from, localDate(end));
  return { hoje: next.filter((e) => e.data === from).length, proximos: next.slice(0, 30) };
}
