import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const checked = new Set<string>();

export function ensureScript(prefix: string, content: string): string {
  const signature = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const path = join(tmpdir(), `${prefix}-${signature}.ps1`);
  if (checked.has(path)) return path;
  let current: string | null = null;
  try {
    current = existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    current = null;
  }
  if (current !== content) {
    const temporary = `${path}.${process.pid}.gravando`;
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, path);
  }
  checked.add(path);
  return path;
}
