import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync, readdirSync, writeFileSync, createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const lab = process.env.NIKO_HTTP_LAB;
assert.ok(lab?.startsWith('/tmp/niko-http-runtime.'));
assert.equal(process.env.XDG_DATA_HOME, join(lab, 'data'));
assert.notEqual(readFileSync(join(lab, 'netns'), 'utf8').trim(), process.env.NIKO_HTTP_HOST_NETNS);
const uuid = 'niko-ilha-runtime@local';
const dest = join(lab, 'data/gnome-shell/extensions', uuid);
const source = '/usr/share/niko/gnome/' + uuid;
for (const name of ['extension.js', 'metadata.json', 'current.json']) {
  assert.deepEqual(readFileSync(join(source, name)), readFileSync(join(lab, 'package', source.slice(1), name)));
}
const dbus = (destination, path, method, ...args) => execFileSync('gdbus', ['call', '--session', '--timeout', '3', '--dest', destination, '--object-path', path, '--method', method, ...args], {encoding: 'utf8'});
const shellOwner = () => dbus('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.GetNameOwner', 'org.gnome.Shell');
const owner = shellOwner();
const pid = dbus('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.GetConnectionUnixProcessID', 'org.gnome.Shell');
assert.equal(Number(pid.match(/(?:uint32 )?(\d+)/)[1]), Number(readFileSync(join(lab, 'shell.pid'), 'utf8')));
const native = (method, id) => dbus('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions.' + method, id);
assert.equal(native('EnableExtension', uuid).trim(), '(true,)');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const tree = () => Object.fromEntries(readdirSync(dest).sort().map(name => [name, createHash('sha256').update(readFileSync(join(dest, name))).digest('hex')]));
const token = 'fictitious-private-http-token';
const log = createWriteStream(join(lab, 'bridge.log'));
await once(log, 'open');
const bridge = spawn(join(lab, 'package/usr/lib/Niko/recursos/node'), [join(lab, 'package/usr/lib/Niko/recursos/ponte.mjs')], {
  env: {...process.env, NIKO_TOKEN: token, NIKO_PORTA: '47831', NIKO_PAI: String(process.pid)}, stdio: ['ignore', log, log],
});
const request = async (method = 'GET', suppliedToken = token, body) => {
  const response = await fetch('http://127.0.0.1:47831/ponte/ilha/gnome', {method, headers: {'x-niko': '1', 'x-niko-token': suppliedToken, 'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)});
  return {status: response.status, body: await response.json()};
};
try {
  let state;
  for (let i = 0; i < 100; i++) {
    if (bridge.exitCode !== null) throw Error('packaged bridge exited');
    try { state = await request(); if (state.body.estado === 'instalar') break; } catch {}
    await sleep(100);
  }
  assert.deepEqual(state, {status: 200, body: {estado: 'instalar'}});
  const before = tree();
  assert.equal((await request()).body.estado, 'instalar');
  assert.deepEqual(tree(), before, 'GET is readonly');
  assert.equal((await request('POST', 'incorrect-token', {confirmacao: 'ATIVAR_ILHA'})).status, 403);
  assert.equal((await request('POST', token, {confirmacao: 'NO'})).status, 400);
  assert.deepEqual(tree(), before, 'unauthorized POST does not write');
  assert.deepEqual(await request('POST', token, {confirmacao: 'ATIVAR_ILHA'}), {status: 200, body: {estado: 'ativa'}});
  assert.equal(shellOwner(), owner);
  const expected = JSON.parse(readFileSync(join(source, 'current.json'), 'utf8')).file;
  const revision = dbus('com.niko.Ilha.Integracao', '/com/niko/Ilha/Integracao', 'org.freedesktop.DBus.Properties.Get', 'com.niko.Ilha.Integracao', 'Revision');
  assert.ok(revision.includes(expected), revision);
  assert.equal((await request()).body.estado, 'ativa');
  assert.deepEqual(readFileSync(join(dest, expected)), readFileSync(join(source, expected)));
  writeFileSync(join(lab, 'result'), 'PASS: packaged HTTP bridge; real GNOME nested; readonly GET; denied POST; authenticated update; revision and Shell owner; isolated TCP/filesystem\n');
  console.log(readFileSync(join(lab, 'result'), 'utf8').trim());
} finally {
  if (bridge.exitCode === null && bridge.signalCode === null) { const ended = once(bridge, 'exit'); bridge.kill('SIGTERM'); await ended; }
  log.end();
}
