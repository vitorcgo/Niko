import { T } from "../textos/textos";
import type { ServicoId } from "../tipos";

export interface DadosStripe {
  disponivel: number;
  pendente: number;
  cobrancas: { id: string; cliente: string; valor: number; status: "pago" | "falhou" | "reembolsado"; data: string; metodo: string }[];
  disputas: { id: string; valor: number; motivo: string; prazo: string }[];
  repasses: { id: string; valor: number; chegada: string; status: "a_caminho" | "pago" }[];
  clientes: { nome: string; email: string; desde: string; total: number }[];
}

export interface DadosGithub {
  usuario: string;
  commitsPorDia?: Record<string, number>;
  repositorios: { nome: string; linguagem: string; estrelas: number; atualizado: string; privado: boolean }[];
  prs: { titulo: string; repo: string; numero: number; autor: string; revisao: "pendente" | "aprovado" | "mudancas"; data: string; url?: string; tipo?: "meu" | "revisar"; ci?: "sucesso" | "falhou" | "rodando" | "nenhum" }[];
  issues: { titulo: string; repo: string; numero: number; rotulos: string[]; data: string }[];
  actions: { workflow: string; repo: string; branch: string; status: "sucesso" | "falhou" | "rodando"; duracao: number; data: string }[];
}

export interface DadosVercel {
  projetos: { nome: string; dominio: string; framework: string; ultimoDeploy: string; estado: "pronto" | "erro" | "construindo" }[];
  deploys: { projeto: string; branch: string; commit: string; estado: "pronto" | "erro" | "construindo" | "cancelado"; duracao: number; data: string; ambiente: "produção" | "prévia"; url?: string }[];
}

export interface DadosResend {
  enviados: number;
  entregues: number;
  falhas: number;
  emails: { para: string; assunto: string; estado: "entregue" | "aberto" | "devolvido" | "spam"; data: string }[];
  dominios: { nome: string; verificado: boolean }[];
}

export interface DadosNotion {
  paginas: { titulo: string; editadoPor: string; data: string; local: string }[];
  bancos: { nome: string; itens: number }[];
}

export interface DadosCalcom {
  agendamentos: { pessoa: string; tipo: string; inicio: string; status: "confirmado" | "pendente" | "cancelado" }[];
  tiposEvento: { nome: string; duracao: number; reservas: number }[];
}

export interface DadosN8n {
  workflows: { nome: string; ativo: boolean; execucoes: number; ultimaFalha?: string }[];
  execucoes: { id: string; workflow: string; status: "sucesso" | "erro" | "rodando"; duracao: number; data: string }[];
}

export interface DadosGmail {
  email: string;
  naoLidos: number;
  total: number;
  importantes: EmailResumo[];
  recentes: EmailResumo[];
}

export interface DadosAgenda {
  hoje: number;
  proximos: EventoGoogle[];
}

export interface ArquivoDrive {
  id: string;
  nome: string;
  tipo: string;
  alterado: string;
  link?: string;
}

export interface TarefaGoogle {
  id: string;
  titulo: string;
  lista: string;
  prazo?: string;
  link?: string;
}

export type FalhaGoogle = "api_desativada" | "sem_permissao" | "falhou";

export interface DadosGoogle {
  email: string;
  gmail: DadosGmail | null;
  agenda: DadosAgenda | null;
  drive: ArquivoDrive[] | null;
  tarefas: TarefaGoogle[] | null;
  falhas: Partial<Record<"gmail" | "agenda" | "drive" | "tarefas", FalhaGoogle>>;
}

export interface EventoGoogle {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  link?: string;
}

export interface EmailResumo {
  id: string;
  de: string;
  assunto: string;
  trecho: string;
  data: string;
  naoLido: boolean;
  importante: boolean;
}

