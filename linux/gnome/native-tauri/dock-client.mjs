import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, readlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';

const lab = process.env.NIKO_NATIVE_LAB;
assert.ok(lab?.startsWith('/tmp/niko-tauri.'));
assert.equal(process.env.HOME, `${lab}/home`);
assert.ok(process.env.DBUS_SESSION_BUS_ADDRESS?.includes(lab), 'somente D-Bus privado');
const fixturePid = Number(readFileSync(`${lab}/fixture.pid`, 'utf8'));
const vite = await createServer({root: process.env.NIKO_NATIVE_REPO, configFile: false,
  server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', optimizeDeps: {noDiscovery: true}});
let closeClient = () => {};
try {
  const {pedirJanelasLinux: outsider, encerrarJanelasLinux} = await vite.ssrLoadModule('/servidor/janelasLinux.ts');
  closeClient = encerrarJanelasLinux;
  const outsideA = outsider('listar'), outsideB = outsider('listar');
  assert.equal(outsideA, outsideB, 'consultas simultâneas reutilizam o mesmo processo');
  await assert.rejects(outsideA, /acesso_janelas_recusado/, 'cliente fora da árvore do Niko recusado');
  const appPid = Number(readFileSync(`${lab}/app.pid`, 'utf8'));
  const pending = [appPid]; let bridge, bridgePid;
  for (let attempt = 0; attempt < 64 && pending.length; attempt++) {
    const pid = pending.shift();
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      if (cmd[0] === `${lab}/package/usr/lib/Niko/recursos/node`) {
        const env = Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map(v => { const n=v.indexOf('='); return [v.slice(0,n),v.slice(n+1)]; }));
        if (env.NIKO_PAI === String(appPid)) { bridge = env; bridgePid = pid; break; }
      }
      pending.push(...readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number));
    } catch {}
  }
  assert.ok(bridge?.NIKO_TOKEN, 'ponte privada filha do Niko');
  const http = `const [action,id]=process.argv.slice(1);const tool=action==='tool';const overview=action==='overview';const response=await fetch('http://127.0.0.1:'+process.env.NIKO_PORTA+(tool?'/ponte/controle/ferramenta':overview?'/ponte/controle/iniciar':'/ponte/janelas'+(action==='listar'?'':'/'+action)),{method:action==='listar'||overview?'GET':'POST',headers:{'x-niko':'1','x-niko-token':process.env.NIKO_TOKEN,'content-type':'application/json'},body:action==='listar'||overview?undefined:JSON.stringify(tool?{nome:id}:{janela:id})});const data=await response.json();if(!response.ok||data.erro)throw Error(data.erro||'http_'+response.status);console.log(JSON.stringify(data));`;
  const pedirJanelasLinux = async (action, id = '') => {
    try { return JSON.parse(execFileSync('nsenter', ['--target', String(appPid), '--user', '--net', '--preserve-credentials', '--', `${lab}/package/usr/lib/Niko/recursos/node`, '--input-type=module', '-e', http, action, id], {env: {...process.env, NIKO_TOKEN: bridge.NIKO_TOKEN, NIKO_PORTA: bridge.NIKO_PORTA}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})); }
    catch (error) { throw Error(String(error.stderr || error.message)); }
  };
  const list = async () => (await pedirJanelasLinux('listar')).janelas;
  let target;
  for (let attempt = 0; attempt < 30 && !target; attempt++) {
    target = (await list()).find(win => win.pid === fixturePid && win.titulo === 'Fixture dock privada');
    if (!target) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(target, 'janela GTK fictícia privada');
  assert.ok(target.icone?.startsWith('data:image/png;base64,'), 'ícone do tema nativo resolvido pela ponte');
  const cpu = (root=appPid) => {
    let ticks=0,pssKiB=0,memoryAvailable=true; const queue=[root]; const seen=new Set();
    while(queue.length) {
      const pid=queue.shift(); if(seen.has(pid)) continue; seen.add(pid);
      try {
        const stat=readFileSync(`/proc/${pid}/stat`,'utf8'); const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
        ticks+=Number(fields[11])+Number(fields[12])+Number(fields[13])+Number(fields[14]);
        try{const pss=/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`,'utf8'));if(pss)pssKiB+=Number(pss[1]);else memoryAvailable=false;}catch{memoryAvailable=false;}
        queue.push(...readFileSync(`/proc/${pid}/task/${pid}/children`,'utf8').trim().split(/\s+/).filter(Boolean).map(Number));
      } catch {}
    }
    return {ticks,pssKiB:memoryAvailable?pssKiB:null};
  };
  const hz=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}));
  const settle=Number(process.env.NIKO_CPU_SETTLE_SECONDS??3),sample=Number(process.env.NIKO_CPU_SAMPLE_SECONDS??8);
  assert.ok(Number.isInteger(settle)&&settle>=3&&settle<=20);assert.ok(Number.isInteger(sample)&&sample>=8&&sample<=30);
  await new Promise(resolve=>setTimeout(resolve,settle*1000));
  const workers = () => readFileSync(`/proc/${bridgePid}/task/${bridgePid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number).filter(pid => {try {const cmd=readFileSync(`/proc/${pid}/cmdline`,'utf8');return /\/gjs(?:-console)?$/.test(readlinkSync(`/proc/${pid}/exe`))&&cmd.includes('input.read_line_async')&&cmd.includes('/com/niko/Janelas');}catch{return false;}});
  const beforeWorkers=workers();assert.equal(beforeWorkers.length,1,'um cliente GJS persistente na ponte');
  const shellPid=Number(readFileSync(`${lab}/shell.pid`,'utf8'));
  const cpuBefore=cpu(),shellBefore=cpu(shellPid),started=Date.now();
  await new Promise(resolve => setTimeout(resolve, sample*1000)); // amostra após início e desenho do item real
  assert.deepEqual(workers(),beforeWorkers,'PID GJS reaproveitado nas consultas periódicas');
  const after=cpu(),shellAfter=cpu(shellPid);
  console.log('PASS: um cliente GJS persistente por ponte, sem processo novo a cada consulta');
  console.log(`Amostra CPU privada de ${sample}s após ${settle}s (Tauri, filhos e CPU reaproveitada de filhos encerrados): ${((after.ticks-cpuBefore.ticks)/hz/((Date.now()-started)/1000)*100).toFixed(1)}% de um núcleo; GNOME software=${process.env.NIKO_TAURI_SOFTWARE??1}; não mede estabilidade`);
  console.log(`CPU GNOME privado: ${((shellAfter.ticks-shellBefore.ticks)/hz/((Date.now()-started)/1000)*100).toFixed(1)}% de um núcleo`);
  console.log(`Memória PSS ao fim da amostra: app=${after.pssKiB===null?'indisponível':(after.pssKiB/1024).toFixed(1)+' MiB'} GNOME=${shellAfter.pssKiB===null?'indisponível':(shellAfter.pssKiB/1024).toFixed(1)+' MiB'}`);
  const preview = await pedirJanelasLinux('miniatura', target.id);
  assert.ok(preview.imagem?.startsWith('data:image/png;base64,'));
  const png = Buffer.from(preview.imagem.split(',')[1], 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) <= 184 && png.readUInt32BE(20) <= 104, 'PNG nativo limitado');
  writeFileSync(`${lab}/fixture-ready`, 'READY');
  for (let attempt = 0; attempt < 240 && !existsSync(`${lab}/input-pass`); attempt++)
    await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(existsSync(`${lab}/input-pass`), 'cliques reais devem passar antes das ações de backend');
  assert.equal((await list()).some(win => /^(Dock|Ilha) do Niko/.test(win.titulo) || win.titulo === 'Niko'), false);
  const poll = async predicate => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const windows = await list();
      if (predicate(windows)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('estado da janela não confirmou ação');
  };
  await assert.rejects(pedirJanelasLinux('focar', '1'), /janela_invalida/);
  await pedirJanelasLinux('focar', target.id);
  await poll(windows => windows.find(win => win.id === target.id)?.ativa);
  await pedirJanelasLinux('minimizar', target.id);
  await poll(windows => windows.find(win => win.id === target.id)?.minimizada);
  assert.equal((await pedirJanelasLinux('miniatura', target.id)).imagem, null);
  await pedirJanelasLinux('focar', target.id);
  await poll(windows => { const win = windows.find(win => win.id === target.id); return win?.ativa && !win.minimizada; });
  const cycles=Number(process.env.NIKO_JANELAS_CICLOS??0);
  assert.ok(Number.isInteger(cycles)&&cycles>=0&&cycles<=20);
  for(let n=0;n<cycles;n++){
    await pedirJanelasLinux('minimizar',target.id);await poll(w=>w.find(x=>x.id===target.id)?.minimizada);
    await pedirJanelasLinux('focar',target.id);await poll(w=>{const x=w.find(x=>x.id===target.id);return x?.ativa&&!x.minimizada;});
  }
  if(cycles)console.log('PASS: '+cycles+' ciclos nativos minimizar/focar com estado confirmado');
  await pedirJanelasLinux('fechar', target.id);
  await poll(windows => !windows.some(win => win.id === target.id));
  await assert.rejects(pedirJanelasLinux('focar', target.id), /janela_invalida/);
  await assert.rejects(pedirJanelasLinux('miniatura', target.id), /janela_invalida/);
  if (process.env.NIKO_CONTROLES_NATIVE === '1') {
    const overviewBefore=Boolean((await pedirJanelasLinux('overview')).aberto);
    await pedirJanelasLinux('tool', 'iniciar');
    await new Promise(r=>setTimeout(r,800));assert.equal((await pedirJanelasLinux('overview')).aberto,!overviewBefore);
    await pedirJanelasLinux('tool', 'iniciar');
    await new Promise(r=>setTimeout(r,800));assert.equal((await pedirJanelasLinux('overview')).aberto,overviewBefore);
    if (overviewBefore) { await pedirJanelasLinux('tool','iniciar'); await new Promise(r=>setTimeout(r,800)); }
    await pedirJanelasLinux('tool','captura');
    for(let n=0;n<30&&!existsSync(lab+'/capture-ui-pass');n++)await new Promise(r=>setTimeout(r,100));
    assert.ok(existsSync(lab+'/capture-ui-pass'),'interface de captura GNOME aberta sem salvar imagem');
    await pedirJanelasLinux('tool','teclado');
    for(let n=0;n<30&&!existsSync(lab+'/keyboard-ui-pass');n++)await new Promise(r=>setTimeout(r,100));
    assert.ok(existsSync(lab+'/keyboard-ui-pass'),'teclado virtual nativo privado');
    console.log('PASS: overview, interface de captura e teclado GNOME46 via ponte autenticada; sem mídia salva');
  }
  console.log('PASS: PNG nativo limitado, minimizada sem imagem; backend Node/GJS/D-Bus real; lista/foco/minimizar/restaurar/fechar; ID stale recusado; Tauri/WebKit privado');
} finally { closeClient(); await vite.close(); }
