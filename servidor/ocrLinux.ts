import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {ResultadoOcr} from "./ocr";

const run = promisify(execFile);
const INFO = String.raw`
const {GdkPixbuf} = imports.gi;
const [format,width,height]=GdkPixbuf.Pixbuf.get_file_info(ARGV[0]);
print(JSON.stringify({format:format?.get_name()??'',width,height}));
`;

export async function rodarOcrLinux(caminho: string, executar: typeof run = run): Promise<ResultadoOcr> {
  try {
    const options={timeout:60000,maxBuffer:16*1024*1024,env:{...process.env,LC_ALL:'C',OMP_THREAD_LIMIT:'2'}};
    const {stdout:dimensions}=await executar('/usr/bin/gjs',['-c',INFO,caminho],options);
    const info=JSON.parse(dimensions);
    if(!['png','jpeg','tiff','bmp','gif','webp'].includes(info.format)||info.width<1||info.height<1)throw new Error('imagem_invalida_ocr');
    if(info.width>10000||info.height>10000||info.width*info.height>40000000)throw new Error('imagem_grande_ocr');
    const {stdout:available}=await executar('/usr/bin/tesseract',['--list-langs'],options);
    const languages=available.split(/\r?\n/).map(s=>s.trim());
    const idioma=['por','eng'].filter(lang=>languages.includes(lang)).join('+');
    if(!idioma)throw new Error('sem_idioma_ocr_linux');
    const {stdout}=await executar('/usr/bin/tesseract',[caminho,'stdout','-l',idioma,'--psm','3'],options);
    return {texto:stdout.trim(),idioma};
  } catch(error) {
    const e=error as NodeJS.ErrnoException & {killed?:boolean};
    if(e.code==='ENOENT')throw new Error('ocr_dependencia_ausente');
    if(['imagem_invalida_ocr','imagem_grande_ocr','sem_idioma_ocr_linux'].includes(e.message))throw e;
    throw new Error(e.killed?'tempo_ocr':'falha_ocr');
  }
}
