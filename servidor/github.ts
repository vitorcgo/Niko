import { normalizarCalendarioGithub } from "../src/utilitarios/contribuicoesGithub.ts";
import { normalizarCommitsGithub } from "../src/utilitarios/commitsGithub.ts";

type ConsultaGithub = (url: string, cabecalhos: Record<string, string>, corpo: { query: string }) => Promise<unknown>;

export async function lerContribuicoesGithub(cabecalhos: Record<string, string>, consultar: ConsultaGithub) {
  const query = "query { viewer { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }";
  return normalizarCalendarioGithub(await consultar("https://api.github.com/graphql", cabecalhos, { query }));
}

export async function lerCommitsGithub(usuario: string, cabecalhos: Record<string, string>, consultar: (url: string, cabecalhos: Record<string, string>) => Promise<unknown>) {
  if (!/^[a-z\d][a-z\d-]{0,38}$/i.test(usuario)) throw new Error("usuario_github_invalido");
  const query = encodeURIComponent(`author:${usuario}`);
  return normalizarCommitsGithub(await consultar(`https://api.github.com/search/commits?q=${query}&sort=committer-date&order=desc&per_page=12`, cabecalhos));
}
