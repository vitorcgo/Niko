import type { Plugin, Connect } from "./viteTypes";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { listProviders, saveProvider, removeProvider, testProvider, chat, validateMessages, validateTools } from "./ai";
import { readUsage, usageOfficial } from "./usage";
import { readLastVersion } from "./updates";
import { readAll, write, backupManual, resetDatabase } from "./database";
import { requestMedia } from "./media";
import { requestWindows } from "./windows";
import { stateConnections, readConnection, saveKeyConnection, removeKeyConnection, serviceValid, keyValue, SERVICES as SERVICES_CONNECTION } from "./connections";
import { searchGmail, createDraftGmail, sendGmail } from "./gmail";
import { readAgendaGoogle } from "./googleCalendar";
import { readAudio, setVolume, setMute, adjustSession, readTheme, readStart, setTheme, openTool, actPower, readTray, openTray, directoryTray, stopTray, listApps, iconsApps, openApp, openCommandSystem } from "./quickControls";
import { ocrRequest } from "./ocr";
import { receiveEventHook, isRouteHook, listenEvents, decideRequest, stateInstallation, previewInstallation, installHooks, removeHooks, openProject, trazerTerminal, isRouteStatus, receiveStatusClaude } from "./claude";
import { isRouteAgent, receiveEventAgent, stateAgents, installAgent, removeAgent } from "./codingAgents";
import { listFiles, receiveFile, sendContent, deleteFile, deleteFilesSubject, downloadFile, openFileProgram } from "./files";
import { typeComputer, stateSystem, listNetworks, listBluetooth, readComputer, connectNetwork, forgetNetwork, disconnectNetwork, setBrightness, setRadio, openSettingsWindows } from "./system";

const LIMIT_BODY = 24 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (p: Buffer) => {
      size += p.length;
      if (size > LIMIT_BODY) {
        reject(new Error("corpo_grande"));
        req.destroy();
        return;
      }
      parts.push(p);
    });
    req.on("end", () => {
      try {
        resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {});
      } catch {
        reject(new Error("json_invalido"));
      }
    });
    req.on("error", reject);
  });
}

