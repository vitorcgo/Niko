import { cabecalhoDoBanco, modoArmazenamento, salvarAgora } from "./armazenamento";

export function chaveConfirmacao(conversa: string, mensagem: string, indice: number | null): string {
  return `${conversa}:${mensagem}:${indice ?? "unico"}`;
}

export async function reservarConfirmacao(id: string, aceitar: boolean): Promise<{ reservada: boolean; situacao: "confirmado" | "cancelado" }> {
  if (modoArmazenamento() === "banco") {
    await salvarAgora();
    const r = await fetch("/ponte/confirmacoes/reservar", {
      method: "POST", headers: { "x-niko": "1", "content-type": "application/json", ...cabecalhoDoBanco() },
      body: JSON.stringify({ id, aceitar }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error("confirmacao_indisponivel");
    const resultado: unknown = await r.json();
    if (!resultado || typeof resultado !== "object" || !("reservada" in resultado) || typeof resultado.reservada !== "boolean" || !("situacao" in resultado) || (resultado.situacao !== "confirmado" && resultado.situacao !== "cancelado")) throw new Error("confirmacao_invalida");
    return { reservada: resultado.reservada, situacao: resultado.situacao };
  }
  const reservar = (): { reservada: boolean; situacao: "confirmado" | "cancelado" } => {
    const chave = `niko-confirmacao:${cabecalhoDoBanco()["x-niko-banco"] ?? ""}:${id}`;
    const salvo = localStorage.getItem(chave);
    if (salvo === "confirmado" || salvo === "cancelado") return { reservada: false, situacao: salvo };
    const situacao = aceitar ? "confirmado" as const : "cancelado" as const;
    localStorage.setItem(chave, situacao);
    return { reservada: true, situacao };
  };
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`niko-confirmacao:${id}`, reservar);
  return reservar();
}
