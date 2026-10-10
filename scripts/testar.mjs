import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const arquivosDeTeste = [
  "validacoes", "escritorio", "chat", "midia", "claude", "personalizacao-agentes",
  "ilha", "versao-release", "animacoes-ilha", "concorrencia", "configuracao-vite",
].map((nome) => `scripts/${nome}.test.mjs`);

export function validarArquivosDeTeste(raiz) {
  const ausentes = arquivosDeTeste.filter((arquivo) => !existsSync(join(raiz, arquivo)));
  if (ausentes.length) throw new Error(`Arquivos de teste ausentes: ${ausentes.join(", ")}`);
  return arquivosDeTeste;
}

const caminho = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === caminho) {
  try {
    const raiz = join(dirname(caminho), "..");
    const arquivos = validarArquivosDeTeste(raiz);
    const resultado = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...arquivos], { cwd: raiz, stdio: "inherit" });
    if (resultado.error) throw resultado.error;
    process.exitCode = resultado.status ?? 1;
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