export interface DadosSupabase {
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

export interface DadosCloudflare {
  zonas: { nome: string; status: string; plano: string }[];
  dns: { zona: string; tipo: string; nome: string; valor: string; proxy: boolean }[];
  pages: { nome: string; dominio: string; estado: string; etapa: string; data: string; ambiente: string }[];
  workers: { nome: string; alterado: string }[];
  metricas: { zona: string; dias: { data: string; requisicoes: number; bytes: number; ameacas: number; visitas: number; unicos: number }[] }[];
}

export type DadosServico = {
  google: DadosGoogle;
  supabase: DadosSupabase;
  cloudflare: DadosCloudflare;
  stripe: DadosStripe;
  github: DadosGithub;
  vercel: DadosVercel;
  resend: DadosResend;
  notion: DadosNotion;
  calcom: DadosCalcom;
  n8n: DadosN8n;
};

const CABECALHOS = { "x-niko": "1", "content-type": "application/json" };

async function pedir<R>(caminho: string, opcoes: RequestInit = {}): Promise<R> {
  const r = await fetch(`/ponte${caminho}`, { ...opcoes, headers: { ...CABECALHOS, ...(opcoes.headers ?? {}) } });
  const json = (await r.json().catch(() => ({}))) as R & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const conexoesPonte = {
  loginDireto: () => pedir<{ disponivel: boolean }>("/google/login-direto", { signal: AbortSignal.timeout(4000) }),
  estado: () => pedir<Record<ServicoId, { temChave: boolean; url: string | null }>>("/conexoes"),
  ler: <S extends ServicoId>(servico: S, forcar = false) => pedir<DadosServico[S]>(`/conexoes/${servico}${forcar ? "?forcar=1" : ""}`),
  salvarChave: (servico: ServicoId, chave: string, extra: { url?: string; clienteId?: string; segredo?: string } = {}) => pedir<{ ok: boolean }>(`/conexoes/${servico}/chave`, { method: "POST", body: JSON.stringify({ chave, ...extra }) }),
  buscarEmails: (q: string) => pedir<EmailResumo[]>(`/gmail/buscar?q=${encodeURIComponent(q)}`),
  lerAgendaGoogle: (de: string, ate: string) => pedir<EventoGoogle[]>(`/agenda/eventos?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`),
  criarRascunho: (dados: { para: string; assunto: string; corpo: string }) => pedir<{ ok: boolean }>("/gmail/rascunho", { method: "POST", body: JSON.stringify(dados) }),
  enviarEmail: (dados: { para: string; assunto: string; corpo: string }) => pedir<{ ok: boolean }>("/gmail/enviar", { method: "POST", body: JSON.stringify(dados) }),
  removerChave: (servico: ServicoId) => pedir<{ ok: boolean }>(`/conexoes/${servico}/chave`, { method: "DELETE" }),
};

export function resumoDe<S extends ServicoId>(servico: S, dados: DadosServico[S]): string {
  const R = T.conexoes.resumos;
  const d = dados as DadosServico[ServicoId];
  switch (servico) {
    case "stripe":
      return R.stripe((d as DadosStripe).cobrancas.filter((c) => c.status === "pago").length);
    case "github":
      return R.github((d as DadosGithub).prs.length, (d as DadosGithub).actions.filter((a) => a.status === "falhou").length);
    case "vercel":
      return R.vercel((d as DadosVercel).deploys.filter((x) => x.estado === "pronto").length);
    case "resend":
      return R.resend((d as DadosResend).enviados, (d as DadosResend).falhas);
    case "notion":
      return R.notion((d as DadosNotion).paginas.length);
    case "calcom":
      return R.calcom((d as DadosCalcom).agendamentos.length);
    case "google": {
      const g = d as DadosGoogle;
      return R.google(g.gmail?.naoLidos ?? null, g.agenda?.hoje ?? null, g.tarefas?.length ?? null);
    }
    case "supabase":
      return R.supabase((d as DadosSupabase).projetos.length, (d as DadosSupabase).projetos.reduce((a, p) => a + p.usuarios, 0));
    case "cloudflare":
      return R.cloudflare((d as DadosCloudflare).zonas.length, (d as DadosCloudflare).workers.length);
    default:
      return R.n8n((d as DadosN8n).execucoes.filter((e) => e.status === "erro").length);
  }
}

export interface OcorrenciaConexao {
  chave: string;
  texto: string;
  tipo: "sucesso" | "falha";
  data: string;
}

export function ocorrenciasDe<S extends ServicoId>(servico: S, dados: DadosServico[S]): OcorrenciaConexao[] {
  const nome = T.conexoes.servicos[servico].nome;
  const O = T.conexoes.ocorrencias;
  const d = dados as DadosServico[ServicoId];
  switch (servico) {
    case "stripe":
      return (d as DadosStripe).cobrancas.slice(0, 10).map((c) => ({ chave: c.id, texto: c.status === "falhou" ? O.cobrancaFalhou(nome, c.cliente) : O.cobrancaPaga(nome, c.cliente), tipo: c.status === "falhou" ? "falha" : "sucesso", data: c.data }));
    case "github": {
      const g = d as DadosGithub;
      const agora = new Date().toISOString();
      const actions: OcorrenciaConexao[] = g.actions.filter((a) => a.status !== "rodando").map((a) => ({ chave: `${a.repo}-${a.workflow}-${a.data}`, texto: a.status === "falhou" ? O.actionFalhou(a.repo, a.workflow) : O.actionOk(a.repo, a.workflow), tipo: a.status === "falhou" ? "falha" : "sucesso", data: a.data }));
      const ciDosPrs: OcorrenciaConexao[] = g.prs
        .filter((p) => p.tipo === "meu" && (p.ci === "falhou" || p.ci === "sucesso"))
        .map((p) => ({ chave: `pr-ci-${p.repo}-${p.numero}-${p.ci}`, texto: p.ci === "falhou" ? O.prCiFalhou(p.repo, p.numero) : O.prCiOk(p.repo, p.numero), tipo: p.ci === "falhou" ? "falha" : "sucesso", data: agora }));
      const revisoes: OcorrenciaConexao[] = g.prs.filter((p) => p.tipo === "revisar").map((p) => ({ chave: `pr-revisar-${p.repo}-${p.numero}`, texto: O.revisaoPedida(p.autor, p.repo, p.numero), tipo: "sucesso", data: p.data }));
      return [...actions, ...ciDosPrs, ...revisoes];
    }
    case "vercel":
      return (d as DadosVercel).deploys.filter((x) => x.estado === "pronto" || x.estado === "erro").map((x) => ({ chave: `${x.projeto}-${x.data}`, texto: x.estado === "erro" ? O.deployFalhou(x.projeto) : O.deployPronto(x.projeto), tipo: x.estado === "erro" ? "falha" : "sucesso", data: x.data }));
    case "resend":
      return (d as DadosResend).emails.filter((e) => e.estado === "devolvido" || e.estado === "spam").map((e) => ({ chave: `${e.para}-${e.data}`, texto: O.emailFalhou(e.para), tipo: "falha", data: e.data }));
    case "google":
      return ((d as DadosGoogle).gmail?.importantes ?? []).map((e) => ({ chave: e.id, texto: O.emailImportante(e.de, e.assunto), tipo: "sucesso" as const, data: e.data }));
    case "supabase":
      return (d as DadosSupabase).projetos.flatMap((p) => p.servicos.filter((x) => !x.saudavel).map((x) => ({ chave: `${p.ref}-${x.nome}-${new Date().toISOString().slice(0, 13)}`, texto: O.supabaseServico(p.nome, x.nome), tipo: "falha" as const, data: new Date().toISOString() })));
    case "cloudflare":
      return (d as DadosCloudflare).pages.filter((p) => p.data).map((p) => ({ chave: `${p.nome}-${p.data}`, texto: p.estado === "failure" ? O.pagesFalhou(p.nome) : O.pagesOk(p.nome), tipo: p.estado === "failure" ? ("falha" as const) : ("sucesso" as const), data: p.data }));
    case "n8n":
      return (d as DadosN8n).execucoes.filter((e) => e.status !== "rodando").map((e) => ({ chave: e.id, texto: e.status === "erro" ? O.n8nFalhou(e.workflow) : O.n8nOk(e.workflow), tipo: e.status === "erro" ? "falha" : "sucesso", data: e.data }));
    default:
      return [];
  }
}
export const SERVICOS_DO_GOOGLE: ServicoId[] = ["google"];

export const LINKS_DO_GUIA: Record<ServicoId, (string | null)[]> = {
  stripe: ["https://dashboard.stripe.com/apikeys", null, null, null],
  github: ["https://github.com/settings/personal-access-tokens/new", null, null, null],
  vercel: ["https://vercel.com/account/tokens", null, null],
  resend: ["https://resend.com/api-keys", null, null],
  notion: ["https://app.notion.com/developers/connections", null, null, null],
  calcom: ["https://app.cal.com/settings/security", null, null],
  n8n: [null, null, null],
  google: [
    "https://console.cloud.google.com/projectcreate",
    "https://console.cloud.google.com/apis/enableflow;apiid=gmail.googleapis.com,calendar-json.googleapis.com,drive.googleapis.com,tasks.googleapis.com",
    "https://console.cloud.google.com/auth/branding",
    "https://console.cloud.google.com/auth/audience",
    "https://console.cloud.google.com/auth/clients",
    null,
  ],
  supabase: ["https://supabase.com/dashboard/account/tokens", null, null],
  cloudflare: ["https://dash.cloudflare.com/profile/api-tokens", null, null, null],
};

export const PAINEL_OFICIAL: Record<ServicoId, string> = {
  stripe: "https://dashboard.stripe.com",
  github: "https://github.com",
  vercel: "https://vercel.com/dashboard",
  resend: "https://resend.com/emails",
  notion: "https://www.notion.so",
  calcom: "https://app.cal.com/bookings/upcoming",
  n8n: "https://n8n.io",
  google: "https://myaccount.google.com/",
  supabase: "https://supabase.com/dashboard/projects",
  cloudflare: "https://dash.cloudflare.com",
};
