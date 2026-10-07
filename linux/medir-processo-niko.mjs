// Leitura de CPU/PSS do próprio Niko; não consulta janelas, mídia, rede ou credenciais.
import {readFileSync,readlinkSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {cpus,totalmem} from 'node:os';
import {basename} from 'node:path';
const root=Number(process.argv[2]),seconds=Number(process.argv[3]??30);
if(!Number.isSafeInteger(root)||root<2||!Number.isInteger(seconds)||seconds<10||seconds>60)throw Error('PID/duração inválidos');
if(readlinkSync(`/proc/${root}/exe`)!=='/usr/bin/niko')throw Error('processo não é a versão instalada do Niko');
const hz=Number(execFileSync('/usr/bin/getconf',['CLK_TCK'],{encoding:'utf8'}));
function usage(){
 let ticks=0,pss=0,available=true;const queue=[root],seen=new Set();
 while(queue.length){const pid=queue.shift();if(seen.has(pid))continue;seen.add(pid);
  try{const stat=readFileSync(`/proc/${pid}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
   ticks+=Number(fields[11])+Number(fields[12])+Number(fields[13])+Number(fields[14]);
   try{const match=/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`,'utf8'));if(match)pss+=Number(match[1]);else available=false;}catch{available=false;}
   queue.push(...readFileSync(`/proc/${pid}/task/${pid}/children`,'utf8').trim().split(/\s+/).filter(Boolean).map(Number));
  }catch{if(pid===root)throw Error('Niko encerrou durante a medição');}
 }
 return {ticks,pssMiB:available?Number((pss/1024).toFixed(1)):null};
}
const before=usage(),start=performance.now();await new Promise(r=>setTimeout(r,seconds*1000));const after=usage(),elapsed=(performance.now()-start)/1000;
const gpu=[];
for(const card of readdirSync('/sys/class/drm').filter(n=>/^card\d+$/.test(n))){try{gpu.push({vendor:readFileSync(`/sys/class/drm/${card}/device/vendor`,'utf8').trim(),device:readFileSync(`/sys/class/drm/${card}/device/device`,'utf8').trim(),driver:basename(readlinkSync(`/sys/class/drm/${card}/device/driver`))});}catch{}}
console.log(JSON.stringify({segundos:Number(elapsed.toFixed(1)),cpuPercentUmNucleo:Number(((after.ticks-before.ticks)/hz/elapsed*100).toFixed(1)),pssMiB:after.pssMiB,hardware:{cpuLogicos:cpus().length,memoriaGiB:Number((totalmem()/1024**3).toFixed(1)),gpu,backlight:readdirSync('/sys/class/backlight').length>0,bluetooth:existsSync('/sys/class/bluetooth')&&readdirSync('/sys/class/bluetooth').length>0}},null,2));
