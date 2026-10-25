import type { ServicoId } from "../../tipos";

export function alturaDasConexoes(servico: ServicoId | null, ligada: boolean) {
  if (!ligada) return 350;
  return servico === "github" ? 500 : servico === "gitlab" || servico === "gitea" ? 440 : 350;
}
