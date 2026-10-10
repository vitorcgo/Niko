import type { AgenteId, EstadoAgente } from "../tipos";

export const COR_AGENTE: Record<AgenteId, string> = {
  organizador: "#FF5A5A",
  tutor: "#1C1C1E",
  java: "#5b8def",
  operador: "#FFC20E",
};

export const COR_PADRAO_AGENTE: Record<AgenteId, string> = {
  organizador: "#FF0000",
  tutor: "#00E300",
  java: "#5B8DEF",
  operador: "#FFC20E",
};

export const ESTADOS_SVG: EstadoAgente[] = ["ocioso", "ouvindo", "pensando", "escrevendo", "sucesso", "alerta", "erro", "dormindo"];

export function caminhoPersonagem(agente: AgenteId, estado: EstadoAgente): string {
  return `/personagens/${agente}/${estado}.svg`;
}
