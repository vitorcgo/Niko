// Protocolo compartilhado entre o servidor (Node) e o cliente (navegador).
// Código puro: sem APIs de Node nem de DOM.
//
// Regra de evolução: mudanças aqui devem ser ADITIVAS (campos opcionais novos).
// Renomear/remover campos quebra servidor, mundo e UI ao mesmo tempo.

export type AgentKind = 'main' | 'sub';

/**
 * De qual ferramenta vem o agente (ou a conta, a fonte, a sessão, o pedido). Nos tipos do protocolo o campo
 * `provider` é opcional e AUSENTE quer dizer 'claude' (tudo o que existia antes do Codex continua igual).
 * - claude: Claude Code;
 * - codex: OpenAI Codex (CLI `codex` e o app desktop, que gravam no mesmo CODEX_HOME).
 */
export type Provider = 'claude' | 'codex';

/**
 * Estado de alto nível de um agente — é o que dirige o comportamento do personagem.
 * - working: processando um turno (ocupado). Fica na mesa digitando.
 * - waiting: precisa do usuário (permissão, pergunta, diálogo). Fica na mesa com a mão levantada.
 * - idle: terminou o turno e espera a próxima instrução. Circula pelo escritório (café, bebedouro...).
 * - shell: terminou o turno, mas há shell(s) rodando em segundo plano (ver `shells`); está esperando
 *   o shell terminar. Fica na mesa, de olho no terminal. (O registro do Claude Code grava "shell"
 *   quando a sessão está ociosa com shells em segundo plano.)
 * - done: subagente concluiu. Entrega o resultado ao agente principal e vai embora.
 * - offline: sessão encerrada. Vai embora (se for o último da sala, apaga a luz).
 */
export type AgentStatus = 'working' | 'waiting' | 'idle' | 'shell' | 'done' | 'offline';

/** Um comando de shell que o agente está esperando terminar. */
export interface ShellJob {
  /** Id da tarefa em segundo plano (ex.: "bo0ov3q3l") ou, em primeiro plano, o id do tool_use. */
  id: string;
  /** Texto curto em PT-BR: a descrição do Bash ou um resumo do comando (segredos mascarados). */
  label: string;
  /** Comando completo (mascarado, até ~300 caracteres), quando houver. */
  command?: string;
  /** Epoch ms em que o comando começou. */
  startedAt: number;
  /** true = run_in_background (o agente encerrou o turno e espera a notificação); false = comando em primeiro plano ainda sem resultado. */
  background: boolean;
  /** 'monitor' = ferramenta Monitor (acompanha um processo); 'shell' = Bash. */
  kind: 'shell' | 'monitor';
}

export type ActivityKind =
  | 'prompt' // recebeu nova instrução do usuário
  | 'think' // pensando (bloco de thinking)
  | 'respond' // escrevendo resposta em texto
  | 'read'
  | 'search'
  | 'edit'
  | 'write'
  | 'run' // comando no terminal
  | 'test'
  | 'git'
  | 'web'
  | 'browser'
  | 'plan' // tarefas / planejamento
  | 'delegate' // disparou subagente(s)
  | 'communicate' // mensagem para outro agente / aviso
  | 'ask' // pergunta ao usuário
  | 'mcp'
  | 'skill'
  | 'wait'
  | 'error'
  | 'compact' // compactação de contexto
  | 'done' // terminou o turno
  | 'other';

export interface Activity {
  /** Único por atividade (ex.: uuid da entrada + índice do bloco). */
  id: string;
  kind: ActivityKind;
  /** Emoji que representa a atividade. */
  icon: string;
  /** Texto curto em PT-BR (até ~46 caracteres). Ex.: "Editando App.tsx". */
  text: string;
  /** Detalhe opcional (comando completo, caminho, consulta...), até ~300 caracteres. */
  detail?: string;
  /** Nome bruto da ferramenta, quando houver. */
  tool?: string;
  /** Epoch ms. */
  at: number;
  durationMs?: number;
  error?: boolean;
  /** Perguntas completas de um AskUserQuestion (kind 'ask'), para o escritório mostrar as opções. */
  questions?: AskQuestion[];
}

