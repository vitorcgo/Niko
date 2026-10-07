import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepararRuntime, UUID_RUNTIME } from './preparar-gnome-runtime.mjs';

test('runtime usa loader e implementação atuais; rebuild remove revisões obsoletas', () => {
  const destino = mkdtempSync(join(tmpdir(), 'niko-runtime-build-'));
  try {
    const { file } = prepararRuntime(undefined, destino);
    const source = readFileSync('linux/gnome/niko-ilha@local/extension.js');
    assert.equal(file, `implementation-${createHash('sha256').update(source).digest('hex')}.js`);
    assert.deepEqual(readFileSync(join(destino, file)), source);
    assert.deepEqual(readFileSync(join(destino, 'extension.js')), readFileSync('linux/gnome/candidato-sem-reinicio/extension.js'));
    assert.deepEqual(JSON.parse(readFileSync(join(destino, 'current.json'))), { file });
    const metadata = JSON.parse(readFileSync(join(destino, 'metadata.json')));
    assert.equal(metadata.uuid, UUID_RUNTIME);
    assert.equal(metadata.version, 1);
    assert.deepEqual(metadata['shell-version'], ['46']);
    writeFileSync(join(destino, 'implementation-antiga.js'), 'obsolete');
    prepararRuntime(undefined, destino);
    assert.deepEqual(readdirSync(destino).sort(), ['current.json', 'extension.js', file, 'metadata.json'].sort());
  } finally { rmSync(destino, { recursive: true, force: true }); }
});
