import type { AgenteId } from "../tipos";
import { CONFIG_PADRAO, useConfig } from "./configuracoes";
import { aparenciaValida, personaValida, textoDeIdentidade, type AparenciaAgente } from "../personagens/personalizacao";
import { acessoriosValidos, corAcessorioValida, type AcessoriosAgente } from "../personagens/acessorios";

export interface PersonalizacaoAgente {
  nome: string;
  cargo: string;
  aparencia: AparenciaAgente;
  persona: string;
  acessorios?: AcessoriosAgente;
  corAcessorio?: string | null;
}

export function personalizacaoSalva(agente: AgenteId): PersonalizacaoAgente {
  const { nomes, cargos, aparencias, personas, acessorios, coresAcessorios } = useConfig.getState().agentes;
  return { nome: nomes[agente], cargo: cargos[agente], aparencia: aparencias[agente], persona: personas[agente], acessorios: acessorios[agente], corAcessorio: coresAcessorios[agente] };
}

export function salvarPersonalizacao(agente: AgenteId, dados: PersonalizacaoAgente) {
  const { agentes, definir } = useConfig.getState();
  definir({ agentes: {
    ...agentes,
    nomes: { ...agentes.nomes, [agente]: textoDeIdentidade(dados.nome, CONFIG_PADRAO.agentes.nomes[agente], 20) },
    cargos: { ...agentes.cargos, [agente]: textoDeIdentidade(dados.cargo, CONFIG_PADRAO.agentes.cargos[agente], 32) },
    aparencias: { ...agentes.aparencias, [agente]: aparenciaValida(dados.aparencia, agente) },
    acessorios: { ...agentes.acessorios, [agente]: acessoriosValidos(dados.acessorios ?? agentes.acessorios[agente]) },
    coresAcessorios: { ...agentes.coresAcessorios, [agente]: corAcessorioValida(dados.corAcessorio === undefined ? agentes.coresAcessorios[agente] : dados.corAcessorio) },
    personas: { ...agentes.personas, [agente]: personaValida(dados.persona) },
  } });
}

export function restaurarPersonalizacao(agente: AgenteId) {
  const padrao = CONFIG_PADRAO.agentes;
  salvarPersonalizacao(agente, { nome: padrao.nomes[agente], cargo: padrao.cargos[agente], aparencia: padrao.aparencias[agente], persona: "", acessorios: padrao.acessorios[agente], corAcessorio: null });
}
