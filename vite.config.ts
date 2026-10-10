import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { ponteLocal } from "./servidor/ponte.ts";
import { readFileSync } from "node:fs";

const POLITICA_SEGURANCA: string = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")).app.security.csp;

function politicaDeSeguranca(): Plugin {
  return {
    name: "niko-politica-seguranca",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${POLITICA_SEGURANCA}" />\n    <meta name="referrer" content="no-referrer" />`),
  };
}

export default defineConfig({
  cacheDir: "node_modules/.vite-niko",
  plugins: [react(), politicaDeSeguranca(), ponteLocal()],
  server: { port: 5420, strictPort: false, host: "localhost" },
  preview: { port: 5421, host: "localhost" },
  build: { chunkSizeWarningLimit: 1500 },
});
