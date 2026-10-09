import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { localBridge } from "./server/bridge";

const SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:47831",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function securityPolicy(): Plugin {
  return {
    name: "niko-politica-seguranca",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${SECURITY_POLICY}" />\n    <meta name="referrer" content="no-referrer" />`),
  };
}

export default defineConfig({
  plugins: [react(), securityPolicy(), localBridge()],
  server: { port: 5420, strictPort: false, host: "localhost" },
  preview: { port: 5421, host: "localhost" },
  build: { chunkSizeWarningLimit: 1500 },
});
