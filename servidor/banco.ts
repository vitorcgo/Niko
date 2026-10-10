import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pastaDados } from "./ia.ts";

const VERSAO = 2;
const bancos = new Map<string, DatabaseSync>();
const diasCopiados = new Map<string, string>();

export function caminhoBanco(nome = "") {
  return join(pastaDados(), nome ? `niko-${nome}.db` : "niko.db");
}

function fazerBackup(arquivo: string, banco = "") {
  if (!existsSync(arquivo)) return;
  const pasta = join(pastaDados(), "backups");
  mkdirSync(pasta, { recursive: true });
  const prefixo = banco ? `niko-${banco}--` : "niko-";
  const ehDesteBanco = (n: string) => n.startsWith(prefixo) && n.endsWith(".db") && (banco !== "" || !n.includes("--"));
  const nome = `${prefixo}${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  copyFileSync(arquivo, join(pasta, nome));
  const antigos = readdirSync(pasta).filter(ehDesteBanco).sort();
  for (const velho of antigos.slice(0, Math.max(0, antigos.length - 10))) unlinkSync(join(pasta, velho));
}

function abrir(nome = ""): DatabaseSync {
  if (nome && !/^[a-z0-9-]{1,20}$/.test(nome)) throw new Error("banco_invalido");
  const aberto = bancos.get(nome);
  if (aberto) return aberto;
  mkdirSync(pastaDados(), { recursive: true });
  const arquivo = caminhoBanco(nome);
  const db = new DatabaseSync(arquivo);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
  const versao = Number((db.prepare("SELECT valor FROM meta WHERE chave = 'versao'").get() as { valor?: string } | undefined)?.valor ?? 0);
  if (versao < VERSAO) {
    if (versao > 0) {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      fazerBackup(arquivo, nome);
    }
    db.exec("CREATE TABLE IF NOT EXISTS dados (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado INTEGER NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS confirmacoes (id TEXT PRIMARY KEY, situacao TEXT NOT NULL CHECK(situacao IN ('confirmado', 'cancelado')), criado INTEGER NOT NULL)");
    db.prepare("INSERT INTO meta (chave, valor) VALUES ('versao', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(String(VERSAO));
  }
  bancos.set(nome, db);
  return db;
}

const CHAVE_VALIDA = /^niko:[a-z0-9_-]{1,60}$/i;

export function lerTudo(nome = ""): Record<string, string> {
  const linhas = abrir(nome).prepare("SELECT chave, valor FROM dados").all() as { chave: string; valor: string }[];
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

export function gravar(itens: Record<string, string | null>, nome = "") {
  const db = abrir(nome);
  const inserir = db.prepare("INSERT INTO dados (chave, valor, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado");
  const apagar = db.prepare("DELETE FROM dados WHERE chave = ?");
  const agora = Date.now();
  db.exec("BEGIN");
  try {
    for (const [chave, valor] of Object.entries(itens)) {
      if (!CHAVE_VALIDA.test(chave)) throw new Error("chave_invalida");
      if (valor === null) apagar.run(chave);
      else if (typeof valor === "string" && valor.length <= 20_000_000) inserir.run(chave, valor, agora);
      else throw new Error("valor_invalido");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  const dia = new Date().toISOString().slice(0, 10);
  if (diasCopiados.get(nome) !== dia) {
    try {
      const pasta = join(pastaDados(), "backups");
      const prefixo = nome ? `niko-${nome}--` : "niko-";
      const existe = existsSync(pasta) && readdirSync(pasta).some((n) => n.startsWith(`${prefixo}${dia}`) && n.endsWith(".db"));
      if (!existe) {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        fazerBackup(caminhoBanco(nome), nome);
      }
      diasCopiados.set(nome, dia);
    } catch {
      process.stderr.write("backup_diario_falhou\n");
    }
  }
}

export function reservarConfirmacao(id: string, aceitar: boolean, nome = ""): { reservada: boolean; situacao: "confirmado" | "cancelado" } {
  if (!/^[A-Za-z0-9:_-]{1,200}$/.test(id)) throw new Error("confirmacao_invalida");
  const db = abrir(nome);
  const situacao = aceitar ? "confirmado" : "cancelado";
  const insercao = db.prepare("INSERT INTO confirmacoes (id, situacao, criado) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").run(id, situacao, Date.now());
  const salvo = db.prepare("SELECT situacao FROM confirmacoes WHERE id = ?").get(id) as { situacao: "confirmado" | "cancelado" };
  return { reservada: insercao.changes === 1, situacao: salvo.situacao };
}

export function zerarBanco(nome = ""): string {
  const db = abrir(nome);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fazerBackup(caminhoBanco(nome), nome);
  db.exec("DELETE FROM dados");
  db.exec("DELETE FROM confirmacoes");
  db.exec("VACUUM");
  return join(pastaDados(), "backups");
}

export function backupManual(nome = ""): string {
  const arquivo = caminhoBanco(nome);
  abrir(nome).exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fazerBackup(arquivo, nome);
  return join(pastaDados(), "backups");
}

export function fecharBanco() {
  for (const db of bancos.values()) db.close();
  bancos.clear();
  diasCopiados.clear();
}
