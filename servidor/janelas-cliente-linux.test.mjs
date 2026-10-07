import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('cliente reiniciado ignora saída e exit tardios do GJS anterior (processos simulados)',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'niko-janelas-cliente.'));
 globalThis.__nikoWindowWorkers=[];
 const fake=`import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
 export function execFile(){throw Error('não deve executar ícones');}
 export function spawn(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new EventEmitter();child.stdin.write=text=>{child.id=JSON.parse(text).id;};child.kill=()=>{child.killed=true;};globalThis.__nikoWindowWorkers.push(child);return child;}`;
 let api;
 try{
  const result=await build({configFile:false,publicDir:false,logLevel:'silent',ssr:{noExternal:true},build:{ssr:'servidor/janelasLinux.ts',write:false,minify:false,rollupOptions:{output:{format:'es'}}},plugins:[{name:'processos-ficticios',enforce:'pre',resolveId(id){if(id==='node:child_process')return '\0fake-child';},load(id){if(id==='\0fake-child')return fake;}}]});
  const path=join(folder,'cliente.mjs');writeFileSync(path,result.output[0].code);api=await import(pathToFileURL(path));
  const first=api.pedirJanelasLinux('estado'),old=globalThis.__nikoWindowWorkers[0];
  old.stdout.write(JSON.stringify({id:old.id,cobre:false})+'\n');await first;api.encerrarJanelasLinux();
  const next=api.pedirJanelasLinux('estado'),current=globalThis.__nikoWindowWorkers[1];
  old.stdout.write('resposta antiga inválida\n');old.emit('exit',0);
  assert.equal(current.killed,undefined);current.stdout.write(JSON.stringify({id:current.id,cobre:true})+'\n');
  assert.deepEqual(await next,{cobre:true});
 }finally{api?.encerrarJanelasLinux();delete globalThis.__nikoWindowWorkers;rmSync(folder,{recursive:true,force:true});}
});
