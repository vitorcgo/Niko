import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, getDaysInMonth, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { useRoutine, tasksDay, habitCompleted } from "../../state/routine";
import { useConfig } from "../../state/settings";
import { T } from "../../i18n/ptBR";
import { formatDateString, formatDate, toISO, todayISO } from "../../utils/dates";
import { sanitizeHtml, escapeHtml } from "../../utils/sanitize";
import type { Mood } from "../../types";

const COLOR_MOOD: Record<Mood, string> = { otimo: "#22c55e", bom: "#84cc16", neutro: "#f59e0b", dificil: "#ef4444" };

function e(text: string) {
  return escapeHtml(text);
}

function liters(ml: number) {
  return (ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function printMonth(month: Date, onFail: () => void) {
  const { tarefas: tasks, dias: days, habitos: habits, registros: records } = useRoutine.getState();
  const cfg = useConfig.getState();
  const P = T.journal.impressao;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--destaque").trim() || "#7c5ce0";
  const start = startOfMonth(month);
  const list = Array.from({ length: getDaysInMonth(start) }, (_, i) => toISO(addDays(start, i)));
  const active = habits.filter((h) => !h.arquivado);
  const today = todayISO();

  const tasksMonth = list.flatMap((d) => tasksDay(tasks, d));
  const completed = tasksMonth.filter((t) => t.status === "concluida").length;
  const sleep = list.map((d) => days[d]?.sono ?? 0).filter((v) => v > 0);
  const water = list.map((d) => days[d]?.agua ?? 0).filter((v) => v > 0);
  const moods = list.map((d) => days[d]?.humor).filter((h): h is Mood => !!h);
  const count = moods.reduce<Record<string, number>>((a, h) => ((a[h] = (a[h] ?? 0) + 1), a), {});
  const dominant = (Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "") as Mood | "";
  const past = list.filter((d) => d <= today);
  const totalHabit = active.length * past.length;
  const doneHabit = active.reduce((a, h) => a + past.filter((d) => habitCompleted(h, records[d]?.[h.id])).length, 0);
  const recorded = list.filter((d) => days[d] && (days[d].diario || days[d].nota || days[d].humor || days[d].sono || days[d].agua)).length;

  const stats = [
    [String(recorded), P.diasRegistrados],
    [`${completed}/${tasksMonth.length}`, P.tarefasConcluidas],
    [sleep.length ? `${(sleep.reduce((a, b) => a + b, 0) / sleep.length).toFixed(1).replace(".", ",")} h` : "--", P.mediaSono],
    [water.length ? `${liters(water.reduce((a, b) => a + b, 0) / water.length)} L` : "--", P.mediaAgua],
    [dominant ? T.humor[dominant] : "--", P.humorPredominante],
    [totalHabit ? `${Math.round((doneHabit / totalHabit) * 100)}%` : "--", P.habitosCumpridos],
  ];

  const grid = eachDayOfInterval({ start: startOfWeek(start, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(start), { weekStartsOn: 1 }) });
  const calendar = grid
    .map((d) => {
      const iso = toISO(d);
      const day = days[iso];
      const outside = !isSameMonth(d, start);
      const color = day?.humor ? COLOR_MOOD[day.humor] : "transparent";
      const waterValue = day?.agua ? Math.min(1, day.agua / cfg.agua.meta) : 0;
      return `<div class="cal-dia${outside ? " fora" : ""}" style="--humor:${color}"><span>${d.getDate()}</span>${day?.diario ? '<i class="ponto"></i>' : ""}${waterValue ? `<b class="agua" style="width:${Math.round(waterValue * 100)}%"></b>` : ""}</div>`;
    })
    .join("");

  const tableHabits = active.length
    ? `<table class="habitos"><thead><tr><th></th>${list.map((d) => `<th>${Number(d.slice(8))}</th>`).join("")}</tr></thead><tbody>${active
        .map((h) => `<tr><th>${e(h.nome)}</th>${list.map((d) => `<td>${habitCompleted(h, records[d]?.[h.id]) ? '<i class="ok"></i>' : (records[d]?.[h.id] ?? 0) > 0 ? '<i class="meio"></i>' : '<i class="nao"></i>'}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    : "";

  const inputs = list
    .map((d) => {
      const day = days[d];
      const t = tasksDay(tasks, d);
      if (!day && t.length === 0) return "";
      const habit = active.filter((h) => habitCompleted(h, records[d]?.[h.id]));
      const chips = [
        day?.humor ? `<span class="chip" style="--c:${COLOR_MOOD[day.humor]}"><i></i>${e(T.humor[day.humor])}</span>` : "",
        day?.sono ? `<span class="chip">${e(T.journal.sono)}: ${String(day.sono).replace(".", ",")} h</span>` : "",
        day?.agua ? `<span class="chip agua-chip">${e(T.journal.agua)}: ${liters(day.agua)} L</span>` : "",
      ].join("");
      const listTasks = t.length
        ? `<ul class="tarefas">${t.map((x) => `<li class="${x.status}"><i></i><span>${e(x.titulo)}</span>${x.status !== "concluida" && x.status !== "a_fazer" ? `<em>${e(T.status[x.status])}</em>` : ""}</li>`).join("")}</ul>`
        : "";
      return `<article class="dia"><div class="data"><b>${d.slice(8)}</b><span>${e(formatDateString(d, "EEE"))}</span></div><div class="conteudo">${chips ? `<div class="chips">${chips}</div>` : ""}${listTasks}${habit.length ? `<div class="hab">${habit.map((h) => `<span>${e(h.nome)}</span>`).join("")}</div>` : ""}${day?.diario ? `<div class="diario">${sanitizeHtml(day.diario)}</div>` : ""}${day?.nota ? `<p class="nota">${e(day.nota)}</p>` : ""}${[day?.manha, day?.tarde, day?.noite].some(Boolean) ? `<div class="periodos">${(["manha", "tarde", "noite"] as const).filter((p) => day?.[p]).map((p) => `<span><b>${e(T.journal[p])}</b> ${e(day![p])}</span>`).join("")}</div>` : ""}</div></article>`;
    })
    .filter(Boolean)
    .join("");

  const photo = cfg.foto && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(cfg.foto) ? `<img class="foto" src="${e(cfg.foto)}" alt="">` : `<span class="foto letra">${e((cfg.nome || "N").slice(0, 1).toUpperCase())}</span>`;
  const title = formatDate(start, "MMMM yyyy");
  const css = `
  @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root { --d: ${accent}; }
  body { margin: 0; font-family: "Inter", system-ui, sans-serif; color: #1c1c1e; font-size: 11.5px; line-height: 1.5; background: #fff; }
  .pagina { max-width: 186mm; margin: 0 auto; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-radius: 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--d) 16%, #fff), #fff 70%); border: 1px solid #ececec; }
  .marca { display: flex; align-items: center; gap: 12px; }
  .logo { width: 38px; height: 38px; border-radius: 10px; background: #111; color: #fff; display: grid; place-items: center; font: 700 20px "IBM Plex Mono", ui-monospace, monospace; }
  h1 { margin: 0; font: 700 22px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: -0.01em; text-transform: capitalize; }
  .rotulo { font: 600 9.5px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; color: var(--d); }
  .pessoa { display: flex; align-items: center; gap: 10px; text-align: right; }
  .pessoa b { display: block; font-size: 13px; }
  .pessoa small { color: #8a8a8a; }
  .foto { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 0 0 1px #e5e5e5; }
  .letra { display: grid; place-items: center; background: color-mix(in srgb, var(--d) 18%, #fff); color: var(--d); font-weight: 700; font-size: 18px; }
  .estat { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 14px 0; }
  .estat div { padding: 10px; border: 1px solid #ececec; border-radius: 12px; }
  .estat b { display: block; font: 700 16px "IBM Plex Mono", ui-monospace, monospace; }
  .estat span { color: #8a8a8a; font-size: 9.5px; }
  .bloco { border: 1px solid #ececec; border-radius: 14px; padding: 14px; margin-bottom: 14px; break-inside: avoid; }
  .bloco h2 { margin: 0 0 10px; font: 600 10px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8a8a; }
  .duas { display: grid; grid-template-columns: 1fr 1.2fr; gap: 14px; }
  .semana, .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .semana span { text-align: center; font-size: 9px; color: #9a9a9a; text-transform: uppercase; }
  .cal-dia { position: relative; height: 34px; border-radius: 8px; background: color-mix(in srgb, var(--humor) 22%, #f6f6f5); border: 1px solid color-mix(in srgb, var(--humor) 50%, #eee); padding: 3px 5px; font-size: 10px; overflow: hidden; }
  .cal-dia.fora { opacity: 0.3; }
  .cal-dia .ponto { position: absolute; top: 5px; right: 5px; width: 5px; height: 5px; border-radius: 50%; background: var(--d); }
  .cal-dia .agua { position: absolute; left: 0; bottom: 0; height: 3px; background: #60a5fa; }
  .legenda { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; font-size: 9.5px; color: #6b6b6b; }
  .legenda i { display: inline-block; width: 8px; height: 8px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
  table.habitos { width: 100%; border-collapse: collapse; font-size: 8.5px; table-layout: fixed; }
  table.habitos th { font-weight: 500; color: #9a9a9a; padding: 1px; }
  table.habitos tbody th { text-align: left; color: #1c1c1e; font-size: 9.5px; width: 26mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  table.habitos td { text-align: center; padding: 1px; }
  table.habitos i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; background: #eeeeec; }
  table.habitos i.ok { background: var(--d); }
  table.habitos i.meio { background: color-mix(in srgb, var(--d) 40%, #fff); }
  .dia { display: grid; grid-template-columns: 46px 1fr; gap: 12px; padding: 12px 0; border-top: 1px dashed #e5e5e5; break-inside: avoid; }
  .dia:first-of-type { border-top: 0; }
  .data { text-align: center; }
  .data b { display: block; font: 700 22px/1 "IBM Plex Mono", ui-monospace, monospace; color: var(--d); }
  .data span { font-size: 9.5px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 0.06em; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; background: #f4f4f2; font-size: 10px; }
  .chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
  .agua-chip { background: #e8f3ff; color: #1d4ed8; }
  ul.tarefas { list-style: none; margin: 0 0 6px; padding: 0; }
  ul.tarefas li { display: flex; align-items: center; gap: 7px; padding: 1px 0; }
  ul.tarefas li i { width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid #bdbdbd; flex: 0 0 auto; }
  ul.tarefas li.concluida i { background: var(--d); border-color: var(--d); }
  ul.tarefas li.concluida span { text-decoration: line-through; color: #8a8a8a; }
  ul.tarefas li.cancelada span { text-decoration: line-through; color: #b0b0b0; }
  ul.tarefas em { font-style: normal; font-size: 9px; color: #8a8a8a; border: 1px solid #e5e5e5; border-radius: 999px; padding: 0 6px; }
  .hab { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
  .hab span { font-size: 9.5px; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--d) 12%, #fff); color: color-mix(in srgb, var(--d) 75%, #000); }
  .diario { font-size: 11px; color: #2a2a2e; }
  .diario p { margin: 0 0 4px; }
  .nota { margin: 6px 0 0; padding: 6px 10px; border-radius: 8px; background: #fff8db; border-left: 3px solid #f2c94c; font-size: 10.5px; }
  .periodos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; font-size: 10px; color: #4a4a4a; }
  .periodos b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9a9a; }
  footer { margin-top: 18px; text-align: center; font-size: 9px; color: #a0a0a0; }
  .vazio { color: #9a9a9a; text-align: center; padding: 24px; }
  `;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(T.journal.titulo)} ${e(title)}</title><style>${css}</style></head><body><div class="pagina">
  <header><div class="marca"><span class="logo">N</span><div><span class="rotulo">${e(T.journal.titulo)}</span><h1>${e(title)}</h1></div></div><div class="pessoa"><div><b>${e(cfg.nome || T.barraLateral.perfil)}</b><small>${e(P.geradoEm(formatDateString(today, "d 'de' MMMM 'de' yyyy")))}</small></div>${photo}</div></header>
  <section class="estat">${stats.map(([v, r]) => `<div><b>${e(v)}</b><span>${e(r)}</span></div>`).join("")}</section>
  <div class="duas">
    <section class="bloco"><h2>${e(P.humorDoMes)}</h2><div class="semana">${T.calendario.diasSemana.map((d) => `<span>${e(d)}</span>`).join("")}</div><div class="cal">${calendar}</div><div class="legenda">${(Object.keys(COLOR_MOOD) as Mood[]).map((h) => `<span><i style="background:${COLOR_MOOD[h]}"></i>${e(T.humor[h])}</span>`).join("")}<span><i style="background:#60a5fa"></i>${e(T.journal.agua)}</span></div></section>
    <section class="bloco"><h2>${e(T.journal.habitos)}</h2>${tableHabits || `<p class="vazio">${e(T.journal.semHabitos)}</p>`}</section>
  </div>
  <section class="bloco"><h2>${e(P.dias)}</h2>${inputs || `<p class="vazio">${e(P.semRegistros)}</p>`}</section>
  <footer>${e(P.rodape)}</footer>
  </div></body></html>`;

  printAtBoardInvisible(html, onFail);
}

const WAIT_TO_PRINT_MS = 350;
const LIMIT_BOARD_MS = 10 * 60_000;

function printAtBoardInvisible(html: string, onFail: () => void) {
  document.querySelector("iframe[data-niko-impressao]")?.remove();
  const board = document.createElement("iframe");
  board.dataset.nikoImpressao = "";
  board.setAttribute("aria-hidden", "true");
  board.tabIndex = -1;
  board.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  const address = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const remove = () => {
    board.remove();
    URL.revokeObjectURL(address);
  };
  board.onload = () => {
    const target = board.contentWindow;
    if (!target) {
      remove();
      onFail();
      return;
    }
    target.addEventListener("afterprint", () => window.setTimeout(remove, 0), { once: true });
    window.setTimeout(() => {
      try {
        target.focus();
        target.print();
      } catch {
        remove();
        onFail();
      }
    }, WAIT_TO_PRINT_MS);
    window.setTimeout(remove, LIMIT_BOARD_MS);
  };
  board.src = address;
  document.body.appendChild(board);
}
