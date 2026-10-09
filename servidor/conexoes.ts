import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { lerSegredo, gravarSegredo, apagarSegredo } from "./segredos";
import { pastaDados, validarUrlBase } from "./ia";
import { autorizarWorkspace, lerGoogle } from "./google";

export const SERVICOS = ["stripe", "github", "vercel", "resend", "notion", "calcom", "n8n", "google", "supabase", "cloudflare"] as const;
const SERVICOS_ANTIGOS_DO_GOOGLE = ["gmail", "agenda"];
export type Servico = (typeof SERVICOS)[number];

const ARQUIVO = () => join(pastaDados(), "conexoes.json");

interface ConfigConexoes {
  [servico: string]: { url?: string; temChave: boolean };
}

function lerConfig(): ConfigConexoes {
  try {
    return existsSync(ARQUIVO()) ? (JSON.parse(readFileSync(ARQUIVO(), "utf8")) as ConfigConexoes) : {};
  } catch {
    return {};
  }
}

function salvarConfig(c: ConfigConexoes) {
  mkdirSync(pastaDados(), { recursive: true });
  const tmp = `${ARQUIVO()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(c, null, 2), "utf8");
  renameSync(tmp, ARQUIVO());
}

export function servicoValido(s: string): s is Servico {
  return (SERVICOS as readonly string[]).includes(s);
}

export function estadoConexoes() {
  const c = lerConfig();
  return Object.fromEntries(SERVICOS.map((s) => [s, { temChave: Boolean(c[s]?.temChave), url: c[s]?.url ?? null }]));
}

export async function pedir<T>(url: string, cabecalhos: Record<string, string>, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { accept: "application/json", "user-agent": "Niko", ...(corpo === undefined ? {} : { "content-type": "application/json" }), ...cabecalhos },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    throw new Error(`http_${r.status} ${texto.slice(0, 160)}`);
  }
  return (await r.json()) as T;
}

const deUnix = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : new Date().toISOString());

const LIMITE_DE_PRS_DETALHADOS = 6;

export type CiDoPr = "sucesso" | "falhou" | "rodando" | "nenhum";
export type RevisaoDoPr = "pendente" | "aprovado" | "mudancas";

export function ciDosRuns(runs: { status: string; conclusion: string | null }[]): CiDoPr {
  if (runs.length === 0) return "nenhum";
  if (runs.some((r) => r.status !== "completed")) return "rodando";
  if (runs.some((r) => r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "startup_failure")) return "falhou";
  return "sucesso";
}

export function revisaoDasAvaliacoes(avaliacoes: { state: string }[]): RevisaoDoPr {
  const decisivas = avaliacoes.filter((a) => a.state === "APPROVED" || a.state === "CHANGES_REQUESTED");
  const ultima = decisivas.at(-1)?.state;
  return ultima === "APPROVED" ? "aprovado" : ultima === "CHANGES_REQUESTED" ? "mudancas" : "pendente";
}

async function contribuicoesDoGithub(cabecalhos: Record<string, string>): Promise<Record<string, number>> {
  const consulta = "query { viewer { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }";
  const r = await pedir<{ data?: { viewer?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays?: { date: string; contributionCount: number }[] }[] } } } }; errors?: unknown[] }>(
    "https://api.github.com/graphql",
    cabecalhos,
    { query: consulta },
  );
  const semanas = r.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks;
  if (r.errors?.length || !semanas) throw new Error("sem_contribuicoes");
  const porDia: Record<string, number> = {};
  for (const s of semanas) for (const d of s.contributionDays ?? []) if (d.contributionCount > 0) porDia[d.date] = d.contributionCount;
  return porDia;
}

type Leitor = (chave: string, url?: string) => Promise<unknown>;

const LEITORES: Record<Servico, Leitor> = {
  stripe: async (chave) => {
    const h = { authorization: `Bearer ${chave}` };
    const base = "https://api.stripe.com/v1";
    type Lista<T> = { data: T[] };
    const [saldo, cobrancas, disputas, repasses, clientes] = await Promise.all([
      pedir<{ available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] }>(`${base}/balance`, h),
      pedir<Lista<{ id: string; amount: number; status: string; refunded: boolean; created: number; billing_details?: { name?: string | null; email?: string | null }; payment_method_details?: { type?: string } }>>(`${base}/charges?limit=20`, h),
      pedir<Lista<{ id: string; amount: number; reason: string; evidence_details?: { due_by?: number | null } }>>(`${base}/disputes?limit=10`, h),
      pedir<Lista<{ id: string; amount: number; arrival_date: number; status: string }>>(`${base}/payouts?limit=10`, h),
      pedir<Lista<{ name?: string | null; email?: string | null; created: number }>>(`${base}/customers?limit=10`, h),
    ]);
    const somar = (l: { amount: number }[]) => l.reduce((a, x) => a + x.amount, 0);
    return {
      disponivel: somar(saldo.available),
      pendente: somar(saldo.pending),
      cobrancas: cobrancas.data.map((c) => ({
        id: c.id,
        cliente: c.billing_details?.name || c.billing_details?.email || "Cliente",
        valor: c.amount,
        status: c.refunded ? "reembolsado" : c.status === "succeeded" ? "pago" : c.status === "failed" ? "falhou" : "pago",
        data: deUnix(c.created),
        metodo: c.payment_method_details?.type ?? "",
      })),
      disputas: disputas.data.map((d) => ({ id: d.id, valor: d.amount, motivo: d.reason, prazo: deUnix(d.evidence_details?.due_by) })),
      repasses: repasses.data.map((p) => ({ id: p.id, valor: p.amount, chegada: deUnix(p.arrival_date), status: p.status === "paid" ? "pago" : "a_caminho" })),
      clientes: clientes.data.map((c) => ({ nome: c.name || c.email || "Cliente", email: c.email ?? "", desde: deUnix(c.created), total: 0 })),
    };
  },
  github: async (chave) => {
    const h = { authorization: `Bearer ${chave}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
    const base = "https://api.github.com";
    const eu = await pedir<{ login: string }>(`${base}/user`, h);
    type Item = { title: string; number: number; repository_url: string; html_url: string; user?: { login: string }; created_at: string; labels?: { name: string }[] };
    const busca = (q: string, n: number) => pedir<{ items: Item[] }>(`${base}/search/issues?q=${encodeURIComponent(q)}&per_page=${n}`, h);
    const [repos, meus, paraRevisar, issues] = await Promise.all([
      pedir<{ name: string; full_name: string; language: string | null; stargazers_count: number; updated_at: string; private: boolean }[]>(`${base}/user/repos?sort=updated&per_page=10`, h),
      busca(`is:pr is:open author:${eu.login}`, 10),
      busca(`is:pr is:open review-requested:${eu.login}`, 10),
      busca(`is:issue is:open assignee:${eu.login}`, 15),
    ]);
    const nomeCompleto = (url: string) => url.split("/repos/")[1] ?? "";
    const detalharPr = async (p: Item) => {
      const repo = nomeCompleto(p.repository_url);
      try {
        const [pr, revisoes] = await Promise.all([
          pedir<{ head: { sha: string } }>(`${base}/repos/${repo}/pulls/${p.number}`, h),
          pedir<{ state: string }[]>(`${base}/repos/${repo}/pulls/${p.number}/reviews?per_page=50`, h).catch(() => []),
        ]);
        const runs = await pedir<{ workflow_runs: { status: string; conclusion: string | null }[] }>(`${base}/repos/${repo}/actions/runs?head_sha=${pr.head.sha}&per_page=20`, h).catch(() => ({ workflow_runs: [] }));
        return { ci: ciDosRuns(runs.workflow_runs), revisao: revisaoDasAvaliacoes(revisoes) };
      } catch {
        return { ci: "nenhum" as const, revisao: "pendente" as const };
      }
    };
    const detalhes = await Promise.all(meus.items.slice(0, LIMITE_DE_PRS_DETALHADOS).map(detalharPr));
    const execucoes = await Promise.all(
      repos.slice(0, 4).map((r) =>
        pedir<{ workflow_runs: { name: string; head_branch: string; status: string; conclusion: string | null; run_started_at: string; updated_at: string }[] }>(`${base}/repos/${r.full_name}/actions/runs?per_page=5`, h)
          .then((x) => x.workflow_runs.map((w) => ({ ...w, repo: r.name })))
          .catch(() => []),
      ),
    );
    const commitsPorDia = await contribuicoesDoGithub(h).catch(async () => {
      const eventos = await pedir<{ type: string; created_at: string; payload?: { size?: number; commits?: unknown[] } }[]>(`${base}/users/${eu.login}/events?per_page=100`, h).catch(() => []);
      const porDia: Record<string, number> = {};
      for (const ev of eventos) {
        if (ev.type !== "PushEvent") continue;
        const dia = new Date(ev.created_at).toLocaleDateString("sv-SE");
        porDia[dia] = (porDia[dia] ?? 0) + (ev.payload?.size ?? ev.payload?.commits?.length ?? 1);
      }
      return porDia;
    });
    const repoDe = (url: string) => url.split("/").pop() ?? "";
    const paraLista = (p: Item, tipo: "meu" | "revisar", extra: { ci: CiDoPr; revisao: RevisaoDoPr } = { ci: "nenhum", revisao: "pendente" }) => ({
      titulo: p.title, repo: repoDe(p.repository_url), numero: p.number, autor: p.user?.login ?? "", data: p.created_at, url: p.html_url, tipo, ...extra,
    });
    return {
      usuario: eu.login,
      commitsPorDia,
      repositorios: repos.map((r) => ({ nome: r.name, linguagem: r.language ?? "", estrelas: r.stargazers_count, atualizado: r.updated_at, privado: r.private })),
      prs: [...paraRevisar.items.map((p) => paraLista(p, "revisar")), ...meus.items.map((p, i) => paraLista(p, "meu", detalhes[i]))],
      issues: issues.items.map((i) => ({ titulo: i.title, repo: repoDe(i.repository_url), numero: i.number, rotulos: (i.labels ?? []).map((l) => l.name), data: i.created_at })),
      actions: execucoes
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
  vercel: async (chave) => {
    const h = { authorization: `Bearer ${chave}` };
    const [projetos, deploys] = await Promise.all([
      pedir<{ projects: { name: string; framework: string | null; updatedAt: number }[] }>("https://api.vercel.com/v9/projects?limit=10", h),
      pedir<{ deployments: { name: string; url: string; state?: string; readyState?: string; created: number; ready?: number; buildingAt?: number; target?: string | null; meta?: Record<string, string> }[] }>("https://api.vercel.com/v6/deployments?limit=15", h),
    ]);
    const estado = (s?: string) => (s === "READY" ? "pronto" : s === "ERROR" ? "erro" : s === "CANCELED" ? "cancelado" : "construindo");
    const lista = deploys.deployments.map((d) => ({
      projeto: d.name,
      branch: d.meta?.githubCommitRef ?? "",
      commit: d.meta?.githubCommitMessage ?? d.url,
      estado: estado(d.state ?? d.readyState),
      duracao: d.ready && d.buildingAt ? Math.round((d.ready - d.buildingAt) / 1000) : 0,
      data: new Date(d.created).toISOString(),
      ambiente: d.target === "production" ? "produção" : "prévia",
      url: d.url,
    }));
    return {
      projetos: projetos.projects.map((p) => {
        const ultimo = lista.find((d) => d.projeto === p.name);
        return { nome: p.name, dominio: ultimo?.url ?? `${p.name}.vercel.app`, framework: p.framework ?? "", ultimoDeploy: ultimo?.data ?? new Date(p.updatedAt).toISOString(), estado: ultimo?.estado === "erro" ? "erro" : ultimo?.estado === "construindo" ? "construindo" : "pronto" };
      }),
      deploys: lista,
    };
  },
  resend: async (chave) => {
    const h = { authorization: `Bearer ${chave}` };
    const [emails, dominios] = await Promise.all([
      pedir<{ data: { to: string[]; subject: string; last_event?: string; created_at: string }[] }>("https://api.resend.com/emails?limit=30", h),
      pedir<{ data: { name: string; status: string }[] }>("https://api.resend.com/domains", h),
    ]);
    const estado = (e?: string) => (e === "opened" || e === "clicked" ? "aberto" : e === "bounced" ? "devolvido" : e === "complained" ? "spam" : "entregue");
    const lista = emails.data.map((e) => ({ para: e.to?.[0] ?? "", assunto: e.subject, estado: estado(e.last_event), data: e.created_at }));
    const falhas = lista.filter((e) => e.estado === "devolvido" || e.estado === "spam").length;
    return { enviados: lista.length, entregues: lista.length - falhas, falhas, emails: lista, dominios: dominios.data.map((d) => ({ nome: d.name, verificado: d.status === "verified" })) };
  },
  notion: async (chave) => {
    const h = { authorization: `Bearer ${chave}`, "notion-version": "2022-06-28" };
    type Resultado = { object: "page" | "database"; last_edited_time: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }>; title?: { plain_text: string }[]; parent?: { type: string } };
    const r = await pedir<{ results: Resultado[] }>("https://api.notion.com/v1/search", h, { page_size: 20, sort: { direction: "descending", timestamp: "last_edited_time" } });
    const titulo = (x: Resultado) => {
      if (x.object === "database") return x.title?.map((t) => t.plain_text).join("") || "Sem título";
      const prop = Object.values(x.properties ?? {}).find((p) => p.type === "title");
      return prop?.title?.map((t) => t.plain_text).join("") || "Sem título";
    };
    return {
      paginas: r.results.filter((x) => x.object === "page").map((x) => ({ titulo: titulo(x), editadoPor: "", data: x.last_edited_time, local: x.parent?.type === "database_id" ? "Banco" : "Página" })),
      bancos: r.results.filter((x) => x.object === "database").map((x) => ({ nome: titulo(x), itens: 0 })),
    };
  },
  calcom: async (chave) => {
    const h = { authorization: `Bearer ${chave}`, "cal-api-version": "2026-05-01" };
    const r = await pedir<{ data: { title: string; start: string; end?: string; status: string; attendees?: { name: string }[]; eventType?: { slug?: string } }[] }>("https://api.cal.com/v2/bookings?status=upcoming&limit=20", h);
    const agendamentos = r.data.map((b) => ({ pessoa: b.attendees?.[0]?.name ?? "", tipo: b.title, inicio: b.start, status: b.status === "accepted" ? "confirmado" : b.status === "cancelled" || b.status === "rejected" ? "cancelado" : "pendente" }));
    const porTipo = new Map<string, { duracao: number; reservas: number }>();
    for (const b of r.data) {
      const atual = porTipo.get(b.title) ?? { duracao: b.end ? Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000) : 0, reservas: 0 };
      atual.reservas += 1;
      porTipo.set(b.title, atual);
    }
    return { agendamentos, tiposEvento: [...porTipo].map(([nome, v]) => ({ nome, ...v })) };
  },
  n8n: async (chave, url) => {
    if (!url) throw new Error("sem_url");
    const h = { "x-n8n-api-key": chave };
    const [workflows, execucoes] = await Promise.all([
      pedir<{ data: { id: string; name: string; active: boolean }[] }>(`${url}/api/v1/workflows?limit=50`, h),
      pedir<{ data: { id: string; workflowId: string; status?: string; finished?: boolean; startedAt: string; stoppedAt?: string | null }[] }>(`${url}/api/v1/executions?limit=30`, h),
    ]);
    const nome = (id: string) => workflows.data.find((w) => w.id === id)?.name ?? id;
    const lista = execucoes.data.map((e) => ({
      id: e.id,
      workflow: nome(e.workflowId),
      status: e.status === "error" || e.status === "crashed" ? "erro" : e.status === "running" || e.status === "waiting" || !e.stoppedAt ? "rodando" : "sucesso",
      duracao: e.stoppedAt ? new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime() : 0,
      data: e.startedAt,
    }));
    return {
      workflows: workflows.data.map((w) => ({ nome: w.name, ativo: w.active, execucoes: lista.filter((e) => e.workflow === w.name).length, ultimaFalha: lista.find((e) => e.workflow === w.name && e.status === "erro")?.data })),
      execucoes: lista,
    };
  },
  google: async (chave) => lerGoogle(chave),
  supabase: async (chave) => {
    const h = { authorization: `Bearer ${chave}` };
    const base = "https://api.supabase.com/v1";
    const projetos = await pedir<{ id: string; ref?: string; name: string; region: string; status: string; created_at: string; database?: { version?: string } }[]>(`${base}/projects`, h);
    const detalhes = await Promise.all(
      projetos.slice(0, 6).map(async (p) => {
        const ref = p.ref ?? p.id;
        const sql = (query: string) => pedir<Record<string, unknown>[]>(`${base}/projects/${ref}/database/query`, h, { query, read_only: true }).catch(() => null);
        const [usuarios, buckets, tamanho, saude, tabelas] = await Promise.all([
          sql("select count(*)::int as total, count(*) filter (where created_at > now() - interval '7 days')::int as novos, max(last_sign_in_at) as ultimo_login from auth.users"),
          sql("select b.name, b.public, count(o.id)::int as arquivos, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes from storage.buckets b left join storage.objects o on o.bucket_id = b.id group by b.name, b.public order by b.name"),
          sql("select pg_database_size(current_database())::bigint as bytes"),
          pedir<{ name: string; healthy: boolean; status: string }[]>(`${base}/projects/${ref}/health?services=auth,db,rest,realtime,storage`, h).catch(() => []),
          sql("select schemaname as esquema, relname as nome, n_live_tup::bigint as linhas, pg_total_relation_size(relid)::bigint as bytes from pg_stat_user_tables order by n_live_tup desc limit 8"),
        ]);
        const logs = await pedir<{ result?: { timestamp: number | string; event_message: string; error_severity?: string }[] }>(
          `${base}/projects/${ref}/analytics/endpoints/logs.all?iso_timestamp_start=${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}&sql=${encodeURIComponent("select timestamp, event_message from postgres_logs order by timestamp desc limit 15")}`,
          h,
        ).catch(() => ({ result: [] }));
        const u = usuarios?.[0] ?? {};
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
          bancoBytes: Number(tamanho?.[0]?.bytes ?? 0),
          buckets: (buckets ?? []).map((b) => ({ nome: String(b.name), publico: Boolean(b.public), arquivos: Number(b.arquivos ?? 0), bytes: Number(b.bytes ?? 0) })),
          servicos: saude.map((s) => ({ nome: s.name, saudavel: s.healthy, status: s.status })),
          tabelas: (tabelas ?? []).map((t) => ({ nome: String(t.esquema) === "public" ? String(t.nome) : `${String(t.esquema)}.${String(t.nome)}`, linhas: Number(t.linhas ?? 0), bytes: Number(t.bytes ?? 0) })),
          logs: (logs.result ?? []).map((l) => ({ data: typeof l.timestamp === "number" ? new Date(l.timestamp / 1000).toISOString() : String(l.timestamp), texto: String(l.event_message).slice(0, 300) })),
          semSql: usuarios === null,
        };
      }),
    );
    return { projetos: detalhes };
  },
  cloudflare: async (chave) => {
    const h = { authorization: `Bearer ${chave}` };
    const base = "https://api.cloudflare.com/client/v4";
    type Lista<T> = { result: T[] };
    const [zonas, contas] = await Promise.all([
      pedir<Lista<{ id: string; name: string; status: string; paused: boolean; plan?: { name: string }; account?: { id: string } }>>(`${base}/zones?per_page=50`, h),
      pedir<Lista<{ id: string; name: string }>>(`${base}/accounts?per_page=20`, h).catch(() => ({ result: [] })),
    ]);
    const conta = contas.result[0]?.id;
    const [pages, workers, dns] = await Promise.all([
      conta ? pedir<Lista<{ name: string; subdomain: string; domains?: string[]; latest_deployment?: { latest_stage?: { name?: string; status?: string }; created_on?: string; url?: string; environment?: string } }>>(`${base}/accounts/${conta}/pages/projects`, h).catch(() => ({ result: [] })) : Promise.resolve({ result: [] }),
      conta ? pedir<Lista<{ id: string; modified_on: string; created_on?: string }>>(`${base}/accounts/${conta}/workers/scripts`, h).catch(() => ({ result: [] })) : Promise.resolve({ result: [] }),
      Promise.all(zonas.result.slice(0, 5).map((z) => pedir<Lista<{ type: string; name: string; content: string; proxied?: boolean }>>(`${base}/zones/${z.id}/dns_records?per_page=100`, h).then((r) => r.result.map((d) => ({ ...d, zona: z.name }))).catch(() => []))),
    ]);
    const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const metricas = await Promise.all(
      zonas.result.slice(0, 5).map((z) =>
        pedir<{ data?: { viewer?: { zones?: { httpRequests1dGroups?: { dimensions: { date: string }; sum: { requests: number; bytes: number; threats: number; pageViews: number }; uniq: { uniques: number } }[] }[] } } }>(`${base}/graphql`, h, {
          query: `query { viewer { zones(filter: { zoneTag: "${z.id}" }) { httpRequests1dGroups(limit: 7, filter: { date_geq: "${desde}" }, orderBy: [date_ASC]) { dimensions { date } sum { requests bytes threats pageViews } uniq { uniques } } } } }`,
        })
          .then((r) => ({ zona: z.name, dias: (r.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []).map((g) => ({ data: g.dimensions.date, requisicoes: g.sum.requests, bytes: g.sum.bytes, ameacas: g.sum.threats, visitas: g.sum.pageViews, unicos: g.uniq.uniques })) }))
          .catch(() => ({ zona: z.name, dias: [] })),
      ),
    );
    return {
      zonas: zonas.result.map((z) => ({ nome: z.name, status: z.paused ? "pausada" : z.status, plano: z.plan?.name ?? "" })),
      dns: dns.flat().map((d) => ({ zona: d.zona, tipo: d.type, nome: d.name, valor: d.content, proxy: Boolean(d.proxied) })),
      pages: pages.result.map((p) => ({ nome: p.name, dominio: p.domains?.[0] ?? p.subdomain, estado: p.latest_deployment?.latest_stage?.status ?? "", etapa: p.latest_deployment?.latest_stage?.name ?? "", data: p.latest_deployment?.created_on ?? "", ambiente: p.latest_deployment?.environment ?? "" })),
      workers: workers.result.map((w) => ({ nome: w.id, alterado: w.modified_on })),
      metricas,
    };
  },
};

