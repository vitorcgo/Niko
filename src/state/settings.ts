import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { AgentId, CardConfirmation, Route } from "../types";
import type { CategorySound } from "../bridge/sounds";
import { BACKGROUND_ACCENT, hexValid, mix } from "../utils/colors";
import type { SearchEngine } from "../utils/appSearch";
import { SHORTCUTS_DEFAULT, shortcutsWithDefault, type ActionGlobal } from "../utils/shortcuts";
import { ASSISTIVE_DEFAULT, validateAssistive, type ConfigAssistive } from "../windows/assistive/rules";

const ACCENT_DARK_DEFAULT = "#a78bfa";

export type Theme = "claro" | "escuro" | "sistema";
export type ColorPalette = "padrao" | "areia" | "grafite" | "floresta" | "oceano";
export type ModeBorder = "fixo" | "esconder" | "inteligente";
export type TabIsland = "hoje" | "midia" | "foco" | "chat" | "conexoes" | "avisos" | "claude";
export type ViewIsland = TabIsland | "captura";
export type SectionToday = "agenda" | "tarefas" | "habitos";

export const TABS_ISLAND: TabIsland[] = ["hoje", "claude", "conexoes", "chat", "midia", "foco", "avisos"];
const TABS_JOINED_TODAY = ["hoje", "calendario", "habitos"];

export function joinTabsToday(order: string[], blocks: Record<string, boolean>) {
  const positions = TABS_JOINED_TODAY.map((a) => order.indexOf(a)).filter((i) => i >= 0);
  const remaining = order.filter((a) => !TABS_JOINED_TODAY.includes(a) && a !== "captura");
  const position = positions.length ? order.slice(0, Math.min(...positions)).filter((a) => !TABS_JOINED_TODAY.includes(a) && a !== "captura").length : 0;
  const connections = remaining.indexOf("conexoes");
  remaining.splice(connections >= 0 ? Math.min(position, connections) : position, 0, "hoje");
  const { calendario: calendar, habitos: habits, captura: capture, ...others } = blocks;
  const today = [others.hoje, calendar, habits].some((v) => v !== false);
  return { ordemAbas: remaining as TabIsland[], blocos: { ...others, hoje: today } as Record<TabIsland, boolean> };
}
export type RestIsland = "nada" | "relogio" | "midia" | "agente";
export type BlockStart =
  | "time" | "hoje" | "foco" | "financas" | "conexoes" | "revisoes" | "consumo" | "mapa" | "conquistas";

export interface SidebarItem {
  rota: Route;
  nome?: string;
  visivel: boolean;
}

export const BAR_DEFAULT: SidebarItem[] = [
  { rota: "inicio", visivel: true },
  { rota: "chat", visivel: true },
  { rota: "escritorio", visivel: true },
  { rota: "conexoes", visivel: true },
  { rota: "journal", visivel: true },
  { rota: "estudos", visivel: true },
  { rota: "financas", visivel: true },
  { rota: "metas", visivel: true },
  { rota: "calendario", visivel: true },
  { rota: "atualizacao", visivel: true },
  { rota: "ia", visivel: true },
  { rota: "consumo", visivel: true },
  { rota: "conquistas", visivel: true },
];

export const GROUP_ROUTE: Record<Route, "principal" | "organizacao" | "ferramentas"> = {
  inicio: "principal",
  chat: "principal",
  escritorio: "principal",
  conexoes: "principal",
  journal: "organizacao",
  estudos: "organizacao",
  financas: "organizacao",
  metas: "organizacao",
  calendario: "organizacao",
  atualizacao: "organizacao",
  ia: "ferramentas",
  consumo: "ferramentas",
  conquistas: "ferramentas",
  configuracoes: "ferramentas",
};

export const BLOCKS_START_DEFAULT: { id: BlockStart; visivel: boolean }[] = [
  { id: "time", visivel: true },
  { id: "hoje", visivel: true },
  { id: "foco", visivel: true },
  { id: "financas", visivel: true },
  { id: "revisoes", visivel: true },
  { id: "conexoes", visivel: true },
  { id: "consumo", visivel: true },
  { id: "mapa", visivel: true },
  { id: "conquistas", visivel: true },
];

export interface ShortcutDock {
  id: string;
  nome: string;
  url: string;
}

export const BACKGROUND_DEFAULT_BORDERS = "#232428";

export interface ConfigIsland {
  ativa: boolean;
  modo: ModeBorder;
  blocos: Record<TabIsland, boolean>;
  ordemAbas: TabIsland[];
  repouso: RestIsland;
  tamanho: "pequena" | "media" | "grande";
  fundo: string;
  opacidade: number;
  fechamentoSeg: number;
  abrirHover: boolean;
  esconderSeg: number;
  notificacoes: "todas" | "importantes" | "nenhuma";
  laterais: boolean;
  iconesDaBarra: Record<IconBar, boolean>;
  monitor: string;
}

