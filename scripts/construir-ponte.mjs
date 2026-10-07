import { build } from "vite";
import { prepararRuntime } from "./preparar-gnome-runtime.mjs";
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "src-tauri", "recursos");
mkdirSync(destino, { recursive: true });

if (process.platform === "linux") prepararRuntime(raiz);

await build({
  configFile: false,
  root: raiz,
  logLevel: "warn",
  publicDir: false,
  build: {
    ssr: join(raiz, "servidor", "producao.ts"),
    outDir: destino,
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rollupOptions: { output: { format: "es", entryFileNames: "ponte.mjs" } },
  },
  ssr: { noExternal: true },
});

const node = process.execPath;
const copia = join(destino, process.platform === "win32" ? "node.exe" : "node");
if (!existsSync(copia) || statSync(copia).size !== statSync(node).size) copyFileSync(node, copia);
console.log("ponte pronta em", destino);
