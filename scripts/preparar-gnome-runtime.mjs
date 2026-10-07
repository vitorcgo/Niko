import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UUID_RUNTIME = 'niko-ilha-runtime@local';
export function prepararRuntime(raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..'), destino = join(raiz, 'linux/gnome/runtime-build', UUID_RUNTIME)) {
  const implementation = readFileSync(join(raiz, 'linux/gnome/niko-ilha@local/extension.js'));
  const revision = createHash('sha256').update(implementation).digest('hex');
  const file = `implementation-${revision}.js`;
  mkdirSync(destino, { recursive: true });
  for (const antigo of readdirSync(destino)) rmSync(join(destino, antigo), { recursive: true, force: true });
  writeFileSync(join(destino, 'extension.js'), readFileSync(join(raiz, 'linux/gnome/candidato-sem-reinicio/extension.js')));
  writeFileSync(join(destino, file), implementation);
  writeFileSync(join(destino, 'metadata.json'), JSON.stringify({ uuid: UUID_RUNTIME, name: 'Niko — ilha experimental', description: 'Runtime versionado da ilha do Niko.', 'shell-version': ['46'], version: 1 }, null, 2) + '\n');
  writeFileSync(join(destino, 'current.json'), JSON.stringify({ file }) + '\n');
  return { destino, file };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(prepararRuntime());
