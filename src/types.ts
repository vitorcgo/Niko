export type AgentId = "organizador" | "tutor" | "operador" | "java";

export type AgentState =
  | "ocioso"
  | "ouvindo"
  | "pensando"
  | "escrevendo"
  | "sucesso"
  | "alerta"
  | "erro"
  | "dormindo";

export type Route =
  | "inicio"
  | "chat"
  | "escritorio"
  | "conexoes"
  | "journal"
  | "estudos"
  | "financas"
  | "metas"
  | "calendario"
  | "atualizacao"
  | "ia"
  | "consumo"
  | "conquistas"
  | "configuracoes";

export type TaskStatus = "a_fazer" | "em_andamento" | "concluida" | "reagendada" | "cancelada" | "em_aguardo";

export type Priority = "baixa" | "media" | "alta";

export interface ChecklistItem {
  id: string;
  texto: string;
  feito: boolean;
}

export interface Task {
  id: string;
  titulo: string;
  descricao: string;
  status: TaskStatus;
  data?: string;
  hora?: string;
  materiaId?: string;
  colunaId?: string;
  metaId?: string;
  prioridade: Priority;
  checklist: ChecklistItem[];
  estimativaPomodoros?: number;
  criadaEm: string;
  concluidaEm?: string;
  ordem: number;
}

export type HabitType = "sim_nao" | "quantidade";

export interface Habit {
  id: string;
  nome: string;
  tipo: HabitType;
  meta: number;
  unidade: string;
  arquivado: boolean;
  hora?: string;
}

export type Mood = "otimo" | "bom" | "neutro" | "dificil";

export interface JournalDay {
  humor?: Mood;
  sono?: number;
  dormiu?: string;
  acordou?: string;
  agua?: number;
  diario: string;
  nota: string;
  manha: string;
  tarde: string;
  noite: string;
}

export type AreaType = "faculdade" | "idiomas" | "programacao" | "concurso" | "cursos";

export interface Area {
  id: string;
  nome: string;
  tipo: AreaType;
  cor: string;
}

export interface KanbanColumn {
  id: string;
  nome: string;
  conclui: boolean;
}

export interface Subject {
  id: string;
  areaId: string;
  nome: string;
  colunas: KanbanColumn[];
  semestre?: string;
}

export interface Page {
  id: string;
  materiaId: string;
  paiId?: string;
  titulo: string;
  conteudo: string;
  atualizadaEm: string;
  estudadaEm?: string;
}

export type ImportantDateType = "prova" | "entrega" | "apresentacao" | "inscricao" | "outro";

export interface ImportantDate {
  id: string;
  materiaId: string;
  titulo: string;
  tipo: ImportantDateType;
  data: string;
  concluida: boolean;
}

export interface ReviewCard {
  id: string;
  materiaId: string;
  frente: string;
  verso: string;
  vencimento: string;
  estabilidade: number;
  dificuldade: number;
  diasDecorridos: number;
  diasAgendados: number;
  repeticoes: number;
  lapsos: number;
  estado: number;
  ultimaRevisao?: string;
  aprendizado: number;
}

export interface ContentReview {
  id: string;
  paginaId: string;
  data: string;
  feita: boolean;
}

export type LinkState = "para_ler" | "lido" | "referencia";

export interface SavedLink {
  id: string;
  url: string;
  titulo: string;
  nota: string;
  tags: string[];
  materiaId?: string;
  estado: LinkState;
  criadoEm: string;
}

export interface ReviewRecord {
  data: string;
  quantidade: number;
}

export type PomodoroStage = "foco" | "pausa_curta" | "pausa_longa";

export interface PomodoroSession {
  id: string;
  etapa: PomodoroStage;
  inicio: string;
  minutos: number;
  materiaId?: string;
  tarefaId?: string;
  situacao: "concluida" | "interrompida";
}

export type TypeAccount = "corrente" | "poupanca" | "carteira" | "cartao" | "investimento";

export interface Account {
  id: string;
  nome: string;
  tipo: TypeAccount;
  saldoInicial: number;
  cor: string;
  fechamentoDia?: number;
  vencimentoDia?: number;
  limite?: number;
  arquivada: boolean;
}

export interface Category {
  id: string;
  nome: string;
  cor: string;
  orcamento: number;
  tipo: "despesa" | "receita";
}

export type TypeTransaction = "despesa" | "receita" | "transferencia";

export interface Transaction {
  id: string;
  tipo: TypeTransaction;
  valor: number;
  descricao: string;
  categoriaId?: string;
  contaId: string;
  contaDestinoId?: string;
  data: string;
  recorrenteId?: string;
  grupoParcelasId?: string;
  parcela?: { numero: number; total: number };
  divisaoId?: string;
  ajuste?: boolean;
  criadaEm: string;
}

