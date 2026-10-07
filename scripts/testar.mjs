import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pastas = ["scripts", "servidor", "linux/gnome"];
const arquivos = pastas.flatMap(pasta => readdirSync(pasta)
  .filter(nome => nome.endsWith(".test.mjs") && (process.platform === "linux" || !nome.includes("linux") && !nome.includes("isolamento")))
  .sort().map(nome => `${pasta}/${nome}`));
const resultado = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...arquivos], { stdio: "inherit" });
if (resultado.error) throw resultado.error;
process.exitCode = resultado.status ?? 1;
