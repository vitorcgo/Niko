export function conexaoEmTestes(servico: string): boolean {
  return servico === "google";
}

export function exigirConexaoDisponivel(servico: string): void {
  if (conexaoEmTestes(servico)) throw new Error("conexao_em_testes");
}
