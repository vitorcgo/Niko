import { appearanceFromSeed } from "./motor/client/src/art/character/appearance";
import { hash32 } from "./motor/shared/hash";

export type EstiloDoPersonagem = "niko" | "original";

export function aparenciaDoEscritorio(id: string, estilo: EstiloDoPersonagem, cor = "#5da995") {
  const aparencia = appearanceFromSeed(hash32(id));
  if (estilo === "original") return aparencia;
  return { ...aparencia, topStyle: "hoodie" as const, top: cor, topAccent: "#d8ede6", bottom: "#2c3546", shoes: "#e8e8df", accessory: "headphones" as const, accessoryColor: "#323e4c" };
}
