import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { AgenteId, CartaoConfirmacao, Rota } from "../tipos";
import type { CategoriaSom } from "../ponte/sons";
import { FUNDO_DESTAQUE, hexValido, misturar } from "../utilitarios/cores";
import type { Buscador } from "../utilitarios/buscaApps";
import { ATALHOS_PADRAO, atalhosComPadrao, type AcaoGlobal } from "../utilitarios/atalhos";
import { ASSISTIVE_PADRAO, validarAssistive, type ConfigAssistive } from "../janelas/assistive/regras";
import { configuracoesValidas } from "../utilitarios/configuracoesValidas";
import { objeto } from "../utilitarios/validacoes";
import { aparenciaPadrao, type AparenciaAgente } from "../personagens/personalizacao";
import { SEM_ACESSORIOS, type AcessoriosAgente } from "../personagens/acessorios";

const DESTAQUE_ESCURO_PADRAO = "#a78bfa";

export type Tema = "claro" | "escuro" | "sistema";
export type Paleta = "padrao" | "areia" | "grafite" | "floresta" | "oceano";
export type ModoBorda = "fixo" | "esconder" | "inteligente";
export type AbaIlha = "hoje" | "midia" | "foco" | "chat" | "conexoes" | "avisos" | "claude" | "time";
export type VisaoIlha = AbaIlha | "captura";
export type SecaoHoje = "agenda" | "tarefas" | "habitos";

export const ABAS_ILHA: AbaIlha[] = ["hoje", "time", "claude", "conexoes", "chat", "midia", "foco", "avisos"];
const ABAS_JUNTADAS_NO_HOJE = ["hoje", "calendario", "habitos"];

export function juntarAbasNoHoje(ordem: string[], blocos: Record<string, boolean>) {
  const posicoes = ABAS_JUNTADAS_NO_HOJE.map((a) => ordem.indexOf(a)).filter((i) => i >= 0);
  const restante = ordem.filter((a) => !ABAS_JUNTADAS_NO_HOJE.includes(a) && a !== "captura");
  const posicao = posicoes.length ? ordem.slice(0, Math.min(...posicoes)).filter((a) => !ABAS_JUNTADAS_NO_HOJE.includes(a) && a !== "captura").length : 0;
  const conexoes = restante.indexOf("conexoes");
  restante.splice(conexoes >= 0 ? Math.min(posicao, conexoes) : posicao, 0, "hoje");
  const { calendario, habitos, captura: _captura, ...outros } = blocos;
  const hoje = [outros.hoje, calendario, habitos].some((v) => v !== false);
  return { ordemAbas: restante as AbaIlha[], blocos: { ...outros, hoje } as Record<AbaIlha, boolean> };
}
export type RepousoIlha = "nada" | "relogio" | "midia" | "agente";
export type BlocoInicio =
  | "time" | "hoje" | "foco" | "financas" | "conexoes" | "revisoes" | "consumo" | "mapa" | "conquistas";

export interface ItemBarra {
  rota: Rota;
  nome?: string;
  visivel: boolean;
}

