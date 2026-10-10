import type { EstadoDaFrente } from "../../../desktop/desktop";
import type { EstadoIlha } from "../../../estado/ilha";

export function areaDeTrabalhoNaFrente(frente: EstadoDaFrente, anterior: boolean): boolean {
  if (frente.telaCheia) return false;
  if (frente.frente === "sobreposta") return anterior;
  return frente.frente === "area_de_trabalho";
}

export function focoDaAreaPeloElemento(alvo: Element | null): boolean | undefined {
  if (alvo?.closest(".janela")) return false;
  if (alvo?.matches(".area-trabalho")) return true;
  return undefined;
}

export function mostrarLateraisDaIlha({ ativadas, estado, saudando, telaCheia, areaEmFoco }: {
  ativadas: boolean;
  estado: EstadoIlha;
  saudando: boolean;
  telaCheia: boolean;
  areaEmFoco: boolean;
}): boolean {
  return ativadas && !telaCheia && !saudando && estado !== "escondida" && (areaEmFoco || estado === "expandida");
}
