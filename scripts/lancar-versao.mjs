import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { lerArgumentos, lerNotasDoArquivo, lerVersoes, validarVersoes, validarTag, planejarVersao, sincronizarVersao, verificarPublicacao, validarArtefatos, montarManifesto } from "./versao-release.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

async function lancar() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    console.log('Nova release: pnpm lancar 0.1.2 "Notas da versão"\nNotas completas: pnpm lancar 0.2.2 --notas-arquivo docs/releases/0.2.2.md\nSó conferir: pnpm lancar:verificar\nPrévia da sincronização: pnpm lancar 0.1.2 --verificar\nRepetir um build publicado: pnpm lancar 0.1.1 --recompilar "Notas da versão"');
    return;
  }
  const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined;
  const notas = opcoes.arquivoNotas ? lerNotasDoArquivo(raiz, opcoes.arquivoNotas) : opcoes.notas;
  if (opcoes.verificar) {
    if (opcoes.versao) {
      validarTag(opcoes.versao, tag);
      const plano = planejarVersao(raiz, opcoes.versao);
      console.log(`Prévia da versão ${opcoes.versao}:\n${plano.map((a) => `  ${a.nome}: ${a.antes === a.depois ? "sem mudança" : "será atualizado"}`).join("\n")}\nNenhum arquivo foi alterado. Nenhum build foi iniciado.`);
    } else {
      const arquivos = lerVersoes(raiz);
      const versao = validarVersoes(arquivos);
      validarTag(versao, tag);
      console.log(`Versões sincronizadas em ${versao}:\n${arquivos.map((a) => `  ${a.nome}: ${a.versao}`).join("\n")}`);
    }
    return;
  }
  const versao = opcoes.versao;
  validarTag(versao, tag);
  const plano = planejarVersao(raiz, versao);
  const chave = join(homedir(), ".tauri", "niko-atualizacao.key");
  const chaveConfigurada = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!chaveConfigurada && !existsSync(chave)) throw new Error(`Chave de atualização não encontrada em ${chave}. Use a mesma chave das versões anteriores.`);
  if (!opcoes.recompilar) await verificarPublicacao(versao);
  sincronizarVersao(plano);
  validarVersoes(lerVersoes(raiz), versao);
  console.log(`Versão ${versao} sincronizada. Iniciando o build assinado.`);
  const inicio = Date.now();
  execSync("pnpm tauri build", {
    cwd: raiz,
    stdio: "inherit",
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: chaveConfigurada || readFileSync(chave, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
  });
  validarVersoes(lerVersoes(raiz), versao);
  const nsis = validarArtefatos(raiz, versao, inicio, "nsis");
  const msi = validarArtefatos(raiz, versao, inicio, "msi");
  const manifesto = montarManifesto(versao, notas, nsis, msi);
  writeFileSync(join(nsis.pasta, "latest.json"), JSON.stringify(manifesto, null, 2));
  if (opcoes.recompilar) console.log("Recompilação concluída. Isso não cria nem substitui uma release no GitHub.");
  console.log(`\nPronto. Para a release v${versao} em github.com/vitorcgo/niko, os arquivos são:\n  ${join(nsis.pasta, nsis.instalador)}\n  ${join(msi.pasta, msi.instalador)}\n  ${join(nsis.pasta, "latest.json")}\nNada foi publicado automaticamente.`);
}

try {
  await lancar();
} catch (erro) {
  console.error(`Lançamento interrompido: ${erro.message}`);
  process.exitCode = 1;
}
