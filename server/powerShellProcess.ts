import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { ensureScript } from "./temporaryScripts";

interface Wait {
  resolver: (v: unknown) => void;
  rejeitar: (e: Error) => void;
  relogio: NodeJS.Timeout;
}

export function createProcessPowerShell(prefix: string, script: string, errorOnStop: string, args: string[] = []) {
  let childProcess: ChildProcessWithoutNullStreams | null = null;
  let counter = 0;
  const waiting = new Map<number, Wait>();

  const rejectAll = (reason: string) => {
    for (const [id, e] of waiting) {
      clearTimeout(e.relogio);
      e.rejeitar(new Error(reason));
      waiting.delete(id);
    }
  };

  const stopValue = () => {
    const current = childProcess;
    childProcess = null;
    current?.kill();
  };

  const start = () => {
    if (childProcess) return childProcess;
    if (process.platform !== "win32") throw new Error("somente_windows");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ensureScript(prefix, script), ...args], { windowsHide: true });
    createInterface({ input: p.stdout }).on("line", (line) => {
      try {
        const r = JSON.parse(line) as { id?: number; erro?: string };
        const pending = r.id ? waiting.get(r.id) : undefined;
        if (!pending) return;
        waiting.delete(r.id!);
        clearTimeout(pending.relogio);
        if (r.erro) pending.rejeitar(new Error(r.erro));
        else pending.resolver(r);
      } catch {
        return;
      }
    });
    p.stdin.on("error", () => undefined);
    p.on("error", () => {
      if (childProcess === p) childProcess = null;
      rejectAll(errorOnStop);
    });
    p.on("exit", () => {
      if (childProcess === p) childProcess = null;
      rejectAll(errorOnStop);
    });
    childProcess = p;
    return p;
  };

  const request = (requestValue: Record<string, unknown>, limitMs = 15000): Promise<unknown> => {
    const p = start();
    const id = ++counter;
    return new Promise((resolve, reject) => {
      const clock = setTimeout(() => {
        waiting.delete(id);
        reject(new Error("tempo_esgotado"));
        if (childProcess === p) stopValue();
      }, limitMs);
      waiting.set(id, { resolver: resolve, rejeitar: reject, relogio: clock });
      p.stdin.write(`${JSON.stringify({ ...requestValue, id })}\n`);
    });
  };

  return { request, stop: stopValue };
}
