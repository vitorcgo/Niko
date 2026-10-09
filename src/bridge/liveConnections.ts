import { T } from "../i18n/ptBR";
import type { ServiceId } from "../types";

export interface DataStripe {
  disponivel: number;
  pendente: number;
  cobrancas: { id: string; cliente: string; valor: number; status: "pago" | "falhou" | "reembolsado"; data: string; metodo: string }[];
  disputas: { id: string; valor: number; motivo: string; prazo: string }[];
  repasses: { id: string; valor: number; chegada: string; status: "a_caminho" | "pago" }[];
  clientes: { nome: string; email: string; desde: string; total: number }[];
}

export interface DataGithub {
  usuario: string;
  commitsPorDia?: Record<string, number>;
  repositorios: { nome: string; linguagem: string; estrelas: number; atualizado: string; privado: boolean }[];
  prs: { titulo: string; repo: string; numero: number; autor: string; revisao: "pendente" | "aprovado" | "mudancas"; data: string; url?: string; tipo?: "meu" | "revisar"; ci?: "sucesso" | "falhou" | "rodando" | "nenhum" }[];
  issues: { titulo: string; repo: string; numero: number; rotulos: string[]; data: string }[];
  actions: { workflow: string; repo: string; branch: string; status: "sucesso" | "falhou" | "rodando"; duracao: number; data: string }[];
}

export interface DataVercel {
  projetos: { nome: string; dominio: string; framework: string; ultimoDeploy: string; estado: "pronto" | "erro" | "construindo" }[];
  deploys: { projeto: string; branch: string; commit: string; estado: "pronto" | "erro" | "construindo" | "cancelado"; duracao: number; data: string; ambiente: "produção" | "prévia"; url?: string }[];
}

export interface DataResend {
  enviados: number;
  entregues: number;
  falhas: number;
  emails: { para: string; assunto: string; estado: "entregue" | "aberto" | "devolvido" | "spam"; data: string }[];
  dominios: { nome: string; verificado: boolean }[];
}

export interface DataNotion {
  paginas: { titulo: string; editadoPor: string; data: string; local: string }[];
  bancos: { nome: string; itens: number }[];
}

export interface DataCalcom {
  agendamentos: { pessoa: string; tipo: string; inicio: string; status: "confirmado" | "pendente" | "cancelado" }[];
  tiposEvento: { nome: string; duracao: number; reservas: number }[];
}

export interface DataN8n {
  workflows: { nome: string; ativo: boolean; execucoes: number; ultimaFalha?: string }[];
  execucoes: { id: string; workflow: string; status: "sucesso" | "erro" | "rodando"; duracao: number; data: string }[];
}

export interface DataGmail {
  email: string;
  naoLidos: number;
  total: number;
  importantes: EmailSummary[];
  recentes: EmailSummary[];
}

export interface DataAgenda {
  hoje: number;
  proximos: EventGoogle[];
}

export interface EventGoogle {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  link?: string;
}

export interface EmailSummary {
  id: string;
  de: string;
  assunto: string;
  trecho: string;
  data: string;
  naoLido: boolean;
  importante: boolean;
}

export interface DataSupabase {
  projetos: {
    ref: string;
    nome: string;
    regiao: string;
    status: string;
    criado: string;
    versaoBanco: string;
    usuarios: number;
    novos7d: number;
    ultimoLogin: string | null;
    bancoBytes: number;
    buckets: { nome: string; publico: boolean; arquivos: number; bytes: number }[];
    servicos: { nome: string; saudavel: boolean; status: string }[];
    tabelas?: { nome: string; linhas: number; bytes: number }[];
    logs: { data: string; texto: string }[];
    semSql: boolean;
  }[];
}

export interface DataCloudflare {
  zonas: { nome: string; status: string; plano: string }[];
  dns: { zona: string; tipo: string; nome: string; valor: string; proxy: boolean }[];
  pages: { nome: string; dominio: string; estado: string; etapa: string; data: string; ambiente: string }[];
  workers: { nome: string; alterado: string }[];
  metricas: { zona: string; dias: { data: string; requisicoes: number; bytes: number; ameacas: number; visitas: number; unicos: number }[] }[];
}

export type DataService = {
  gmail: DataGmail;
  agenda: DataAgenda;
  supabase: DataSupabase;
  cloudflare: DataCloudflare;
  stripe: DataStripe;
  github: DataGithub;
  vercel: DataVercel;
  resend: DataResend;
  notion: DataNotion;
  calcom: DataCalcom;
  n8n: DataN8n;
};

const HEADERS = { "x-niko": "1", "content-type": "application/json" };