export type CategoryNotice = "lembretes" | "habitos" | "estudos" | "financas" | "conexoes" | "codigo" | "conquistas" | "consumo";
export const CATEGORIES_NOTICE: CategoryNotice[] = ["lembretes", "habitos", "estudos", "financas", "conexoes", "codigo", "conquistas", "consumo"];

export type IconBar = "rede" | "volume" | "bateria";
export const ICONS_BAR: IconBar[] = ["rede", "volume", "bateria"];

export interface Settings {
  nome: string;
  foto: string | null;
  viradaAs4h: boolean;
  iniciarComWindows: boolean;
  tema: Theme;
  paleta: ColorPalette;
  destaque: string | null;
  escala: number;
  reduzirAnimacoes: boolean;
  modoLeveEscritorio: boolean;
  barraLateral: SidebarItem[];
  barraRecolhida: boolean;
  gruposFechados: string[];
  blocosInicio: { id: BlockStart; visivel: boolean }[];
  ilha: ConfigIsland;
  assistive: ConfigAssistive;
  dock: { ativo: boolean; modo: ModeBorder; favoritos: Route[]; atalhos: ShortcutDock[]; ampliar: boolean; fundo: string; opacidade: number; monitores: string; buscador: SearchEngine };
  atalhosGlobais: Record<ActionGlobal, string>;
  pomodoro: { foco: number; curta: number; longa: number; ciclos: number; autoProxima: boolean; tique: boolean };
  agua: { meta: number; copo: number };
  sons: { ligado: boolean; volume: number; categorias: Record<CategorySound, boolean> };
  agentes: { nomes: Record<AgentId, string>; cargos: Record<AgentId, string>; inatividadeMin: number; favorito: AgentId };
  consumo: { precoEntrada: number; precoSaida: number; limiteMensal: number; lerPlanos: boolean };
  ia: { provedorId: string | null; modelo: string; reservas: string[]; modelos: Record<string, string>; autoAprovar: CardConfirmation["tipo"][] };
  privacidade: boolean;
  naoPerturbe: boolean;
  avisosDesligados: CategoryNotice[];
  sugestaoAgendaGoogle: boolean;
  nuncaFinanceiro: boolean;
  pausarConexoes: boolean;
  conquistasAtivas: boolean;
  esconderTelaCheia: boolean;
  appsEsconder: string;
  receberStripe: boolean;
  primeiraExecucaoFeita: boolean;
  notificarClaude: boolean;
  claudeInstalado: boolean;
  funcoesDesligadas: ("journal" | "estudos" | "financas" | "metas" | "calendario")[];
  ultimaSaudacao: { dia: string; versao: string } | null;
}

export const CONFIG_DEFAULT: Settings = {
  nome: "",
  foto: null,
  viradaAs4h: false,
  iniciarComWindows: true,
  tema: "claro",
  paleta: "padrao",
  destaque: null,
  escala: 1,
  reduzirAnimacoes: false,
  modoLeveEscritorio: false,
  barraLateral: BAR_DEFAULT,
  barraRecolhida: false,
  gruposFechados: [],
  blocosInicio: BLOCKS_START_DEFAULT,
  ilha: {
    ativa: true,
    modo: "inteligente",
    blocos: { hoje: true, midia: true, foco: true, chat: true, conexoes: true, avisos: true, claude: true },
    ordemAbas: TABS_ISLAND,
    repouso: "agente",
    tamanho: "media",
    fundo: BACKGROUND_DEFAULT_BORDERS,
    opacidade: 1,
    fechamentoSeg: 15,
    abrirHover: false,
    esconderSeg: 4,
    notificacoes: "importantes",
    laterais: true,
    iconesDaBarra: { rede: true, volume: true, bateria: true },
    monitor: "",
  },
  dock: { ativo: true, modo: "inteligente", favoritos: ["chat", "journal", "estudos", "financas", "calendario"], atalhos: [], ampliar: true, fundo: BACKGROUND_DEFAULT_BORDERS, opacidade: 1, monitores: "todos", buscador: "google" },
  assistive: ASSISTIVE_DEFAULT,
  atalhosGlobais: SHORTCUTS_DEFAULT,
  pomodoro: { foco: 25, curta: 5, longa: 15, ciclos: 4, autoProxima: false, tique: false },
  agua: { meta: 2000, copo: 250 },
  sons: {
    ligado: true,
    volume: 0.15,
    categorias: { personagens: true, avisos: true, pomodoro: true, interface: true },
  },
  agentes: {
    nomes: { organizador: "Rubi", tutor: "Nanquim", operador: "Sol", java: "Java" },
    cargos: { organizador: "Gerente de projetos", tutor: "Professor", operador: "Analista de operações", java: "Engenheiro de software" },
    inatividadeMin: 10,
    favorito: "organizador",
  },
  consumo: { precoEntrada: 0, precoSaida: 0, limiteMensal: 20, lerPlanos: false },
  ia: { provedorId: null, modelo: "", reservas: [], modelos: {}, autoAprovar: [] },
  privacidade: false,
  naoPerturbe: false,
  avisosDesligados: [],
  sugestaoAgendaGoogle: true,
  nuncaFinanceiro: true,
  pausarConexoes: false,
  conquistasAtivas: true,
  esconderTelaCheia: true,
  appsEsconder: "",
  receberStripe: false,
  primeiraExecucaoFeita: false,
  notificarClaude: false,
  claudeInstalado: false,
  funcoesDesligadas: [],
  ultimaSaudacao: null,
};

