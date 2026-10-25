import { lerJson } from "./conexoesExtras.ts";
import { validarUrlBase } from "./ia.ts";
import { calendarioDeContagens } from "../src/utilitarios/contribuicoesGithub.ts";

type Pedir = <T>(url: string, cabecalhos: Record<string, string>, corpo?: unknown) => Promise<T>;
type Ci = "sucesso" | "falhou" | "rodando" | "nenhum";
type Revisao = "pendente" | "aprovado" | "mudancas";
export type Forja = "gitlab" | "gitea";

export const SITE_DO_GITLAB = "https://gitlab.com";
const DIA_MS = 86_400_000;
const LIMITE_DE_PRS_DETALHADOS = 6;
const PAGINAS_DE_EVENTOS = 5;

export function credencialDaForja(forja: Forja, site: string, token: string): string {
  const limpo = site.trim();
  const base = limpo ? validarUrlBase(limpo, true) : forja === "gitlab" ? SITE_DO_GITLAB : "";
  if (!base) throw new Error("forja_sem_site");
  if (token.trim().length < 8) throw new Error("chave_invalida");
  return JSON.stringify({ site: base, token: token.trim() });
}

function credencial(chave: string) {
  const c = lerJson<{ site: string; token: string }>(chave);
  if (typeof c.site !== "string" || typeof c.token !== "string" || !c.token) throw new Error("chave_invalida");
  return { site: validarUrlBase(c.site, true), token: c.token };
}

