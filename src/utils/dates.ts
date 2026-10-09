import { addDays, format, parseISO, differenceInCalendarDays, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { T } from "../i18n/ptBR";

export function toISO(data: Date): string {
  return format(data, "yyyy-MM-dd");
}

export function fromISO(text: string): Date {
  return parseISO(text);
}

export function isValidDate(text: string | undefined): boolean {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return isValid(parseISO(text));
}

export function isValidTime(text: string | undefined): boolean {
  if (!text) return false;
  const parts = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!parts) return false;
  return Number(parts[1]) < 24 && Number(parts[2]) < 60;
}

let rolloverAs4h = false;

export function setRolloverDay(active: boolean) {
  rolloverAs4h = active;
}

export function nowNiko(): Date {
  const now = new Date();
  if (rolloverAs4h && now.getHours() < 4) return addDays(now, -1);
  return now;
}

export function todayISO(): string {
  return toISO(nowNiko());
}

export function formatDateString(text: string, defaultValue: string): string {
  return format(parseISO(text), defaultValue, { locale: ptBR });
}

export function formatDate(data: Date, defaultValue: string): string {
  return format(data, defaultValue, { locale: ptBR });
}

export function daysUntil(text: string): number {
  return differenceInCalendarDays(parseISO(text), parseISO(todayISO()));
}

export function describeDistance(text: string): string {
  const days = daysUntil(text);
  if (days === 0) return T.datas.hoje;
  if (days === 1) return T.datas.amanha;
  if (days === -1) return T.datas.ontem;
  if (days > 1) return T.datas.emDias(days);
  return T.datas.haDias(Math.abs(days));
}

export function scheduleRelative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return T.datas.agora;
  if (seconds < 3600) return T.datas.haMin(Math.round(seconds / 60));
  if (seconds < 86400) return T.datas.haHoras(Math.round(seconds / 3600));
  return T.datas.haDiasCurto(Math.round(seconds / 86400));
}

export function dayMoment(iso: string): string {
  const moment = new Date(iso);
  return toISO(rolloverAs4h && moment.getHours() < 4 ? addDays(moment, -1) : moment);
}

export function monthISO(text: string): string {
  return text.slice(0, 7);
}

export function greeting(): string {
  const time = new Date().getHours();
  if (time < 5) return T.datas.boaNoite;
  if (time < 12) return T.datas.bomDia;
  if (time < 18) return T.datas.boaTarde;
  return T.datas.boaNoite;
}
