import { existsSync, mkdtempSync, readFileSync, lstatSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pasta: string | null = null;

export function garantirScript(prefixo: string, conteudo: string): string {
  if (!/^[a-z0-9-]{1,60}$/.test(prefixo)) throw new Error("script_invalido");
  pasta ??= mkdtempSync(join(tmpdir(), "niko-scripts-"));
  const assinatura = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
  const caminho = join(pasta, `${prefixo}-${assinatura}.ps1`);
  let atual: string | null = null;
  try {
    if (existsSync(caminho)) {
      const info = lstatSync(caminho);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("script_invalido");
      atual = readFileSync(caminho, "utf8");
    }
  } catch {
    throw new Error("script_invalido");
  }
  if (atual !== conteudo) {
    const temporario = `${caminho}.${randomBytes(12).toString("hex")}.gravando`;
    writeFileSync(temporario, conteudo, { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporario, caminho);
  }
  return caminho;
}
