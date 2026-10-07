import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';

if(!process.env.NIKO_GMAIL_LAB){
 test('Gmail Linux usa navegador fictício em rede e D-Bus privados',{timeout:45000},async()=>{
  const lab=mkdtempSync(join(tmpdir(),'niko-gmail.'));
  for(const name of ['home','data/applications','config','runtime','cache'])mkdirSync(join(lab,name),{recursive:true,mode:0o700});
  writeFileSync(join(lab,'bus.conf'),`<busconfig><type>session</type><listen>unix:tmpdir=${lab}</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>`);
  writeFileSync(join(lab,'config/mimeapps.list'),'[Default Applications]\nx-scheme-handler/https=niko-fake-browser.desktop;\n');
  writeFileSync(join(lab,'data/applications/niko-fake-browser.desktop'),`[Desktop Entry]\nType=Application\nName=Niko browser fixture\nExec=${process.execPath} ${lab}/browser.mjs %u\nMimeType=x-scheme-handler/https;\nNoDisplay=true\n`);
  writeFileSync(join(lab,'browser.mjs'),`import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';const url=new URL(process.argv[2]);assert.equal(url.origin,'https://accounts.google.com');const callback=new URL(url.searchParams.get('redirect_uri'));assert.equal(callback.hostname,'127.0.0.1');callback.protocol='http:';assert.equal(url.searchParams.get('code_challenge_method'),'S256');process.on('uncaughtException',e=>writeFileSync(process.env.NIKO_GMAIL_LAB+'/browser-error',e.message));process.on('unhandledRejection',e=>writeFileSync(process.env.NIKO_GMAIL_LAB+'/browser-error',e.message));writeFileSync(process.env.NIKO_GMAIL_LAB+'/challenge',url.searchParams.get('code_challenge'));callback.searchParams.set('code','codigo-ficticio');callback.searchParams.set('state','estado-invalido');const wrong=await fetch(callback,{signal:AbortSignal.timeout(5000)});assert.equal(wrong.status,404);callback.searchParams.set('state',url.searchParams.get('state'));const good=await fetch(callback,{signal:AbortSignal.timeout(5000)});assert.equal(good.status,200);writeFileSync(process.env.NIKO_GMAIL_LAB+'/browser-pass','PASS');`);
  try {
   const child=spawn('unshare',['--user','--map-current-user','--keep-caps','--net','bash','-c','set -e; ip link set lo up; exec dbus-run-session --config-file="$NIKO_GMAIL_LAB/bus.conf" -- "$NIKO_GMAIL_NODE" "$NIKO_GMAIL_TEST"'],{env:{...process.env,NODE_TEST_CONTEXT:'',NIKO_GMAIL_LAB:lab,NIKO_GMAIL_NODE:process.execPath,NIKO_GMAIL_TEST:fileURLToPath(import.meta.url),HOME:join(lab,'home'),XDG_STATE_HOME:join(lab,'state'),XDG_DATA_HOME:join(lab,'data'),XDG_DATA_DIRS:join(lab,'data'),XDG_CONFIG_HOME:join(lab,'config'),XDG_RUNTIME_DIR:join(lab,'runtime'),XDG_CACHE_HOME:join(lab,'cache'),GSETTINGS_BACKEND:'keyfile',GIO_USE_VFS:'local',GIO_USE_PORTALS:'0',DISPLAY:'',WAYLAND_DISPLAY:''},stdio:['ignore','pipe','pipe']});
   let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);const [code]=await once(child,'exit');assert.equal(code,0,log);console.log(log.trim());
  }finally{rmSync(lab,{recursive:true,force:true});}
 });
}else{
 test('Gio real abre handler privado; PKCE/state/loopback e troca fictícia',{timeout:30000},async()=>{
  process.env.DBUS_SYSTEM_BUS_ADDRESS=process.env.DBUS_SESSION_BUS_ADDRESS;
  const lab=process.env.NIKO_GMAIL_LAB;
  assert.ok(lab.startsWith('/tmp/niko-gmail.'));assert.equal(process.env.HOME,lab+'/home');
  const originalFetch=globalThis.fetch;let tokenCalls=0;
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://oauth2.googleapis.com/token');tokenCalls++;
   const body=options.body;assert.equal(body.get('code'),'codigo-ficticio');assert.equal(body.get('client_secret'),'segredo-ficticio');
   assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),readFileSync(lab+'/challenge','utf8'));
   return new Response(JSON.stringify({refresh_token:'refresh-ficticio',access_token:'access-ficticio',expires_in:3600}),{status:200});
  };
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
  try {
   const {autorizarGmail}=await vite.ssrLoadModule('/servidor/gmail.ts');
   await assert.rejects(autorizarGmail('invalido','segredo-ficticio'),/cliente_id_invalido/);
   let result; try { result=await autorizarGmail('cliente-ficticio.apps.googleusercontent.com','segredo-ficticio',AbortSignal.timeout(15000)); } catch(error) { try { console.log(readFileSync(lab+'/browser-error','utf8')); } catch {} throw error; }
   assert.equal(result.refresh,'refresh-ficticio');assert.equal(tokenCalls,1);
   for(let n=0;n<50;n++){try{assert.equal(readFileSync(lab+'/browser-pass','utf8'),'PASS');break;}catch{await new Promise(r=>setTimeout(r,100));}}
   assert.equal(readFileSync(lab+'/browser-pass','utf8'),'PASS');
   console.log('PASS: abertura Gio nativa e callback local; Google e credenciais inteiramente fictícios');
  }finally{globalThis.fetch=originalFetch;await vite.close();}
 });
}