async function request<R>(path: string, options: RequestInit = {}): Promise<R> {
  const r = await fetch(`/ponte${path}`, { ...options, headers: { ...HEADERS, ...(options.headers ?? {}) } });
  const json = (await r.json().catch(() => ({}))) as R & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const connectionsBridge = {
  estado: () => request<Record<ServiceId, { temChave: boolean; url: string | null }>>("/conexoes"),
  ler: <S extends ServiceId>(service: S, force = false) => request<DataService[S]>(`/conexoes/${service}${force ? "?forcar=1" : ""}`),
  salvarChave: (service: ServiceId, key: string, extra: { url?: string; clienteId?: string; segredo?: string } = {}) => request<{ ok: boolean }>(`/conexoes/${service}/chave`, { method: "POST", body: JSON.stringify({ chave: key, ...extra }) }),
  buscarEmails: (q: string) => request<EmailSummary[]>(`/gmail/buscar?q=${encodeURIComponent(q)}`),
  lerAgendaGoogle: (from: string, until: string) => request<EventGoogle[]>(`/agenda/eventos?de=${encodeURIComponent(from)}&ate=${encodeURIComponent(until)}`),
  criarRascunho: (payload: { para: string; assunto: string; corpo: string }) => request<{ ok: boolean }>("/gmail/rascunho", { method: "POST", body: JSON.stringify(payload) }),
  enviarEmail: (payload: { para: string; assunto: string; corpo: string }) => request<{ ok: boolean }>("/gmail/enviar", { method: "POST", body: JSON.stringify(payload) }),
  removerChave: (service: ServiceId) => request<{ ok: boolean }>(`/conexoes/${service}/chave`, { method: "DELETE" }),
};

export function summary<S extends ServiceId>(service: S, payload: DataService[S]): string {
  const R = T.conexoes.resumos;
  const d = payload as DataService[ServiceId];
  switch (service) {
    case "stripe":
      return R.stripe((d as DataStripe).cobrancas.filter((c) => c.status === "pago").length);
    case "github":
      return R.github((d as DataGithub).prs.length, (d as DataGithub).actions.filter((a) => a.status === "falhou").length);
    case "vercel":
      return R.vercel((d as DataVercel).deploys.filter((x) => x.estado === "pronto").length);
    case "resend":
      return R.resend((d as DataResend).enviados, (d as DataResend).falhas);
    case "notion":
      return R.notion((d as DataNotion).paginas.length);
    case "calcom":
      return R.calcom((d as DataCalcom).agendamentos.length);
    case "gmail":
      return R.gmail((d as DataGmail).naoLidos, (d as DataGmail).importantes.length);
    case "agenda":
      return R.agenda((d as DataAgenda).hoje, (d as DataAgenda).proximos.length);
    case "supabase":
      return R.supabase((d as DataSupabase).projetos.length, (d as DataSupabase).projetos.reduce((a, p) => a + p.usuarios, 0));
    case "cloudflare":
      return R.cloudflare((d as DataCloudflare).zonas.length, (d as DataCloudflare).workers.length);
    default:
      return R.n8n((d as DataN8n).execucoes.filter((e) => e.status === "erro").length);
  }
}

export interface OccurrenceConnection {
  chave: string;
  texto: string;
  tipo: "sucesso" | "falha";
  data: string;
}

export function getOccurrences<S extends ServiceId>(service: S, payload: DataService[S]): OccurrenceConnection[] {
  const nameValue = T.conexoes.servicos[service].nome;
  const O = T.conexoes.ocorrencias;
  const d = payload as DataService[ServiceId];
  switch (service) {
    case "stripe":
      return (d as DataStripe).cobrancas.slice(0, 10).map((c) => ({ chave: c.id, texto: c.status === "falhou" ? O.cobrancaFalhou(nameValue, c.cliente) : O.cobrancaPaga(nameValue, c.cliente), tipo: c.status === "falhou" ? "falha" : "sucesso", data: c.data }));
    case "github": {
      const g = d as DataGithub;
      const now = new Date().toISOString();
      const actions: OccurrenceConnection[] = g.actions.filter((a) => a.status !== "rodando").map((a) => ({ chave: `${a.repo}-${a.workflow}-${a.data}`, texto: a.status === "falhou" ? O.actionFalhou(a.repo, a.workflow) : O.actionOk(a.repo, a.workflow), tipo: a.status === "falhou" ? "falha" : "sucesso", data: a.data }));
      const ciPrs: OccurrenceConnection[] = g.prs
        .filter((p) => p.tipo === "meu" && (p.ci === "falhou" || p.ci === "sucesso"))
        .map((p) => ({ chave: `pr-ci-${p.repo}-${p.numero}-${p.ci}`, texto: p.ci === "falhou" ? O.prCiFalhou(p.repo, p.numero) : O.prCiOk(p.repo, p.numero), tipo: p.ci === "falhou" ? "falha" : "sucesso", data: now }));
      const reviews: OccurrenceConnection[] = g.prs.filter((p) => p.tipo === "revisar").map((p) => ({ chave: `pr-revisar-${p.repo}-${p.numero}`, texto: O.revisaoPedida(p.autor, p.repo, p.numero), tipo: "sucesso", data: p.data }));
      return [...actions, ...ciPrs, ...reviews];
    }
    case "vercel":
      return (d as DataVercel).deploys.filter((x) => x.estado === "pronto" || x.estado === "erro").map((x) => ({ chave: `${x.projeto}-${x.data}`, texto: x.estado === "erro" ? O.deployFalhou(x.projeto) : O.deployPronto(x.projeto), tipo: x.estado === "erro" ? "falha" : "sucesso", data: x.data }));
    case "resend":
      return (d as DataResend).emails.filter((e) => e.estado === "devolvido" || e.estado === "spam").map((e) => ({ chave: `${e.para}-${e.data}`, texto: O.emailFalhou(e.para), tipo: "falha", data: e.data }));
    case "gmail":
      return (d as DataGmail).importantes.map((e) => ({ chave: e.id, texto: O.emailImportante(e.de, e.assunto), tipo: "sucesso" as const, data: e.data }));
    case "supabase":
      return (d as DataSupabase).projetos.flatMap((p) => p.servicos.filter((x) => !x.saudavel).map((x) => ({ chave: `${p.ref}-${x.nome}-${new Date().toISOString().slice(0, 13)}`, texto: O.supabaseServico(p.nome, x.nome), tipo: "falha" as const, data: new Date().toISOString() })));
    case "cloudflare":
      return (d as DataCloudflare).pages.filter((p) => p.data).map((p) => ({ chave: `${p.nome}-${p.data}`, texto: p.estado === "failure" ? O.pagesFalhou(p.nome) : O.pagesOk(p.nome), tipo: p.estado === "failure" ? ("falha" as const) : ("sucesso" as const), data: p.data }));
    case "n8n":
      return (d as DataN8n).execucoes.filter((e) => e.status !== "rodando").map((e) => ({ chave: e.id, texto: e.status === "erro" ? O.n8nFalhou(e.workflow) : O.n8nOk(e.workflow), tipo: e.status === "erro" ? "falha" : "sucesso", data: e.data }));
    default:
      return [];
  }
}
export const SERVICES_GOOGLE: ServiceId[] = ["gmail", "agenda"];

export const LINKS_GUIDE: Record<ServiceId, (string | null)[]> = {
  stripe: ["https://dashboard.stripe.com/apikeys", null, null, null],
  github: ["https://github.com/settings/personal-access-tokens/new", null, null, null],
  vercel: ["https://vercel.com/account/tokens", null, null],
  resend: ["https://resend.com/api-keys", null, null],
  notion: ["https://app.notion.com/developers/connections", null, null, null],
  calcom: ["https://app.cal.com/settings/security", null, null],
  n8n: [null, null, null],
  gmail: [
    "https://console.cloud.google.com/projectcreate",
    "https://console.cloud.google.com/apis/enableflow;apiid=gmail.googleapis.com",
    "https://console.cloud.google.com/auth/branding",
    "https://console.cloud.google.com/auth/audience",
    "https://console.cloud.google.com/auth/clients",
    null,
  ],
  agenda: [
    "https://console.cloud.google.com/projectcreate",
    "https://console.cloud.google.com/apis/enableflow;apiid=calendar-json.googleapis.com",
    "https://console.cloud.google.com/auth/branding",
    "https://console.cloud.google.com/auth/audience",
    "https://console.cloud.google.com/auth/clients",
    null,
  ],
  supabase: ["https://supabase.com/dashboard/account/tokens", null, null],
  cloudflare: ["https://dash.cloudflare.com/profile/api-tokens", null, null, null],
};

export const PANEL_OFFICIAL: Record<ServiceId, string> = {
  stripe: "https://dashboard.stripe.com",
  github: "https://github.com",
  vercel: "https://vercel.com/dashboard",
  resend: "https://resend.com/emails",
  notion: "https://www.notion.so",
  calcom: "https://app.cal.com/bookings/upcoming",
  n8n: "https://n8n.io",
  gmail: "https://mail.google.com",
  agenda: "https://calendar.google.com",
  supabase: "https://supabase.com/dashboard/projects",
  cloudflare: "https://dash.cloudflare.com",
};
