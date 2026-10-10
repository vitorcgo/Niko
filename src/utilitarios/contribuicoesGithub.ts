export interface DiaContribuicaoGithub {
  data: string;
  quantidade: number;
  nivel: number;
}

export interface CalendarioContribuicoesGithub {
  total: number;
  dias: DiaContribuicaoGithub[];
}

const NIVEIS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
const DIA_MS = 86400000;
const objeto = (valor: unknown): Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
const inteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;

export function normalizarCalendarioGithub(resposta: unknown): CalendarioContribuicoesGithub {
  const r = objeto(resposta);
  const calendario = objeto(objeto(objeto(objeto(r.data).viewer).contributionsCollection).contributionCalendar);
  if (r.errors || !inteiro(calendario.totalContributions) || !Array.isArray(calendario.weeks)) throw new Error("contribuicoes_indisponiveis");
  const dias: DiaContribuicaoGithub[] = [];
  for (const semana of calendario.weeks) {
    const lista = objeto(semana).contributionDays;
    if (!Array.isArray(lista)) throw new Error("contribuicoes_invalidas");
    for (const valor of lista) {
      const dia = objeto(valor);
      const nivel = NIVEIS.indexOf(String(dia.contributionLevel));
      const data = typeof dia.date === "string" ? dia.date : "";
      const tempo = Date.parse(`${data}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(tempo) || new Date(tempo).toISOString().slice(0, 10) !== data || !inteiro(dia.contributionCount) || nivel < 0 || dias.length >= 371)
        throw new Error("contribuicoes_invalidas");
      dias.push({ data, quantidade: dia.contributionCount, nivel });
    }
  }
  dias.sort((a, b) => a.data.localeCompare(b.data));
  if (!dias.length || dias.some((d, i) => i > 0 && Date.parse(d.data) - Date.parse(dias[i - 1].data) !== DIA_MS)) throw new Error("contribuicoes_invalidas");
  return { total: calendario.totalContributions, dias };
}

export function montarGradeGithub(calendario: CalendarioContribuicoesGithub) {
  const deslocamento = new Date(`${calendario.dias[0].data}T00:00:00Z`).getUTCDay();
  const celulas: (DiaContribuicaoGithub | null)[] = [...Array.from({ length: deslocamento }, () => null), ...calendario.dias];
  const semanas = Math.ceil(celulas.length / 7);
  const meses = Array.from({ length: semanas }, (_, coluna) => {
    const primeiro = celulas.slice(coluna * 7, coluna * 7 + 7).find(Boolean);
    const anterior = coluna ? celulas.slice((coluna - 1) * 7, coluna * 7).find(Boolean) : null;
    return primeiro && (!anterior || primeiro.data.slice(0, 7) !== anterior.data.slice(0, 7)) ? primeiro.data : null;
  });
  return { celulas, semanas, meses };
}

export function resumirContribuicoesGithub(calendario: CalendarioContribuicoesGithub) {
  return {
    ultimos7dias: calendario.dias.slice(-7).reduce((total, d) => total + d.quantidade, 0),
    diasAtivos: calendario.dias.filter((d) => d.quantidade > 0).length,
    melhorDia: calendario.dias.reduce((melhor, d) => d.quantidade > melhor.quantidade ? d : melhor, calendario.dias[0]),
  };
}
