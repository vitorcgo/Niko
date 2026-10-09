import { dataValida, horaValida } from "./datas";

function partesNoFuso(instante: number, fuso: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)!.value;
  return {
    data: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}`,
    segundos: valor("second"),
  };
}

export function lerDataIcs(valor: string, parametros = "", fusoLocal = Intl.DateTimeFormat().resolvedOptions().timeZone): { data: string; hora?: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(valor);
  if (!m) return null;
  const data = `${m[1]}-${m[2]}-${m[3]}`;
  if (!dataValida(data)) return null;
  if (!m[4]) return { data };
  const hora = `${m[4]}:${m[5]}`;
  if (!horaValida(hora) || Number(m[6]) > 59 || /;VALUE=DATE(?:;|$)/i.test(parametros)) return null;
  const fuso = /;TZID=(?:"([^"]+)"|([^;]+))/i.exec(parametros);
  if (!m[7] && !fuso) return { data, hora };
  const referencia = Date.parse(`${data}T${hora}:${m[6]}Z`);
  let instante = referencia;
  if (!m[7]) {
    const origem = fuso![1] ?? fuso![2];
    const candidatos = [-86400000, 0, 86400000].map((desvio) => {
      const amostra = referencia + desvio;
      const partes = partesNoFuso(amostra, origem);
      const deslocamento = Date.parse(`${partes.data}T${partes.hora}:${partes.segundos}Z`) - amostra;
      return referencia - deslocamento;
    }).filter((candidato) => {
      const partes = partesNoFuso(candidato, origem);
      return partes.data === data && partes.hora === hora && partes.segundos === m[6];
    });
    if (!candidatos.length) return null;
    instante = Math.min(...candidatos);
  }
  const local = partesNoFuso(instante, fusoLocal);
  return { data: local.data, hora: local.hora };
}

export function lerEventosIcs(texto: string, fusoLocal = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const blocos = texto.replace(/\r?\n[ \t]/g, "").match(/BEGIN:VEVENT\r?\n[\s\S]*?\r?\nEND:VEVENT/g) ?? [];
  return blocos.slice(0, 499).flatMap((bloco) => {
    const linhas = bloco.split(/\r?\n/);
    const propriedade = (nome: string) => linhas.find((linha) => linha.startsWith(`${nome}:`) || linha.startsWith(`${nome};`));
    const resumo = propriedade("SUMMARY")?.replace(/^SUMMARY[^:]*:/, "").trim().replace(/\\([,;nN\\])/g, (_, c: string) => /[nN]/.test(c) ? " " : c);
    const inicio = /^DTSTART([^:]*):(.*)$/.exec(propriedade("DTSTART") ?? "");
    if (!resumo || !inicio) return [];
    const quando = lerDataIcs(inicio[2], inicio[1], fusoLocal);
    if (!quando) return [];
    const rr = /(?:^|;)FREQ=(DAILY|WEEKLY|MONTHLY)(?:;|$)/.exec(propriedade("RRULE")?.slice(6) ?? "")?.[1];
    const excecoes = linhas.filter((linha) => /^EXDATE[;:]/.test(linha)).flatMap((linha) => {
      const m = /^EXDATE([^:]*):(.*)$/.exec(linha)!;
      return m[2].split(",").flatMap((valor) => {
        const quando = lerDataIcs(valor, m[1], fusoLocal);
        return quando ? [quando.data] : [];
      });
    });
    return [{ titulo: resumo.slice(0, 120), ...quando, tipo: "evento" as const,
      repeticao: rr === "DAILY" ? "diaria" as const : rr === "WEEKLY" ? "semanal" as const : rr === "MONTHLY" ? "mensal" as const : "nenhuma" as const,
      excecoes: [...new Set(excecoes)].slice(0, 400) }];
  });
}
