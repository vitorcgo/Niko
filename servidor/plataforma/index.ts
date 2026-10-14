import type { Plataforma } from "./tipos.ts";
import { linux } from "./linux/index.ts";
import { windows } from "./windows/index.ts";

export const plataforma: Plataforma = process.platform === "linux" ? linux : windows;
