import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, accessSync, constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const versao = JSON.parse(readFileSync("package.json", "utf8")).version;
const pacote = resolve(process.argv[2] ?? `src-tauri/target/release/bundle/deb/Niko_${versao}_amd64.deb`);
const executar = (comando, args) => execFileSync(comando, args, { encoding: "utf8" });
const hash = caminho => createHash("sha256").update(readFileSync(caminho)).digest("hex");
const pasta = mkdtempSync(join(tmpdir(), "niko-pacote-"));
try {
  assert.equal(executar("dpkg-deb", ["--field", pacote, "Package"]).trim(), "niko");
  assert.equal(executar("dpkg-deb", ["--field", pacote, "Version"]).trim(), versao);
  assert.equal(executar("dpkg-deb", ["--field", pacote, "Architecture"]).trim(), "amd64");
  const deps = executar("dpkg-deb", ["--field", pacote, "Depends"]).trim();
  for (const dependencia of ["gjs", "gir1.2-secret-1", "libwebkit2gtk-4.1-0", "libgtk-3-0", "wireplumber", "pipewire-bin", "tesseract-ocr", "tesseract-ocr-eng", "tesseract-ocr-por"]) {
    assert.ok(deps.split(",").some(d => d.trim().split(" ")[0] === dependencia), dependencia);
  }
  executar("dpkg-deb", ["--extract", pacote, pasta]);
  const app = join(pasta, "usr/bin/niko");
  accessSync(app, constants.X_OK);
  const binario = readFileSync("src-tauri/target/release/niko");
  const marcador = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const offset = binario.indexOf(marcador);
  assert.ok(offset >= 0 && binario.indexOf(marcador, offset + 1) === -1, "marcador Tauri único no build");
  // O bundler troca somente este marcador e restaura UNK no executável original.
  Buffer.from("__TAURI_BUNDLE_TYPE_VAR_DEB").copy(binario, offset);
  assert.equal(hash(app), createHash("sha256").update(binario).digest("hex"), "binário do build atual com marcador DEB");
  assert.ok(!executar("ldd", [app]).includes("not found"), "bibliotecas nativas disponíveis neste host");
  for (const nome of ["node", "ponte.mjs"]) {
    assert.equal(hash(join(pasta, "usr/lib/Niko/recursos", nome)), hash(join("src-tauri/recursos", nome)), `recurso integrado: ${nome}`);
  }
  const runtime = join(pasta, "usr/lib/Niko/recursos/node");
  for (const nome of ["metadata.json", "extension.js"]) {
    assert.equal(hash(join(pasta, "usr/share/niko/gnome/niko-ilha@local", nome)), hash(join("linux/gnome/niko-ilha@local", nome)), `extensão GNOME empacotada: ${nome}`);
  }
  const runtimeSource = "linux/gnome/runtime-build/niko-ilha-runtime@local";
  const runtimePayload = join(pasta, "usr/share/niko/gnome/niko-ilha-runtime@local");
  const manifest = JSON.parse(readFileSync(join(runtimeSource, "current.json"), "utf8"));
  assert.match(manifest.file, /^implementation-[a-f0-9]{64}\.js$/);
  assert.equal(manifest.file, `implementation-${hash("linux/gnome/niko-ilha@local/extension.js")}.js`, "runtime implementa fonte atual");
  assert.equal(hash(join(runtimeSource, manifest.file)), hash("linux/gnome/niko-ilha@local/extension.js"));
  assert.equal(hash(join(runtimeSource, "extension.js")), hash("linux/gnome/candidato-sem-reinicio/extension.js"), "loader atual");
  const metadata = JSON.parse(readFileSync(join(runtimeSource, "metadata.json"), "utf8"));
  assert.equal(metadata.uuid, "niko-ilha-runtime@local");
  assert.equal(metadata.version, 1);
  assert.deepEqual(metadata["shell-version"], ["46"]);
  for (const nome of ["extension.js", "metadata.json", "current.json", manifest.file]) {
    assert.equal(hash(join(runtimePayload, nome)), hash(join(runtimeSource, nome)), `runtime GNOME integrado: ${nome}`);
  }
  accessSync(runtime, constants.X_OK);
  assert.ok(Number(executar(runtime, ["--version"]).trim().match(/^v(\d+)\./)?.[1]) >= 22, "Node integrado >=22");
  assert.equal(executar(runtime, ["--version"]).trim(), executar(resolve("src-tauri/recursos/node"), ["--version"]).trim(), "versão Node do recurso integrado");
  assert.match(readFileSync(join(pasta, "usr/share/applications/Niko.desktop"), "utf8"), /^Exec=niko\b/m);
  console.log(`PASS: pacote ${versao}, dependências, binário/ponte/Node integrados, Node executável e bibliotecas presentes.`);
  console.log(`SHA256: ${hash(pacote)}`);
  console.log("Não instala nem inicia Niko; relocação Tauri e confirmação manual seguem pendentes.");
} finally {
  rmSync(pasta, { recursive: true, force: true });
}
