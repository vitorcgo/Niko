import type { ServicoId } from "../../tipos";

export function alturaDasConexoes(servico: ServicoId | null, ligada: boolean) {
  return servico === "github" && ligada ? 500 : 350;
}
