import { T } from "../textos/textos";
import { exigirConexaoDisponivel } from "../utilitarios/disponibilidadeConexoes";
import type { ServicoId } from "../tipos";
import type { CalendarioContribuicoesGithub } from "../utilitarios/contribuicoesGithub";
import type { CommitGithub } from "../utilitarios/commitsGithub";
import { hojeISO, paraISO } from "../utilitarios/datas";

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
  contribuicoes?: CalendarioContribuicoesGithub | null;
  commits?: CommitGithub[] | null;
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

export interface IssueAtribuida {
  id: string;
  titulo: string;
  url: string;
  estado: string;
  prazo: string | null;
  atualizada: string;
  prioridade?: number | string;
  rotuloPrioridade?: string;
  tipoEstado?: string;
  categoria?: string;
  time?: string;
  projeto?: string;
}

export interface DadosLinear {
  usuario: string;
  issues: IssueAtribuida[];
}

export interface DadosJira {
  usuario: string;
  site: string;
  issues: IssueAtribuida[];
}

export interface DadosTrello {
  usuario: string;
  quadros: { id: string; nome: string; url: string; atividade: string | null }[];
  cartoes: { id: string; titulo: string; prazo: string | null; concluido: boolean; quadro: string; url: string; atividade: string; etiquetas: string[] }[];
}

export interface DadosRailway {
  projetos: { id: string; nome: string; atualizado: string; estado: "pronto" | "erro" | "construindo" | "dormindo" | "parado"; url: string }[];
  deploys: { id: string; projeto: string; estado: "pronto" | "erro" | "construindo" | "dormindo" | "parado"; data: string; url: string }[];
}

export interface DadosDiscord {
  bot: string;
  servidores: { id: string; nome: string }[];
  mensagens: { id: string; canal: string; servidor: string; autor: string; texto: string; data: string; mencionaMe: boolean; url: string }[];
  mencoes: number;
  falhas: string[];
}

export interface DadosReddit {
  usuario: string;
  itens: { id: string; tipo: "comentario" | "mensagem" | "outro"; autor: string; assunto: string; texto: string; subreddit: string; naoLida: boolean; data: string; link: string }[];
  naoLidas: number;
}

interface TotaisStrava {
  vezes: number;
  metros: number;
  segundos: number;
  subida: number;
}

export interface DadosStrava {
  atleta: string;
  atividades: { id: string; nome: string; esporte: string; metros: number; segundos: number; subida: number; data: string; batimentos: number | null; url: string }[];
  ultimas4Semanas: { corrida: TotaisStrava | null; pedal: TotaisStrava | null; natacao: TotaisStrava | null } | null;
  noAno: { corrida: TotaisStrava | null; pedal: TotaisStrava | null } | null;
}

export interface DadosEmail {
  conta: string;
  naoLidas: number;
  total: number;
  mensagens: { uid: number; lido: boolean; data: string; assunto: string; de: string; endereco: string }[];
}

export interface EventoDeAgenda {
  id: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  diaInteiro: boolean;
  local: string;
  agenda: string;
}

export interface DadosCalendario {
  agendas: { nome: string; eventos: number; erro: string }[];
  eventos: EventoDeAgenda[];
}

export interface DadosCripto {
  moeda: string;
  fonte: "coinbase" | "okx";
  alerta: number;
  cotacoes: { simbolo: string; preco: number; variacao24h: number; curva: number[] }[];
  semCotacao: string[];
  carteira: { total: number; posicoes: { origem: string; ativo: string; quantidade: number; valor: number | null }[] };
  falhas: string[];
}

export type DadosServico = {
  linear: DadosLinear;
  jira: DadosJira;
  trello: DadosTrello;
  railway: DadosRailway;
  discord: DadosDiscord;
  reddit: DadosReddit;
  strava: DadosStrava;
  email: DadosEmail;
  calendario: DadosCalendario;
  cripto: DadosCripto;
  google: DadosGoogle;
  supabase: DadosSupabase;
  cloudflare: DadosCloudflare;
  stripe: DadosStripe;
  github: DadosGithub;
  gitlab: DadosGithub;
  gitea: DadosGithub;
  vercel: DadosVercel;
  resend: DadosResend;
  notion: DadosNotion;
  calcom: DadosCalcom;
  n8n: DadosN8n;
};

