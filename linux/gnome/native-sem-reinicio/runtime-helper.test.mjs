import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';

const lab=process.env.NIKO_GNOME_LAB;
const uuid='niko-ilha-runtime@local';
const dest=join(lab,'data/gnome-shell/extensions',uuid);
const origin=join(lab,'runtime-origin');
const call=(service,path,method,...args)=>execFileSync('gdbus',['call','--session','--timeout','3','--dest',service,'--object-path',path,'--method',method,...args],{encoding:'utf8'});
const dbus=(method,...args)=>call('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions.'+method,...args);
const owner=()=>call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus.GetNameOwner','org.gnome.Shell');
const status=()=>JSON.parse(execFileSync('gjs',['-c',`
const {Gio,GLib}=imports.gi;
const p=Gio.DBus.session.call_sync('com.niko.Ilha.Integracao','/com/niko/Ilha/Integracao','org.freedesktop.DBus.Properties','GetAll',new GLib.Variant('(s)',['com.niko.Ilha.Integracao']),new GLib.VariantType('(a{sv})'),Gio.DBusCallFlags.NO_AUTO_START,2000,null).deep_unpack()[0];
print(JSON.stringify(Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v.deep_unpack()]))));
`],{encoding:'utf8'}));
async function until(read,check){let value;for(let i=0;i<100;i++){try{value=read();if(check(value))return value;}catch{}await new Promise(r=>setTimeout(r,100));}assert.fail(JSON.stringify(value));}
const files=folder=>Object.fromEntries(readdirSync(folder).sort().map(name=>[name,readFileSync(join(folder,name),'utf8')]));