/**
 * Uma pergunta do AskUserQuestion, já mascarada e cortada. Com o pedido no escritório (PermissionRequestInfo.questions),
 * dá para responder por lá; senão a resposta é dada no Claude Code.
 */
export interface AskQuestion {
  /** Posição da pergunta em `tool_input.questions` (entradas inválidas são puladas, então pode haver saltos). */
  index: number;
  question: string;
  header?: string;
  multiSelect?: boolean;
  /** `index` = posição da opção em `options` do original: é ela que volta na resposta (PermissionAnswer). */
  options: Array<{ index: number; label: string; description?: string }>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  /** Forma no gerúndio ("Escrevendo testes"), quando disponível. */
  activeForm?: string;
}

export interface AgentStats {
  toolCalls: number;
  /** input + cache read + cache creation. */
  tokensIn: number;
  tokensOut: number;
  costUSD?: number;
  linesAdded?: number;
  linesRemoved?: number;
  /** Total de subagentes disparados por este agente. */
  subagents: number;
}

export interface AgentInfo {
  /**
   * Estável enquanto o agente existir. Claude Code: principal "<conta>:<pid>", sub "<sessionId>:<agentId>".
   * Codex: principal e sub "<conta>:<threadId>" (o sub com `parentId`).
   */
  id: string;
  kind: AgentKind;
  /** Ferramenta do agente; ausente = 'claude'. */
  provider?: Provider;
  /** Para subagentes: id do agente que o disparou. */
  parentId?: string;
  roomId: string;
  /** Nome humano único no escritório. Ex.: "Marina". */
  name: string;
  /** Dica de apresentação do nome (usada pela arte para variar o visual). */
  look: 'f' | 'm';
  /** Papel. Principal: "Agente principal". Sub: tipo do subagente ("Explore", "Plan", "fork"...). */
  role: string;
  /** Título da sessão (principal) ou descrição da tarefa (sub). */
  title?: string;
  sessionId: string;
  /** Conta de origem = AccountInfo.id (basename do config dir, ex.: ".claude", ".claude-conta2"). */
  account: string;
  status: AgentStatus;
  /** Motivo em PT-BR quando status === 'waiting'. Ex.: "aprovar uma permissão". */
  waitingFor?: string;
  /** Atividade atual (ou a mais recente). */
  activity?: Activity;
  /** Últimas atividades, da mais antiga para a mais recente (máx. ~30). */
  recent: Activity[];
  tasks: TaskItem[];
  /** Shells rodando que o agente espera: em segundo plano e o comando em primeiro plano ainda sem resultado. */
  shells?: ShellJob[];
  model?: string;
  gitBranch?: string;
  permissionMode?: string;
  startedAt: number;
  lastEventAt: number;
  /** Quando o status mudou pela última vez (epoch ms). */
  statusSince: number;
  stats: AgentStats;
  /** Semente 32-bit para a aparência determinística do personagem. */
  seed: number;
  /** Subagente rodando em segundo plano. */
  background?: boolean;
  
  permission?: PermissionRequestInfo;
  
  canMessage?: boolean;
}

export interface RoomInfo {
  /** Chave estável: cwd normalizado do projeto. */
  id: string;
  /** Nome exibido (basename do cwd, desambiguado se repetido). */
  name: string;
  /** Caminho completo do projeto. */
  path: string;
  /**
   * Ordem de chegada da sala, atribuída pelo servidor e estável enquanto a sala existir (um slot liberado só é
   * reutilizado após um período de espera). O cliente usa só como ordem: no prédio, cada sala ocupa a primeira vaga
   * livre e, quando uma vaga fica livre entre salas, a mais distante se muda para ela (client/src/world/sim/sim.ts,
   * compact). Vaga no cliente: coluna = floor(vaga / 2); par = lado norte do corredor, ímpar = lado sul.
   */
  slot: number;
  /** Semente para cores/decoração determinísticas. */
  seed: number;
  createdAt: number;
  /** Efeito visual temporário na sala (eventos do GitHub detectados nos transcripts; ver shared/github.ts). */
  effect?: RoomEffect;
}

