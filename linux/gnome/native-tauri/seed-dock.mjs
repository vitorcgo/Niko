import assert from 'node:assert/strict';
import {mkdirSync, existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const lab = process.env.NIKO_NATIVE_LAB;
assert.ok(lab?.startsWith('/tmp/niko-tauri.'));
assert.equal(process.env.HOME, `${lab}/home`);
assert.equal(process.env.XDG_DATA_HOME, `${lab}/data`);
assert.ok(process.env.DBUS_SESSION_BUS_ADDRESS?.includes(lab));
const mode = process.env.NIKO_DOCK_MODO ?? 'fixo';
assert.ok(['fixo', 'inteligente', 'esconder'].includes(mode));
const root = `${lab}/data/com.niko.desktop`;
mkdirSync(root, {recursive: true});
assert.equal(existsSync(`${root}/niko.db`), false, 'fixture cria apenas banco novo');
const db = new DatabaseSync(`${root}/niko.db`);
try {
  db.exec("CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL); INSERT INTO meta VALUES ('versao','1'); CREATE TABLE dados (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado INTEGER NOT NULL)");
  db.prepare('INSERT INTO dados VALUES (?, ?, ?)').run('niko:configuracoes', JSON.stringify({version: 9, state: {
    primeiraExecucaoFeita: true, nome: "Perfil fictício", foto: null, sons: {ligado: false, volume: 0, categorias: {personagens: false, avisos: false, pomodoro: false, interface: false}},
    consumo: {lerPlanos: false}, dock: {ativo: process.env.NIKO_TAURI_DOCK === '1', modo: mode},
  }}), Date.now());
} finally { db.close(); }
