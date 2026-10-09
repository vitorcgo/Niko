import { addDays, addHours, addMinutes, setDate, addMonths, isValid } from "date-fns";
import { nowNiko, toISO } from "./dates";

export interface When {
  data?: string;
  hora?: string;
  resto: string;
}

const DAYS_WEEK: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};

function withoutAccent(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

export function interpretWhen(textOriginal: string): When {
  let text = ` ${textOriginal} `;
  const compare = () => withoutAccent(text.toLowerCase());
  let data: Date | undefined;
  let time: string | undefined;
  const base = nowNiko();

  const remove = (regex: RegExp) => {
    const target = compare();
    const found = regex.exec(target);
    if (!found) return null;
    text = text.slice(0, found.index) + " " + text.slice(found.index + found[0].length);
    return found;
  };

  const daqui = remove(/\sdaqui\s+(?:a\s+)?(\d{1,3})\s*(minutos?|min|horas?|h|dias?)\s/);
  if (daqui) {
    const n = Number(daqui[1]);
    const unit = daqui[2];
    const now = new Date();
    if (unit.startsWith("min")) {
      const target = addMinutes(now, n);
      data = target;
      time = `${twoDigits(target.getHours())}:${twoDigits(target.getMinutes())}`;
    } else if (unit.startsWith("h")) {
      const target = addHours(now, n);
      data = target;
      time = `${twoDigits(target.getHours())}:${twoDigits(target.getMinutes())}`;
    } else {
      data = addDays(base, n);
    }
  }

  if (!data && remove(/\sdepois de amanha\s/)) data = addDays(base, 2);
  if (!data && remove(/\samanha\s/)) data = addDays(base, 1);
  if (!data && remove(/\shoje\s/)) data = base;

  if (!data) {
    const bar = remove(/\s(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/);
    if (bar) {
      const year = bar[3] ? (bar[3].length === 2 ? 2000 + Number(bar[3]) : Number(bar[3])) : base.getFullYear();
      const candidate = new Date(year, Number(bar[2]) - 1, Number(bar[1]));
      if (isValid(candidate) && candidate.getDate() === Number(bar[1])) data = candidate;
    }
  }

  if (!data) {
    const day = remove(/\sdia\s+(\d{1,2})\s/);
    if (day) {
      const n = Number(day[1]);
      if (n >= 1 && n <= 31) {
        let candidate = setDate(base, n);
        if (candidate < new Date(base.getFullYear(), base.getMonth(), base.getDate())) candidate = setDate(addMonths(base, 1), n);
        data = candidate;
      }
    }
  }

  if (!data) {
    const names = Object.keys(DAYS_WEEK).sort((a, b) => b.length - a.length).join("|");
    const week = remove(new RegExp(`\\s(?:na\\s+|no\\s+|nesta\\s+|neste\\s+|proxima\\s+|proximo\\s+)?(${names})\\s`));
    if (week) {
      const target = DAYS_WEEK[week[1]];
      let difference = (target - base.getDay() + 7) % 7;
      if (difference === 0) difference = 7;
      data = addDays(base, difference);
    }
  }

  if (!time) {
    const h = remove(/\s(?:as\s+|a\s+partir\s+das\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))\s/);
    if (h) {
      const hours = Number(h[1]);
      const minutes = Number(h[2] ?? h[3] ?? 0);
      if (hours < 24 && minutes < 60) {
        time = `${twoDigits(hours)}:${twoDigits(minutes)}`;
        if (!data) {
          const now = new Date();
          const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
          data = todayTime < now ? addDays(base, 1) : base;
        }
      }
    }
  }

  return {
    data: data ? toISO(data) : undefined,
    hora: time,
    resto: text.replace(/\s+/g, " ").trim(),
  };
}