/**
 * Efeito temporário numa sala de projeto, disparado por um evento do GitHub visto ao vivo:
 * - party: comemoração (PR aberto ou mergeado, release, CI verde depois de um alarme); dura ~12 s;
 * - alarm: CI vermelho; dura até um CI verde naquela sala ou expira em ~10 min.
 */
export interface RoomEffect {
  kind: 'party' | 'alarm';
  /** Faixa curta em PT-BR. Ex.: "PR #12 mergeado!", "CI falhou (feat/x)". */
  text: string;
  /** Início (epoch ms, relógio do servidor): um efeito novo tem outro `at`. */
  at: number;
  /** Fim previsto (epoch ms, relógio do servidor). */
  until: number;
  /** Agente responsável: quem abriu/mergeou (festa) ou quem viu o CI falhar (alarme, balão "!"). */
  agentId?: string;
}

/**
 * Verificação de versão nova: o servidor consulta a release mais recente do repositório no GitHub
 * (server/updates/checker.ts) e compara com a versão em uso.
 */
export interface UpdateStatus {
  
  state: 'off' | 'pending' | 'ok' | 'error';
  /** Repositório consultado, "dono/nome". */
  repo?: string;
  /** Última consulta que deu certo (epoch ms). */
  checkedAt?: number;
  /** Versão da release mais recente, sem o "v" (ausente: nenhuma release publicada). */
  latest?: string;
  /** Página da release mais recente no GitHub. */
  url?: string;
  /** Publicação da release mais recente (epoch ms). */
  publishedAt?: number;
  /** A release mais recente é mais nova que a versão em uso. */
  available: boolean;
  /** Motivo da falha (state "error"). */
  error?: string;
}

export interface SourceInfo {
  /** Rótulo da conta (basename do config dir). */
  label: string;
  /** Ferramenta da fonte; ausente = 'claude'. */
  provider?: Provider;
  path: string;
  /** Sessões abertas detectadas nesta fonte. */
  sessions: number;
  ok: boolean;
  error?: string;
}

/** Uma janela de limite de uso do plano (ex.: sessão de 5h, semana). */
export interface UsageWindow {
  /** Percentual usado, 0–100. */
  utilization: number;
  /** Quando a janela reinicia (epoch ms). */
  resetsAt?: number;
}

export interface AccountUsage {
  /** Sessão de 5 horas. */
  fiveHour?: UsageWindow;
  /** Limite semanal (todos os modelos). */
  sevenDay?: UsageWindow;
  sevenDayOpus?: UsageWindow;
  sevenDaySonnet?: UsageWindow;
  
  source: 'cache' | 'statusline' | 'codex';
  
  via?: 'mod' | 'tap';
  /**
   * Conta sem cota nem créditos para usar agora (Codex: `rate_limits.primary` nulo, ex.: créditos do workspace
   * esgotados). Não é "0% usado": as janelas ficam ausentes.
   */
  noQuota?: boolean;
  /** Quando os números foram obtidos na origem (epoch ms). */
  fetchedAt: number;
}

/** Uma conta do Claude (um config dir: ~/.claude, ~/.claude-conta2, ...) ou do Codex (um CODEX_HOME: ~/.codex). */
export interface AccountInfo {
  /** = AgentInfo.account (basename do config dir, ex.: ".claude"); único entre as contas de todas as ferramentas. */
  id: string;
  /** Ferramenta da conta; ausente = 'claude'. */
  provider?: Provider;
  /** Rótulo curtíssimo (1–3 caracteres), ex.: "C" e "D" — atalhos detectados no shell — ou derivado. */
  short: string;
  /** Nome amigável. Ex.: "Conta C". */
  name: string;
  email?: string;
  organization?: string;
  /** Plano, quando conhecido (ex.: "Max", "Pro"). */
  plan?: string;
  /** Cor de identificação da conta (hex). */
  color: string;
  configDir: string;
  /** Sessões abertas agora nesta conta. */
  sessions: number;
  usage?: AccountUsage;
  /**
   * - ok: números recentes;
   * - stale: números antigos (ex.: cache do /usage de horas atrás);
   * - disabled: sem números (tap de statusline não instalado e nenhum cache do /usage).
   */
  usageStatus: 'ok' | 'stale' | 'disabled';
}

