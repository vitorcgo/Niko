import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Verifica o contrato do laboratório; execução com Mutter continua sendo teste separado.
test('laboratório GNOME usa bus privado e dados exclusivos, sem iniciar serviços', () => {
    const caminho = fileURLToPath(new URL('./testar-isolado.sh', import.meta.url));
    const fonte = readFileSync(caminho, 'utf8');
    const sintaxe = spawnSync('bash', ['-n', caminho], {encoding: 'utf8'});
    assert.equal(sintaxe.status, 0, sintaxe.stderr);
    assert.match(fonte, /exec dbus-run-session --config-file="\$NIKO_LAB\/bus.conf" -- bash -c/);
    assert.doesNotMatch(fonte, /<service(?:dir|helper)>/);
    assert.match(fonte, /unset APPDATA/);
    assert.match(fonte, /XDG_CACHE_HOME="\$NIKO_LAB\/cache"/);
    assert.match(fonte, /XDG_STATE_HOME="\$NIKO_LAB\/state"/);
    assert.match(fonte, /niko_lab=\$\(mktemp -d /);
    assert.match(fonte, /GSETTINGS_BACKEND=keyfile/);
    assert.match(fonte, /XDG_CONFIG_HOME="\$NIKO_LAB\/config"/);
    assert.doesNotMatch(fonte, /\/tmp\/niko-linux-desktop/);
    const inicioCliente = fonte.split('\n').find(linha => linha.includes('"$NIKO_BINARY" >'));
    assert.ok(inicioCliente, 'comando do cliente encontrado');
    assert.match(inicioCliente, /XDG_DATA_HOME="\$NIKO_LAB\/[^"\n]+"/);
    assert.match(fonte, /--nested --wayland --no-x11/);
    assert.match(fonte, /kill -TERM "\$niko_client"/);
    assert.match(fonte, /kill -TERM "\$niko_shell"/);
});
