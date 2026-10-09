import { createServer } from "node:http";
import { routes } from "./bridge";
import { closeDatabase } from "./database";
import { stopMedia } from "./media";
import { stopWindows } from "./windows";
import { stopControl } from "./quickControls";
import { stopSystem } from "./system";

const port = Number(process.env.NIKO_PORTA) || 47831;
const ORIGINS = new Set(["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"]);

const server = createServer((req, res) => {
  const originValue = req.headers.origin;
  if (originValue && ORIGINS.has(originValue)) {
    res.setHeader("access-control-allow-origin", originValue);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "x-niko, x-niko-token, x-niko-banco, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("access-control-max-age", "600");
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  void routes(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});

process.on("uncaughtException", (e) => {
  process.stderr.write(`${new Date().toISOString()} erro: ${e.stack ?? e.message}\n`);
});
server.on("error", (e) => {
  process.stderr.write(`${new Date().toISOString()} falha ao abrir a porta ${port}: ${e.message}\n`);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => process.stderr.write(`${new Date().toISOString()} ponte ouvindo em 127.0.0.1:${port}\n`));

const stopValue = () => {
  stopMedia();
  stopWindows();
  stopControl();
  stopSystem();
  closeDatabase();
  server.close();
  process.exit(0);
};
process.on("SIGTERM", stopValue);
process.on("SIGINT", stopValue);
const parentValue = Number(process.env.NIKO_PAI);
if (parentValue > 0) {
  setInterval(() => {
    try {
      process.kill(parentValue, 0);
    } catch {
      stopValue();
    }
  }, 3000).unref();
}