export interface OfficeSnapshot {
  /** Incrementa a cada mudança. */
  rev: number;
  serverTime: number;
  rooms: RoomInfo[];
  agents: AgentInfo[];
  /** Contas do Claude detectadas (com uso de 5h/semanal quando disponível). */
  accounts: AccountInfo[];
  meta: {
    demo: boolean;
    sources: SourceInfo[];
    startedAt: number;
    version: string;
    /**
     * Identificador do build do cliente que o servidor está servindo (nome do bundle, ex.: "main-BFqheOCa").
     * Uma página aberta com outro build está desatualizada e deve se recarregar. Ausente no modo dev.
     */
    build?: string;
    
    terminal?: boolean;
    
    messages?: boolean;
    /** Verificação de versão nova no GitHub (ausente nos testes e no timelapse). */
    updates?: UpdateStatus;
  };
}

export interface FeedItem {
  id: string;
  agentId: string;
  roomId: string;
  agentName: string;
  roomName: string;
  /** Conta do agente (= AccountInfo.id). */
  account?: string;
  activity: Activity;
}

export type NoticeLevel = 'info' | 'success' | 'warn' | 'alert';

export interface Notice {
  id: string;
  level: NoticeLevel;
  text: string;
  agentId?: string;
  roomId?: string;
  at: number;
}

/**
 * Mensagens do servidor via SSE em GET /api/stream.
 * Cada mensagem chega como um evento SSE nomeado (`event: snapshot|feed|notice`) cujo `data` é o JSON de `data`.
 * Ao conectar, o servidor envia um `snapshot` completo e um `feed` com os itens recentes.
 */
export type ServerMessage =
  | { type: 'snapshot'; data: OfficeSnapshot }
  | { type: 'feed'; data: FeedItem[] }
  | { type: 'notice'; data: Notice };

/** Resposta de GET /api/agents/:id */
export interface AgentDetail {
  agent: AgentInfo;
  /** Histórico mais longo (máx. ~200), do mais antigo para o mais recente. */
  history: Activity[];
}

// ------------------------------------------------------------------ mod do Claude Code


export interface ModSummary {
  
  version: string;
  /** Agentes presentes e quantos estão trabalhando. */
  agents: number;
  working: number;
  /** Quem precisa de você, de quem espera há mais tempo para quem espera há menos. */
  waiting: ModWaitingAgent[];
}

export interface ModWaitingAgent {
  /** = AgentInfo.id. */
  id: string;
  name: string;
  /** Nome exibido da sala (projeto). */
  room: string;
  /** = AccountInfo.id. */
  account: string;
  /** Motivo em PT-BR (AgentInfo.waitingFor), ex.: "aprovar uma permissão". */
  waitingFor: string;
  /** Desde quando espera (epoch ms). */
  since?: number;
  /** Há pedido de permissão para responder pelo escritório (AgentInfo.permission). */
  answerable: boolean;
}

// ------------------------------------------------------------------ terminal

/**
 * Como exibir o `input` de uma chamada de ferramenta:
 * - command: comando de shell; diff: linhas "- antiga" / "+ nova" (Edit/Write); json: argumentos brutos; text: texto livre.
 */
export type TerminalInputKind = 'command' | 'diff' | 'json' | 'text';