const CABECALHOS = { "x-niko": "1", "content-type": "application/json" };

async function pedir<R>(caminho: string, opcoes: RequestInit = {}): Promise<R> {
  const recursoGoogle = /^\/(google|gmail|agenda)(\/|$)/.test(caminho);
  const conexaoGoogle = /^\/conexoes\/google(?:\?|$|\/)/.test(caminho) && opcoes.method !== "DELETE";
  if (recursoGoogle || conexaoGoogle) exigirConexaoDisponivel("google");
  const r = await fetch(`/ponte${caminho}`, { ...opcoes, headers: { ...CABECALHOS, ...(opcoes.headers ?? {}) } });
  const json = (await r.json().catch(() => ({}))) as R & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `http_${r.status}`);
  return json;
}

export const conexoesPonte = {
  loginDireto: () => pedir<{ disponivel: boolean }>("/google/login-direto", { signal: AbortSignal.timeout(4000) }),
  estado: () => pedir<Record<ServicoId, { temChave: boolean; url: string | null }>>("/conexoes"),
  ler: <S extends ServicoId>(servico: S, forcar = false) => pedir<DadosServico[S]>(`/conexoes/${servico}${forcar ? "?forcar=1" : ""}`),
  salvarChave: (servico: ServicoId, chave: string, extra: Record<string, unknown> = {}) => pedir<{ ok: boolean }>(`/conexoes/${servico}/chave`, { method: "POST", body: JSON.stringify({ chave, ...extra }) }),
  buscarEmails: (q: string) => pedir<EmailResumo[]>(`/gmail/buscar?q=${encodeURIComponent(q)}`),
  lerAgendaGoogle: (de: string, ate: string) => pedir<EventoGoogle[]>(`/agenda/eventos?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`),
  criarRascunho: (dados: { para: string; assunto: string; corpo: string }) => pedir<{ ok: boolean }>("/gmail/rascunho", { method: "POST", body: JSON.stringify(dados) }),
  enviarEmail: (dados: { para: string; assunto: string; corpo: string }) => pedir<{ ok: boolean }>("/gmail/enviar", { method: "POST", body: JSON.stringify(dados) }),
  config: (servico: ServicoId) => pedir<Record<string, unknown>>(`/conexoes/${servico}/config`),
  removerChave: (servico: ServicoId) => pedir<{ ok: boolean }>(`/conexoes/${servico}/chave`, { method: "DELETE" }),
};

export function resumoDe<S extends ServicoId>(servico: S, dados: DadosServico[S]): string {
  const R = T.conexoes.resumos;
  const d = dados as DadosServico[ServicoId];
  switch (servico) {
    case "stripe":
      return R.stripe((d as DadosStripe).cobrancas.filter((c) => c.status === "pago").length);
    case "github":
    case "gitlab":
    case "gitea":
      return R[servico as "github" | "gitlab" | "gitea"]((d as DadosGithub).prs.length, (d as DadosGithub).actions.filter((a) => a.status === "falhou").length);
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
    case "linear":
    case "jira": {
      const issues = (d as DadosLinear | DadosJira).issues;
      return R.issues(issues.length, issues.filter((i) => i.prazo?.slice(0, 10) === hojeISO()).length);
    }
    case "trello": {
      const cartoes = (d as DadosTrello).cartoes.filter((c) => !c.concluido);
      return R.trello(cartoes.length, cartoes.filter((c) => c.prazo && c.prazo < new Date().toISOString()).length);
    }
    case "railway": {
      const r = d as DadosRailway;
      return R.railway(r.projetos.length, r.projetos.filter((p) => p.estado === "erro").length);
    }
    case "discord":
      return R.discord((d as DadosDiscord).mencoes, (d as DadosDiscord).mensagens.length);
    case "reddit":
      return R.reddit((d as DadosReddit).naoLidas);
    case "strava": {
      const s = d as DadosStrava;
      const metros = (s.ultimas4Semanas?.corrida?.metros ?? 0) + (s.ultimas4Semanas?.pedal?.metros ?? 0) + (s.ultimas4Semanas?.natacao?.metros ?? 0);
      return R.strava(s.atividades.length, metros / 1000);
    }
    case "email":
      return R.email((d as DadosEmail).naoLidas);
    case "calendario": {
      const eventos = (d as DadosCalendario).eventos;
      const hoje = hojeISO();
      const daquiUmaSemana = new Date(Date.now() + 7 * 86400_000).toISOString();
      return R.calendario(eventos.filter((e) => paraISO(new Date(e.inicio)) === hoje).length, eventos.filter((e) => e.inicio <= daquiUmaSemana).length);
    }
    case "cripto": {
      const c = d as DadosCripto;
      return R.cripto(c.cotacoes.length, c.carteira.posicoes.length ? formatarMoedaCripto(c.carteira.total, c.moeda) : null);
    }
    default:
      return R.n8n((d as DadosN8n).execucoes.filter((e) => e.status === "erro").length);
  }
}

