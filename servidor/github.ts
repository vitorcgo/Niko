import { normalizarCalendarioGithub } from "../src/utilitarios/contribuicoesGithub.ts";

type ConsultaGithub = (url: string, cabecalhos: Record<string, string>, corpo: { query: string }) => Promise<unknown>;

export async function lerContribuicoesGithub(cabecalhos: Record<string, string>, consultar: ConsultaGithub) {
  const query = "query { viewer { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }";
  return normalizarCalendarioGithub(await consultar("https://api.github.com/graphql", cabecalhos, { query }));
}
