import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'vite';

test('PipeWire nativo privado: dispositivos virtuais, volume e mudo, sem áudio pessoal',{timeout:30000},async()=>{
 const lab=mkdtempSync(join(tmpdir(),'niko-pipewire.'));
 for(const name of ['home','runtime','config','data','cache','state'])mkdirSync(join(lab,name),{mode:0o700});
 const env={...process.env,HOME:join(lab,'home'),XDG_STATE_HOME:join(lab,'state'),XDG_CACHE_HOME:join(lab,'cache'),XDG_DATA_HOME:join(lab,'data'),XDG_RUNTIME_DIR:join(lab,'runtime'),XDG_CONFIG_HOME:join(lab,'config'),PIPEWIRE_RUNTIME_DIR:join(lab,'runtime'),PIPEWIRE_REMOTE:'niko-test',DBUS_SESSION_BUS_ADDRESS:'unix:path='+join(lab,'bus-ausente'),DBUS_SYSTEM_BUS_ADDRESS:'unix:path='+join(lab,'bus-ausente')};
 writeFileSync(join(lab,'pipewire.conf'),readFileSync('linux/controles/pipewire.conf','utf8').replace('NIKO_FIXTURE_PID',String(process.pid)));
 const pipewire=spawn('/usr/bin/pipewire',['-c',join(lab,'pipewire.conf')],{env,stdio:['ignore','ignore','pipe']});let errors='';pipewire.stderr.on('data',d=>errors+=d);
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try {
  let ready=false;
  for(let n=0;n<50&&!ready;n++){try{execFileSync('/usr/bin/pw-dump',['-N'],{env,stdio:['ignore','pipe','pipe'],timeout:500});ready=true;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,errors);
  for(const [key,name] of [['default.audio.sink','niko-test-sink'],['default.audio.source','niko-test-source']])execFileSync('/usr/bin/pw-metadata',['-n','default','0',key,JSON.stringify({name}),'Spa:String:JSON'],{env,stdio:['ignore','pipe','pipe']});
  const {pedirSistemaLinux}=await vite.ssrLoadModule('/servidor/sistemaLinux.ts');
  const execute=async(file,args)=>execFileSync(file,args,{env,encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
  let audio=await pedirSistemaLinux({acao:'audio'},execute);assert.ok(audio.saida);assert.ok(audio.entrada);
  await pedirSistemaLinux({acao:'volume',fluxo:0,valor:35},execute);audio=await pedirSistemaLinux({acao:'audio'},execute);assert.equal(audio.saida.volume,35);
  await pedirSistemaLinux({acao:'mudo',fluxo:0,mudo:true},execute);audio=await pedirSistemaLinux({acao:'audio'},execute);assert.equal(audio.saida.mudo,true);
  await pedirSistemaLinux({acao:'mudo',fluxo:0,mudo:false},execute);audio=await pedirSistemaLinux({acao:'audio'},execute);assert.equal(audio.saida.mudo,false);
  assert.equal(audio.sessoes.length,1);assert.equal(audio.sessoes[0].pid,process.pid);
  await pedirSistemaLinux({acao:'sessao',pids:[process.pid],volume:25,mudo:1},execute);
  audio=await pedirSistemaLinux({acao:'audio'},execute);assert.equal(audio.sessoes[0].volume,25);assert.equal(audio.sessoes[0].mudo,true);
console.log('PASS: wpctl/pw-dump/PipeWire nativos somente em null sinks privados; nenhum dispositivo físico ou amostra de mídia');
 }finally{pipewire.kill('SIGTERM');await once(pipewire,'exit');await vite.close();rmSync(lab,{recursive:true,force:true});}
});
