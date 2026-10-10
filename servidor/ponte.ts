import type { Plugin, Connect } from "./tiposVite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { listarProvedores, salvarProvedor, removerProvedor, testarProvedor, conversar, validarMensagens, validarFerramentas } from "./ia";
import { lerConsumo, usoOficial } from "./consumo";
import { lerUltimaVersao } from "./atualizacoes";
import { lerTudo, gravar, backupManual, zerarBanco } from "./banco";
import { pedirMidia } from "./midia";
import { pedirJanelas } from "./janelasWindows";
import { estadoConexoes, lerConexao, salvarChaveConexao, removerChaveConexao, servicoValido, chaveDe, SERVICOS as SERVICOS_CONEXAO } from "./conexoes";
import { buscarGmail, criarRascunhoGmail, enviarGmail } from "./gmail";
import { lerAgendaGoogle } from "./agendaGoogle";
import { temClienteDoNiko } from "./google";
import { lerCotacoes } from "./cotacoes";
import { lerAudio, definirVolume, definirMudo, ajustarSessao, lerTema, lerIniciar, definirTema, abrirFerramenta, agirNaEnergia, lerBandeja, abrirDaBandeja, pastaDaBandeja, encerrarDaBandeja, listarApps, iconesDeApps, abrirApp, abrirComandoDoSistema } from "./controleRapido";
import { ocrDaRequisicao } from "./ocr";
import { receberEventoDoGancho, ehRotaDoGancho, ouvirEventos, decidirPedido, estadoDaInstalacao, previaDaInstalacao, instalarGanchos, removerGanchos, abrirProjeto, trazerTerminal, ehRotaDaStatus, receberStatusDoClaude } from "./claude";
import { ehRotaDeAgente, receberEventoDeAgente, estadoDosAgentes, instalarAgente, removerAgente } from "./agentesDeCodigo";
import { listarArquivos, receberArquivo, enviarConteudo, excluirArquivo, excluirArquivosDaMateria, baixarArquivo, abrirArquivoNoPrograma } from "./arquivos";
import { tipoDoComputador, estadoDoSistema, listarRedes, listarBluetooth, lerComputador, conectarRede, esquecerRede, desconectarRede, definirBrilho, definirRadio, abrirConfiguracoesWindows } from "./sistema";

const LIMITE_CORPO = 24 * 1024 * 1024;

function lerCorpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolver, rejeitar) => {
    let tamanho = 0;
    const partes: Buffer[] = [];
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_CORPO) {
        rejeitar(new Error("corpo_grande"));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on("end", () => {
      try {
        const corpo: unknown = partes.length ? JSON.parse(Buffer.concat(partes).toString("utf8")) : {};
        if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) throw new Error("json_invalido");
        resolver(corpo as Record<string, unknown>);
      } catch {
        rejeitar(new Error("json_invalido"));
      }
    });
    req.on("error", rejeitar);
  });
}

