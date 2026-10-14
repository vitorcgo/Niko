import { spawn } from "node:child_process";
import type { Plataforma } from "../tipos.ts";

const PREFIXO = "Niko/";
const TEMPO_LIMITE_MS = 20000;

function secretTool(argumentos: string[], entrada = ""): Promise<{ codigo: number; saida: string }> {
  return new Promise((resolver, rejeitar) => {
    const processo = spawn("secret-tool", argumentos, { stdio: ["pipe", "pipe", "ignore"] });
    let saida = "";
    const relogio = setTimeout(() => {
      processo.kill();
      rejeitar(new Error("tempo_credencial"));
    }, TEMPO_LIMITE_MS);
    processo.stdout.on("data", (d) => (saida += d.toString()));
    processo.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(relogio);
      rejeitar(new Error(e.code === "ENOENT" ? "secret_tool_ausente" : "falha_credencial"));
    });
    processo.on("close", (codigo) => {
      clearTimeout(relogio);
      resolver({ codigo: codigo ?? 1, saida });
    });
    processo.stdin.on("error", () => undefined);
    processo.stdin.end(entrada);
  });
}

export const segredos: Plataforma["segredos"] = {
  async gravar(id, segredo) {
    const r = await secretTool(["store", `--label=${PREFIXO}${id}`, "app", "niko", "id", id], segredo);
    if (r.codigo !== 0) throw new Error("falha_ao_gravar");
  },
  async ler(id) {
    const r = await secretTool(["lookup", "app", "niko", "id", id]).catch(() => null);
    return r && r.codigo === 0 ? r.saida : null;
  },
  async apagar(id) {
    await secretTool(["clear", "app", "niko", "id", id]);
  },
};
