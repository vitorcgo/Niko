import type { AgentId, AgentState } from "../types";

export const COLOR_AGENT: Record<AgentId, string> = {
  organizador: "#FF5A5A",
  tutor: "#1C1C1E",
  java: "#5b8def",
  operador: "#FFC20E",
};

export const STATES_SVG: AgentState[] = ["ocioso", "ouvindo", "pensando", "escrevendo", "sucesso", "alerta", "erro", "dormindo"];

export function pathCharacter(agent: AgentId, state: AgentState): string {
  return `/personagens/${agent}/${state}.svg`;
}