export const BARRA_PADRAO: ItemBarra[] = [
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

export const GRUPO_DA_ROTA: Record<Rota, "principal" | "organizacao" | "ferramentas"> = {
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
  agentes: "principal",
};

export const BLOCOS_INICIO_PADRAO: { id: BlocoInicio; visivel: boolean }[] = [
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

export interface AtalhoDock {
  id: string;
  nome: string;
  url: string;
}

export const FUNDO_PADRAO_DAS_BORDAS = "#232428";

export interface ConfigIlha {
  ativa: boolean;
  modo: ModoBorda;
  blocos: Record<AbaIlha, boolean>;
  ordemAbas: AbaIlha[];
  repouso: RepousoIlha;
  tamanho: "pequena" | "media" | "grande";
  fundo: string;
  opacidade: number;
  fechamentoSeg: number;
  abrirHover: boolean;
  esconderSeg: number;
  notificacoes: "todas" | "importantes" | "nenhuma";
  laterais: boolean;
  iconesDaBarra: Record<IconeDaBarra, boolean>;
  monitor: string;
}

export type CategoriaDeAviso = "lembretes" | "habitos" | "estudos" | "financas" | "conexoes" | "codigo" | "conquistas" | "consumo";
export const CATEGORIAS_DE_AVISO: CategoriaDeAviso[] = ["lembretes", "habitos", "estudos", "financas", "conexoes", "codigo", "conquistas", "consumo"];

export type IconeDaBarra = "rede" | "volume" | "bateria";
export const ICONES_DA_BARRA: IconeDaBarra[] = ["rede", "volume", "bateria"];

export interface Configuracoes {
  nome: string;
  foto: string | null;
  viradaAs4h: boolean;
  iniciarComWindows: boolean;
  tema: Tema;
  paleta: Paleta;
  destaque: string | null;
  escala: number;
  reduzirAnimacoes: boolean;
  modoLeveEscritorio: boolean;
  barraLateral: ItemBarra[];
  barraRecolhida: boolean;
  gruposFechados: string[];
  blocosInicio: { id: BlocoInicio; visivel: boolean }[];
  ilha: ConfigIlha;
  assistive: ConfigAssistive;
  dock: { ativo: boolean; modo: ModoBorda; favoritos: Rota[]; atalhos: AtalhoDock[]; ampliar: boolean; fundo: string; opacidade: number; monitores: string; buscador: Buscador };
  atalhosGlobais: Record<AcaoGlobal, string>;
  pomodoro: { foco: number; curta: number; longa: number; ciclos: number; autoProxima: boolean; tique: boolean };
  agua: { meta: number; copo: number };
  sons: { ligado: boolean; volume: number; categorias: Record<CategoriaSom, boolean> };
  agentes: { nomes: Record<AgenteId, string>; cargos: Record<AgenteId, string>; aparencias: Record<AgenteId, AparenciaAgente>; acessorios: Record<AgenteId, AcessoriosAgente>; coresAcessorios: Record<AgenteId, string | null>; personas: Record<AgenteId, string>; inatividadeMin: number; favorito: AgenteId };
  consumo: { precoEntrada: number; precoSaida: number; limiteMensal: number; lerPlanos: boolean };
  ia: { provedorId: string | null; modelo: string; reservas: string[]; modelos: Record<string, string>; autoAprovar: CartaoConfirmacao["tipo"][] };
  privacidade: boolean;
  naoPerturbe: boolean;
  avisosDesligados: CategoriaDeAviso[];
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

export const CONFIG_PADRAO: Configuracoes = {
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
  barraLateral: BARRA_PADRAO,
  barraRecolhida: false,
  gruposFechados: [],
  blocosInicio: BLOCOS_INICIO_PADRAO,
  ilha: {
    ativa: true,
    modo: "inteligente",
    blocos: { hoje: true, midia: true, foco: true, chat: true, conexoes: true, avisos: true, claude: true, time: true },
    ordemAbas: ABAS_ILHA,
    repouso: "agente",
    tamanho: "media",
    fundo: FUNDO_PADRAO_DAS_BORDAS,
    opacidade: 1,
    fechamentoSeg: 15,
    abrirHover: false,
    esconderSeg: 4,
    notificacoes: "importantes",
    laterais: true,
    iconesDaBarra: { rede: true, volume: true, bateria: true },
    monitor: "",
  },
  dock: { ativo: true, modo: "inteligente", favoritos: ["chat", "journal", "estudos", "financas", "calendario"], atalhos: [], ampliar: true, fundo: FUNDO_PADRAO_DAS_BORDAS, opacidade: 1, monitores: "todos", buscador: "google" },
  assistive: ASSISTIVE_PADRAO,
  atalhosGlobais: ATALHOS_PADRAO,
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
    aparencias: { organizador: aparenciaPadrao("organizador"), tutor: aparenciaPadrao("tutor"), operador: aparenciaPadrao("operador"), java: aparenciaPadrao("java") },
    acessorios: { organizador: { ...SEM_ACESSORIOS }, tutor: { ...SEM_ACESSORIOS }, operador: { ...SEM_ACESSORIOS }, java: { ...SEM_ACESSORIOS } },
    coresAcessorios: { organizador: null, tutor: null, operador: null, java: null },
    personas: { organizador: "", tutor: "", operador: "", java: "" },
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

interface AcoesConfig {
  definir: (parcial: Partial<Configuracoes>) => void;
  definirIlha: (parcial: Partial<ConfigIlha>) => void;
  definirAssistive: (parcial: Partial<ConfigAssistive>) => void;
  restaurar: () => void;
}

export const useConfig = create<Configuracoes & AcoesConfig>()(
  persist(
    (set) => ({
      ...CONFIG_PADRAO,
      definir: (parcial) => set((s) => ({ ...configuracoesValidas({ ...s, ...parcial }, CONFIG_PADRAO), assistive: validarAssistive(parcial.assistive ?? s.assistive) })),
      definirIlha: (parcial) => set((s) => ({ ilha: configuracoesValidas({ ...s, ilha: { ...s.ilha, ...parcial } }, CONFIG_PADRAO).ilha })),
      definirAssistive: (parcial) => set((s) => ({ assistive: validarAssistive({ ...s.assistive, ...parcial }) })),
      restaurar: () => set({ ...CONFIG_PADRAO, primeiraExecucaoFeita: true }),
    }),
    {
      name: chave("configuracoes"),
      storage: armazenamento,
      version: 10,
      migrate: (salvo, versao) => {
        const s = (objeto(salvo) ? { ...salvo } : {}) as Partial<Configuracoes>;
        if (s.ilha) s.ilha = {
          ...configuracoesValidas({ ilha: s.ilha }, CONFIG_PADRAO).ilha,
          blocos: (objeto(s.ilha.blocos) ? Object.fromEntries(Object.entries(s.ilha.blocos).filter(([, v]) => typeof v === "boolean")) : {}) as ConfigIlha["blocos"],
          ordemAbas: Array.isArray(s.ilha.ordemAbas) ? s.ilha.ordemAbas.filter((a) => typeof a === "string") : [],
        };
        if (versao < 2) {
          if (s.ilha && s.ilha.esconderSeg === 60) s.ilha = { ...s.ilha, esconderSeg: 4 };
          if (s.dock && s.dock.modo === "fixo") s.dock = { ...s.dock, modo: "inteligente" };
        }
        if (versao < 3 && s.ilha?.ordemAbas) s.ilha = { ...s.ilha, ordemAbas: ["conexoes", ...s.ilha.ordemAbas.filter((a) => a !== "conexoes")] };
        if (versao < 4 && s.ilha) {
          const antigo = s.ilha as Configuracoes["ilha"] & { blocos: Record<string, boolean> };
          const ordem = (antigo.ordemAbas as string[] | undefined) ?? [];
          const semChat = ordem.filter((a) => a !== "revisao" && a !== "chat");
          const posicao = Math.min(semChat.indexOf("conexoes") + 1, semChat.length);
          semChat.splice(posicao < 0 ? 0 : posicao, 0, "chat");
          const { revisao: _revisao, ...blocos } = antigo.blocos ?? {};
          s.ilha = { ...antigo, ordemAbas: semChat as AbaIlha[], blocos: { ...blocos, chat: true } as Configuracoes["ilha"]["blocos"] };
        }
        if (versao < 5) {
          const corAntiga = (s.ilha as { cor?: string } | undefined)?.cor;
          const fundo = corAntiga === "destaque" ? FUNDO_DESTAQUE : FUNDO_PADRAO_DAS_BORDAS;
          if (s.ilha) {
            const { cor: _cor, ...ilha } = s.ilha as Configuracoes["ilha"] & { cor?: string };
            s.ilha = { ...ilha, modo: "inteligente", fundo, opacidade: 1 };
          }
          if (s.dock) s.dock = { ...s.dock, modo: "inteligente", fundo, opacidade: 1 };
        }
        if (versao < 6 && s.ilha) {
          const ordem = ((s.ilha.ordemAbas as string[] | undefined) ?? []).filter((a) => a !== "time" && a !== "calendario");
          const { time: _time, ...blocos } = (s.ilha.blocos ?? {}) as Record<string, boolean>;
          s.ilha = { ...s.ilha, ordemAbas: ["calendario", ...ordem] as AbaIlha[], blocos: { ...blocos, calendario: true } as unknown as Configuracoes["ilha"]["blocos"] };
        }
        if (versao < 7) {
          const destaque = s.destaque && hexValido(s.destaque) ? s.destaque : DESTAQUE_ESCURO_PADRAO;
          const congelar = (fundo: string | undefined) => (fundo === FUNDO_DESTAQUE ? misturar(destaque, "#000000", 0.82) : fundo);
          if (s.ilha) s.ilha = { ...s.ilha, fundo: congelar(s.ilha.fundo) ?? FUNDO_PADRAO_DAS_BORDAS };
          if (s.dock) s.dock = { ...s.dock, fundo: congelar(s.dock.fundo) ?? FUNDO_PADRAO_DAS_BORDAS };
          if (s.ilha) {
            const { sistema: _sistema, ...blocos } = (s.ilha.blocos ?? {}) as Record<string, boolean>;
            s.ilha = { ...s.ilha, ordemAbas: ((s.ilha.ordemAbas as string[] | undefined) ?? []).filter((a) => a !== "sistema") as AbaIlha[], blocos: blocos as Configuracoes["ilha"]["blocos"] };
          }
        }
        if (versao < 8 && s.ilha) s.ilha = { ...s.ilha, blocos: { ...(s.ilha.blocos ?? {}), claude: true } as Configuracoes["ilha"]["blocos"] };
        if (versao < 9 && s.ilha) {
          const { agenda: _agenda, ...blocos } = (s.ilha.blocos ?? {}) as Record<string, boolean>;
          s.ilha = { ...s.ilha, ordemAbas: ((s.ilha.ordemAbas as string[] | undefined) ?? []).filter((a) => a !== "agenda") as AbaIlha[], blocos: blocos as Configuracoes["ilha"]["blocos"] };
        }
        if (versao < 10 && s.ilha) s.ilha = { ...s.ilha, ...juntarAbasNoHoje((s.ilha.ordemAbas as string[] | undefined) ?? [], (s.ilha.blocos ?? {}) as Record<string, boolean>) };
        if (s.ia) s.ia = { ...s.ia, reservas: s.ia.reservas ?? [], modelos: s.ia.modelos ?? (s.ia.provedorId && s.ia.modelo ? { [s.ia.provedorId]: s.ia.modelo } : {}) };
        return s as Configuracoes & AcoesConfig;
      },
      merge: (persistido, atual) => {
        const salvo = configuracoesValidas(persistido, CONFIG_PADRAO);
        const barraSalva = Array.isArray(salvo.barraLateral) ? salvo.barraLateral.filter((i) => BARRA_PADRAO.some((p) => p.rota === i.rota)) : BARRA_PADRAO;
        const barraLateral = [...barraSalva];
        BARRA_PADRAO.forEach((item, i) => {
          if (barraLateral.some((x) => x.rota === item.rota)) return;
          const seguinte = BARRA_PADRAO.slice(i + 1).find((p) => barraLateral.some((x) => x.rota === p.rota));
          const posicao = seguinte ? barraLateral.findIndex((x) => x.rota === seguinte.rota) : barraLateral.length;
          barraLateral.splice(posicao, 0, item);
        });
        return {
          ...atual,
          ...salvo,
          barraLateral,
          ilha: {
            ...CONFIG_PADRAO.ilha,
            ...salvo.ilha,
            iconesDaBarra: { ...CONFIG_PADRAO.ilha.iconesDaBarra, ...salvo.ilha?.iconesDaBarra },
            blocos: Object.fromEntries(ABAS_ILHA.map((a) => [a, salvo.ilha?.blocos?.[a] ?? CONFIG_PADRAO.ilha.blocos[a]])) as Record<AbaIlha, boolean>,
            ordemAbas: [
              ...(salvo.ilha?.ordemAbas ?? []).filter((a) => ABAS_ILHA.includes(a)),
              ...ABAS_ILHA.filter((a) => !(salvo.ilha?.ordemAbas ?? []).includes(a)),
            ],
          },
          dock: { ...CONFIG_PADRAO.dock, ...salvo.dock },
          assistive: validarAssistive(salvo.assistive),
          atalhosGlobais: atalhosComPadrao(salvo.atalhosGlobais),
          pomodoro: { ...CONFIG_PADRAO.pomodoro, ...salvo.pomodoro },
          agua: { ...CONFIG_PADRAO.agua, ...salvo.agua },
          sons: { ...CONFIG_PADRAO.sons, ...salvo.sons },
          agentes: {
            ...CONFIG_PADRAO.agentes,
            ...salvo.agentes,
            cargos: Object.fromEntries((Object.keys(CONFIG_PADRAO.agentes.cargos) as AgenteId[]).map((a) => {
              const cargo = salvo.agentes?.cargos?.[a];
              return [a, typeof cargo === "string" && cargo.trim() ? cargo : CONFIG_PADRAO.agentes.cargos[a]];
            })) as Record<AgenteId, string>,
            nomes: Object.fromEntries(
              (Object.keys(CONFIG_PADRAO.agentes.nomes) as AgenteId[]).map((a) => {
                const nome = salvo.agentes?.nomes?.[a];
                const antigo = ["Organizador", "Tutor", "Operador"].includes(nome ?? "");
                return [a, nome && !antigo ? nome : CONFIG_PADRAO.agentes.nomes[a]];
              }),
            ) as Record<AgenteId, string>,
          },
          consumo: { ...CONFIG_PADRAO.consumo, ...salvo.consumo },
          ia: { ...CONFIG_PADRAO.ia, ...salvo.ia },
        };
      },
    },
  ),
);

export function nomeDoAgente(id: AgenteId): string {
  return useConfig.getState().agentes.nomes[id];
}

export function useCargos(): Record<AgenteId, string> {
  return useConfig((s) => s.agentes.cargos);
}