export function formatarMoedaCripto(valor: number, moeda: string): string {
  const casas = Math.abs(valor) >= 100 ? 0 : Math.abs(valor) >= 1 ? 2 : 4;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda, minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export type NivelDeAviso = "importante" | "registro";

export interface OcorrenciaConexao {
  chave: string;
  texto: string;
  tipo: "sucesso" | "falha";
  data: string;
  aviso?: NivelDeAviso;
}

const MINUTOS_DE_ANTECEDENCIA_DA_AGENDA = 15;

export function ocorrenciasDe<S extends ServicoId>(servico: S, dados: DadosServico[S]): OcorrenciaConexao[] {
  const nome = T.conexoes.servicos[servico].nome;
  const O = T.conexoes.ocorrencias;
  const d = dados as DadosServico[ServicoId];
  switch (servico) {
    case "stripe":
      return (d as DadosStripe).cobrancas.slice(0, 10).map((c) => ({ chave: c.id, texto: c.status === "falhou" ? O.cobrancaFalhou(nome, c.cliente) : O.cobrancaPaga(nome, c.cliente), tipo: c.status === "falhou" ? "falha" : "sucesso", data: c.data, aviso: "registro" }));
    case "github":
    case "gitlab":
    case "gitea": {
      const g = d as DadosGithub;
      const agora = new Date().toISOString();
      const pedido = (r: string, n: number) => O.pedidoDeMerge(servico, r, n);
      const prefixo = servico === "github" ? "" : `${servico}-`;
      const actions: OcorrenciaConexao[] = g.actions.filter((a) => a.status !== "rodando").map((a) => ({ chave: `${prefixo}${a.repo}-${a.workflow}-${a.data}`, texto: a.status === "falhou" ? O.actionFalhou(nome, a.repo, a.workflow) : O.actionOk(nome, a.repo, a.workflow), tipo: a.status === "falhou" ? "falha" : "sucesso", data: a.data, aviso: "registro" }));
      const ciDosPrs: OcorrenciaConexao[] = g.prs
        .filter((p) => p.tipo === "meu" && (p.ci === "falhou" || p.ci === "sucesso"))
        .map((p) => ({ chave: `${prefixo}pr-ci-${p.repo}-${p.numero}-${p.ci}`, texto: p.ci === "falhou" ? O.prCiFalhou(nome, pedido(p.repo, p.numero)) : O.prCiOk(nome, pedido(p.repo, p.numero)), tipo: p.ci === "falhou" ? "falha" : "sucesso", data: agora, aviso: "importante" }));
      const revisoes: OcorrenciaConexao[] = g.prs.filter((p) => p.tipo === "revisar").map((p) => ({ chave: `${prefixo}pr-revisar-${p.repo}-${p.numero}`, texto: O.revisaoPedida(nome, p.autor, pedido(p.repo, p.numero)), tipo: "sucesso", data: p.data, aviso: "importante" }));
      return [...actions, ...ciDosPrs, ...revisoes];
    }
    case "vercel":
      return (d as DadosVercel).deploys.filter((x) => x.estado === "pronto" || x.estado === "erro").map((x) => ({ chave: `${x.projeto}-${x.data}`, texto: x.estado === "erro" ? O.deployFalhou(x.projeto) : O.deployPronto(x.projeto), tipo: x.estado === "erro" ? "falha" : "sucesso", data: x.data, aviso: "registro" }));
    case "resend":
      return (d as DadosResend).emails.filter((e) => e.estado === "devolvido" || e.estado === "spam").map((e) => ({ chave: `${e.para}-${e.data}`, texto: O.emailFalhou(e.para), tipo: "falha", data: e.data }));
    case "google":
      return ((d as DadosGoogle).gmail?.importantes ?? []).map((e) => ({ chave: e.id, texto: O.emailImportante(e.de, e.assunto), tipo: "sucesso" as const, data: e.data, aviso: "importante" as const }));
    case "supabase":
      return (d as DadosSupabase).projetos.flatMap((p) => p.servicos.filter((x) => !x.saudavel).map((x) => ({ chave: `${p.ref}-${x.nome}-${new Date().toISOString().slice(0, 13)}`, texto: O.supabaseServico(p.nome, x.nome), tipo: "falha" as const, data: new Date().toISOString() })));
    case "cloudflare":
      return (d as DadosCloudflare).pages.filter((p) => p.data).map((p) => ({ chave: `${p.nome}-${p.data}`, texto: p.estado === "failure" ? O.pagesFalhou(p.nome) : O.pagesOk(p.nome), tipo: p.estado === "failure" ? ("falha" as const) : ("sucesso" as const), data: p.data, aviso: "registro" as const }));
    case "n8n":
      return (d as DadosN8n).execucoes.filter((e) => e.status !== "rodando").map((e) => ({ chave: e.id, texto: e.status === "erro" ? O.n8nFalhou(e.workflow) : O.n8nOk(e.workflow), tipo: e.status === "erro" ? "falha" : "sucesso", data: e.data, aviso: "registro" }));
    case "linear":
    case "jira": {
      const hoje = hojeISO();
      const atribuida = servico === "linear" ? O.linearAtribuida : O.jiraAtribuida;
      return (d as DadosLinear | DadosJira).issues.flatMap((i): OcorrenciaConexao[] => [
        { chave: `${servico}-${i.id}`, texto: atribuida(i.id, i.titulo), tipo: "sucesso", data: i.atualizada, aviso: "importante" },
        ...(i.prazo?.slice(0, 10) === hoje ? [{ chave: `${servico}-prazo-${i.id}-${hoje}`, texto: O.prazoHoje(nome, i.titulo), tipo: "sucesso" as const, data: i.atualizada, aviso: "importante" as const }] : []),
      ]);
    }
    case "trello": {
      const hoje = hojeISO();
      return (d as DadosTrello).cartoes
        .filter((c) => !c.concluido && c.prazo && paraISO(new Date(c.prazo)) === hoje)
        .map((c) => ({ chave: `trello-prazo-${c.id}-${hoje}`, texto: O.prazoHoje(nome, c.titulo), tipo: "sucesso" as const, data: c.atividade, aviso: "importante" as const }));
    }
    case "railway":
      return (d as DadosRailway).deploys.filter((x) => x.estado === "pronto" || x.estado === "erro").map((x) => ({ chave: `railway-${x.id}`, texto: x.estado === "erro" ? O.railwayFalhou(x.projeto) : O.railwayPronto(x.projeto), tipo: x.estado === "erro" ? ("falha" as const) : ("sucesso" as const), data: x.data, aviso: "registro" as const }));
    case "discord":
      return (d as DadosDiscord).mensagens.filter((m) => m.mencionaMe).map((m) => ({ chave: `discord-${m.id}`, texto: O.discordMencao(m.autor, m.canal), tipo: "sucesso" as const, data: m.data, aviso: "importante" as const }));
    case "reddit":
      return (d as DadosReddit).itens.filter((i) => i.naoLida).map((i) => ({ chave: `reddit-${i.id}`, texto: O.redditMensagem(i.autor), tipo: "sucesso" as const, data: i.data, aviso: "importante" as const }));
    case "strava":
      return (d as DadosStrava).atividades.slice(0, 5).map((a) => ({ chave: `strava-${a.id}`, texto: O.stravaAtividade(a.nome), tipo: "sucesso" as const, data: a.data, aviso: "registro" as const }));
    case "email": {
      const e = d as DadosEmail;
      const maisNova = e.mensagens.filter((m) => !m.lido).reduce((maior, m) => Math.max(maior, m.uid), 0);
      return maisNova && e.naoLidas > 0 ? [{ chave: `email-${e.conta}-${maisNova}`, texto: O.emailsNovos(e.conta, e.naoLidas), tipo: "sucesso", data: new Date().toISOString(), aviso: "registro" }] : [];
    }
    case "calendario": {
      const agora = Date.now();
      return (d as DadosCalendario).eventos
        .filter((e) => !e.diaInteiro && new Date(e.inicio).getTime() - agora > 0 && new Date(e.inicio).getTime() - agora <= MINUTOS_DE_ANTECEDENCIA_DA_AGENDA * 60_000)
        .map((e) => ({ chave: `agenda-${e.id}`, texto: O.eventoEmBreve(e.titulo, Math.max(1, Math.round((new Date(e.inicio).getTime() - agora) / 60_000))), tipo: "sucesso" as const, data: e.inicio, aviso: "importante" as const }));
    }
    case "cripto": {
      const c = d as DadosCripto;
      if (!c.alerta) return [];
      const hoje = hojeISO();
      return c.cotacoes
        .filter((q) => Math.abs(q.variacao24h) >= c.alerta)
        .map((q) => ({ chave: `cripto-${q.simbolo}-${hoje}-${q.variacao24h >= 0 ? "alta" : "baixa"}`, texto: O.criptoVariou(q.simbolo, q.variacao24h), tipo: "sucesso" as const, data: new Date().toISOString(), aviso: "importante" as const }));
    }
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
  linear: ["https://linear.app/settings/account/security", null, null],
  jira: ["https://id.atlassian.com/manage-profile/security/api-tokens", null, null],
  trello: ["https://trello.com/power-ups/admin", null, null, null],
  railway: ["https://railway.com/account/tokens", null, null],
  discord: ["https://discord.com/developers/applications", null, null, null, null],
  reddit: ["https://www.reddit.com/prefs/feeds", null, null],
  strava: ["https://www.strava.com/settings/api", null, null, null],
  email: [null, "https://myaccount.google.com/apppasswords", null, null, null],
  calendario: [null, "https://outlook.live.com/calendar/0/options/calendar/SharedCalendars", null, null],
  cripto: [null, null, null, null],
  gitlab: ["https://gitlab.com/-/user_settings/personal_access_tokens", null, null],
  gitea: [null, null, null],
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
  linear: "https://linear.app",
  jira: "https://home.atlassian.com",
  trello: "https://trello.com",
  railway: "https://railway.com/dashboard",
  discord: "https://discord.com/app",
  reddit: "https://www.reddit.com/message/inbox",
  strava: "https://www.strava.com/dashboard",
  email: "https://mail.google.com",
  calendario: "https://outlook.live.com/calendar",
  cripto: "https://www.coinbase.com/explore",
  gitlab: "https://gitlab.com/dashboard/merge_requests",
  gitea: "https://gitea.com",
};

export const FORJAS = ["github", "gitlab", "gitea"] as const;

export function ehForja(servico: ServicoId): servico is (typeof FORJAS)[number] {
  return (FORJAS as readonly string[]).includes(servico);
}
