import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { readSecret, writeSecret, deleteSecret } from "./secrets";
import { dataDirectory, validateUrlBase } from "./ai";
import { readGmail, authorizeGmail, type CredentialGmail } from "./gmail";
import { authorizeAgenda, summaryAgenda } from "./googleCalendar";

export const SERVICES = ["stripe", "github", "vercel", "resend", "notion", "calcom", "n8n", "gmail", "agenda", "supabase", "cloudflare"] as const;
export type Service = (typeof SERVICES)[number];

const FILE = () => join(dataDirectory(), "conexoes.json");

interface ConfigConnections {
  [service: string]: { url?: string; temChave: boolean };
}

function readConfig(): ConfigConnections {
  try {
    return existsSync(FILE()) ? (JSON.parse(readFileSync(FILE(), "utf8")) as ConfigConnections) : {};
  } catch {
    return {};
  }
}

function saveConfig(c: ConfigConnections) {
  mkdirSync(dataDirectory(), { recursive: true });
  const tmp = `${FILE()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(c, null, 2), "utf8");
  renameSync(tmp, FILE());
}

export function serviceValid(s: string): s is Service {
  return (SERVICES as readonly string[]).includes(s);
}

export function stateConnections() {
  const c = readConfig();
  return Object.fromEntries(SERVICES.map((s) => [s, { temChave: Boolean(c[s]?.temChave), url: c[s]?.url ?? null }]));
}

export async function request<T>(url: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { accept: "application/json", "user-agent": "Niko", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`http_${r.status} ${text.slice(0, 160)}`);
  }
  return (await r.json()) as T;
}

const fromUnix = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : new Date().toISOString());

const LIMIT_PRS_DETALHADOS = 6;

export type CiPr = "sucesso" | "falhou" | "rodando" | "nenhum";
export type ReviewPr = "pendente" | "aprovado" | "mudancas";

export function ciRuns(runs: { status: string; conclusion: string | null }[]): CiPr {
  if (runs.length === 0) return "nenhum";
  if (runs.some((r) => r.status !== "completed")) return "rodando";
  if (runs.some((r) => r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "startup_failure")) return "falhou";
  return "sucesso";
}

export function reviewAvaliacoes(avaliacoes: { state: string }[]): ReviewPr {
  const decisivas = avaliacoes.filter((a) => a.state === "APPROVED" || a.state === "CHANGES_REQUESTED");
  const last = decisivas.at(-1)?.state;
  return last === "APPROVED" ? "aprovado" : last === "CHANGES_REQUESTED" ? "mudancas" : "pendente";
}

async function contribuicoesGithub(headers: Record<string, string>): Promise<Record<string, number>> {
  const query = "query { viewer { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }";
  const r = await request<{ data?: { viewer?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays?: { date: string; contributionCount: number }[] }[] } } } }; errors?: unknown[] }>(
    "https://api.github.com/graphql",
    headers,
    { query: query },
  );
  const weeks = r.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks;
  if (r.errors?.length || !weeks) throw new Error("sem_contribuicoes");
  const byDay: Record<string, number> = {};
  for (const s of weeks) for (const d of s.contributionDays ?? []) if (d.contributionCount > 0) byDay[d.date] = d.contributionCount;
  return byDay;
}

type Reader = (keyValue: string, url?: string) => Promise<unknown>;

const READERS: Record<Service, Reader> = {
  stripe: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}` };
    const base = "https://api.stripe.com/v1";
    type List<T> = { data: T[] };
    const [balance, charges, disputes, payouts, customers] = await Promise.all([
      request<{ available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] }>(`${base}/balance`, h),
      request<List<{ id: string; amount: number; status: string; refunded: boolean; created: number; billing_details?: { name?: string | null; email?: string | null }; payment_method_details?: { type?: string } }>>(`${base}/charges?limit=20`, h),
      request<List<{ id: string; amount: number; reason: string; evidence_details?: { due_by?: number | null } }>>(`${base}/disputes?limit=10`, h),
      request<List<{ id: string; amount: number; arrival_date: number; status: string }>>(`${base}/payouts?limit=10`, h),
      request<List<{ name?: string | null; email?: string | null; created: number }>>(`${base}/customers?limit=10`, h),
    ]);
    const sumBy = (l: { amount: number }[]) => l.reduce((a, x) => a + x.amount, 0);
    return {
      disponivel: sumBy(balance.available),
      pendente: sumBy(balance.pending),
      cobrancas: charges.data.map((c) => ({
        id: c.id,
        cliente: c.billing_details?.name || c.billing_details?.email || "Cliente",
        valor: c.amount,
        status: c.refunded ? "reembolsado" : c.status === "succeeded" ? "pago" : c.status === "failed" ? "falhou" : "pago",
        data: fromUnix(c.created),
        metodo: c.payment_method_details?.type ?? "",
      })),
      disputas: disputes.data.map((d) => ({ id: d.id, valor: d.amount, motivo: d.reason, prazo: fromUnix(d.evidence_details?.due_by) })),
      repasses: payouts.data.map((p) => ({ id: p.id, valor: p.amount, chegada: fromUnix(p.arrival_date), status: p.status === "paid" ? "pago" : "a_caminho" })),
      clientes: customers.data.map((c) => ({ nome: c.name || c.email || "Cliente", email: c.email ?? "", desde: fromUnix(c.created), total: 0 })),
    };
  },
  github: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
    const base = "https://api.github.com";
    const selfValue = await request<{ login: string }>(`${base}/user`, h);
    type Item = { title: string; number: number; repository_url: string; html_url: string; user?: { login: string }; created_at: string; labels?: { name: string }[] };
    const search = (q: string, n: number) => request<{ items: Item[] }>(`${base}/search/issues?q=${encodeURIComponent(q)}&per_page=${n}`, h);
    const [repos, meus, toRevisar, issues] = await Promise.all([
      request<{ name: string; full_name: string; language: string | null; stargazers_count: number; updated_at: string; private: boolean }[]>(`${base}/user/repos?sort=updated&per_page=10`, h),
      search(`is:pr is:open author:${selfValue.login}`, 10),
      search(`is:pr is:open review-requested:${selfValue.login}`, 10),
      search(`is:issue is:open assignee:${selfValue.login}`, 15),
    ]);
    const nameComplete = (url: string) => url.split("/repos/")[1] ?? "";
    const detalharPr = async (p: Item) => {
      const repo = nameComplete(p.repository_url);
      try {
        const [pr, reviews] = await Promise.all([
          request<{ head: { sha: string } }>(`${base}/repos/${repo}/pulls/${p.number}`, h),
          request<{ state: string }[]>(`${base}/repos/${repo}/pulls/${p.number}/reviews?per_page=50`, h).catch(() => []),
        ]);
        const runs = await request<{ workflow_runs: { status: string; conclusion: string | null }[] }>(`${base}/repos/${repo}/actions/runs?head_sha=${pr.head.sha}&per_page=20`, h).catch(() => ({ workflow_runs: [] }));
        return { ci: ciRuns(runs.workflow_runs), revisao: reviewAvaliacoes(reviews) };
      } catch {
        return { ci: "nenhum" as const, revisao: "pendente" as const };
      }
    };
    const details = await Promise.all(meus.items.slice(0, LIMIT_PRS_DETALHADOS).map(detalharPr));
    const executions = await Promise.all(
      repos.slice(0, 4).map((r) =>
        request<{ workflow_runs: { name: string; head_branch: string; status: string; conclusion: string | null; run_started_at: string; updated_at: string }[] }>(`${base}/repos/${r.full_name}/actions/runs?per_page=5`, h)
          .then((x) => x.workflow_runs.map((w) => ({ ...w, repo: r.name })))
          .catch(() => []),
      ),
    );
    const commitsByDay = await contribuicoesGithub(h).catch(async () => {
      const events = await request<{ type: string; created_at: string; payload?: { size?: number; commits?: unknown[] } }[]>(`${base}/users/${selfValue.login}/events?per_page=100`, h).catch(() => []);
      const byDay: Record<string, number> = {};
      for (const ev of events) {
        if (ev.type !== "PushEvent") continue;
        const day = new Date(ev.created_at).toLocaleDateString("sv-SE");
        byDay[day] = (byDay[day] ?? 0) + (ev.payload?.size ?? ev.payload?.commits?.length ?? 1);
      }
      return byDay;
    });
    const repo = (url: string) => url.split("/").pop() ?? "";
    const toList = (p: Item, type: "meu" | "revisar", extra: { ci: CiPr; revisao: ReviewPr } = { ci: "nenhum", revisao: "pendente" }) => ({
      titulo: p.title, repo: repo(p.repository_url), numero: p.number, autor: p.user?.login ?? "", data: p.created_at, url: p.html_url, tipo: type, ...extra,
    });
    return {
      usuario: selfValue.login,
      commitsPorDia: commitsByDay,
      repositorios: repos.map((r) => ({ nome: r.name, linguagem: r.language ?? "", estrelas: r.stargazers_count, atualizado: r.updated_at, privado: r.private })),
      prs: [...toRevisar.items.map((p) => toList(p, "revisar")), ...meus.items.map((p, i) => toList(p, "meu", details[i]))],
      issues: issues.items.map((i) => ({ titulo: i.title, repo: repo(i.repository_url), numero: i.number, rotulos: (i.labels ?? []).map((l) => l.name), data: i.created_at })),
      actions: executions
        .flat()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 15)
        .map((w) => ({
          workflow: w.name,
          repo: w.repo,
          branch: w.head_branch,
          status: w.status !== "completed" ? "rodando" : w.conclusion === "success" ? "sucesso" : w.conclusion === "failure" || w.conclusion === "timed_out" ? "falhou" : "sucesso",
          duracao: Math.max(0, Math.round((new Date(w.updated_at).getTime() - new Date(w.run_started_at).getTime()) / 1000)),
          data: w.updated_at,
        })),
    };
  },
  vercel: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}` };
    const [projects, deploys] = await Promise.all([
      request<{ projects: { name: string; framework: string | null; updatedAt: number }[] }>("https://api.vercel.com/v9/projects?limit=10", h),
      request<{ deployments: { name: string; url: string; state?: string; readyState?: string; created: number; ready?: number; buildingAt?: number; target?: string | null; meta?: Record<string, string> }[] }>("https://api.vercel.com/v6/deployments?limit=15", h),
    ]);
    const state = (s?: string) => (s === "READY" ? "pronto" : s === "ERROR" ? "erro" : s === "CANCELED" ? "cancelado" : "construindo");
    const list = deploys.deployments.map((d) => ({
      projeto: d.name,
      branch: d.meta?.githubCommitRef ?? "",
      commit: d.meta?.githubCommitMessage ?? d.url,
      estado: state(d.state ?? d.readyState),
      duracao: d.ready && d.buildingAt ? Math.round((d.ready - d.buildingAt) / 1000) : 0,
      data: new Date(d.created).toISOString(),
      ambiente: d.target === "production" ? "produção" : "prévia",
      url: d.url,
    }));
    return {
      projetos: projects.projects.map((p) => {
        const last = list.find((d) => d.projeto === p.name);
        return { nome: p.name, dominio: last?.url ?? `${p.name}.vercel.app`, framework: p.framework ?? "", ultimoDeploy: last?.data ?? new Date(p.updatedAt).toISOString(), estado: last?.estado === "erro" ? "erro" : last?.estado === "construindo" ? "construindo" : "pronto" };
      }),
      deploys: list,
    };
  },
  resend: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}` };
    const [emails, domains] = await Promise.all([
      request<{ data: { to: string[]; subject: string; last_event?: string; created_at: string }[] }>("https://api.resend.com/emails?limit=30", h),
      request<{ data: { name: string; status: string }[] }>("https://api.resend.com/domains", h),
    ]);
    const state = (e?: string) => (e === "opened" || e === "clicked" ? "aberto" : e === "bounced" ? "devolvido" : e === "complained" ? "spam" : "entregue");
    const list = emails.data.map((e) => ({ para: e.to?.[0] ?? "", assunto: e.subject, estado: state(e.last_event), data: e.created_at }));
    const failures = list.filter((e) => e.estado === "devolvido" || e.estado === "spam").length;
    return { enviados: list.length, entregues: list.length - failures, falhas: failures, emails: list, dominios: domains.data.map((d) => ({ nome: d.name, verificado: d.status === "verified" })) };
  },
  notion: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}`, "notion-version": "2022-06-28" };
    type Result = { object: "page" | "database"; last_edited_time: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }>; title?: { plain_text: string }[]; parent?: { type: string } };
    const r = await request<{ results: Result[] }>("https://api.notion.com/v1/search", h, { page_size: 20, sort: { direction: "descending", timestamp: "last_edited_time" } });
    const title = (x: Result) => {
      if (x.object === "database") return x.title?.map((t) => t.plain_text).join("") || "Sem título";
      const prop = Object.values(x.properties ?? {}).find((p) => p.type === "title");
      return prop?.title?.map((t) => t.plain_text).join("") || "Sem título";
    };
    return {
      paginas: r.results.filter((x) => x.object === "page").map((x) => ({ titulo: title(x), editadoPor: "", data: x.last_edited_time, local: x.parent?.type === "database_id" ? "Banco" : "Página" })),
      bancos: r.results.filter((x) => x.object === "database").map((x) => ({ nome: title(x), itens: 0 })),
    };
  },
  calcom: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}`, "cal-api-version": "2026-05-01" };
    const r = await request<{ data: { title: string; start: string; end?: string; status: string; attendees?: { name: string }[]; eventType?: { slug?: string } }[] }>("https://api.cal.com/v2/bookings?status=upcoming&limit=20", h);
    const bookings = r.data.map((b) => ({ pessoa: b.attendees?.[0]?.name ?? "", tipo: b.title, inicio: b.start, status: b.status === "accepted" ? "confirmado" : b.status === "cancelled" || b.status === "rejected" ? "cancelado" : "pendente" }));
    const byType = new Map<string, { duracao: number; reservas: number }>();
    for (const b of r.data) {
      const current = byType.get(b.title) ?? { duracao: b.end ? Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000) : 0, reservas: 0 };
      current.reservas += 1;
      byType.set(b.title, current);
    }
    return { agendamentos: bookings, tiposEvento: [...byType].map(([nameValue, v]) => ({ nome: nameValue, ...v })) };
  },
  n8n: async (keyValue, url) => {
    if (!url) throw new Error("sem_url");
    const h = { "x-n8n-api-key": keyValue };
    const [workflows, executions] = await Promise.all([
      request<{ data: { id: string; name: string; active: boolean }[] }>(`${url}/api/v1/workflows?limit=50`, h),
      request<{ data: { id: string; workflowId: string; status?: string; finished?: boolean; startedAt: string; stoppedAt?: string | null }[] }>(`${url}/api/v1/executions?limit=30`, h),
    ]);
    const nameValue = (id: string) => workflows.data.find((w) => w.id === id)?.name ?? id;
    const list = executions.data.map((e) => ({
      id: e.id,
      workflow: nameValue(e.workflowId),
      status: e.status === "error" || e.status === "crashed" ? "erro" : e.status === "running" || e.status === "waiting" || !e.stoppedAt ? "rodando" : "sucesso",
      duracao: e.stoppedAt ? new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime() : 0,
      data: e.startedAt,
    }));
    return {
      workflows: workflows.data.map((w) => ({ nome: w.name, ativo: w.active, execucoes: list.filter((e) => e.workflow === w.name).length, ultimaFalha: list.find((e) => e.workflow === w.name && e.status === "erro")?.data })),
      execucoes: list,
    };
  },
  gmail: async (keyValue) => readGmail(keyValue),
  agenda: async (keyValue) => summaryAgenda(keyValue),
  supabase: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}` };
    const base = "https://api.supabase.com/v1";
    const projects = await request<{ id: string; ref?: string; name: string; region: string; status: string; created_at: string; database?: { version?: string } }[]>(`${base}/projects`, h);
    const details = await Promise.all(
      projects.slice(0, 6).map(async (p) => {
        const ref = p.ref ?? p.id;
        const sql = (query: string) => request<Record<string, unknown>[]>(`${base}/projects/${ref}/database/query`, h, { query, read_only: true }).catch(() => null);
        const [users, buckets, size, health, tables] = await Promise.all([
          sql("select count(*)::int as total, count(*) filter (where created_at > now() - interval '7 days')::int as novos, max(last_sign_in_at) as ultimo_login from auth.users"),
          sql("select b.name, b.public, count(o.id)::int as arquivos, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes from storage.buckets b left join storage.objects o on o.bucket_id = b.id group by b.name, b.public order by b.name"),
          sql("select pg_database_size(current_database())::bigint as bytes"),
          request<{ name: string; healthy: boolean; status: string }[]>(`${base}/projects/${ref}/health?services=auth,db,rest,realtime,storage`, h).catch(() => []),
          sql("select schemaname as esquema, relname as nome, n_live_tup::bigint as linhas, pg_total_relation_size(relid)::bigint as bytes from pg_stat_user_tables order by n_live_tup desc limit 8"),
        ]);
        const logs = await request<{ result?: { timestamp: number | string; event_message: string; error_severity?: string }[] }>(
          `${base}/projects/${ref}/analytics/endpoints/logs.all?iso_timestamp_start=${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}&sql=${encodeURIComponent("select timestamp, event_message from postgres_logs order by timestamp desc limit 15")}`,
          h,
        ).catch(() => ({ result: [] }));
        const u = users?.[0] ?? {};
        return {
          ref,
          nome: p.name,
          regiao: p.region,
          status: p.status,
          criado: p.created_at,
          versaoBanco: p.database?.version ?? "",
          usuarios: Number(u.total ?? 0),
          novos7d: Number(u.novos ?? 0),
          ultimoLogin: (u.ultimo_login as string | null) ?? null,
          bancoBytes: Number(size?.[0]?.bytes ?? 0),
          buckets: (buckets ?? []).map((b) => ({ nome: String(b.name), publico: Boolean(b.public), arquivos: Number(b.arquivos ?? 0), bytes: Number(b.bytes ?? 0) })),
          servicos: health.map((s) => ({ nome: s.name, saudavel: s.healthy, status: s.status })),
          tabelas: (tables ?? []).map((t) => ({ nome: String(t.esquema) === "public" ? String(t.nome) : `${String(t.esquema)}.${String(t.nome)}`, linhas: Number(t.linhas ?? 0), bytes: Number(t.bytes ?? 0) })),
          logs: (logs.result ?? []).map((l) => ({ data: typeof l.timestamp === "number" ? new Date(l.timestamp / 1000).toISOString() : String(l.timestamp), texto: String(l.event_message).slice(0, 300) })),
          semSql: users === null,
        };
      }),
    );
    return { projetos: details };
  },
  cloudflare: async (keyValue) => {
    const h = { authorization: `Bearer ${keyValue}` };
    const base = "https://api.cloudflare.com/client/v4";
    type List<T> = { result: T[] };
    const [zones, accounts] = await Promise.all([
      request<List<{ id: string; name: string; status: string; paused: boolean; plan?: { name: string }; account?: { id: string } }>>(`${base}/zones?per_page=50`, h),
      request<List<{ id: string; name: string }>>(`${base}/accounts?per_page=20`, h).catch(() => ({ result: [] })),
    ]);
    const account = accounts.result[0]?.id;
    const [pages, workers, dns] = await Promise.all([
      account ? request<List<{ name: string; subdomain: string; domains?: string[]; latest_deployment?: { latest_stage?: { name?: string; status?: string }; created_on?: string; url?: string; environment?: string } }>>(`${base}/accounts/${account}/pages/projects`, h).catch(() => ({ result: [] })) : Promise.resolve({ result: [] }),
      account ? request<List<{ id: string; modified_on: string; created_on?: string }>>(`${base}/accounts/${account}/workers/scripts`, h).catch(() => ({ result: [] })) : Promise.resolve({ result: [] }),
      Promise.all(zones.result.slice(0, 5).map((z) => request<List<{ type: string; name: string; content: string; proxied?: boolean }>>(`${base}/zones/${z.id}/dns_records?per_page=100`, h).then((r) => r.result.map((d) => ({ ...d, zona: z.name }))).catch(() => []))),
    ]);
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const metrics = await Promise.all(
      zones.result.slice(0, 5).map((z) =>
        request<{ data?: { viewer?: { zones?: { httpRequests1dGroups?: { dimensions: { date: string }; sum: { requests: number; bytes: number; threats: number; pageViews: number }; uniq: { uniques: number } }[] }[] } } }>(`${base}/graphql`, h, {
          query: `query { viewer { zones(filter: { zoneTag: "${z.id}" }) { httpRequests1dGroups(limit: 7, filter: { date_geq: "${since}" }, orderBy: [date_ASC]) { dimensions { date } sum { requests bytes threats pageViews } uniq { uniques } } } } }`,
        })
          .then((r) => ({ zona: z.name, dias: (r.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []).map((g) => ({ data: g.dimensions.date, requisicoes: g.sum.requests, bytes: g.sum.bytes, ameacas: g.sum.threats, visitas: g.sum.pageViews, unicos: g.uniq.uniques })) }))
          .catch(() => ({ zona: z.name, dias: [] })),
      ),
    );
    return {
      zonas: zones.result.map((z) => ({ nome: z.name, status: z.paused ? "pausada" : z.status, plano: z.plan?.name ?? "" })),
      dns: dns.flat().map((d) => ({ zona: d.zona, tipo: d.type, nome: d.name, valor: d.content, proxy: Boolean(d.proxied) })),
      pages: pages.result.map((p) => ({ nome: p.name, dominio: p.domains?.[0] ?? p.subdomain, estado: p.latest_deployment?.latest_stage?.status ?? "", etapa: p.latest_deployment?.latest_stage?.name ?? "", data: p.latest_deployment?.created_on ?? "", ambiente: p.latest_deployment?.environment ?? "" })),
      workers: workers.result.map((w) => ({ nome: w.id, alterado: w.modified_on })),
      metricas: metrics,
    };
  },
};

const cacheData = new Map<Service, { quando: number; dados: unknown }>();
const readsAtProgress = new Map<Service, Promise<unknown>>();

async function searchConnection(service: Service, stillValid: () => boolean) {
  const config = readConfig()[service];
  const keyValue = config?.temChave ? await readSecret(`conexao-${service}`) : null;
  if (!keyValue) throw new Error("sem_chave");
  const payload = await READERS[service](keyValue, config?.url);
  if (stillValid()) cacheData.set(service, { quando: Date.now(), dados: payload });
  return payload;
}

export async function readConnection(service: Service, force = false) {
  const previous = cacheData.get(service);
  if (!force && previous && Date.now() - previous.quando < 20000) return previous.dados;
  const atProgress = readsAtProgress.get(service);
  if (atProgress) return atProgress;
  const readResult: Promise<unknown> = searchConnection(service, () => readsAtProgress.get(service) === readResult).finally(() => {
    if (readsAtProgress.get(service) === readResult) readsAtProgress.delete(service);
  });
  readsAtProgress.set(service, readResult);
  return readResult;
}

export async function keyValue(service: Service): Promise<string> {
  const keyValue = readConfig()[service]?.temChave ? await readSecret(`conexao-${service}`) : null;
  if (!keyValue) throw new Error("sem_chave");
  return keyValue;
}

export async function saveKeyConnection(service: Service, payload: { chave?: unknown; url?: unknown; clienteId?: unknown; segredo?: unknown }) {
  if (service === "gmail" || service === "agenda") {
    const authorize: (id: string, secret: string) => Promise<CredentialGmail> = service === "gmail" ? authorizeGmail : authorizeAgenda;
    const credential = await authorize(String(payload.clienteId ?? "").trim(), String(payload.segredo ?? "").trim());
    const text = JSON.stringify(credential);
    await READERS[service](text);
    await writeSecret(`conexao-${service}`, text);
    const c = readConfig();
    c[service] = { temChave: true };
    saveConfig(c);
    cacheData.delete(service);
    readsAtProgress.delete(service);
    return { ok: true };
  }
  const keyValue = typeof payload.chave === "string" ? payload.chave.trim() : "";
  if (keyValue.length < 8 || keyValue.length > 4000) throw new Error("chave_invalida");
  const url = service === "n8n" ? validateUrlBase(String(payload.url ?? "")) : undefined;
  await READERS[service](keyValue, url);
  await writeSecret(`conexao-${service}`, keyValue);
  const c = readConfig();
  c[service] = { temChave: true, url };
  saveConfig(c);
  cacheData.delete(service);
  readsAtProgress.delete(service);
  return { ok: true };
}

export async function removeKeyConnection(service: Service) {
  await deleteSecret(`conexao-${service}`).catch(() => undefined);
  const c = readConfig();
  delete c[service];
  saveConfig(c);
  cacheData.delete(service);
  readsAtProgress.delete(service);
  return { ok: true };
}