test('helper GNOME real atualiza payload e preserva sessão, manifesto e legado',{timeout:90000},async()=>{
 assert.ok(lab.startsWith('/tmp/niko-sem-reinicio.'));
 assert.equal(process.env.XDG_DATA_HOME,join(lab,'data'));
 if(process.env.NIKO_GNOME_MODE==='runtime-helper-clean') {
  const settings=()=>execFileSync('gsettings',['get','org.gnome.shell','enabled-extensions'],{encoding:'utf8'});
  const before=settings();
  const vite=await createServer({configFile:false,root:process.env.NIKO_GNOME_REPO,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
  try {
   const {integrarIlhaLinux}=await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
   const paths={origem:join(lab,'origem'),destino:dest,runtime:true};
   assert.equal((await integrarIlhaLinux('estado',paths)).estado,'canal_gnome');
   assert.equal((await integrarIlhaLinux('instalar',paths)).estado,'canal_gnome');
   assert.equal(existsSync(dest),false,'UUID desconhecido não copia extensão');
   assert.equal(settings(),before,'UUID desconhecido não muda enabled-extensions');
  } finally {await vite.close();}
  console.log('Clean startup unknown UUID: canal_gnome readonly; no copying or settings.');
  return;
 }
 const shellOwner=owner();
 const shellPid=readFileSync(join(lab,'shell.pid'),'utf8');
 if(process.env.NIKO_GNOME_COLLISION==='1') {
  const source=`import GLib from 'gi://GLib';
await new Promise(resolve=>GLib.timeout_add(GLib.PRIORITY_DEFAULT,1000,()=>{resolve();return GLib.SOURCE_REMOVE;}));
export default class Payload {enable(){GLib.file_set_contents(GLib.getenv('NIKO_GNOME_LAB')+'/collision-activated','FAIL');}disable(){}}`;
  const name='implementation-'+createHash('sha256').update(source).digest('hex')+'.js';
  writeFileSync(join(dest,name),source);writeFileSync(join(dest,'current.json'),JSON.stringify({file:name}));
  const contender=spawn('gjs',['-c',`const {Gio,GLib}=imports.gi; const loop=new GLib.MainLoop(null,false); Gio.bus_own_name(Gio.BusType.SESSION,'com.niko.Ilha.Integracao',Gio.BusNameOwnerFlags.NONE,null,()=>print('READY'),null);loop.run();`],{stdio:['ignore','pipe','pipe']});
  try {
   await new Promise((resolve,reject)=>{contender.stdout.on('data',b=>{if(b.toString().includes('READY'))resolve();});contender.once('exit',()=>reject(Error('contender ended')));});
   const before=files(dest);
   const vite=await createServer({configFile:false,root:process.env.NIKO_GNOME_REPO,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
   try {
    const {integrarIlhaLinux}=await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
    for(const action of ['estado','instalar']) {
     assert.deepEqual(await integrarIlhaLinux(action,{origem:join(lab,'origem'),destino:dest,runtime:true}),{estado:'erro',motivo:'owner_invalido'});
     assert.deepEqual(files(dest),before,'owner inválido não grava payload/manifesto');
    }
   }finally{await vite.close();}
   assert.equal(dbus('EnableExtension',uuid).trim(),'(true,)');
   await new Promise(r=>setTimeout(r,1800));
   assert.equal(existsSync(join(lab,'collision-activated')),false,'perda nome durante import impede enable payload');
   const direct=execFileSync('gjs',['-c',`const {Gio,GLib}=imports.gi;const p=Gio.DBus.session.call_sync('org.gnome.Shell','/com/niko/Ilha/Integracao','org.freedesktop.DBus.Properties','GetAll',new GLib.Variant('(s)',['com.niko.Ilha.Integracao']),new GLib.VariantType('(a{sv})'),Gio.DBusCallFlags.NO_AUTO_START,2000,null).deep_unpack()[0];print(JSON.stringify(Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v.deep_unpack()]))));`],{encoding:'utf8'});
   assert.equal(JSON.parse(direct).State,'error');assert.equal(JSON.parse(direct).LastError,'bus_unavailable');
   dbus('DisableExtension',uuid);
   assert.equal(owner(),shellOwner);
   console.log('Collision real: owner inválido readonly; name lost while import pending does not enable payload.');
  }finally{contender.kill();await new Promise(r=>contender.once('exit',r));}
  return;
 }
 const legacy=join(lab,'data/gnome-shell/extensions/niko-ilha@local');
 const legacyBefore=files(legacy);
 assert.equal(dbus('EnableExtension','niko-ilha@local').trim(),'(true,)');
 await until(()=>dbus('GetExtensionInfo','niko-ilha@local'),v=>/'state': <1/.test(v));
 mkdirSync(origin);
 writeFileSync(join(origin,'metadata.json'),readFileSync(join(dest,'metadata.json')));
 const metadataInstalled=JSON.parse(readFileSync(join(dest,'metadata.json'),'utf8'));
 writeFileSync(join(dest,'metadata.json'),JSON.stringify({...metadataInstalled,version:2,description:'channel server normalized metadata'}));
 // Entry point is intentionally unchanged from startup: this tests known UUID lifecycle, not first installation.
 writeFileSync(join(origin,'extension.js'),readFileSync(join(dest,'extension.js')));
 const original=readFileSync(join(lab,'origem/extension.js'),'utf8');
 const payload=source=>{const name='implementation-'+createHash('sha256').update(source).digest('hex')+'.js';writeFileSync(join(origin,name),source);writeFileSync(join(origin,'current.json'),JSON.stringify({file:name}));return name;};
 const a=payload(original);
 const vite=await createServer({configFile:false,root:process.env.NIKO_GNOME_REPO,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try{
  const {integrarIlhaLinux}=await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
  const paths={origem:origin,destino:dest,runtime:true};
  const beforeRead=files(dest);
  await integrarIlhaLinux('estado',paths);
  assert.deepEqual(files(dest),beforeRead,'estado não grava arquivos');
  assert.match(dbus('GetExtensionInfo','niko-ilha@local'),/'state': <1/,'GET não desabilita legado');
  assert.equal((await integrarIlhaLinux('instalar',paths)).estado,'ativa');
  await until(status,v=>v.State==='active'&&v.Revision===a);
  assert.match(dbus('GetExtensionInfo','niko-ilha@local'),/'state': <2/,'helper desabilita legado antes runtime');
  const stable=readFileSync(join(dest,'extension.js'),'utf8');
  const b=payload(original.replace('enable() {',"enable() { console.log('NIKO_HELPER_B_EXECUTED');"));
  assert.equal((await integrarIlhaLinux('estado',paths)).estado,'instalar');
  assert.equal((await integrarIlhaLinux('instalar',paths)).estado,'ativa');
  await until(status,v=>v.State==='active'&&v.Revision===b);
  assert.match(readFileSync(join(lab,'shell.log'),'utf8'),/NIKO_HELPER_B_EXECUTED/);
  assert.equal(readFileSync(join(dest,'extension.js'),'utf8'),stable);
  const manifest=readFileSync(join(dest,'current.json'),'utf8');
  if(process.env.NIKO_GNOME_CRASH==='1') {
   for(const point of ["journal","manifest"]) for(const legacyActive of [false,true]) {
    dbus('DisableExtension',uuid);
    dbus(legacyActive?'EnableExtension':'DisableExtension','niko-ilha@local');
    if(!legacyActive) {dbus('EnableExtension',uuid);await until(status,v=>v.State==='active'&&v.Revision===b);}
    const delayed=payload(original.replace('export default class ', "await new Promise(resolve=>GLib.timeout_add(GLib.PRIORITY_DEFAULT,12000,()=>{resolve();return GLib.SOURCE_REMOVE;}));\nexport default class ")+`\n// crash case ${point}-${legacyActive}`);
    const script=join(lab,'crash-child.mjs');
    writeFileSync(script, `import {createServer} from '${process.env.NIKO_GNOME_REPO}/node_modules/vite/dist/node/index.js';
const vite=await createServer({configFile:false,root:process.argv[2],server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
const {integrarIlhaLinux}=await vite.ssrLoadModule('/servidor/gnomeIlhaLinux.ts');
await integrarIlhaLinux('instalar',{origem:process.argv[3],destino:process.argv[4],runtime:true});await vite.close();`);
    const child=spawn(process.execPath,[script,process.env.NIKO_GNOME_REPO,origin,dest],{detached:true,stdio:['ignore','pipe','pipe']});
    let ended=false;child.once('exit',()=>{ended=true;});
    let currentBeforeKill;
    try {
    if(point==='journal') await until(()=>existsSync(join(dest,'niko-update-journal.json')),v=>v);
    else await until(()=>JSON.parse(readFileSync(join(dest,'current.json'),'utf8')),v=>v.file===delayed);
    currentBeforeKill=JSON.parse(readFileSync(join(dest,'current.json'),'utf8')).file;
    if(point==='journal') assert.equal(currentBeforeKill,b,'SIGKILL após journal antes trocar manifesto');
    assert.equal(ended,false,'helper child ainda em atualização antes SIGKILL');
    if(point==='manifest') {
      assert.deepEqual(await integrarIlhaLinux('instalar',paths),{estado:'erro',motivo:'atualizacao_em_andamento'});
      assert.equal(JSON.parse(readFileSync(join(dest,'current.json'),'utf8')).file,delayed,'writer vivo não sofre recovery concorrente');
    }
    const exited=new Promise(resolve=>child.once('exit',resolve));
    process.kill(-child.pid,'SIGKILL');await exited;
    } finally {if(!ended){const stopped=new Promise(r=>child.once('exit',r));try{process.kill(-child.pid,'SIGKILL');}catch{}await stopped;}}
    const journalBefore=readFileSync(join(dest,'niko-update-journal.json'),'utf8');
    assert.deepEqual(await integrarIlhaLinux('estado',paths),{estado:'recuperar',motivo:'recuperacao_pendente'});
    assert.equal(readFileSync(join(dest,'niko-update-journal.json'),'utf8'),journalBefore);
    const journalParsed=JSON.parse(journalBefore);
    writeFileSync(join(dest,'niko-update-journal.json'),JSON.stringify({...journalParsed,owner:':9999.9999'}));
    assert.deepEqual(await integrarIlhaLinux('instalar',paths),{estado:'erro',motivo:'recuperacao_contexto_alterado'});
    assert.equal(JSON.parse(readFileSync(join(dest,'current.json'),'utf8')).file,currentBeforeKill,'contexto alterado não restaura manifesto');
    writeFileSync(join(dest,'niko-update-journal.json'),JSON.stringify({...journalParsed,busId:'0'.repeat(32)}));
    assert.deepEqual(await integrarIlhaLinux('instalar',paths),{estado:'erro',motivo:'recuperacao_contexto_alterado'});
    assert.equal(JSON.parse(readFileSync(join(dest,'current.json'),'utf8')).file,currentBeforeKill);
    writeFileSync(join(dest,'niko-update-journal.json'),JSON.stringify({...journalParsed,bootstrapHash:'0'.repeat(64)}));
    assert.deepEqual(await integrarIlhaLinux('instalar',paths),{estado:'erro',motivo:'falha_recuperacao'});
    assert.equal(JSON.parse(readFileSync(join(dest,'current.json'),'utf8')).file,currentBeforeKill,'hash inválido não restaura manifesto');
    writeFileSync(join(dest,'niko-update-journal.json'),journalBefore);
    assert.deepEqual(await integrarIlhaLinux('instalar',paths),{estado:'recuperada'});
    assert.equal(existsSync(join(dest,'niko-update-journal.json')),false);
    assert.equal(readFileSync(join(dest,'current.json'),'utf8'),manifest);
    assert.match(dbus('GetExtensionInfo','niko-ilha@local'),new RegExp("'state': <"+(legacyActive?1:2)));
    assert.match(dbus('GetExtensionInfo',uuid),new RegExp("'state': <"+(legacyActive?2:1)));
    if(!legacyActive)assert.equal(status().Revision,b);
   }
   console.log('SIGKILL real child após journal e após manifesto: GET readonly e POST recuperação em dois estados originais.');
   return;
  }

  payload("export default class Broken { enable() { throw Error('fictitious payload'); } disable() {} }");
  const failed=await integrarIlhaLinux('instalar',paths);
  assert.notEqual(failed.estado,'ativa','erro payload não anuncia ativa');
  assert.equal(readFileSync(join(dest,'current.json'),'utf8'),manifest,'falha restaura manifesto B');
  assert.equal(status().Revision,b);
  for(const legacyActive of [true,false]) {
   assert.equal(dbus('DisableExtension',uuid).trim(),'(true,)');
   await until(()=>dbus('GetExtensionInfo',uuid),v=>/'state': <2/.test(v));
   dbus(legacyActive?'EnableExtension':'DisableExtension','niko-ilha@local');
   await until(()=>dbus('GetExtensionInfo','niko-ilha@local'),v=>new RegExp("'state': <"+(legacyActive?1:2)).test(v));
   const result=await integrarIlhaLinux('instalar',paths);
   assert.equal(result.estado,'erro');
   assert.equal(result.motivo,'atualizacao_revertida');
   assert.match(dbus('GetExtensionInfo',uuid),/'state': <2/,'runtime originalmente desabilitado continua desabilitado');
   assert.match(dbus('GetExtensionInfo','niko-ilha@local'),new RegExp("'state': <"+(legacyActive?1:2)),'legado recupera estado original');
   assert.equal(readFileSync(join(dest,'current.json'),'utf8'),manifest);
  }
  assert.deepEqual(files(legacy),legacyBefore,'arquivo legado não alterado');
  assert.equal(owner(),shellOwner);
  assert.equal(readFileSync(join(lab,'shell.pid'),'utf8'),shellPid);
  console.log('Known UUID lifecycle only: A→B, failed payload rollback, readonly, same compositor, legacy files intact.');
 }finally{await vite.close();}
});