export function diaLocal(iso: string | number): string {
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function ciDoPipeline(status: string | null | undefined): Ci {
  if (!status) return "nenhum";
  if (["created", "waiting_for_resource", "preparing", "pending", "running", "scheduled"].includes(status)) return "rodando";
  if (status === "failed") return "falhou";
  if (status === "success") return "sucesso";
  return "nenhum";
}

export function ciDoStatusCombinado(estado: string | null | undefined, total: number): Ci {
  if (!total || !estado) return "nenhum";
  if (estado === "pending") return "rodando";
  if (estado === "failure" || estado === "error") return "falhou";
  return "sucesso";
}

export function revisaoDoGitea(avaliacoes: { state?: string }[]): Revisao {
  const decisivas = avaliacoes.filter((a) => a.state === "APPROVED" || a.state === "REQUEST_CHANGES");
  const ultima = decisivas.at(-1)?.state;
  return ultima === "APPROVED" ? "aprovado" : ultima === "REQUEST_CHANGES" ? "mudancas" : "pendente";
}

const lista = <T,>(v: T[] | unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const ultimoTrecho =(caminho: string | undefined) => (caminho ?? "").split("/").filter(Boolean).pop() ?? "";
const segundos = (inicio: string, fim: string) => Math.max(0, Math.round((Date.parse(fim) - Date.parse(inicio)) / 1000));
const ciDoAction = (ci: Ci): "sucesso" | "falhou" | "rodando" | null => (ci === "nenhum" ? null : ci);

export async function lerGitlab(chave: string, pedir: Pedir) {
  const { site, token } = credencial(chave);
  const api = `${site}/api/v4`;
  const h = { "private-token": token };
  type Mr = { iid: number; project_id: number; title: string; web_url: string; created_at: string; author?: { username?: string }; references?: { full?: string } };
  type Issue = { iid: number; title: string; web_url: string; created_at: string; labels?: string[]; references?: { full?: string } };
  type Projeto = { id: number; name: string; default_branch?: string | null; last_activity_at: string; visibility?: string; star_count?: number };
  type Pipeline = { id: number; status: string; ref: string; created_at: string; updated_at: string };
  const eu = await pedir<{ username: string }>(`${api}/user`, h);
  const [meus, paraRevisar, issues, projetos] = (await Promise.all([
    pedir<Mr[]>(`${api}/merge_requests?state=opened&scope=created_by_me&per_page=15`, h),
    pedir<Mr[]>(`${api}/merge_requests?state=opened&scope=reviews_for_me&per_page=15`, h).catch(() => []),
    pedir<Issue[]>(`${api}/issues?state=opened&scope=assigned_to_me&per_page=20`, h),
    pedir<Projeto[]>(`${api}/projects?membership=true&order_by=last_activity_at&per_page=10`, h),
  ])).map((x) => lista(x)) as [Mr[], Mr[], Issue[], Projeto[]];
  const umAnoAtras = new Date(Date.now() - 365 * DIA_MS).toISOString().slice(0, 10);
  const porDia: Record<string, number> = {};
  for (let pagina = 1; pagina <= PAGINAS_DE_EVENTOS; pagina++) {
    const eventos = lista<{ created_at: string }>(await pedir<{ created_at: string }[]>(`${api}/events?after=${umAnoAtras}&per_page=100&page=${pagina}`, h).catch(() => []));
    for (const e of eventos) if (typeof e.created_at === "string") porDia[diaLocal(e.created_at)] = (porDia[diaLocal(e.created_at)] ?? 0) + 1;
    if (eventos.length < 100) break;
  }
  const detalhar = async (mr: Mr): Promise<{ ci: Ci; revisao: Revisao }> => {
    const [detalhe, aprovacoes] = await Promise.all([
      pedir<{ head_pipeline?: { status?: string } | null }>(`${api}/projects/${mr.project_id}/merge_requests/${mr.iid}`, h).catch(() => null),
      pedir<{ approved?: boolean; approved_by?: unknown[] }>(`${api}/projects/${mr.project_id}/merge_requests/${mr.iid}/approvals`, h).catch(() => null),
    ]);
    return { ci: ciDoPipeline(detalhe?.head_pipeline?.status), revisao: aprovacoes?.approved || (aprovacoes?.approved_by?.length ?? 0) > 0 ? "aprovado" : "pendente" };
  };
  const detalhes = await Promise.all(meus.slice(0, LIMITE_DE_PRS_DETALHADOS).map(detalhar));
  const pipelines = await Promise.all(
    projetos.slice(0, 4).map((p) =>
      p.default_branch
        ? pedir<Pipeline[]>(`${api}/projects/${p.id}/pipelines?ref=${encodeURIComponent(p.default_branch)}&per_page=5`, h).then((l) => lista<Pipeline>(l).map((x) => ({ ...x, repo: p.name }))).catch(() => [])
        : Promise.resolve([]),
    ),
  );
  const repoDoMr = (r?: { full?: string }) => ultimoTrecho(r?.full?.split("!")[0]);
  const repoDaIssue = (r?: { full?: string }) => ultimoTrecho(r?.full?.split("#")[0]);
  const paraLista = (m: Mr, tipo: "meu" | "revisar", extra: { ci: Ci; revisao: Revisao } = { ci: "nenhum", revisao: "pendente" }) => ({
    titulo: m.title, repo: repoDoMr(m.references), numero: m.iid, autor: m.author?.username ?? "", data: m.created_at, url: m.web_url, tipo, ...extra,
  });
  return {
    usuario: eu.username,
    contribuicoes: calendarioDeContagens(porDia, diaLocal(Date.now())),
    commits: null,
    repositorios: projetos.map((p) => ({ nome: p.name, linguagem: "", estrelas: p.star_count ?? 0, atualizado: p.last_activity_at, privado: p.visibility !== "public" })),
    prs: [...paraRevisar.map((m) => paraLista(m, "revisar")), ...meus.map((m, i) => paraLista(m, "meu", detalhes[i]))],
    issues: issues.map((i) => ({ titulo: i.title, repo: repoDaIssue(i.references), numero: i.iid, rotulos: i.labels ?? [], data: i.created_at })),
    actions: pipelines
      .flat()
      .flatMap((x) => {
        const status = ciDoAction(ciDoPipeline(x.status));
        return status ? [{ workflow: `#${x.id}`, repo: x.repo, branch: x.ref, status, duracao: segundos(x.created_at, x.updated_at), data: x.updated_at }] : [];
      })
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 15),
  };
}

export async function lerGitea(chave: string, pedir: Pedir) {
  const { site, token } = credencial(chave);
  const api = `${site}/api/v1`;
  const h = { authorization: `token ${token}` };
  type Item = { number: number; title: string; html_url: string; created_at: string; user?: { login?: string }; labels?: { name: string }[]; repository?: { full_name?: string; name?: string } };
  type Repo = { name: string; full_name: string; default_branch?: string; updated_at: string; private?: boolean; language?: string; stars_count?: number };
  type Combinado = { state?: string; total_count?: number; statuses?: { context?: string; updated_at?: string; created_at?: string }[] };
  const eu = await pedir<{ login: string }>(`${api}/user`, h);
  const busca = (filtro: string) => pedir<Item[]>(`${api}/repos/issues/search?state=open&limit=20&${filtro}`, h).then((l) => lista<Item>(l)).catch(() => [] as Item[]);
  const [meus, paraRevisar, issues, repos, mapa] = await Promise.all([
    busca("type=pulls&created=true"),
    busca("type=pulls&review_requested=true"),
    busca("type=issues&assigned=true"),
    pedir<Repo[]>(`${api}/user/repos?limit=50`, h).then((l) => lista<Repo>(l)),
    pedir<{ timestamp: number; contributions: number }[]>(`${api}/users/${encodeURIComponent(eu.login)}/heatmap`, h).then((l) => lista<{ timestamp: number; contributions: number }>(l)).catch(() => []),
  ]);
  const porDia: Record<string, number> = {};
  for (const m of mapa) if (Number.isFinite(m.timestamp)) porDia[diaLocal(m.timestamp * 1000)] = (porDia[diaLocal(m.timestamp * 1000)] ?? 0) + (Number(m.contributions) || 0);
  const recentes = [...repos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10);
  const status = (repo: string, ref: string) => pedir<Combinado>(`${api}/repos/${repo}/commits/${encodeURIComponent(ref)}/status`, h).catch(() => null);
  const detalhar = async (p: Item): Promise<{ ci: Ci; revisao: Revisao }> => {
    const repo = p.repository?.full_name;
    if (!repo) return { ci: "nenhum", revisao: "pendente" };
    const [pr, avaliacoes] = await Promise.all([
      pedir<{ head?: { sha?: string } }>(`${api}/repos/${repo}/pulls/${p.number}`, h).catch(() => null),
      pedir<{ state?: string }[]>(`${api}/repos/${repo}/pulls/${p.number}/reviews`, h).catch(() => []),
    ]);
    const combinado = pr?.head?.sha ? await status(repo, pr.head.sha) : null;
    return { ci: ciDoStatusCombinado(combinado?.state, combinado?.total_count ?? 0), revisao: revisaoDoGitea(lista(avaliacoes)) };
  };
  const detalhes = await Promise.all(meus.slice(0, LIMITE_DE_PRS_DETALHADOS).map(detalhar));
  const execucoes = await Promise.all(
    recentes.slice(0, 4).map(async (r) => {
      if (!r.default_branch) return null;
      const c = await status(r.full_name, r.default_branch);
      const ci = ciDoAction(ciDoStatusCombinado(c?.state, c?.total_count ?? 0));
      if (!c || !ci) return null;
      const datas = (c.statuses ?? []).map((s) => s.updated_at ?? s.created_at ?? "").filter(Boolean).sort();
      return { workflow: c.statuses?.[0]?.context ?? "CI", repo: r.name, branch: r.default_branch, status: ci, duracao: datas.length > 1 ? segundos(datas[0], datas[datas.length - 1]) : 0, data: datas.at(-1) ?? r.updated_at };
    }),
  );
  const paraLista = (p: Item, tipo: "meu" | "revisar", extra: { ci: Ci; revisao: Revisao } = { ci: "nenhum", revisao: "pendente" }) => ({
    titulo: p.title, repo: p.repository?.name ?? "", numero: p.number, autor: p.user?.login ?? "", data: p.created_at, url: p.html_url, tipo, ...extra,
  });
  return {
    usuario: eu.login,
    contribuicoes: calendarioDeContagens(porDia, diaLocal(Date.now())),
    commits: null,
    repositorios: recentes.map((r) => ({ nome: r.name, linguagem: r.language ?? "", estrelas: r.stars_count ?? 0, atualizado: r.updated_at, privado: Boolean(r.private) })),
    prs: [...paraRevisar.map((p) => paraLista(p, "revisar")), ...meus.map((p, i) => paraLista(p, "meu", detalhes[i]))],
    issues: issues.map((i) => ({ titulo: i.title, repo: i.repository?.name ?? "", numero: i.number, rotulos: (i.labels ?? []).map((l) => l.name), data: i.created_at })),
    actions: execucoes.flatMap((e) => (e ? [e] : [])).sort((a, b) => b.data.localeCompare(a.data)),
  };
}
