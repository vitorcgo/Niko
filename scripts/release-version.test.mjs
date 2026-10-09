import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readArguments, readVersions, validateVersions, validateTag, planVersion, synchronizeVersion, checkPublication, validateArtifacts, mountManifest } from "./release-version.mjs";

function project(t, versions = ["0.1.1", "0.1.1", "0.1.1", "0.1.1"]) {
  const root = mkdtempSync(join(tmpdir(), "niko-release-teste-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, "package.json"), `{\r\n  "name": "niko",\r\n  "version": "${versions[0]}",\r\n  "scripts": { "dev": "vite" }\r\n}\r\n`);
  writeFileSync(join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: versions[1], plugins: { updater: { pubkey: "chave-publica-preservada" } } }));
  writeFileSync(join(root, "src-tauri", "Cargo.toml"), `[package]\nname = "niko"\nversion = "${versions[2]}"\n\n[dependencies]\nserde = { version = "1" }\n`);
  writeFileSync(join(root, "src-tauri", "Cargo.lock"), `version = 4\n\n[[package]]\nname = "outra-biblioteca"\nversion = "9.0.0"\n\n[[package]]\nname = "niko"\nversion = "${versions[3]}"\ndependencies = ["serde"]\n`);
  writeFileSync(join(root, "README.md"), "![Versão](https://img.shields.io/badge/versão-0.1.1-0b0d10?style=flat-square)\n");
  return root;
}

test("Requires an explicit version and keeps release notes separate", () => {
  assert.throws(() => readArguments(["Melhorias em Estudos"]), /Informe a versão/);
  assert.throws(() => readArguments([]), /Informe a versão/);
  assert.deepEqual(readArguments(["0.1.2", "Melhorias", "em Estudos"]), { versao: "0.1.2", notas: "Melhorias em Estudos", verificar: false, recompilar: false, ajuda: false });
  assert.equal(readArguments(["--versao", "0.1.2", "Novidades"]).versao, "0.1.2");
  assert.equal(readArguments(["--versao=0.1.2", "Novidades"]).notas, "Novidades");
  assert.equal(readArguments(["--verificar"]).verificar, true);
  assert.equal(readArguments(["--ajuda"]).ajuda, true);
});

test("Rejects invalid versions, unknown arguments and duplicate version arguments", () => {
  for (const version of ["0.1", "01.1.2", "v0.1.2", "0.1.2-beta", "../0.1.2"]) {
    assert.throws(() => readArguments([version]), /versão|Versão/);
  }
  assert.throws(() => readArguments(["--versao"]), /versão|Versão/);
  assert.throws(() => readArguments(["0.1.2", "--desconhecido"]), /Argumento desconhecido/);
  assert.throws(() => readArguments(["0.1.2", "--versao", "0.1.3"]), /uma vez/);
});

test("Detects version mismatches across four files and validates the tag", (t) => {
  const root = project(t, ["0.1.1", "0.1.2", "0.1.1", "0.1.0"]);
  assert.throws(() => validateVersions(readVersions(root)), /Versões divergentes/);
  assert.throws(() => validateTag("0.1.2", "v0.1.1"), /Tag/);
  validateTag("0.1.2", "v0.1.2");
  validateTag("0.1.2", undefined);
});

test("Plans without writing and synchronizes while preserving content, dependencies and keys", (t) => {
  const root = project(t, ["0.1.1", "0.1.2", "0.1.1", "0.1.1"]);
  const before = readFileSync(join(root, "package.json"), "utf8");
  const plan = planVersion(root, "0.1.2");
  assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
  synchronizeVersion(plan);
  assert.equal(validateVersions(readVersions(root), "0.1.2"), "0.1.2");
  assert.equal(readFileSync(join(root, "package.json"), "utf8"), before.replace('"0.1.1"', '"0.1.2"'));
  assert.match(readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8"), /serde = \{ version = "1" \}/);
  assert.match(readFileSync(join(root, "src-tauri", "Cargo.lock"), "utf8"), /name = "outra-biblioteca"\nversion = "9.0.0"/);
  assert.match(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"), /chave-publica-preservada/);
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /versão-0.1.2-/);
});

test("Prevents version downgrades and compares numbers rather than text", (t) => {
  const root = project(t, ["0.1.9", "0.1.9", "0.1.9", "0.1.9"]);
  assert.throws(() => planVersion(root, "0.1.8"), /menor/);
  assert.equal(planVersion(root, "0.1.10").filter((item) => item.nome !== "README.md").length, 4);
});

test("Preserves substitution tokens in the original content", (t) => {
  const root = project(t);
  const path = join(root, "package.json");
  const before = readFileSync(path, "utf8").replace('"name": "niko"', () => '"name": "niko", "description": "$& $1 $`"');
  writeFileSync(path, before);
  synchronizeVersion(planVersion(root, "0.1.2"));
  assert.equal(readFileSync(path, "utf8"), before.replace('"0.1.1"', '"0.1.2"'));
});

test("Rolls back partial writes without deleting a preexisting temporary file", (t) => {
  const root = project(t);
  const plan = planVersion(root, "0.1.2");
  const temporary = `${plan[1].caminho}.niko-release-${process.pid}.tmp`;
  writeFileSync(temporary, "conteúdo preexistente");
  assert.throws(() => synchronizeVersion(plan), /Alterações de versão revertidas/);
  for (const file of plan) assert.equal(readFileSync(file.caminho, "utf8"), file.antes);
  assert.equal(readFileSync(temporary, "utf8"), "conteúdo preexistente");
});

test("Does not write when any input file is invalid", (t) => {
  const root = project(t);
  const before = readFileSync(join(root, "package.json"), "utf8");
  writeFileSync(join(root, "src-tauri", "Cargo.lock"), "version = 4\n");
  assert.throws(() => planVersion(root, "0.1.2"), /Cargo.lock/);
  assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
});

test("Rejects a plan if a file changed after it was read", (t) => {
  const root = project(t);
  const plan = planVersion(root, "0.1.2");
  const path = join(root, "src-tauri", "Cargo.toml");
  const edited = `${readFileSync(path, "utf8")}\n[features]\npadrao = []\n`;
  writeFileSync(path, edited);
  assert.throws(() => synchronizeVersion(plan), /mudou/);
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "0.1.1");
  assert.equal(readFileSync(path, "utf8"), edited);
});

