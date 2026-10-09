import type { IncomingMessage, ServerResponse } from "node:http";

export namespace Connect {
  export type NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => unknown;
}

export interface Plugin {
  name: string;
  configureServer?: (server: { middlewares: { use: (fn: Connect.NextHandleFunction) => void } }) => void;
  configurePreviewServer?: (server: { middlewares: { use: (fn: Connect.NextHandleFunction) => void } }) => void;
  transformIndexHtml?: { order?: "pre" | "post"; handler: (html: string, context: { server?: unknown }) => string };
}