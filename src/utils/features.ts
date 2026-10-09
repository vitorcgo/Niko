import { useConfig, type TabIsland, type BlockStart, type SectionToday } from "../state/settings";
import type { CardConfirmation, Route } from "../types";
import { T } from "../i18n/ptBR";

export const FUNCTIONS = ["journal", "estudos", "financas", "metas", "calendario"] as const;
export type Feature = (typeof FUNCTIONS)[number];

interface PartsFunction {
  rota: Route;
  abasDaIlha: TabIsland[];
  secoesDoHoje: SectionToday[];
  blocosDoInicio: BlockStart[];
  ferramentasIa: string[];
  areasDoBanco: string[];
  comandos: string[];
  cartoes: CardConfirmation["tipo"][];
}

export const PARTS: Record<Feature, PartsFunction> = {
  journal: {
    rota: "journal",
    abasDaIlha: [],
    secoesDoHoje: ["tarefas", "habitos"],
    blocosDoInicio: ["hoje"],
    ferramentasIa: ["ler_tarefas", "criar_tarefa", "concluir_tarefa", "ler_habitos", "marcar_habito", "criar_habito", "adicionar_compras"],
    areasDoBanco: ["tarefas", "habitos", "registros_habitos", "journal", "listas_compras"],
    comandos: ["tarefa", "concluir", "habito", "compra"],
    cartoes: ["tarefa", "concluir", "habito", "novoHabito", "compra"],
  },
  estudos: {
    rota: "estudos",
    abasDaIlha: [],
    secoesDoHoje: [],
    blocosDoInicio: ["revisoes"],
    ferramentasIa: ["ler_estudos", "listar_arquivos", "ler_arquivo"],
    areasDoBanco: ["areas_estudo", "materias", "paginas", "cartoes", "datas_estudo", "links"],
    comandos: ["revisar", "link"],
    cartoes: [],
  },
  financas: {
    rota: "financas",
    abasDaIlha: [],
    secoesDoHoje: [],
    blocosDoInicio: ["financas"],
    ferramentasIa: ["ler_financas", "lancar_transacao"],
    areasDoBanco: ["contas", "transacoes", "categorias", "recorrentes", "metas_economia", "divisoes"],
    comandos: ["gasto", "receita", "dividir"],
    cartoes: ["gasto", "receita", "dividir"],
  },
  metas: {
    rota: "metas",
    abasDaIlha: [],
    secoesDoHoje: [],
    blocosDoInicio: [],
    ferramentasIa: ["ler_metas"],
    areasDoBanco: ["metas", "pilares", "visao"],
    comandos: [],
    cartoes: [],
  },
  calendario: {
    rota: "calendario",
    abasDaIlha: [],
    secoesDoHoje: ["agenda"],
    blocosDoInicio: [],
    ferramentasIa: ["ler_agenda", "criar_evento", "criar_lembrete", "concluir_evento"],
    areasDoBanco: ["eventos"],
    comandos: ["lembrete", "evento"],
    cartoes: ["lembrete", "evento", "eventoFeito"],
  },
};

export function functionsDisabled(): Feature[] {
  return useConfig.getState().funcoesDesligadas;
}

export function functionEnabled(feature: Feature, disabled: readonly Feature[] = functionsDisabled()): boolean {
  return !disabled.includes(feature);
}

function disabledThatContains<K extends keyof PartsFunction>(part: K, value: PartsFunction[K][number], disabled: readonly Feature[]): Feature | null {
  return disabled.find((f) => (PARTS[f][part] as readonly unknown[]).includes(value)) ?? null;
}

export function routeEnabled(route: Route, disabled: readonly Feature[] = functionsDisabled()): boolean {
  return !disabled.some((f) => PARTS[f].rota === route);
}

export const SECTIONS_TODAY: SectionToday[] = ["agenda", "tarefas", "habitos"];

export function sectionsTodayEnabled(disabled: readonly Feature[] = functionsDisabled()): SectionToday[] {
  return SECTIONS_TODAY.filter((s) => !disabledThatContains("secoesDoHoje", s, disabled));
}

export function tabEnabled(tab: TabIsland, disabled: readonly Feature[] = functionsDisabled()): boolean {
  if (tab === "hoje") return sectionsTodayEnabled(disabled).length > 0;
  return !disabledThatContains("abasDaIlha", tab, disabled);
}

export function blockEnabled(block: BlockStart, disabled: readonly Feature[] = functionsDisabled()): boolean {
  return !disabledThatContains("blocosDoInicio", block, disabled);
}

export function toolEnabled(nameValue: string, disabled: readonly Feature[] = functionsDisabled()): boolean {
  return !disabledThatContains("ferramentasIa", nameValue, disabled);
}

export function areaDatabaseEnabled(area: string, disabled: readonly Feature[] = functionsDisabled()): boolean {
  return !disabledThatContains("areasDoBanco", area, disabled);
}

export function functionCommand(command: string, disabled: readonly Feature[] = functionsDisabled()): Feature | null {
  return disabledThatContains("comandos", command, disabled);
}

export function commandAvailable(line: string, disabled: readonly Feature[] = functionsDisabled()): boolean {
  const nameValue = /^\/(\w+)/.exec(line.trim())?.[1]?.toLowerCase();
  return !nameValue || !functionCommand(nameValue, disabled);
}

const FUNCTION_ACHIEVEMENT: Record<string, Feature> = {
  sequencia_habito: "journal",
  revisor: "estudos",
  prova_vencida: "estudos",
  orcamento_em_dia: "financas",
  meta_economia: "financas",
  sem_pendencias: "financas",
  meta_vida: "metas",
};

export function achievementEnabled(code: string, disabled: readonly Feature[] = functionsDisabled()): boolean {
  const feature = FUNCTION_ACHIEVEMENT[code];
  return !feature || functionEnabled(feature, disabled);
}

export function functionCard(type: CardConfirmation["tipo"], disabled: readonly Feature[] = functionsDisabled()): Feature | null {
  return disabledThatContains("cartoes", type, disabled);
}

export function noticeFunctionDisabled(feature: Feature): string {
  return T.funcoes.desligadaResposta(T.funcoes.nomes[feature]);
}

export function ruleFunctionsToAi(): string | null {
  const disabled = functionsDisabled();
  if (disabled.length === 0) return null;
  return T.funcoes.regraIa(disabled.map((f) => T.funcoes.nomes[f]).join(", "));
}