test("Blocks published releases, accepts missing releases and rejects network failures", async () => {
  let url;
  await checkPublication("0.1.2", async (target) => { url = target; return { status: 404 }; });
  assert.equal(url, "https://api.github.com/repos/vitorcgo/niko/releases/tags/v0.1.2");
  await assert.rejects(checkPublication("0.1.2", async () => ({ status: 200 })), /já existe/);
  await assert.rejects(checkPublication("0.1.2", async () => ({ status: 403 })), /GitHub/);
  await assert.rejects(checkPublication("0.1.2", async () => { throw new Error("sem rede"); }), /GitHub/);
});

test("Requires installer and signature artifacts from the correct version and current build", (t) => {
  const root = project(t);
  const directory = join(root, "src-tauri", "target", "release", "bundle", "nsis");
  mkdirSync(directory, { recursive: true });
  assert.throws(() => validateArtifacts(root, "0.1.2", Date.now()), /não foi gerado/);
  const installer = join(directory, "Niko_0.1.2_x64-setup.exe");
  const signature = `${installer}.sig`;
  writeFileSync(installer, "instalador de teste");
  writeFileSync(signature, "assinatura de teste");
  assert.equal(validateArtifacts(root, "0.1.2", Date.now()).assinatura, "assinatura de teste");
  assert.throws(() => validateArtifacts(root, "0.1.1", Date.now()), /não foi gerado/);
  const previous = new Date(Date.now() - 60000);
  utimesSync(signature, previous, previous);
  assert.throws(() => validateArtifacts(root, "0.1.2", Date.now()), /build atual/);
  writeFileSync(signature, "   ");
  assert.throws(() => validateArtifacts(root, "0.1.2", Date.now()), /vazia/);
});

test("Accepts MSI artifacts and builds a manifest with one entry per installer", (t) => {
  const root = project(t);
  const directory = join(root, "src-tauri", "target", "release", "bundle", "msi");
  mkdirSync(directory, { recursive: true });
  assert.throws(() => validateArtifacts(root, "0.1.2", Date.now(), "msi"), /não foi gerado/);
  writeFileSync(join(directory, "Niko_0.1.2_x64_pt-BR.msi"), "msi de teste");
  writeFileSync(join(directory, "Niko_0.1.2_x64_pt-BR.msi.sig"), "assinatura msi");
  const msi = validateArtifacts(root, "0.1.2", Date.now(), "msi");
  const nsis = { instalador: "Niko_0.1.2_x64-setup.exe", assinatura: "assinatura nsis" };
  const manifest = mountManifest("0.1.2", "", nsis, msi, new Date("2026-10-08T12:00:00Z"));
  assert.equal(manifest.notes, "Niko 0.1.2");
  assert.deepEqual(manifest.platforms["windows-x86_64"], manifest.platforms["windows-x86_64-nsis"]);
  assert.equal(manifest.platforms["windows-x86_64-nsis"].url, "https://github.com/vitorcgo/niko/releases/download/v0.1.2/Niko_0.1.2_x64-setup.exe");
  assert.deepEqual(manifest.platforms["windows-x86_64-msi"], { signature: "assinatura msi", url: "https://github.com/vitorcgo/niko/releases/download/v0.1.2/Niko_0.1.2_x64_pt-BR.msi" });
});

test("Accepts English release flags and preserves legacy flag behavior", () => {
  assert.deepEqual(readArguments(["--version", "0.1.2", "--check", "--rebuild", "Notes"]),
    readArguments(["--versao", "0.1.2", "--verificar", "--recompilar", "Notes"]));
  assert.deepEqual(readArguments(["--version=0.1.2"]), readArguments(["--versao=0.1.2"]));
  assert.deepEqual(readArguments(["--help"]), readArguments(["--ajuda"]));
  assert.throws(() => readArguments(["--version", "0.1.2", "--versao", "0.1.3"]), /uma vez/);
});