export interface Recurring {
  id: string;
  descricao: string;
  valor: number;
  categoriaId?: string;
  contaId: string;
  dia: number;
  frequencia: "mensal" | "anual";
  mesAnual?: number;
  ativa: boolean;
  geradoAte?: string;
}

export interface GoalSavings {
  id: string;
  nome: string;
  alvo: number;
  guardado: number;
  prazo?: string;
}

export interface Person {
  id: string;
  nome: string;
}

export interface PartSplit {
  pessoaId: string;
  valor: number;
}

export interface Split {
  id: string;
  descricao: string;
  total: number;
  pagadorId: string;
  partes: PartSplit[];
  data: string;
  categoriaId?: string;
  contaId?: string;
}

export interface Settlement {
  id: string;
  pessoaId: string;
  valor: number;
  data: string;
  contaId?: string;
}

export interface ItemPurchase {
  id: string;
  nome: string;
  quantidade: number;
  precoEstimado: number;
  marcado: boolean;
}

export interface ListPurchases {
  id: string;
  nome: string;
  categoriaId?: string;
  itens: ItemPurchase[];
}

export interface PriceHistory {
  preco: number;
  data: string;
}

export interface RuleCategory {
  id: string;
  contem: string;
  categoriaId: string;
}

export type TypeGoal = "habito" | "estudo" | "financeira" | "tarefas" | "manual";

export interface Pillar {
  id: string;
  nome: string;
  nota: number;
}

export interface Goal {
  id: string;
  nome: string;
  pilarId: string;
  tipo: TypeGoal;
  alvo: number;
  atual: number;
  vinculoId?: string;
  periodo: "trimestre" | "ano";
  prazo?: string;
  historico: { data: string; valor: number }[];
}

export interface CardView {
  id: string;
  titulo: string;
  descricao: string;
  estado: "em_andamento" | "planejada" | "concluida";
  prazo?: string;
  imagem?: string;
}

export type Recurrence = "nenhuma" | "diaria" | "semanal" | "mensal";

export interface EventType {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  tipo: "evento" | "lembrete";
  repeticao: Recurrence;
  ultimoDisparo?: string;
  excecoes?: string[];
  feitos?: string[];
}

export interface CardConfirmation {
  tipo: "gasto" | "receita" | "dividir" | "tarefa" | "lembrete" | "evento" | "concluir" | "eventoFeito" | "habito" | "novoHabito" | "compra" | "memoria" | "rascunho" | "email";
  dados: Record<string, string | number | string[]>;
  situacao: "pendente" | "confirmado" | "cancelado";
}

export interface Message {
  id: string;
  autor: "usuario" | "agente";
  agenteId: AgentId;
  texto: string;
  criadaEm: string;
  confirmacao?: CardConfirmation;
  incompleta?: boolean;
  repetir?: string;
  analiseAnexo?: boolean;
  confirmacoes?: CardConfirmation[];
  origem?: string;
  acoes?: string[];
  detalhe?: string;
  erro?: boolean;
  anexos?: AttachmentMessage[];
}

export interface AttachmentMessage {
  nome: string;
  tipo: string;
  tamanho: number;
  texto?: string;
  imagem?: string;
}

export interface Conversation {
  id: string;
  titulo: string;
  agenteId: AgentId;
  criadaEm: string;
  atualizadaEm: string;
  mensagens: Message[];
}

export interface Memory {
  id: string;
  texto: string;
  agenteId: AgentId;
  origem: "comando" | "manual";
  data: string;
}

export type ServiceId = "stripe" | "github" | "vercel" | "resend" | "notion" | "calcom" | "n8n" | "gmail" | "agenda" | "supabase" | "cloudflare";

export type StatusConnection = "conectado" | "sem_chave" | "erro" | "pausado" | "sem_internet";

export interface EventConnection {
  id: string;
  servico: ServiceId;
  texto: string;
  tipo: "sucesso" | "falha" | "info";
  data: string;
}

export interface Connection {
  id: ServiceId;
  ligada: boolean;
  chaveSalva: boolean;
  intervalo: number;
  status: StatusConnection;
  ultimaAtualizacao?: string;
  resumo: string;
  fixadaNaIlha: boolean;
  falhasVistasEm?: string;
}

export interface UsageAi {
  id: string;
  data: string;
  provedor: string;
  modelo: string;
  agenteId: AgentId;
  entrada: number;
  saida: number;
}

export interface Alert {
  id: string;
  agenteId: AgentId;
  texto: string;
  rota?: Route;
  servico?: ServiceId;
  criadoEm: string;
  visto?: boolean;
}

export interface Activity {
  id: string;
  agenteId: AgentId;
  texto: string;
  data: string;
}

export interface AchievementReached {
  codigo: string;
  nivel: number;
  data: string;
}
