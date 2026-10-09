import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";

const FILES = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
const DEFAULT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateVersion(version) {
  if (typeof version !== "string" || !DEFAULT_VERSION.test(version) || version.split(".").some((n) => !Number.isSafeInteger(Number(n)))) {
    throw new Error("Versão inválida. Use três números, por exemplo: 0.1.2.");
  }
  return version;
}

export function readArguments(args) {
  const aliases = { "--version": "--versao", "--check": "--verificar", "--rebuild": "--recompilar", "--help": "--ajuda" };
  args = args.map((argument) => argument.startsWith("--version=")
    ? `--versao=${argument.slice("--version=".length)}`
    : aliases[argument] ?? argument);
  const options = { versao: undefined, notas: "", verificar: false, recompilar: false, ajuda: false };
  const notes = [];
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--") continue;
    if (argument === "--verificar") options.verificar = true;
    else if (argument === "--recompilar") options.recompilar = true;
    else if (argument === "--ajuda") options.ajuda = true;
    else if (argument === "--versao" || argument.startsWith("--versao=")) {
      if (options.versao) throw new Error("Informe a versão apenas uma vez.");
      options.versao = validateVersion(argument === "--versao" ? args[++i] : argument.slice("--versao=".length));
    } else if (argument.startsWith("--")) throw new Error(`Argumento desconhecido: ${argument}`);
    else if (!options.versao && notes.length === 0 && /^\d/.test(argument)) options.versao = validateVersion(argument);
    else notes.push(argument);
  }
  if (!options.versao && !options.verificar && !options.ajuda) {
    throw new Error('Informe a versão explicitamente: pnpm release 0.1.2 "Notas da versão".');
  }
  if (options.recompilar && !options.versao) throw new Error("Informe a versão para recompilar.");
  options.notas = notes.join(" ");
  return options;
}

function locateVersion(nameValue, content) {
  let block = content;
  let defaultValue;
  if (nameValue.endsWith(".json")) {
    const payload = JSON.parse(content);
    validateVersion(payload.version);
    defaultValue = /("version"\s*:\s*")([^"]+)(")/g;
  } else {
    const blocks = content.split(/(?=^\[)/m);
    const found = nameValue.endsWith("Cargo.lock")
      ? blocks.filter((b) => b.startsWith("[[package]]") && /^name\s*=\s*"niko"\s*$/m.test(b))
      : blocks.filter((b) => b.startsWith("[package]"));
    if (found.length !== 1) throw new Error(`Não foi possível localizar o pacote Niko em ${nameValue}.`);
    block = found[0];
    defaultValue = /(^version\s*=\s*")([^"]+)(")/gm;
  }
  const fields = [...block.matchAll(defaultValue)];
  if (fields.length !== 1) throw new Error(`Não foi possível identificar uma única versão em ${nameValue}.`);
  const version = validateVersion(fields[0][2]);
  return { versao: version, atualizar: (newItem) => content.replace(block, () => block.replace(defaultValue, (_, start, current, end) => `${start}${newItem}${end}`)) };
}

export function readVersions(root) {
  return FILES.map((nameValue) => {
    const path = join(root, nameValue);
    const content = readFileSync(path, "utf8");
    return { nome: nameValue, caminho: path, conteudo: content, ...locateVersion(nameValue, content) };
  });
}

export function validateVersions(files, expected) {
  const version = expected ?? files[0].versao;
  validateVersion(version);
  if (files.some((a) => a.versao !== version)) {
    throw new Error(`Versões divergentes:\n${files.map((a) => `  ${a.nome}: ${a.versao}`).join("\n")}\nUse pnpm release ${version} "Notas da versão" para sincronizar antes do build.`);
  }
  return version;
}

export function validateTag(version, tag) {
  if (tag && tag !== `v${version}`) throw new Error(`Tag ${tag} não corresponde à versão ${version}. Use v${version}.`);
}

function isVersionLower(a, b) {
  const first = a.split(".").map(Number);
  const second = b.split(".").map(Number);
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i]) return first[i] < second[i];
  }
  return false;
}

