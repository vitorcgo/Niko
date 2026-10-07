import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'vite';

const IMAGE = `const Cairo=imports.cairo;const surface=new Cairo.ImageSurface(Cairo.Format.ARGB32,800,160);const ctx=new Cairo.Context(surface);ctx.setSourceRGB(1,1,1);ctx.paint();ctx.setSourceRGB(0,0,0);ctx.selectFontFace('Sans',Cairo.FontSlant.NORMAL,Cairo.FontWeight.NORMAL);ctx.setFontSize(44);ctx.moveTo(20,100);ctx.showText('NIKO OCR TESTE 123');surface.writeToPNG(ARGV[0]);`;

test('OCR Linux valida tamanho/formato/idiomas e preserva erros',{timeout:15000},async()=>{
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try{
  const {rodarOcrLinux}=await vite.ssrLoadModule('/servidor/ocrLinux.ts');
  const calls=[];const fake=async(file,args)=>{calls.push([file,args]);return {stdout:file.endsWith('gjs')?JSON.stringify({format:'png',width:200,height:100}):args[0]==='--list-langs'?'List of available languages:\neng\npor\n':'Texto fictício\n'};};
  assert.deepEqual(await rodarOcrLinux('/tmp/imagem-ficticia.png',fake),{texto:'Texto fictício',idioma:'por+eng'});
  assert.deepEqual(calls.at(-1)[1],['/tmp/imagem-ficticia.png','stdout','-l','por+eng','--psm','3']);
  await assert.rejects(rodarOcrLinux('/tmp/ficticio',async()=>({stdout:JSON.stringify({format:'png',width:20000,height:100})})),/imagem_grande_ocr/);
  await assert.rejects(rodarOcrLinux('/tmp/ficticio',async()=>({stdout:JSON.stringify({format:'svg',width:20,height:20})})),/imagem_invalida_ocr/);
  await assert.rejects(rodarOcrLinux('/tmp/ficticio',async()=>{const e=Error('ausente');e.code='ENOENT';throw e;}),/ocr_dependencia_ausente/);
 }finally{await vite.close();}
});

test('Tesseract real lê PNG sintético; nenhuma imagem pessoal',{skip:!process.env.NIKO_OCR_PRIVATE_ENGINE&&!existsSync('/usr/bin/tesseract'),timeout:30000},async()=>{
 const privateEngine=process.env.NIKO_OCR_PRIVATE_ENGINE;
 const engine=privateEngine??'/usr/bin/tesseract';
 assert.ok(!privateEngine||engine.startsWith('/tmp/niko-ocr-motor/extraido/'));
 const lab=mkdtempSync(join(tmpdir(),'niko-ocr-texto.'));for(const name of ['home','data','config','cache','state','runtime'])mkdirSync(join(lab,name),{mode:0o700});
 const env={...process.env,HOME:join(lab,'home'),XDG_DATA_HOME:join(lab,'data'),XDG_CONFIG_HOME:join(lab,'config'),XDG_CACHE_HOME:join(lab,'cache'),XDG_STATE_HOME:join(lab,'state'),XDG_RUNTIME_DIR:join(lab,'runtime'),DBUS_SESSION_BUS_ADDRESS:'unix:path='+join(lab,'bus-ausente'),DBUS_SYSTEM_BUS_ADDRESS:'unix:path='+join(lab,'bus-ausente'),DISPLAY:'',WAYLAND_DISPLAY:''};
 execFileSync('/usr/bin/gjs',['-c',IMAGE,join(lab,'texto.png')],{env});
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try{
  const {rodarOcrLinux}=await vite.ssrLoadModule('/servidor/ocrLinux.ts'),run=promisify(execFile);
  const execute=(file,args,options)=>run(file==='/usr/bin/tesseract'?engine:file,args,{...options,env:{...options.env,...env,LD_LIBRARY_PATH:privateEngine?'/tmp/niko-ocr-motor/extraido/usr/lib/x86_64-linux-gnu':'',TESSDATA_PREFIX:privateEngine?'/tmp/niko-ocr-motor/extraido/usr/share/tesseract-ocr/5/tessdata':'/usr/share/tesseract-ocr/5/tessdata'}});
  const result=await rodarOcrLinux(join(lab,'texto.png'),execute);
  assert.match(result.texto,/NIKO/);assert.match(result.texto,/OCR/);assert.match(result.texto,/123/);assert.equal(result.idioma,'por+eng');
  console.log('PASS: Tesseract nativo com HOME/XDG privados reconheceu NIKO/OCR/123 na imagem gerada');
 }finally{await vite.close();rmSync(lab,{recursive:true,force:true});}
});
