import { plataforma } from "./plataforma/index.ts";
import type { AcaoDeMidia } from "./plataforma/tipos.ts";

export const pedirMidia = (acao: AcaoDeMidia, segundos?: number) => plataforma.midia.pedir(acao, Math.max(0, Number(segundos) || 0));

export const encerrarMidia = () => plataforma.midia.encerrar();
