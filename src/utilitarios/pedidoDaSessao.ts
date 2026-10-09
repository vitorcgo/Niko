import type { PedidoDePermissao } from "../estado/claudeCode";

export function pedidoDaSessao(pedidos: PedidoDePermissao[], sessao: string | undefined, somenteSessaoSelecionada = false) {
  return pedidos.find((p) => p.sessao === sessao) ?? (somenteSessaoSelecionada ? undefined : pedidos[0]);
}
