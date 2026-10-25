import type { ConversaWhatsapp } from "../ponte/whatsapp";

export type FiltroDaLista = "todas" | "naoLidas" | "grupos";

export function filtrarConversas(conversas: ConversaWhatsapp[], filtro: FiltroDaLista, busca: string): ConversaWhatsapp[] {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return conversas.filter((c) => (filtro === "naoLidas" ? c.naoLidas > 0 : filtro === "grupos" ? c.grupo : true) && (!termo || c.nome.toLocaleLowerCase("pt-BR").includes(termo)));
}
