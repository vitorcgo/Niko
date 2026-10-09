import { build } from "vite";
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "src-tauri", "resources");
mkdirSync(destination, { recursive: true });

await build({
  configFile: false,
  root: root,
  logLevel: "warn",
  publicDir: false,
  build: {
    ssr: join(root, "server", "production.ts"),
    outDir: destination,
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rollupOptions: { output: { format: "es", entryFileNames: "bridge.mjs" } },
  },
  ssr: { noExternal: true },
});

const node = process.execPath;
const copy = join(destination, "node.exe");
if (!existsSync(copy) || statSync(copy).size !== statSync(node).size) copyFileSync(node, copy);
console.log("ponte pronta em", destination);