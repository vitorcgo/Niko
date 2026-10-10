import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ARQUIVOS = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
const PADRAO_VERSAO = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validarVersao(versao) {
  if (typeof versao !== "string" || !PADRAO_VERSAO.test(versao) || versao.split(".").some((n) => !Number.isSafeInteger(Number(n)))) {
    throw new Error("Versão inválida. Use três números, por exemplo: 0.1.2.");
  }
  return versao;
}

export function lerArgumentos(argumentos) {
  const opcoes = { versao: undefined, notas: "", verificar: false, recompilar: false, ajuda: false };
  const notas = [];
  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i];
    if (argumento === "--") continue;
    if (argumento === "--verificar") opcoes.verificar = true;
    else if (argumento === "--recompilar") opcoes.recompilar = true;
    else if (argumento === "--ajuda") opcoes.ajuda = true;
    else if (argumento === "--notas-arquivo" || argumento.startsWith("--notas-arquivo=")) {
      if (opcoes.arquivoNotas !== undefined) throw new Error("Informe o arquivo de notas apenas uma vez.");
      const arquivo = argumento === "--notas-arquivo" ? argumentos[++i] : argumento.slice("--notas-arquivo=".length);
      if (!arquivo || arquivo.startsWith("--")) throw new Error("Informe o caminho do arquivo de notas.");
      opcoes.arquivoNotas = arquivo;
    }
    else if (argumento === "--versao" || argumento.startsWith("--versao=")) {
      if (opcoes.versao) throw new Error("Informe a versão apenas uma vez.");
      opcoes.versao = validarVersao(argumento === "--versao" ? argumentos[++i] : argumento.slice("--versao=".length));
    } else if (argumento.startsWith("--")) throw new Error(`Argumento desconhecido: ${argumento}`);
    else if (!opcoes.versao && notas.length === 0 && /^\d/.test(argumento)) opcoes.versao = validarVersao(argumento);
    else notas.push(argumento);
  }
  if (!opcoes.versao && !opcoes.verificar && !opcoes.ajuda) {
    throw new Error('Informe a versão explicitamente: pnpm lancar 0.1.2 "Notas da versão".');
  }
  if (opcoes.recompilar && !opcoes.versao) throw new Error("Informe a versão para recompilar.");
  opcoes.notas = notas.join(" ");
  if (opcoes.arquivoNotas && opcoes.notas) throw new Error("Use o arquivo de notas ou o texto no comando, não os dois.");
  return opcoes;
}

export function lerNotasDoArquivo(raiz, arquivo) {
  const caminho = resolve(raiz, arquivo);
  const tamanho = statSync(caminho);
  if (!tamanho.isFile() || tamanho.size > 100_000) throw new Error("Use um arquivo de notas de até 100 KB.");
  const notas = readFileSync(caminho, "utf8").replace(/^\uFEFF/, "").trim();
  if (!notas) throw new Error("O arquivo de notas está vazio.");
  return notas;
}

