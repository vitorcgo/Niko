import { build } from "vite";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  statSync,
  chmodSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "src-tauri", "recursos");

mkdirSync(destino, { recursive: true });

await build({
  configFile: false,
  root: raiz,
  logLevel: "warn",
  publicDir: false,
  define: {
    "process.env.NIKO_GOOGLE_CLIENTE_ID": JSON.stringify(
      process.env.NIKO_GOOGLE_CLIENTE_ID ?? ""
    ),
    "process.env.NIKO_GOOGLE_SEGREDO": JSON.stringify(
      process.env.NIKO_GOOGLE_SEGREDO ?? ""
    ),
  },
  build: {
    ssr: join(raiz, "servidor", "producao.ts"),
    outDir: destino,
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "ponte.mjs",
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});

if (process.platform === "win32") {
  const node = process.execPath;
  const copia = join(destino, "node.exe");

  if (!existsSync(copia) || statSync(copia).size !== statSync(node).size) {
    copyFileSync(node, copia);
  }
} else if (process.platform === "linux") {
  const node = process.env.NIKO_NODE_BIN;

  if (!node) {
    throw new Error(
      "NIKO_NODE_BIN não definido. Informe o caminho para o binário Node Linux."
    );
  }

  const copia = join(destino, "node");

  if (!existsSync(node)) {
    throw new Error(`Node Linux não encontrado: ${node}`);
  }

  if (!existsSync(copia) || statSync(copia).size !== statSync(node).size) {
    copyFileSync(node, copia);
  }

  chmodSync(copia, 0o755);
} else {
  throw new Error(
    `Plataforma não suportada para o Node embutido: ${process.platform}`
  );
}

console.log("ponte pronta em", destino);