export function planVersion(root, version) {
  validateVersion(version);
  const files = readVersions(root);
  for (const file of files) {
    if (isVersionLower(version, file.versao)) throw new Error(`A versão ${version} é menor que ${file.versao} em ${file.nome}.`);
  }
  const plan = files.map((a) => ({ nome: a.nome, caminho: a.caminho, antes: a.conteudo, depois: a.atualizar(version) }));
  const path = join(root, "README.md");
  if (existsSync(path)) {
    const before = readFileSync(path, "utf8");
    const after = before.replace(/(https:\/\/img\.shields\.io\/badge\/versão-)(\d+\.\d+\.\d+)(-)/g, `$1${version}$3`);
    plan.push({ nome: "README.md", caminho: path, antes: before, depois: after });
  }
  return plan;
}

function writeAtomic(path, content) {
  const temporary = `${path}.niko-release-${process.pid}.tmp`;
  let created = false;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    created = true;
    renameSync(temporary, path);
  } finally {
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}

export function synchronizeVersion(plan) {
  for (const file of plan) {
    if (readFileSync(file.caminho, "utf8") !== file.antes) throw new Error(`${file.nome} mudou durante a preparação. Execute o comando novamente. Nada foi alterado.`);
  }
  const changed = [];
  try {
    for (const file of plan) {
      if (file.antes === file.depois) continue;
      writeAtomic(file.caminho, file.depois);
      changed.push(file);
    }
  } catch (error) {
    const failures = [];
    for (const file of changed.reverse()) {
      try {
        if (readFileSync(file.caminho, "utf8") !== file.depois) throw new Error("arquivo mudou");
        writeAtomic(file.caminho, file.antes);
      } catch {
        failures.push(file.nome);
      }
    }
    throw new Error(`Falha ao sincronizar versões: ${error.message}.${failures.length ? ` Revise estes arquivos: ${failures.join(", ")}.` : " Alterações de versão revertidas."}`);
  }
}

export async function checkPublication(version, request = fetch) {
  validateVersion(version);
  let response;
  try {
    response = await request(`https://api.github.com/repos/vitorcgo/niko/releases/tags/v${version}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Niko-release" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Não foi possível consultar o GitHub. Confira a internet e tente novamente. Nenhuma versão foi alterada.");
  }
  if (response.status === 404) return;
  if (response.status === 200) throw new Error(`A release v${version} já existe no GitHub. Escolha uma versão nova ou use --recompilar para gerar novamente sem publicar.`);
  throw new Error(`Não foi possível verificar a release no GitHub (HTTP ${response.status}). Nenhuma versão foi alterada.`);
}

export const INSTALLERS = {
  nsis: (version) => `Niko_${version}_x64-setup.exe`,
  msi: (version) => `Niko_${version}_x64_pt-BR.msi`,
};

export function validateArtifacts(root, version, start, type = "nsis") {
  const directory = join(root, "src-tauri", "target", "release", "bundle", type);
  const installer = INSTALLERS[type](validateVersion(version));
  for (const nameValue of [installer, `${installer}.sig`]) {
    const path = join(directory, nameValue);
    if (!existsSync(path)) throw new Error(`${nameValue} não foi gerado. Não publique uma versão anterior.`);
    const info = statSync(path);
    if (!info.isFile() || info.size === 0) throw new Error(`Artefato inválido: ${nameValue}.`);
    if (info.mtimeMs < start - 2000) throw new Error(`${nameValue} não pertence ao build atual. O manifesto não será gerado.`);
  }
  const signature = readFileSync(join(directory, `${installer}.sig`), "utf8").trim();
  if (!signature) throw new Error("A assinatura do instalador está vazia.");
  return { pasta: directory, instalador: installer, assinatura: signature };
}

export function mountManifest(version, notes, nsis, msi, data = new Date()) {
  const address = (installer) => `https://github.com/vitorcgo/niko/releases/download/v${validateVersion(version)}/${installer}`;
  const inputNsis = { signature: nsis.assinatura, url: address(nsis.instalador) };
  return {
    version: version,
    notes: notes || `Niko ${version}`,
    pub_date: data.toISOString(),
    platforms: {
      "windows-x86_64": inputNsis,
      "windows-x86_64-nsis": inputNsis,
      "windows-x86_64-msi": { signature: msi.assinatura, url: address(msi.instalador) },
    },
  };
}
