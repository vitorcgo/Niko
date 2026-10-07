import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

if(!process.env.NIKO_CONSUMO_LAB){
 test('consumo Linux somente em HOME fictício',{timeout:20000},async()=>{
  const lab=mkdtempSync(join(tmpdir(),'niko-consumo.'));mkdirSync(join(lab,'home'),{mode:0o700});
  try{
   const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,NODE_TEST_CONTEXT:'',HOME:join(lab,'home'),XDG_RUNTIME_DIR:join(lab,'runtime'),XDG_STATE_HOME:join(lab,'state'),XDG_CACHE_HOME:join(lab,'cache'),XDG_DATA_HOME:join(lab,'data'),XDG_CONFIG_HOME:join(lab,'config'),DBUS_SESSION_BUS_ADDRESS:'unix:path='+join(lab,'bus-ausente'),DBUS_SYSTEM_BUS_ADDRESS:'unix:path='+join(lab,'bus-ausente'),DISPLAY:'',WAYLAND_DISPLAY:'',NIKO_CONSUMO_LAB:lab},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);const [code]=await once(child,'exit');assert.equal(code,0,log);console.log(log.trim());
  }finally{rmSync(lab,{recursive:true,force:true});}
 });
}else{
 test('leitura portátil, cache e sessão deduplicada; APIs remotas simuladas',async()=>{
  const home=join(process.env.NIKO_CONSUMO_LAB,'home');assert.equal(process.env.HOME,home);
  for(const dir of ['.claude/projects/-tmp-projeto','.codex'])mkdirSync(join(home,dir),{recursive:true,mode:0o700});
  writeFileSync(join(home,'.claude/.credentials.json'),JSON.stringify({claudeAiOauth:{accessToken:'token-ficticio-claude',subscriptionType:'fixture'}}));
  writeFileSync(join(home,'.codex/auth.json'),JSON.stringify({tokens:{access_token:'token-ficticio-codex',account_id:'conta-ficticia'}}));
  const record={cwd:'/tmp/projeto-ficticio',timestamp:'2026-10-07T12:00:00Z',message:{id:'mensagem-ficticia',model:'modelo-ficticio',usage:{input_tokens:100,output_tokens:20,cache_creation_input_tokens:30,cache_read_input_tokens:40}}};
  writeFileSync(join(home,'.claude/projects/-tmp-projeto/sessao.jsonl'),JSON.stringify(record)+'\n'+JSON.stringify(record)+'\n');
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;if(url==='https://api.anthropic.com/api/oauth/usage'){assert.equal(options.headers.authorization,'Bearer token-ficticio-claude');return new Response(JSON.stringify({five_hour:{utilization:85},seven_day:{utilization:25}}));}assert.equal(url,'https://chatgpt.com/backend-api/wham/usage');assert.equal(options.headers.authorization,'Bearer token-ficticio-codex');return new Response(JSON.stringify({plan_type:'fixture',rate_limit:{primary_window:{used_percent:90,reset_after_seconds:100},secondary_window:{used_percent:10}}}));};
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
  try{
   const {lerConsumo}=await vite.ssrLoadModule('/servidor/consumo.ts');
   const [a,b]=await Promise.all([lerConsumo(true),lerConsumo(true)]);assert.equal(a,b);assert.equal(calls,2);
   assert.equal(a.ferramentas[0].janelas[0].usado,85);assert.equal(a.ferramentas[1].janelas[0].usado,90);
   assert.equal(a.sessao.projeto,'/tmp/projeto-ficticio');assert.equal(a.sessao.mensagens,1);assert.equal(a.sessao.entrada,100);assert.equal(a.sessao.cacheLido,40);
   assert.equal(await lerConsumo(),a);assert.equal(calls,2);
   console.log('PASS: consumo Linux com credenciais e sessões fictícias; nenhuma API real consultada');
  }finally{globalThis.fetch=original;await vite.close();}
 });
}
