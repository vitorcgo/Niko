import type { AgenteId } from "../tipos";
import { COR_AGENTE, COR_PADRAO_AGENTE } from "./cores";

export const FORMATOS_AGENTE = ["padrao", "organizador", "tutor", "java", "operador"] as const;
export type FormatoAgente = typeof FORMATOS_AGENTE[number];
export interface AparenciaAgente { formato: FormatoAgente; cor: string }
export const LIMITE_PERSONA = 2000;

export function aparenciaPadrao(agente: AgenteId): AparenciaAgente {
  return { formato: "operador", cor: COR_PADRAO_AGENTE[agente] };
}

export function aparenciaOriginal(agente: AgenteId): AparenciaAgente {
  return { formato: "padrao", cor: COR_AGENTE[agente] };
}

export function aparenciaValida(valor: unknown, agente: AgenteId): AparenciaAgente {
  const fonte = typeof valor === "object" && valor !== null ? valor as Record<string, unknown> : {};
  const anteriores: Record<string, AgenteId> = { redondo: "tutor", quadrado: "tutor", triangulo: "java", gota: "organizador" };
  const formato = typeof fonte.formato === "string" && Object.hasOwn(anteriores, fonte.formato) ? anteriores[fonte.formato] : fonte.formato;
  const padrao = aparenciaPadrao(agente);
  return {
    formato: FORMATOS_AGENTE.includes(formato as FormatoAgente) ? formato as FormatoAgente : padrao.formato,
    cor: typeof fonte.cor === "string" && /^#[\da-f]{6}$/i.test(fonte.cor) ? fonte.cor : padrao.cor,
  };
}

export function modeloDoAgente(agente: AgenteId, formato: FormatoAgente): AgenteId {
  return formato === "padrao" ? agente : formato;
}

export function textoDeIdentidade(valor: unknown, padrao: string, limite: number): string {
  if (typeof valor !== "string") return padrao;
  return valor.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, limite) || padrao;
}

export function personaValida(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const texto = valor.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, LIMITE_PERSONA);
  return (texto.match(/\p{L}/gu)?.length ?? 0) >= 3 ? texto : "";
}