/**
 * Uma entrada do terminal: a conversa da sessão reconstruída do transcript JSONL,
 * no formato em que o Claude Code a mostra. Todo texto já vem com segredos mascarados e truncado.
 * Entradas só são acrescentadas (nunca editadas): o resultado de uma ferramenta chega depois, numa
 * entrada 'result' que aponta para a 'tool' pelo `toolUseId`.
 */
export type TerminalEntry =
  /** Prompt do usuário ou comando de barra (ex.: "/model"). */
  | { kind: 'user'; id: string; at: number; text: string }
  /** Texto da resposta do agente (markdown). */
  | { kind: 'assistant'; id: string; at: number; text: string }
  /** Bloco de raciocínio; `text` ausente quando o transcript só guarda a assinatura. */
  | { kind: 'thinking'; id: string; at: number; text?: string }
  /**
   * Chamada de ferramenta. `id` = id do tool_use. `title` no estilo do Claude Code: "Bash(npm test)",
   * "Read(server/index.ts)". `input` = argumentos relevantes (comando, diff...), quando houver.
   */
  | { kind: 'tool'; id: string; at: number; tool: string; title: string; input?: string; inputKind?: TerminalInputKind }
  /** Resultado de uma ferramenta. `truncated` = o texto foi cortado (resultado longo demais). */
  | { kind: 'result'; id: string; at: number; toolUseId: string; text: string; error?: boolean; truncated?: boolean }
  /** Evento da sessão: compactação, interrupção, resultado em segundo plano, erro da API... */
  | { kind: 'system'; id: string; at: number; text: string; detail?: string; level?: 'info' | 'warn' | 'error' };

/** Evento `init` do stream do terminal: a conversa recente (substitui tudo o que o cliente tiver). */
export interface TerminalInit {
  agentId: string;
  /** Da mais antiga para a mais recente. */
  entries: TerminalEntry[];
  /** Há conversa anterior que não foi carregada (o transcript é maior do que a janela lida). */
  truncated: boolean;
}

/**
 * Stream do terminal (Server-Sent Events) em GET /api/agents/:id/terminal.
 * Ao conectar (e a cada reconexão, ou se o transcript for truncado/substituído) chega um `init`;
 * depois, `append` com as entradas novas. Erros antes do stream respondem JSON `{error}`:
 * 403 (recurso desligado ou acesso que não é local), 404 (agente/transcript desconhecido),
 * 429 (terminais abertos demais).
 */
export type TerminalMessage = { type: 'init'; data: TerminalInit } | { type: 'append'; data: TerminalEntry[] };

/**
 * Uma sessão recente (aberta ou já encerrada) no histórico do terminal, em
 * GET /api/sessions/recent. A conversa de uma sessão encerrada sai, com o mesmo protocolo do terminal
 * do agente (TerminalMessage), de GET /api/sessions/:conta/:sessionId/terminal.
 */
export interface RecentSession {
  /** = AccountInfo.id. */
  account: string;
  /** Ferramenta da sessão; ausente = 'claude'. */
  provider?: Provider;
  sessionId: string;
  /** Caminho do projeto (o `cwd` das primeiras linhas do transcript); ausente se não deu para descobrir. */
  project?: string;
  /** Nome da pasta do projeto em `projects/` (o cwd codificado), para quando `project` falta. */
  projectDir: string;
  /** Título como o do agente: /rename > nome do agente > título automático > último prompt (ou o primeiro). */
  title?: string;
  /** Primeira e última atividade com horário (epoch ms); `lastAt` cai no mtime do arquivo sem horário no fim. */
  firstAt?: number;
  lastAt: number;
  /** Tamanho do transcript em bytes. */
  size: number;
  /** A sessão ainda está aberta: `agentId` é o agente principal dela no escritório. */
  open: boolean;
  agentId?: string;
}

/** Resposta de GET /api/sessions/recent: da atividade mais recente para a mais antiga. */
export interface RecentSessionsResponse {
  sessions: RecentSession[];
  /** Janela da listagem (dias) e máximo de sessões. */
  days: number;
  limit: number;
}

// ------------------------------------------------------------------ responder pelo escritório

