import { plataforma } from "./plataforma/index.ts";
import type { AcaoDeJanela } from "./plataforma/tipos.ts";

export function pedirJanelas(acao: AcaoDeJanela, janela?: string): Promise<unknown> {
  if (janela !== undefined && !/^\d{1,20}$/.test(janela)) return Promise.reject(new Error("janela_invalida"));
  if (acao === "listar") return plataforma.janelas.listar();
  if (janela === undefined) return Promise.reject(new Error("janela_invalida"));
  return plataforma.janelas.agir(acao, janela);
}

export const encerrarJanelas = () => plataforma.janelas.encerrar();
