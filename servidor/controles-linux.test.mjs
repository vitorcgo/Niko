import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

if(!process.env.NIKO_CONTROLES_LAB){
 test('controles Linux em HOME e D-Bus privados',{timeout:60000},async()=>{
  const lab=mkdtempSync(join(tmpdir(),'niko-controles.'));
  for(const name of ['home','data','config','cache','runtime','state'])mkdirSync(join(lab,name),{mode:0o700});
  writeFileSync(join(lab,'bus.conf'),`<busconfig><type>session</type><listen>unix:tmpdir=${lab}</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>`);
  try {
   const child=spawn('dbus-run-session',['--config-file='+join(lab,'bus.conf'),'--',process.execPath,fileURLToPath(import.meta.url)],{env:{...process.env,NODE_TEST_CONTEXT:'',NIKO_CONTROLES_LAB:lab,HOME:join(lab,'home'),XDG_STATE_HOME:join(lab,'state'),XDG_DATA_HOME:join(lab,'data'),XDG_CONFIG_HOME:join(lab,'config'),XDG_CACHE_HOME:join(lab,'cache'),XDG_RUNTIME_DIR:join(lab,'runtime'),GSETTINGS_BACKEND:'keyfile',DISPLAY:'',WAYLAND_DISPLAY:'',GIO_USE_VFS:'local'},stdio:['ignore','pipe','pipe']});
   let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);
   const [code]=await once(child,'exit');assert.equal(code,0,log);console.log(log.trim());
  } finally {rmSync(lab,{recursive:true,force:true});}
 });
}else{
 test('Gio nativo com UPower/NM/BlueZ/logind fictícios; PipeWire simulado',{timeout:50000},async()=>{
  const lab=process.env.NIKO_CONTROLES_LAB;process.env.DBUS_SYSTEM_BUS_ADDRESS=process.env.DBUS_SESSION_BUS_ADDRESS;
  const fake=spawn('/usr/bin/gjs',['linux/controles/servicos-privados.js'],{env:process.env,stdio:['ignore','pipe','pipe']});
  let errors='';fake.stderr.on('data',d=>errors+=d);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
  try{
   await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(errors||'private service timeout')),5000);fake.stdout.on('data',d=>{if(String(d).includes('READY')){clearTimeout(t);resolve();}});});
   const {pedirSistemaLinux}=await vite.ssrLoadModule('/servidor/sistemaLinux.ts');
   const {estadoDoSistema,definirBrilho,definirRadio,conectarRede,desconectarRede,esquecerRede,listarRedes,listarBluetooth}=await vite.ssrLoadModule('/servidor/sistema.ts');
   const {agirNaEnergia,abrirDaBandeja}=await vite.ssrLoadModule('/servidor/controleRapido.ts');
   assert.deepEqual(await pedirSistemaLinux({acao:'tipo'}),{notebook:true,bateria:true});
   const state=await estadoDoSistema();assert.equal(state.bateria.nivel,84);assert.equal(state.bateria.minutos,120);assert.equal(state.wifi.sinal,72);assert.equal(state.brilho,60);assert.equal(state.radios.Bluetooth,true);
   const networks=await listarRedes();assert.equal(networks.redes[0].salva,true);assert.equal(networks.redes[0].segura,true);
   assert.equal((await listarBluetooth()).aparelhos[0].nome,'Fone ficticio');
   await definirBrilho({nivel:150});assert.equal((await estadoDoSistema()).brilho,100);
   await definirRadio({tipo:'Bluetooth',ligado:false});assert.equal((await estadoDoSistema()).radios.Bluetooth,false);
   await definirRadio({tipo:'WiFi',ligado:false});assert.equal((await estadoDoSistema()).radios.WiFi,false);
   await conectarRede({ssid:'Rede ficticia',senha:'senha-ficticia'});await conectarRede({ssid:'Rede ficticia'});
   await desconectarRede();await esquecerRede({ssid:'Rede ficticia'});
   assert.throws(()=>agirNaEnergia({tipo:'reiniciar',confirmacao:'errado'}),/confirmacao_invalida/);
   for(const tipo of ['bloquear','suspender','reiniciar','desligar'])await agirNaEnergia({tipo,confirmacao:'CONFIRMADO'});
   const tray=await pedirSistemaLinux({acao:'bandeja'});assert.equal(tray.itens[0].nome,'Bandeja ficticia');assert.ok(tray.itens[0].icone.startsWith('data:image/png;base64,'),'IconPixmap SNI convertido nativamente');
   await abrirDaBandeja({caminho:tray.itens[0].caminho});
   await assert.rejects(abrirDaBandeja({caminho:'org.niko.Outro/StatusNotifierItem'}),/valor_invalido/);
   const calls=JSON.parse(readFileSync(join(lab,'calls.json'),'utf8'));for(const expected of ['add','activate','disconnect','delete-fictitious','Lock','Suspend','Reboot','PowerOff','tray-activate'])assert.ok(calls.includes(expected));
   const executed=[];
   const mock=async(file,args,input)=>{executed.push([file,args,input]);if(file.endsWith('wpctl')&&args[0]==='get-volume')return 'Volume: 0.42 [MUTED]';if(file.endsWith('pw-dump'))return JSON.stringify([{id:7,type:'PipeWire:Interface:Node',info:{state:'running',props:{'media.class':'Stream/Output/Audio','application.process.id':123,'application.name':'Som ficticio'}}}]);return '';};
   const audio=await pedirSistemaLinux({acao:'audio'},mock);assert.equal(audio.saida.volume,42);assert.equal(audio.saida.mudo,true);assert.equal(audio.sessoes[0].pid,123);
   await pedirSistemaLinux({acao:'volume',fluxo:0,valor:150},mock);assert.deepEqual(executed.at(-1)[1],['set-volume','@DEFAULT_AUDIO_SINK@','100%']);
   await pedirSistemaLinux({acao:'sessao',pids:[123],volume:35,mudo:0},mock);assert.deepEqual(executed.at(-1)[1],['set-mute','7','0']);
   await assert.rejects(pedirSistemaLinux({acao:'sessao',pids:[0],volume:35,mudo:0},mock),/valor_invalido/);
   await assert.rejects(pedirSistemaLinux({acao:'nao_existe'},mock),/acao_indisponivel/);
   console.log('PASS: APIs Gio reais em serviço privado fictício; nenhum controle executado em hardware ou sessão pessoal');
  }finally{fake.kill('SIGTERM');await once(fake,'exit');await vite.close();}
 });
}