/** Regra "sempre permitir" sugerida pelo Claude Code para um pedido (permission_suggestions do hook). */
export interface PermissionSuggestionInfo {
  /** Posição na lista que o hook recebeu: é ela que volta na decisão (o hook aplica a sugestão original). */
  index: number;
  /** Regras no formato das permissões do Claude Code, ex.: "Bash(npm test:*)". */
  rules: string[];
  /** Onde a regra fica guardada: 'session', 'localSettings', 'projectSettings' ou 'userSettings'. */
  destination: string;
}


export interface PermissionRequestInfo {
  id: string;
  /** Ferramenta de quem pediu; ausente = 'claude'. */
  provider?: Provider;
  /** Nome bruto da ferramenta (ex.: "Bash", "Edit", "mcp__github__create_issue"). */
  tool: string;
  /** Título no estilo do Claude Code: "Bash(npm test)", "Edit(src/app.ts)". Mascarado e cortado. */
  title: string;
  /** Resumo em PT-BR (ex.: "Rodando os testes") e o ícone da atividade. */
  text: string;
  icon: string;
  /** Argumentos (comando, diff, JSON...), mascarados e truncados. */
  input?: string;
  inputKind?: TerminalInputKind;
  
  subagent?: string;
  /** Regras "sempre permitir" que podem ser aplicadas junto com a aprovação. */
  suggestions?: PermissionSuggestionInfo[];
  /**
   * Pedido do AskUserQuestion: as perguntas, para responder pelo escritório (decisão `answer`). Vai também no
   * snapshot (sem elas o cartão não tem o que mostrar).
   */
  questions?: AskQuestion[];
  /** Outros pedidos do mesmo agente esperando depois deste. */
  queued?: number;
  createdAt: number;
  /** Quando o hook desiste de esperar e o pedido passa a valer só no terminal. */
  expiresAt: number;
}

/**
 * Resposta a uma pergunta do AskUserQuestion, por POSIÇÃO (AskQuestion.index e o `index` das opções): o hook troca
 * as posições pelos textos originais que recebeu do Claude Code (a página só vê os textos mascarados e cortados).
 */
export interface PermissionAnswer {
  /** AskQuestion.index. */
  question: number;
  /** Posições das opções escolhidas (uma só sem multiSelect). */
  options?: number[];
  /** Texto livre ("Outro"). Sem multiSelect, vale no lugar de uma opção. */
  other?: string;
}

/** Corpo de POST /api/permissions/:id/decision (vindo da página). */
export interface PermissionDecision {
  /**
   * allow = aprovar; deny = recusar; terminal = devolver o pedido ao terminal (o hook sai sem decidir);
   * answer = responder as perguntas de um AskUserQuestion (`answers`).
   */
  behavior: 'allow' | 'deny' | 'terminal' | 'answer';
  /** Recusa: motivo repassado ao agente. */
  message?: string;
  /** Recusa: interrompe o agente (ele para e espera você). */
  interrupt?: boolean;
  /** Aprovação: aplica junto a sugestão desta posição (PermissionSuggestionInfo.index). */
  suggestion?: number;
  /** Resposta (`answer`): uma por pergunta do pedido. */
  answers?: PermissionAnswer[];
}

// ------------------------------------------------------------------ mensagens pelo escritório

/**
 * Situação de uma mensagem mandada pela página a um agente (GET /api/messages/:id):
 * queued = esperando a sessão buscar; sent = a sessão buscou e está entregando; delivered = entrou na sessão (ou
 * na fila dela, se o agente estava ocupado); failed = não entrou (`error` diz por quê).
 */
export type OutboxStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface OutboxMessage {
  id: string;
  /** AgentInfo.id do destinatário (sempre um principal). */
  agentId: string;
  status: OutboxStatus;
  error?: string;
  createdAt: number;
  /** Última mudança de status. */
  updatedAt: number;
}


export interface InboxMessage {
  id: string;
  /** O texto como foi digitado: o plugin o manda à sessão como se você o tivesse digitado. */
  text: string;
}