const cacheDados = new Map<Servico, { quando: number; dados: unknown }>();
const leiturasEmAndamento = new Map<Servico, Promise<unknown>>();

async function buscarConexao(servico: Servico, aindaValida: () => boolean) {
  const config = lerConfig()[servico];
  const chave = config?.temChave ? await lerSegredo(`conexao-${servico}`) : null;
  if (!chave) throw new Error("sem_chave");
  const dados = await LEITORES[servico](chave, config?.url);
  if (aindaValida()) cacheDados.set(servico, { quando: Date.now(), dados });
  return dados;
}

export async function lerConexao(servico: Servico, forcar = false) {
  const anterior = cacheDados.get(servico);
  if (!forcar && anterior && Date.now() - anterior.quando < 20000) return anterior.dados;
  const emAndamento = leiturasEmAndamento.get(servico);
  if (emAndamento) return emAndamento;
  const leitura: Promise<unknown> = buscarConexao(servico, () => leiturasEmAndamento.get(servico) === leitura).finally(() => {
    if (leiturasEmAndamento.get(servico) === leitura) leiturasEmAndamento.delete(servico);
  });
  leiturasEmAndamento.set(servico, leitura);
  return leitura;
}

export async function chaveDe(servico: Servico): Promise<string> {
  const chave = lerConfig()[servico]?.temChave ? await lerSegredo(`conexao-${servico}`) : null;
  if (!chave) throw new Error("sem_chave");
  return chave;
}

