import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('laboratório recusa iniciar app se namespace não estiver disponível', () => {
    const fake = mkdtempSync(join(tmpdir(), 'niko-netns-recusa-'));
    let lab;
    try {
        // Contrato de falha: não extrai pacote nem cria compositor/network real.
        writeFileSync(join(fake, 'dpkg-deb'), '#!/bin/sh\nmkdir -p "$3/usr/bin" "$3/usr/lib/Niko/recursos"\ntouch "$3/usr/bin/niko" "$3/usr/lib/Niko/recursos/ponte.mjs"\n', {mode: 0o700});
        writeFileSync(join(fake, 'unshare'), '#!/bin/sh\nexit 77\n', {mode: 0o700});
        const result = spawnSync('bash', [resolve('linux/gnome/native-tauri/run.sh')], {
            env: {...process.env, PATH: fake + ':' + process.env.PATH, WAYLAND_DISPLAY: '/tmp/fake-wayland-unused'},
            encoding: 'utf8', timeout: 10000,
        });
        assert.ifError(result.error);
        lab = result.stdout.match(/Evidence directory: (\/tmp\/niko-tauri\.[^\s]+)/)?.[1];
        assert.ok(lab);
        assert.equal(result.status, 77);
        assert.equal(existsSync(join(lab, 'app.pid')), false);
        assert.equal(existsSync(join(lab, 'bus-address')), false);
        assert.equal(existsSync(join(lab, 'netns')), false);
    } finally {
        rmSync(fake, {recursive: true, force: true});
        if (lab) rmSync(lab, {recursive: true, force: true});
    }
});
