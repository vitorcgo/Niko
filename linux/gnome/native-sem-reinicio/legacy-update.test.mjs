import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

test('GNOME real: legado com painel carregado atualiza arquivos e mantém sessão', async () => {
 const lab=process.env.NIKO_GNOME_LAB;
 assert.ok(lab?.startsWith('/tmp/niko-sem-reinicio.'));
 assert.equal(process.env.HOME, lab+'/home');
 assert.equal(process.env.DBUS_SYSTEM_BUS_ADDRESS, process.env.DBUS_SESSION_BUS_ADDRESS);
 for(let n=0;n<50&&!existsSync(lab+'/old-loaded');n++) await new Promise(r=>setTimeout(r,100));
 assert.ok(existsSync(lab+'/old-loaded'),'painel fictício carregado pelo GNOME real');
 const dest=lab+'/data/gnome-shell/extensions/niko-ilha@local';
 const old=readFileSync(dest+'/extension.js','utf8');
 const owner=()=>execFileSync('gdbus',['call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.GetNameOwner','org.gnome.Shell'],{encoding:'utf8'});
 const before=owner();
 const vite=await createServer({configFile:false,root:process.env.NIKO_GNOME_REPO,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try {
  const {integrarIlhaLinux}=await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
  const paths={runtime:true,origem:lab+'/source/niko-ilha-runtime@local',destino:lab+'/data/gnome-shell/extensions/niko-ilha-runtime@local'};
  assert.equal((await integrarIlhaLinux('estado',paths)).estado,'instalar');
  assert.equal(readFileSync(dest+'/extension.js','utf8'),old);
  assert.equal((await integrarIlhaLinux('instalar',paths)).estado,'nova_sessao');
  assert.equal(readFileSync(dest+'/extension.js','utf8'),readFileSync(lab+'/source/niko-ilha@local/extension.js','utf8'));
  assert.equal((await integrarIlhaLinux('estado',paths)).estado,'nova_sessao');
  assert.equal(owner(),before,'compositor não reiniciado');
  const backups=lab+'/data/gnome-shell/niko-backups-extensao';
  assert.equal(readFileSync(backups+'/'+readdirSync(backups)[0]+'/extension.js','utf8'),old);
  assert.equal(existsSync(paths.destino),false);
  console.log('PASS: painel legado real, atualização com backup, nova_sessao explícita, compositor preservado');
 } finally {await vite.close();}
});