export async function salvarChaveConexao(servico: Servico, dados: { chave?: unknown; url?: unknown; clienteId?: unknown; segredo?: unknown }) {
  if (servico === "google") {
    const credencial = await autorizarWorkspace(String(dados.clienteId ?? "").trim(), String(dados.segredo ?? "").trim());
    const texto = JSON.stringify(credencial);
    await LEITORES[servico](texto);
    await gravarSegredo(`conexao-${servico}`, texto);
    for (const antigo of SERVICOS_ANTIGOS_DO_GOOGLE) await apagarSegredo(`conexao-${antigo}`).catch(() => undefined);
    const c = lerConfig();
    for (const antigo of SERVICOS_ANTIGOS_DO_GOOGLE) delete c[antigo];
    c[servico] = { temChave: true };
    salvarConfig(c);
    cacheDados.delete(servico);
    leiturasEmAndamento.delete(servico);
    return { ok: true };
  }
  const chave = typeof dados.chave === "string" ? dados.chave.trim() : "";
  if (chave.length < 8 || chave.length > 4000) throw new Error("chave_invalida");
  const url = servico === "n8n" ? validarUrlBase(String(dados.url ?? "")) : undefined;
  await LEITORES[servico](chave, url);
  await gravarSegredo(`conexao-${servico}`, chave);
  const c = lerConfig();
  c[servico] = { temChave: true, url };
  salvarConfig(c);
  cacheDados.delete(servico);
  leiturasEmAndamento.delete(servico);
  return { ok: true };
}

export async function removerChaveConexao(servico: Servico) {
  await apagarSegredo(`conexao-${servico}`).catch(() => undefined);
  const c = lerConfig();
  delete c[servico];
  salvarConfig(c);
  cacheDados.delete(servico);
  leiturasEmAndamento.delete(servico);
  return { ok: true };
}
