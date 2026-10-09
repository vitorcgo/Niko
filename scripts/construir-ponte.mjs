import { build } from "vite";
import { chmodSync, copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "src-tauri", "recursos");
const binarios = join(raiz, "src-tauri", "binaries");
mkdirSync(destino, { recursive: true });
mkdirSync(binarios, { recursive: true });

await build({
  configFile: false,
  root: raiz,
  logLevel: "warn",
  publicDir: false,
  define: {
    "process.env.NIKO_GOOGLE_CLIENTE_ID": JSON.stringify(process.env.NIKO_GOOGLE_CLIENTE_ID ?? ""),
    "process.env.NIKO_GOOGLE_SEGREDO": JSON.stringify(process.env.NIKO_GOOGLE_SEGREDO ?? ""),
  },
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
const arquitetura = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;
const alvo = process.platform === "win32" ? `${arquitetura}-pc-windows-msvc` : process.platform === "darwin" ? `${arquitetura}-apple-darwin` : `${arquitetura}-unknown-linux-gnu`;
const copia = join(binarios, `node-${alvo}${process.platform === "win32" ? ".exe" : ""}`);
if (!existsSync(copia) || statSync(copia).size !== statSync(node).size) copyFileSync(node, copia);
chmodSync(copia, 0o755);
console.log("ponte pronta em", destino);
