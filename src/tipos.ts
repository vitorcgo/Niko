export type AgenteId = "organizador" | "tutor" | "operador" | "java";

export type EstadoAgente =
  | "ocioso"
  | "ouvindo"
  | "pensando"
  | "escrevendo"
  | "sucesso"
  | "alerta"
  | "erro"
  | "dormindo";

export type Rota =
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

export type StatusTarefa = "a_fazer" | "em_andamento" | "concluida" | "reagendada" | "cancelada" | "em_aguardo";

export type Prioridade = "baixa" | "media" | "alta";

export interface ItemChecklist {
  id: string;
  texto: string;
  feito: boolean;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  status: StatusTarefa;
  data?: string;
  hora?: string;
  materiaId?: string;
  colunaId?: string;
  metaId?: string;
  prioridade: Prioridade;
  checklist: ItemChecklist[];
  estimativaPomodoros?: number;
  criadaEm: string;
  concluidaEm?: string;
  ordem: number;
}

export type TipoHabito = "sim_nao" | "quantidade";

export interface Habito {
  id: string;
  nome: string;
  tipo: TipoHabito;
  meta: number;
  unidade: string;
  arquivado: boolean;
  hora?: string;
}

export type Humor = "otimo" | "bom" | "neutro" | "dificil";

export interface DiaJournal {
  humor?: Humor;
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

export type TipoArea = "faculdade" | "idiomas" | "programacao" | "concurso" | "cursos";

export interface Area {
  id: string;
  nome: string;
  tipo: TipoArea;
  cor: string;
}

export interface ColunaKanban {
  id: string;
  nome: string;
  conclui: boolean;
}

export interface Materia {
  id: string;
  areaId: string;
  nome: string;
  colunas: ColunaKanban[];
  semestre?: string;
}

export interface Pagina {
  id: string;
  materiaId: string;
  paiId?: string;
  titulo: string;
  conteudo: string;
  atualizadaEm: string;
  estudadaEm?: string;
}

export type TipoDataImportante = "prova" | "entrega" | "apresentacao" | "inscricao" | "outro";

export interface DataImportante {
  id: string;
  materiaId: string;
  titulo: string;
  tipo: TipoDataImportante;
  data: string;
  concluida: boolean;
}

export interface CartaoRevisao {
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

export interface RevisaoConteudo {
  id: string;
  paginaId: string;
  data: string;
  feita: boolean;
}

export type EstadoLink = "para_ler" | "lido" | "referencia";

export interface LinkSalvo {
  id: string;
  url: string;
  titulo: string;
  nota: string;
  tags: string[];
  materiaId?: string;
  estado: EstadoLink;
  criadoEm: string;
}

export interface RegistroRevisao {
  data: string;
  quantidade: number;
}

export type EtapaPomodoro = "foco" | "pausa_curta" | "pausa_longa";

export interface SessaoPomodoro {
  id: string;
  etapa: EtapaPomodoro;
  inicio: string;
  minutos: number;
  materiaId?: string;
  tarefaId?: string;
  situacao: "concluida" | "interrompida";
}

export type TipoConta = "corrente" | "poupanca" | "carteira" | "cartao" | "investimento";

export type Moeda = "BRL" | "USD" | "EUR";

export interface Conta {
  id: string;
  nome: string;
  tipo: TipoConta;
  moeda?: Moeda;
  saldoInicial: number;
  cor: string;
  fechamentoDia?: number;
  vencimentoDia?: number;
  limite?: number;
  arquivada: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  cor: string;
  orcamento: number;
  tipo: "despesa" | "receita";
}

export type TipoTransacao = "despesa" | "receita" | "transferencia";

export interface Transacao {
  id: string;
  tipo: TipoTransacao;
  valor: number;
  descricao: string;
  categoriaId?: string;
  contaId: string;
  contaDestinoId?: string;
  valorDestino?: number;
  data: string;
  recorrenteId?: string;
  grupoParcelasId?: string;
  parcela?: { numero: number; total: number };
  divisaoId?: string;
  ajuste?: boolean;
  criadaEm: string;
}

export interface Recorrente {
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

export interface MetaEconomia {
  id: string;
  nome: string;
  alvo: number;
  guardado: number;
  prazo?: string;
}

export interface Pessoa {
  id: string;
  nome: string;
}

export interface ParteDivisao {
  pessoaId: string;
  valor: number;
}

export interface Divisao {
  id: string;
  descricao: string;
  total: number;
  pagadorId: string;
  partes: ParteDivisao[];
  data: string;
  categoriaId?: string;
  contaId?: string;
}

export interface Acerto {
  id: string;
  pessoaId: string;
  valor: number;
  data: string;
  contaId?: string;
}

export interface ItemCompra {
  id: string;
  nome: string;
  quantidade: number;
  precoEstimado: number;
  marcado: boolean;
}

export interface ListaCompras {
  id: string;
  nome: string;
  categoriaId?: string;
  itens: ItemCompra[];
}

export interface PrecoHistorico {
  preco: number;
  data: string;
}

export interface RegraCategoria {
  id: string;
  contem: string;
  categoriaId: string;
}

export type TipoMeta = "habito" | "estudo" | "financeira" | "tarefas" | "manual";

export interface Pilar {
  id: string;
  nome: string;
  nota: number;
}

export interface Meta {
  id: string;
  nome: string;
  pilarId: string;
  tipo: TipoMeta;
  alvo: number;
  atual: number;
  vinculoId?: string;
  periodo: "trimestre" | "ano";
  prazo?: string;
  historico: { data: string; valor: number }[];
}

export interface CartaoVisao {
  id: string;
  titulo: string;
  descricao: string;
  estado: "em_andamento" | "planejada" | "concluida";
  prazo?: string;
  imagem?: string;
}

export type Repeticao = "nenhuma" | "diaria" | "semanal" | "mensal";

export interface Evento {
  id: string;
  titulo: string;
  data: string;
  hora?: string;
  tipo: "evento" | "lembrete";
  repeticao: Repeticao;
  ultimoDisparo?: string;
  excecoes?: string[];
  feitos?: string[];
}

export interface CartaoConfirmacao {
  tipo: "gasto" | "receita" | "dividir" | "tarefa" | "lembrete" | "evento" | "concluir" | "eventoFeito" | "habito" | "novoHabito" | "compra" | "memoria" | "rascunho" | "email";
  dados: Record<string, string | number | string[]>;
  situacao: "pendente" | "confirmado" | "cancelado";
}

export interface Mensagem {
  id: string;
  autor: "usuario" | "agente";
  agenteId: AgenteId;
  texto: string;
  criadaEm: string;
  confirmacao?: CartaoConfirmacao;
  incompleta?: boolean;
  repetir?: string;
  analiseAnexo?: boolean;
  confirmacoes?: CartaoConfirmacao[];
  origem?: string;
  acoes?: string[];
  detalhe?: string;
  erro?: boolean;
  anexos?: AnexoMensagem[];
}

export interface AnexoMensagem {
  nome: string;
  tipo: string;
  tamanho: number;
  texto?: string;
  imagem?: string;
}

export interface Conversa {
  id: string;
  titulo: string;
  agenteId: AgenteId;
  criadaEm: string;
  atualizadaEm: string;
  mensagens: Mensagem[];
}

export interface Memoria {
  id: string;
  texto: string;
  agenteId: AgenteId;
  origem: "comando" | "manual";
  data: string;
}

export type ServicoId = "stripe" | "github" | "vercel" | "resend" | "notion" | "calcom" | "n8n" | "google" | "supabase" | "cloudflare";

export type StatusConexao = "conectado" | "sem_chave" | "erro" | "pausado" | "sem_internet";

export interface EventoConexao {
  id: string;
  servico: ServicoId;
  texto: string;
  tipo: "sucesso" | "falha" | "info";
  data: string;
}

export interface Conexao {
  id: ServicoId;
  ligada: boolean;
  chaveSalva: boolean;
  intervalo: number;
  status: StatusConexao;
  ultimaAtualizacao?: string;
  resumo: string;
  fixadaNaIlha: boolean;
  falhasVistasEm?: string;
}

export interface UsoIa {
  id: string;
  data: string;
  provedor: string;
  modelo: string;
  agenteId: AgenteId;
  entrada: number;
  saida: number;
}

export interface Alerta {
  id: string;
  agenteId: AgenteId;
  texto: string;
  rota?: Rota;
  servico?: ServicoId;
  criadoEm: string;
  visto?: boolean;
}

export interface Atividade {
  id: string;
  agenteId: AgenteId;
  texto: string;
  data: string;
}

export interface ConquistaAlcancada {
  codigo: string;
  nivel: number;
  data: string;
}