interface ActionsConfig {
  set: (partial: Partial<Settings>) => void;
  setIsland: (partial: Partial<ConfigIsland>) => void;
  setAssistive: (partial: Partial<ConfigAssistive>) => void;
  restore: () => void;
}

export const useConfig = create<Settings & ActionsConfig>()(
  persist(
    (set) => ({
      ...CONFIG_DEFAULT,
      set: (partial) => set(partial),
      setIsland: (partial) => set((s) => ({ ilha: { ...s.ilha, ...partial } })),
      setAssistive: (partial) => set((s) => ({ assistive: validateAssistive({ ...s.assistive, ...partial }) })),
      restore: () => set({ ...CONFIG_DEFAULT, primeiraExecucaoFeita: true }),
    }),
    {
      name: key("configuracoes"),
      storage: storage,
      version: 10,
      migrate: (saved, version) => {
        const s = (saved ?? {}) as Partial<Settings>;
        if (version < 2) {
          if (s.ilha && s.ilha.esconderSeg === 60) s.ilha = { ...s.ilha, esconderSeg: 4 };
          if (s.dock && s.dock.modo === "fixo") s.dock = { ...s.dock, modo: "inteligente" };
        }
        if (version < 3 && s.ilha?.ordemAbas) s.ilha = { ...s.ilha, ordemAbas: ["conexoes", ...s.ilha.ordemAbas.filter((a) => a !== "conexoes")] };
        if (version < 4 && s.ilha) {
          const previous = s.ilha as Settings["ilha"] & { blocos: Record<string, boolean> };
          const order = (previous.ordemAbas as string[] | undefined) ?? [];
          const withoutChat = order.filter((a) => a !== "revisao" && a !== "chat");
          const position = Math.min(withoutChat.indexOf("conexoes") + 1, withoutChat.length);
          withoutChat.splice(position < 0 ? 0 : position, 0, "chat");
          const { revisao: review, ...blocks } = previous.blocos ?? {};
          s.ilha = { ...previous, ordemAbas: withoutChat as TabIsland[], blocos: { ...blocks, chat: true } as Settings["ilha"]["blocos"] };
        }
        if (version < 5) {
          const colorPrevious = (s.ilha as { cor?: string } | undefined)?.cor;
          const background = colorPrevious === "destaque" ? BACKGROUND_ACCENT : BACKGROUND_DEFAULT_BORDERS;
          if (s.ilha) {
            const { cor: color, ...island } = s.ilha as Settings["ilha"] & { cor?: string };
            s.ilha = { ...island, modo: "inteligente", fundo: background, opacidade: 1 };
          }
          if (s.dock) s.dock = { ...s.dock, modo: "inteligente", fundo: background, opacidade: 1 };
        }
        if (version < 6 && s.ilha) {
          const order = ((s.ilha.ordemAbas as string[] | undefined) ?? []).filter((a) => a !== "time" && a !== "calendario");
          const { time: _time, ...blocks } = (s.ilha.blocos ?? {}) as Record<string, boolean>;
          s.ilha = { ...s.ilha, ordemAbas: ["calendario", ...order] as TabIsland[], blocos: { ...blocks, calendario: true } as unknown as Settings["ilha"]["blocos"] };
        }
        if (version < 7) {
          const accent = s.destaque && hexValid(s.destaque) ? s.destaque : ACCENT_DARK_DEFAULT;
          const freeze = (background: string | undefined) => (background === BACKGROUND_ACCENT ? mix(accent, "#000000", 0.82) : background);
          if (s.ilha) s.ilha = { ...s.ilha, fundo: freeze(s.ilha.fundo) ?? BACKGROUND_DEFAULT_BORDERS };
          if (s.dock) s.dock = { ...s.dock, fundo: freeze(s.dock.fundo) ?? BACKGROUND_DEFAULT_BORDERS };
          if (s.ilha) {
            const { sistema: system, ...blocks } = (s.ilha.blocos ?? {}) as Record<string, boolean>;
            s.ilha = { ...s.ilha, ordemAbas: ((s.ilha.ordemAbas as string[] | undefined) ?? []).filter((a) => a !== "sistema") as TabIsland[], blocos: blocks as Settings["ilha"]["blocos"] };
          }
        }
        if (version < 8 && s.ilha) s.ilha = { ...s.ilha, blocos: { ...(s.ilha.blocos ?? {}), claude: true } as Settings["ilha"]["blocos"] };
        if (version < 9 && s.ilha) {
          const { agenda: _agenda, ...blocks } = (s.ilha.blocos ?? {}) as Record<string, boolean>;
          s.ilha = { ...s.ilha, ordemAbas: ((s.ilha.ordemAbas as string[] | undefined) ?? []).filter((a) => a !== "agenda") as TabIsland[], blocos: blocks as Settings["ilha"]["blocos"] };
        }
        if (version < 10 && s.ilha) s.ilha = { ...s.ilha, ...joinTabsToday((s.ilha.ordemAbas as string[] | undefined) ?? [], (s.ilha.blocos ?? {}) as Record<string, boolean>) };
        if (s.ia) s.ia = { ...s.ia, reservas: s.ia.reservas ?? [], modelos: s.ia.modelos ?? (s.ia.provedorId && s.ia.modelo ? { [s.ia.provedorId]: s.ia.modelo } : {}) };
        return s as Settings & ActionsConfig;
      },
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Settings>;
        const barSalva = Array.isArray(saved.barraLateral) ? saved.barraLateral.filter((i) => BAR_DEFAULT.some((p) => p.rota === i.rota)) : BAR_DEFAULT;
        const barSidebar = [...barSalva];
        BAR_DEFAULT.forEach((item, i) => {
          if (barSidebar.some((x) => x.rota === item.rota)) return;
          const next = BAR_DEFAULT.slice(i + 1).find((p) => barSidebar.some((x) => x.rota === p.rota));
          const position = next ? barSidebar.findIndex((x) => x.rota === next.rota) : barSidebar.length;
          barSidebar.splice(position, 0, item);
        });
        return {
          ...current,
          ...saved,
          barraLateral: barSidebar,
          ilha: {
            ...CONFIG_DEFAULT.ilha,
            ...saved.ilha,
            iconesDaBarra: { ...CONFIG_DEFAULT.ilha.iconesDaBarra, ...saved.ilha?.iconesDaBarra },
            blocos: Object.fromEntries(TABS_ISLAND.map((a) => [a, saved.ilha?.blocos?.[a] ?? CONFIG_DEFAULT.ilha.blocos[a]])) as Record<TabIsland, boolean>,
            ordemAbas: [
              ...(saved.ilha?.ordemAbas ?? []).filter((a) => TABS_ISLAND.includes(a)),
              ...TABS_ISLAND.filter((a) => !(saved.ilha?.ordemAbas ?? []).includes(a)),
            ],
          },
          dock: { ...CONFIG_DEFAULT.dock, ...saved.dock },
          assistive: validateAssistive(saved.assistive),
          atalhosGlobais: shortcutsWithDefault(saved.atalhosGlobais),
          pomodoro: { ...CONFIG_DEFAULT.pomodoro, ...saved.pomodoro },
          agua: { ...CONFIG_DEFAULT.agua, ...saved.agua },
          sons: { ...CONFIG_DEFAULT.sons, ...saved.sons },
          agentes: {
            ...CONFIG_DEFAULT.agentes,
            ...saved.agentes,
            cargos: Object.fromEntries((Object.keys(CONFIG_DEFAULT.agentes.cargos) as AgentId[]).map((a) => {
              const role = saved.agentes?.cargos?.[a];
              return [a, role && role.trim() ? role : CONFIG_DEFAULT.agentes.cargos[a]];
            })) as Record<AgentId, string>,
            nomes: Object.fromEntries(
              (Object.keys(CONFIG_DEFAULT.agentes.nomes) as AgentId[]).map((a) => {
                const nameValue = saved.agentes?.nomes?.[a];
                const previous = ["Organizador", "Tutor", "Operador"].includes(nameValue ?? "");
                return [a, nameValue && !previous ? nameValue : CONFIG_DEFAULT.agentes.nomes[a]];
              }),
            ) as Record<AgentId, string>,
          },
          consumo: { ...CONFIG_DEFAULT.consumo, ...saved.consumo },
          ia: { ...CONFIG_DEFAULT.ia, ...saved.ia },
        };
      },
    },
  ),
);

export function nameAgent(id: AgentId): string {
  return useConfig.getState().agentes.nomes[id];
}

export function useRoles(): Record<AgentId, string> {
  return useConfig((s) => s.agentes.cargos);
}
