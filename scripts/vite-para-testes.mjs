import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export async function criarServidorDeTeste(opcoes) {
  const raizCache = fileURLToPath(new URL("../node_modules/.vite-testes", import.meta.url));
  const cacheDir = fileURLToPath(new URL(`../node_modules/.vite-testes/${randomUUID()}`, import.meta.url));
  if (dirname(cacheDir) !== raizCache) throw new Error("Cache de teste fora da pasta isolada");
  const servidor = await createServer({ ...opcoes, cacheDir, server: { ...opcoes.server, ws: false } });
  const fechar = servidor.close.bind(servidor);
  servidor.close = async () => {
    await fechar();
    await rm(cacheDir, { recursive: true, force: true });
  };
  return servidor;
}