function responder(res: ServerResponse, status: number, dados: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(dados));
}

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostLocal(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  try {
    return HOSTS_LOCAIS.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function origemConfiavel(req: IncomingMessage): boolean {
  if (req.headers["x-niko"] !== "1") return false;
  const token = process.env.NIKO_TOKEN;
  if (token && req.headers["x-niko-token"] !== token) return false;
  const origem = req.headers.origin;
  if (!origem) return true;
  try {
    const host = new URL(origem).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "tauri.localhost";
  } catch {
    return false;
  }
}

export const rotas: Connect.NextHandleFunction = async (req, res, proximo) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/ponte/")) return proximo();
  if (!hostLocal(req)) return responder(res, 403, { erro: "host_nao_permitido" });
  if (ehRotaDoGancho(url.pathname) && req.method === "POST") return receberEventoDoGancho(req, res);
  if (ehRotaDaStatus(url.pathname) && req.method === "POST") return receberStatusDoClaude(req, res);
  if (ehRotaDeAgente(url.pathname) && req.method === "POST") return receberEventoDeAgente(req, res, url);
  if (!origemConfiavel(req)) return responder(res, 403, { erro: "origem_nao_permitida" });
  const caminho = url.pathname.slice("/ponte".length);

  try {
    if (caminho === "/atualizacao" && req.method === "GET") return responder(res, 200, await lerUltimaVersao());
    if (caminho === "/estado" && req.method === "GET") {
      return responder(res, 200, { disponivel: true, plataforma: process.platform, provedores: listarProvedores() });
    }
    if (caminho === "/provedores" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const provedor = await salvarProvedor(corpo as never);
      return responder(res, 200, provedor);
    }
    const remover = /^\/provedores\/([a-z0-9-]+)$/.exec(caminho);
    if (remover && req.method === "DELETE") {
      await removerProvedor(remover[1]);
      return responder(res, 200, { ok: true });
    }
    const testar = /^\/provedores\/([a-z0-9-]+)\/testar$/.exec(caminho);
    if (testar && req.method === "POST") {
      return responder(res, 200, await testarProvedor(testar[1]));
    }
    if (caminho === "/claude/eventos" && req.method === "GET") return ouvirEventos(req, res);
    if (caminho === "/claude/decisao" && req.method === "POST") return responder(res, 200, decidirPedido(await lerCorpo(req)));
    if (caminho === "/claude/abrir" && req.method === "POST") return responder(res, 200, abrirProjeto(await lerCorpo(req)));
    if (caminho === "/claude/terminal" && req.method === "POST") return responder(res, 200, await trazerTerminal(await lerCorpo(req)));
    if (caminho === "/claude/instalacao" && req.method === "GET") return responder(res, 200, estadoDaInstalacao());
    if (caminho === "/claude/previa" && req.method === "GET") return responder(res, 200, previaDaInstalacao(url.searchParams.get("acao") === "remover" ? "remover" : "instalar"));
    if (caminho === "/claude/instalar" && req.method === "POST") return responder(res, 200, instalarGanchos(await lerCorpo(req)));
    if (caminho === "/claude/remover" && req.method === "POST") return responder(res, 200, removerGanchos(await lerCorpo(req)));
    if (caminho === "/agentes" && req.method === "GET") return responder(res, 200, estadoDosAgentes());
    const agente = /^\/agentes\/([a-z]{2,20})\/(instalar|remover)$/.exec(caminho);
    if (agente && req.method === "POST") return responder(res, 200, agente[2] === "instalar" ? instalarAgente(agente[1], await lerCorpo(req)) : removerAgente(agente[1], await lerCorpo(req)));
    if (caminho === "/ocr" && req.method === "POST") return responder(res, 200, await ocrDaRequisicao(req));
    const arquivo = /^\/arquivos\/([A-Za-z0-9-]{1,64})(?:\/([A-Za-z0-9-]{1,64})(?:\/(baixar|abrir))?)?$/.exec(caminho);
    if (arquivo) {
      const banco = String(req.headers["x-niko-banco"] ?? "");
      const [, materia, id, acao] = arquivo;
      if (!id && req.method === "GET") return responder(res, 200, { arquivos: await listarArquivos(banco, materia) });
      if (!id && req.method === "POST") return responder(res, 200, await receberArquivo(req, banco, materia, url.searchParams.get("nome") ?? ""));
      if (!id && req.method === "DELETE") return responder(res, 200, excluirArquivosDaMateria(banco, materia));
      if (id && !acao && req.method === "GET") return enviarConteudo(res, banco, materia, id);
      if (id && !acao && req.method === "DELETE") return responder(res, 200, excluirArquivo(banco, materia, id));
      if (id && acao === "baixar" && req.method === "POST") return responder(res, 200, await baixarArquivo(banco, materia, id));
      if (id && acao === "abrir" && req.method === "POST") return responder(res, 200, abrirArquivoNoPrograma(banco, materia, id));
    }
    if (caminho === "/janelas" && req.method === "GET") return responder(res, 200, await pedirJanelas("listar"));
    const acaoJanela = /^\/janelas\/(focar|minimizar|fechar)$/.exec(caminho);
    if (acaoJanela && req.method === "POST") {
      const corpo = await lerCorpo(req);
      return responder(res, 200, await pedirJanelas(acaoJanela[1] as "focar", String(corpo.janela ?? "")));
    }
    if (caminho === "/midia" && req.method === "GET") {
      return responder(res, 200, await pedirMidia("estado"));
    }
    const acaoMidia = /^\/midia\/(alternar|proxima|anterior|posicao)$/.exec(caminho);
    if (acaoMidia && req.method === "POST") {
      const corpo = await lerCorpo(req);
      return responder(res, 200, await pedirMidia(acaoMidia[1] as "alternar", Number(corpo.segundos)));
    }
    if (caminho === "/conexoes" && req.method === "GET") {
      return responder(res, 200, estadoConexoes());
    }
    if (caminho === "/cotacoes" && req.method === "GET") return responder(res, 200, await lerCotacoes());
    if (caminho === "/google/login-direto" && req.method === "GET") return responder(res, 200, { disponivel: temClienteDoNiko() });
    if (caminho === "/gmail/buscar" && req.method === "GET") return responder(res, 200, await buscarGmail(await chaveDe("google"), url.searchParams.get("q") ?? ""));
    if (caminho === "/agenda/eventos" && req.method === "GET") return responder(res, 200, await lerAgendaGoogle(await chaveDe("google"), url.searchParams.get("de") ?? "", url.searchParams.get("ate") ?? ""));
    if (caminho === "/gmail/rascunho" && req.method === "POST") return responder(res, 200, await criarRascunhoGmail(await chaveDe("google"), await lerCorpo(req)));
    if (caminho === "/gmail/enviar" && req.method === "POST") return responder(res, 200, await enviarGmail(await chaveDe("google"), await lerCorpo(req)));
    const conexao = /^\/conexoes\/([a-z]+)(\/chave)?$/.exec(caminho);
    if (conexao && servicoValido(conexao[1])) {
      const servico = conexao[1];
      if (!conexao[2] && req.method === "GET") return responder(res, 200, await lerConexao(servico, url.searchParams.get("forcar") === "1"));
      if (conexao[2] && req.method === "POST") return responder(res, 200, await salvarChaveConexao(servico, await lerCorpo(req)));
      if (conexao[2] && req.method === "DELETE") return responder(res, 200, await removerChaveConexao(servico));
    }
    if (caminho === "/dados" && req.method === "GET") {
      return responder(res, 200, { dados: lerTudo(String(req.headers["x-niko-banco"] ?? "")) });
    }
    if (caminho === "/dados" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const itens = corpo.itens;
      if (!itens || typeof itens !== "object" || Array.isArray(itens)) return responder(res, 400, { erro: "itens_invalidos" });
      gravar(itens as Record<string, string | null>, String(req.headers["x-niko-banco"] ?? ""));
      return responder(res, 200, { ok: true });
    }
    if (caminho === "/dados/zerar" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      if (corpo.confirmacao !== "APAGAR") return responder(res, 400, { erro: "confirmacao_invalida" });
      const pasta = zerarBanco(String(req.headers["x-niko-banco"] ?? ""));
      if (corpo.chaves === true) {
        for (const p of listarProvedores()) await removerProvedor(p.id);
        for (const s of SERVICOS_CONEXAO) await removerChaveConexao(s);
      }
      return responder(res, 200, { pasta });
    }
    if (caminho === "/dados/backup" && req.method === "POST") {
      return responder(res, 200, { pasta: backupManual() });
    }
    if (caminho === "/consumo" && req.method === "GET") {
      if (url.searchParams.get("oficial") === "1") return responder(res, 200, usoOficial());
      return responder(res, 200, await lerConsumo(url.searchParams.get("forcar") === "1"));
    }
    if (caminho === "/ia" && req.method === "POST") {
      const corpo = await lerCorpo(req);
      const mensagens = validarMensagens(corpo.mensagens);
      const ferramentas = validarFerramentas(corpo.ferramentas);
      const controle = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controle.abort();
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      for await (const evento of conversar(String(corpo.provedorId ?? ""), String(corpo.sistema ?? "").slice(0, 20000), mensagens, typeof corpo.modelo === "string" ? corpo.modelo : undefined, controle.signal, ferramentas)) {
        res.write(`${JSON.stringify(evento)}\n`);
      }
      return res.end();
    }
    if (caminho.startsWith("/sistema/")) {
      const acao = caminho.slice("/sistema/".length);
      const leitura: Record<string, () => Promise<unknown>> = { tipo: tipoDoComputador, estado: estadoDoSistema, redes: listarRedes, bluetooth: listarBluetooth, computador: lerComputador };
      const escrita: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
        conectar: conectarRede,
        esquecer: esquecerRede,
        desconectar: () => desconectarRede(),
        brilho: definirBrilho,
        radio: definirRadio,
        configuracoes: abrirConfiguracoesWindows,
      };
      if (req.method === "GET" && leitura[acao]) return responder(res, 200, await leitura[acao]());
      if (req.method === "POST" && escrita[acao]) return responder(res, 200, await escrita[acao](await lerCorpo(req)));
    }
    if (caminho.startsWith("/controle/")) {
      const acao = caminho.slice("/controle/".length);
      const leitura: Record<string, () => Promise<unknown>> = { audio: lerAudio, tema: lerTema, bandeja: lerBandeja, iniciar: lerIniciar };
      const escrita: Record<string, (d: Record<string, unknown>) => Promise<unknown>> = {
        volume: definirVolume,
        mudo: definirMudo,
        sessao: ajustarSessao,
        tema: definirTema,
        ferramenta: abrirFerramenta,
        energia: agirNaEnergia,
        bandeja: abrirDaBandeja,
        bandejaPasta: pastaDaBandeja,
        bandejaEncerrar: encerrarDaBandeja,
        apps: listarApps,
        iconesApps: iconesDeApps,
        abrirApp,
        comandoDoSistema: abrirComandoDoSistema,
      };
      if (req.method === "GET" && leitura[acao]) return responder(res, 200, await leitura[acao]());
      if (req.method === "POST" && escrita[acao]) return responder(res, 200, await escrita[acao](await lerCorpo(req)));
    }
    return responder(res, 404, { erro: "rota_desconhecida" });
  } catch (e) {
    if (!res.headersSent) return responder(res, 400, { erro: (e as Error).message });
    res.end();
  }
};

export function ponteLocal(): Plugin {
  return {
    name: "niko-ponte-local",
    configureServer(servidor) {
      process.env.NIKO_TOKEN ||= randomBytes(32).toString("hex");
      servidor.middlewares.use(rotas);
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html, contexto) => (contexto.server && process.env.NIKO_TOKEN ? html.replace("<head>", `<head>\n    <meta name="niko-token" content="${process.env.NIKO_TOKEN}" />`) : html),
    },
    configurePreviewServer(servidor) {
      servidor.middlewares.use(rotas);
    },
  };
}
