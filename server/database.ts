import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./ai";

const VERSION = 1;
const databases = new Map<string, DatabaseSync>();

export function pathDatabase(nameValue = "") {
  return join(dataDirectory(), nameValue ? `niko-${nameValue}.db` : "niko.db");
}

function fromBackup(file: string, database = "") {
  if (!existsSync(file)) return;
  const directory = join(dataDirectory(), "backups");
  mkdirSync(directory, { recursive: true });
  const prefix = database ? `niko-${database}--` : "niko-";
  const isDesteDatabase = (n: string) => n.startsWith(prefix) && n.endsWith(".db") && (database !== "" || !n.includes("--"));
  const nameValue = `${prefix}${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  copyFileSync(file, join(directory, nameValue));
  const previous = readdirSync(directory).filter(isDesteDatabase).sort();
  for (const old of previous.slice(0, Math.max(0, previous.length - 10))) unlinkSync(join(directory, old));
}

function openValue(nameValue = ""): DatabaseSync {
  if (nameValue && !/^[a-z0-9-]{1,20}$/.test(nameValue)) throw new Error("banco_invalido");
  const isOpen = databases.get(nameValue);
  if (isOpen) return isOpen;
  mkdirSync(dataDirectory(), { recursive: true });
  const file = pathDatabase(nameValue);
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
  const version = Number((db.prepare("SELECT valor FROM meta WHERE chave = 'versao'").get() as { valor?: string } | undefined)?.valor ?? 0);
  if (version < VERSION) {
    if (version > 0) fromBackup(file, nameValue);
    db.exec("CREATE TABLE IF NOT EXISTS dados (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado INTEGER NOT NULL)");
    db.prepare("INSERT INTO meta (chave, valor) VALUES ('versao', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(String(VERSION));
  }
  databases.set(nameValue, db);
  return db;
}

const KEY_VALID = /^niko:[a-z0-9_-]{1,60}$/i;

export function readAll(nameValue = ""): Record<string, string> {
  const lines = openValue(nameValue).prepare("SELECT chave, valor FROM dados").all() as { chave: string; valor: string }[];
  return Object.fromEntries(lines.map((l) => [l.chave, l.valor]));
}

export function write(items: Record<string, string | null>, nameValue = "") {
  const db = openValue(nameValue);
  const insert = db.prepare("INSERT INTO dados (chave, valor, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado");
  const remove = db.prepare("DELETE FROM dados WHERE chave = ?");
  const now = Date.now();
  db.exec("BEGIN");
  try {
    for (const [key, value] of Object.entries(items)) {
      if (!KEY_VALID.test(key)) throw new Error("chave_invalida");
      if (value === null) remove.run(key);
      else if (typeof value === "string" && value.length <= 20_000_000) insert.run(key, value, now);
      else throw new Error("valor_invalido");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function resetDatabase(nameValue = ""): string {
  const db = openValue(nameValue);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fromBackup(pathDatabase(nameValue), nameValue);
  db.exec("DELETE FROM dados");
  db.exec("VACUUM");
  return join(dataDirectory(), "backups");
}

export function backupManual(): string {
  const file = pathDatabase();
  openValue().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fromBackup(file);
  return join(dataDirectory(), "backups");
}

export function closeDatabase() {
  for (const db of databases.values()) db.close();
  databases.clear();
}
