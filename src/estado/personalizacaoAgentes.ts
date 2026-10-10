import type { AgenteId } from "../tipos";
import { CONFIG_PADRAO, useConfig } from "./configuracoes";
import { aparenciaValida, personaValida, textoDeIdentidade, type AparenciaAgente } from "../personagens/personalizacao";

export interface PersonalizacaoAgente {
  nome: string;
  cargo: string;
  aparencia: AparenciaAgente;
  persona: string;
}

export function personalizacaoSalva(agente: AgenteId): PersonalizacaoAgente {
  const { nomes, cargos, aparencias, personas } = useConfig.getState().agentes;
  return { nome: nomes[agente], cargo: cargos[agente], aparencia: aparencias[agente], persona: personas[agente] };
}

export function salvarPersonalizacao(agente: AgenteId, dados: PersonalizacaoAgente) {
  const { agentes, definir } = useConfig.getState();
  definir({ agentes: {
    ...agentes,
    nomes: { ...agentes.nomes, [agente]: textoDeIdentidade(dados.nome, CONFIG_PADRAO.agentes.nomes[agente], 20) },
    cargos: { ...agentes.cargos, [agente]: textoDeIdentidade(dados.cargo, CONFIG_PADRAO.agentes.cargos[agente], 32) },
    aparencias: { ...agentes.aparencias, [agente]: aparenciaValida(dados.aparencia, agente) },
    personas: { ...agentes.personas, [agente]: personaValida(dados.persona) },
  } });
}

export function restaurarPersonalizacao(agente: AgenteId) {
  const padrao = CONFIG_PADRAO.agentes;
  salvarPersonalizacao(agente, { nome: padrao.nomes[agente], cargo: padrao.cargos[agente], aparencia: padrao.aparencias[agente], persona: "" });
}