function respond(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

const HOSTS_LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostLocal(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  try {
    return HOSTS_LOCAL.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function originTrusted(req: IncomingMessage): boolean {
  if (req.headers["x-niko"] !== "1") return false;
  const token = process.env.NIKO_TOKEN;
  if (token && req.headers["x-niko-token"] !== token) return false;
  const originValue = req.headers.origin;
  if (!originValue) return true;
  try {
    const host = new URL(originValue).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "tauri.localhost";
  } catch {
    return false;
  }
}

export const routes: Connect.NextHandleFunction = async (req, res, next) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/ponte/")) return next();
  if (!hostLocal(req)) return respond(res, 403, { erro: "host_nao_permitido" });
  if (isRouteHook(url.pathname) && req.method === "POST") return receiveEventHook(req, res);
  if (isRouteStatus(url.pathname) && req.method === "POST") return receiveStatusClaude(req, res);
  if (isRouteAgent(url.pathname) && req.method === "POST") return receiveEventAgent(req, res, url);
  if (!originTrusted(req)) return respond(res, 403, { erro: "origem_nao_permitida" });
  const path = url.pathname.slice("/ponte".length);

  try {
    if (path === "/atualizacao" && req.method === "GET") return respond(res, 200, await readLastVersion());
    if (path === "/estado" && req.method === "GET") {
      return respond(res, 200, { disponivel: true, plataforma: process.platform, provedores: listProviders() });
    }
    if (path === "/provedores" && req.method === "POST") {
      const body = await readBody(req);
      const provider = await saveProvider(body as never);
      return respond(res, 200, provider);
    }
    const remove = /^\/provedores\/([a-z0-9-]+)$/.exec(path);
    if (remove && req.method === "DELETE") {
      await removeProvider(remove[1]);
      return respond(res, 200, { ok: true });
    }
    const test = /^\/provedores\/([a-z0-9-]+)\/testar$/.exec(path);
    if (test && req.method === "POST") {
      return respond(res, 200, await testProvider(test[1]));
    }
    if (path === "/claude/eventos" && req.method === "GET") return listenEvents(req, res);
    if (path === "/claude/decisao" && req.method === "POST") return respond(res, 200, decideRequest(await readBody(req)));
    if (path === "/claude/abrir" && req.method === "POST") return respond(res, 200, openProject(await readBody(req)));
    if (path === "/claude/terminal" && req.method === "POST") return respond(res, 200, await trazerTerminal(await readBody(req)));
    if (path === "/claude/instalacao" && req.method === "GET") return respond(res, 200, stateInstallation());
    if (path === "/claude/previa" && req.method === "GET") return respond(res, 200, previewInstallation(url.searchParams.get("acao") === "remover" ? "remover" : "instalar"));
    if (path === "/claude/instalar" && req.method === "POST") return respond(res, 200, installHooks(await readBody(req)));
    if (path === "/claude/remover" && req.method === "POST") return respond(res, 200, removeHooks(await readBody(req)));
    if (path === "/agentes" && req.method === "GET") return respond(res, 200, stateAgents());
    const agent = /^\/agentes\/([a-z]{2,20})\/(instalar|remover)$/.exec(path);
    if (agent && req.method === "POST") return respond(res, 200, agent[2] === "instalar" ? installAgent(agent[1], await readBody(req)) : removeAgent(agent[1], await readBody(req)));
    if (path === "/ocr" && req.method === "POST") return respond(res, 200, await ocrRequest(req));
    const file = /^\/arquivos\/([A-Za-z0-9-]{1,64})(?:\/([A-Za-z0-9-]{1,64})(?:\/(baixar|abrir))?)?$/.exec(path);
    if (file) {
      const database = String(req.headers["x-niko-banco"] ?? "");
      const [, subject, id, action] = file;
      if (!id && req.method === "GET") return respond(res, 200, { arquivos: listFiles(database, subject) });
      if (!id && req.method === "POST") return respond(res, 200, await receiveFile(req, database, subject, url.searchParams.get("nome") ?? ""));
      if (!id && req.method === "DELETE") return respond(res, 200, deleteFilesSubject(database, subject));
      if (id && !action && req.method === "GET") return sendContent(res, database, subject, id);
      if (id && !action && req.method === "DELETE") return respond(res, 200, deleteFile(database, subject, id));
      if (id && action === "baixar" && req.method === "POST") return respond(res, 200, await downloadFile(database, subject, id));
      if (id && action === "abrir" && req.method === "POST") return respond(res, 200, openFileProgram(database, subject, id));
    }
    if (path === "/janelas" && req.method === "GET") return respond(res, 200, await requestWindows("listar"));
    const actionWindow = /^\/janelas\/(focar|minimizar|fechar)$/.exec(path);
    if (actionWindow && req.method === "POST") {
      const body = await readBody(req);
      return respond(res, 200, await requestWindows(actionWindow[1] as "focar", String(body.janela ?? "")));
    }
    if (path === "/midia" && req.method === "GET") {
      return respond(res, 200, await requestMedia("estado"));
    }
    const actionMedia = /^\/midia\/(alternar|proxima|anterior|posicao)$/.exec(path);
    if (actionMedia && req.method === "POST") {
      const body = await readBody(req);
      return respond(res, 200, await requestMedia(actionMedia[1] as "alternar", Number(body.segundos)));
    }
    if (path === "/conexoes" && req.method === "GET") {
      return respond(res, 200, stateConnections());
    }
    if (path === "/gmail/buscar" && req.method === "GET") return respond(res, 200, await searchGmail(await keyValue("gmail"), url.searchParams.get("q") ?? ""));
    if (path === "/agenda/eventos" && req.method === "GET") return respond(res, 200, await readAgendaGoogle(await keyValue("agenda"), url.searchParams.get("de") ?? "", url.searchParams.get("ate") ?? ""));
    if (path === "/gmail/rascunho" && req.method === "POST") return respond(res, 200, await createDraftGmail(await keyValue("gmail"), await readBody(req)));
    if (path === "/gmail/enviar" && req.method === "POST") return respond(res, 200, await sendGmail(await keyValue("gmail"), await readBody(req)));
    const connection = /^\/conexoes\/([a-z]+)(\/chave)?$/.exec(path);
    if (connection && serviceValid(connection[1])) {
      const service = connection[1];
      if (!connection[2] && req.method === "GET") return respond(res, 200, await readConnection(service, url.searchParams.get("forcar") === "1"));
      if (connection[2] && req.method === "POST") return respond(res, 200, await saveKeyConnection(service, await readBody(req)));
      if (connection[2] && req.method === "DELETE") return respond(res, 200, await removeKeyConnection(service));
    }
    if (path === "/dados" && req.method === "GET") {
      return respond(res, 200, { dados: readAll(String(req.headers["x-niko-banco"] ?? "")) });
    }
    if (path === "/dados" && req.method === "POST") {
      const body = await readBody(req);
      const items = body.itens;
      if (!items || typeof items !== "object" || Array.isArray(items)) return respond(res, 400, { erro: "itens_invalidos" });
      write(items as Record<string, string | null>, String(req.headers["x-niko-banco"] ?? ""));
      return respond(res, 200, { ok: true });
    }
    if (path === "/dados/zerar" && req.method === "POST") {
      const body = await readBody(req);
      if (body.confirmacao !== "APAGAR") return respond(res, 400, { erro: "confirmacao_invalida" });
      const directory = resetDatabase(String(req.headers["x-niko-banco"] ?? ""));
      if (body.chaves === true) {
        for (const p of listProviders()) await removeProvider(p.id);
        for (const s of SERVICES_CONNECTION) await removeKeyConnection(s);
      }
      return respond(res, 200, { pasta: directory });
    }
    if (path === "/dados/backup" && req.method === "POST") {
      return respond(res, 200, { pasta: backupManual() });
    }
    if (path === "/consumo" && req.method === "GET") {
      if (url.searchParams.get("oficial") === "1") return respond(res, 200, usageOfficial());
      return respond(res, 200, await readUsage(url.searchParams.get("forcar") === "1"));
    }
    if (path === "/ia" && req.method === "POST") {
      const body = await readBody(req);
      const messages = validateMessages(body.mensagens);
      const tools = validateTools(body.ferramentas);
      const control = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) control.abort();
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      for await (const eventValue of chat(String(body.provedorId ?? ""), String(body.sistema ?? "").slice(0, 20000), messages, typeof body.modelo === "string" ? body.modelo : undefined, control.signal, tools)) {
        res.write(`${JSON.stringify(eventValue)}\n`);
      }
      return res.end();
    }
    if (path.startsWith("/sistema/")) {
      const action = path.slice("/sistema/".length);
      const readResult: Record<string, () => Promise<unknown>> = { tipo: typeComputer, estado: stateSystem, redes: listNetworks, bluetooth: listBluetooth, computador: readComputer };
      const writeValue: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
        conectar: connectNetwork,
        esquecer: forgetNetwork,
        desconectar: () => disconnectNetwork(),
        brilho: setBrightness,
        radio: setRadio,
        configuracoes: openSettingsWindows,
      };
      if (req.method === "GET" && readResult[action]) return respond(res, 200, await readResult[action]());
      if (req.method === "POST" && writeValue[action]) return respond(res, 200, await writeValue[action](await readBody(req)));
    }
    if (path.startsWith("/controle/")) {
      const action = path.slice("/controle/".length);
      const readResult: Record<string, () => Promise<unknown>> = { audio: readAudio, tema: readTheme, bandeja: readTray, iniciar: readStart };
      const writeValue: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
        volume: setVolume,
        mudo: setMute,
        sessao: adjustSession,
        tema: setTheme,
        ferramenta: openTool,
        energia: actPower,
        bandeja: openTray,
        bandejaPasta: directoryTray,
        bandejaEncerrar: stopTray,
        apps: listApps,
        iconesApps: iconsApps,
        abrirApp: openApp,
        comandoDoSistema: openCommandSystem,
      };
      if (req.method === "GET" && readResult[action]) return respond(res, 200, await readResult[action]());
      if (req.method === "POST" && writeValue[action]) return respond(res, 200, await writeValue[action](await readBody(req)));
    }
    return respond(res, 404, { erro: "rota_desconhecida" });
  } catch (e) {
    if (!res.headersSent) return respond(res, 400, { erro: (e as Error).message });
    res.end();
  }
};

export function localBridge(): Plugin {
  return {
    name: "niko-ponte-local",
    configureServer(server) {
      process.env.NIKO_TOKEN ||= randomBytes(32).toString("hex");
      server.middlewares.use(routes);
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html, context) => (context.server && process.env.NIKO_TOKEN ? html.replace("<head>", `<head>\n    <meta name="niko-token" content="${process.env.NIKO_TOKEN}" />`) : html),
    },
    configurePreviewServer(server) {
      server.middlewares.use(routes);
    },
  };
}
