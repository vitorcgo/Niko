import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { readArguments, readVersions, validateVersions, validateTag, planVersion, synchronizeVersion, checkPublication, validateArtifacts, mountManifest } from "./release-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function release() {
  const options = readArguments(process.argv.slice(2));
  if (options.ajuda) {
    console.log('Nova release: pnpm release 0.1.2 "Notas da versão"\nSó conferir: pnpm release:verify\nPrévia da sincronização: pnpm release 0.1.2 --check\nRepetir um build publicado: pnpm release 0.1.1 --rebuild "Notas da versão"');
    return;
  }
  const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined;
  if (options.verificar) {
    if (options.versao) {
      validateTag(options.versao, tag);
      const plan = planVersion(root, options.versao);
      console.log(`Prévia da versão ${options.versao}:\n${plan.map((a) => `  ${a.nome}: ${a.antes === a.depois ? "sem mudança" : "será atualizado"}`).join("\n")}\nNenhum arquivo foi alterado. Nenhum build foi iniciado.`);
    } else {
      const files = readVersions(root);
      const version = validateVersions(files);
      validateTag(version, tag);
      console.log(`Versões sincronizadas em ${version}:\n${files.map((a) => `  ${a.nome}: ${a.versao}`).join("\n")}`);
    }
    return;
  }
  const version = options.versao;
  validateTag(version, tag);
  const plan = planVersion(root, version);
  const key = join(homedir(), ".tauri", "niko-atualizacao.key");
  const keyConfigured = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!keyConfigured && !existsSync(key)) throw new Error(`Chave de atualização não encontrada em ${key}. Use a mesma chave das versões anteriores.`);
  if (!options.recompilar) await checkPublication(version);
  synchronizeVersion(plan);
  validateVersions(readVersions(root), version);
  console.log(`Versão ${version} sincronizada. Iniciando o build assinado.`);
  const start = Date.now();
  execSync("pnpm tauri build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: keyConfigured || readFileSync(key, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
  });
  validateVersions(readVersions(root), version);
  const nsis = validateArtifacts(root, version, start, "nsis");
  const msi = validateArtifacts(root, version, start, "msi");
  const manifest = mountManifest(version, options.notas, nsis, msi);
  writeFileSync(join(nsis.pasta, "latest.json"), JSON.stringify(manifest, null, 2));
  if (options.recompilar) console.log("Recompilação concluída. Isso não cria nem substitui uma release no GitHub.");
  console.log(`\nPronto. Para a release v${version} em github.com/vitorcgo/niko, os arquivos são:\n  ${join(nsis.pasta, nsis.instalador)}\n  ${join(msi.pasta, msi.instalador)}\n  ${join(nsis.pasta, "latest.json")}\nNada foi publicado automaticamente.`);
}

try {
  await release();
} catch (error) {
  console.error(`Lançamento interrompido: ${error.message}`);
  process.exitCode = 1;
}