function localizarVersao(nome, conteudo) {
  let bloco = conteudo;
  let padrao;
  if (nome.endsWith(".json")) {
    const dados = JSON.parse(conteudo);
    validarVersao(dados.version);
    padrao = /("version"\s*:\s*")([^"]+)(")/g;
  } else {
    const blocos = conteudo.split(/(?=^\[)/m);
    const encontrados = nome.endsWith("Cargo.lock")
      ? blocos.filter((b) => b.startsWith("[[package]]") && /^name\s*=\s*"niko"\s*$/m.test(b))
      : blocos.filter((b) => b.startsWith("[package]"));
    if (encontrados.length !== 1) throw new Error(`Não foi possível localizar o pacote Niko em ${nome}.`);
    bloco = encontrados[0];
    padrao = /(^version\s*=\s*")([^"]+)(")/gm;
  }
  const campos = [...bloco.matchAll(padrao)];
  if (campos.length !== 1) throw new Error(`Não foi possível identificar uma única versão em ${nome}.`);
  const versao = validarVersao(campos[0][2]);
  return { versao, atualizar: (nova) => conteudo.replace(bloco, () => bloco.replace(padrao, (_, inicio, _atual, fim) => `${inicio}${nova}${fim}`)) };
}

export function lerVersoes(raiz) {
  return ARQUIVOS.map((nome) => {
    const caminho = join(raiz, nome);
    const conteudo = readFileSync(caminho, "utf8");
    return { nome, caminho, conteudo, ...localizarVersao(nome, conteudo) };
  });
}

export function validarVersoes(arquivos, esperada) {
  const versao = esperada ?? arquivos[0].versao;
  validarVersao(versao);
  if (arquivos.some((a) => a.versao !== versao)) {
    throw new Error(`Versões divergentes:\n${arquivos.map((a) => `  ${a.nome}: ${a.versao}`).join("\n")}\nUse pnpm lancar ${versao} "Notas da versão" para sincronizar antes do build.`);
  }
  return versao;
}

export function validarTag(versao, tag) {
  if (tag && tag !== `v${versao}`) throw new Error(`Tag ${tag} não corresponde à versão ${versao}. Use v${versao}.`);
}

function menorQue(a, b) {
  const primeira = a.split(".").map(Number);
  const segunda = b.split(".").map(Number);
  for (let i = 0; i < primeira.length; i++) {
    if (primeira[i] !== segunda[i]) return primeira[i] < segunda[i];
  }
  return false;
}

export function planejarVersao(raiz, versao) {
  validarVersao(versao);
  const arquivos = lerVersoes(raiz);
  for (const arquivo of arquivos) {
    if (menorQue(versao, arquivo.versao)) throw new Error(`A versão ${versao} é menor que ${arquivo.versao} em ${arquivo.nome}.`);
  }
  const plano = arquivos.map((a) => ({ nome: a.nome, caminho: a.caminho, antes: a.conteudo, depois: a.atualizar(versao) }));
  const caminho = join(raiz, "README.md");
  if (existsSync(caminho)) {
    const antes = readFileSync(caminho, "utf8");
    const depois = antes.replace(/(https:\/\/img\.shields\.io\/badge\/versão-)(\d+\.\d+\.\d+)(-)/g, `$1${versao}$3`);
    plano.push({ nome: "README.md", caminho, antes, depois });
  }
  return plano;
}

function gravarAtomico(caminho, conteudo) {
  const temporario = `${caminho}.niko-release-${process.pid}.tmp`;
  let criado = false;
  try {
    writeFileSync(temporario, conteudo, { encoding: "utf8", flag: "wx" });
    criado = true;
    renameSync(temporario, caminho);
  } finally {
    if (criado && existsSync(temporario)) unlinkSync(temporario);
  }
}

export function sincronizarVersao(plano) {
  for (const arquivo of plano) {
    if (readFileSync(arquivo.caminho, "utf8") !== arquivo.antes) throw new Error(`${arquivo.nome} mudou durante a preparação. Execute o comando novamente. Nada foi alterado.`);
  }
  const alterados = [];
  try {
    for (const arquivo of plano) {
      if (arquivo.antes === arquivo.depois) continue;
      gravarAtomico(arquivo.caminho, arquivo.depois);
      alterados.push(arquivo);
    }
  } catch (erro) {
    const falhas = [];
    for (const arquivo of alterados.reverse()) {
      try {
        if (readFileSync(arquivo.caminho, "utf8") !== arquivo.depois) throw new Error("arquivo mudou");
        gravarAtomico(arquivo.caminho, arquivo.antes);
      } catch {
        falhas.push(arquivo.nome);
      }
    }
    throw new Error(`Falha ao sincronizar versões: ${erro.message}.${falhas.length ? ` Revise estes arquivos: ${falhas.join(", ")}.` : " Alterações de versão revertidas."}`);
  }
}

export async function verificarPublicacao(versao, pedir = fetch) {
  validarVersao(versao);
  let resposta;
  try {
    resposta = await pedir(`https://api.github.com/repos/vitorcgo/niko/releases/tags/v${versao}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Niko-release" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Não foi possível consultar o GitHub. Confira a internet e tente novamente. Nenhuma versão foi alterada.");
  }
  if (resposta.status === 404) return;
  if (resposta.status === 200) throw new Error(`A release v${versao} já existe no GitHub. Escolha uma versão nova ou use --recompilar para gerar novamente sem publicar.`);
  throw new Error(`Não foi possível verificar a release no GitHub (HTTP ${resposta.status}). Nenhuma versão foi alterada.`);
}

export const INSTALADORES = {
  nsis: (versao) => `Niko_${versao}_x64-setup.exe`,
  msi: (versao) => `Niko_${versao}_x64_pt-BR.msi`,
};

export function validarArtefatos(raiz, versao, inicio, tipo = "nsis") {
  const pasta = join(raiz, "src-tauri", "target", "release", "bundle", tipo);
  const instalador = INSTALADORES[tipo](validarVersao(versao));
  for (const nome of [instalador, `${instalador}.sig`]) {
    const caminho = join(pasta, nome);
    if (!existsSync(caminho)) throw new Error(`${nome} não foi gerado. Não publique uma versão anterior.`);
    const info = statSync(caminho);
    if (!info.isFile() || info.size === 0) throw new Error(`Artefato inválido: ${nome}.`);
    if (info.mtimeMs < inicio - 2000) throw new Error(`${nome} não pertence ao build atual. O manifesto não será gerado.`);
  }
  const assinatura = readFileSync(join(pasta, `${instalador}.sig`), "utf8").trim();
  if (!assinatura) throw new Error("A assinatura do instalador está vazia.");
  return { pasta, instalador, assinatura };
}

export function montarManifesto(versao, notas, nsis, msi, data = new Date()) {
  const endereco = (instalador) => `https://github.com/vitorcgo/niko/releases/download/v${validarVersao(versao)}/${instalador}`;
  const entradaNsis = { signature: nsis.assinatura, url: endereco(nsis.instalador) };
  return {
    version: versao,
    notes: notas || `Niko ${versao}`,
    pub_date: data.toISOString(),
    platforms: {
      "windows-x86_64": entradaNsis,
      "windows-x86_64-nsis": entradaNsis,
      "windows-x86_64-msi": { signature: msi.assinatura, url: endereco(msi.instalador) },
    },
  };
}
