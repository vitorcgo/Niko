import { execFile, spawn } from "node:child_process";
import { readFile, readdir, statfs } from "node:fs/promises";
import { cpus, freemem, totalmem, uptime, hostname, release, networkInterfaces, homedir } from "node:os";
import { pedirJanelasLinux, aplicarIconesLinux } from "./janelasLinux";

// Comandos fixos, sem shell. Entrada sensível via stdin, nunca pela linha de comando.
export function comandoLinux(arquivo: string, argumentos: string[], entrada?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (arquivo === "/usr/bin/gnome-control-center") {
      const child = spawn(arquivo, argumentos, {detached: true, stdio: "ignore"});
      child.once("error", () => reject(new Error("controle_linux_indisponivel")));
      child.once("spawn", () => { child.unref(); resolve(""); });
      return;
    }
    const child = execFile(arquivo, argumentos, {timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: {...process.env, LC_ALL: "C"}}, (error, stdout, stderr) => {
      if (error) return reject(new Error((error as NodeJS.ErrnoException).code === "ENOENT" ? "dependencia_linux_ausente" : "controle_linux_indisponivel", {cause: stderr}));
      resolve(stdout);
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(entrada ?? "");
  });
}

const SCRIPT = String.raw`
const {Gio, GLib} = imports.gi;
const stream = new Gio.DataInputStream({base_stream: new Gio.UnixInputStream({fd: 0, close_fd: false})});
const input = JSON.parse(stream.read_line_utf8(null)[0]);
const system = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
const session = Gio.bus_get_sync(Gio.BusType.SESSION, null);
const decode = value => value instanceof GLib.Variant ? decode(value.deep_unpack()) : value instanceof Uint8Array ? Array.from(value) : Array.isArray(value) ? value.map(decode) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)])) : value;
const call = (bus,name,path,iface,method,args=null) => decode(bus.call_sync(name,path,iface,method,args,null,Gio.DBusCallFlags.NO_AUTO_START,15000,null));
const props = (bus,name,path,iface) => call(bus,name,path,'org.freedesktop.DBus.Properties','GetAll',new GLib.Variant('(s)',[iface]))[0];
const set = (bus,name,path,iface,key,type,value) => call(bus,name,path,'org.freedesktop.DBus.Properties','Set',new GLib.Variant('(ssv)',[iface,key,new GLib.Variant(type,value)]));
const NM='org.freedesktop.NetworkManager', NM_PATH='/org/freedesktop/NetworkManager';
const devices = () => call(system,NM,NM_PATH,NM,'GetDevices')[0].map(path=>({path,...props(system,NM,path,NM+'.Device')}));
const wireless = () => devices().filter(d=>d.DeviceType===2);
const aps = dev => call(system,NM,dev.path,NM+'.Device.Wireless','GetAccessPoints')[0].map(path=>({path,...props(system,NM,path,NM+'.AccessPoint')}));
const ssid = ap => new TextDecoder().decode(Uint8Array.from(ap.Ssid));
const profiles = () => call(system,NM,NM_PATH+'/Settings',NM+'.Settings','ListConnections')[0].map(path=>({path,settings:call(system,NM,path,NM+'.Settings.Connection','GetSettings')[0]}));
const saved = p => p.settings['802-11-wireless']?.ssid;
const matching = p => saved(p) && new TextDecoder().decode(Uint8Array.from(saved(p)))===input.ssid;
const blue = () => call(system,'org.bluez','/','org.freedesktop.DBus.ObjectManager','GetManagedObjects')[0];
const trayIcon = properties => {
 const candidates=(properties.IconPixmap??[]).filter(p=>p.length===3&&p[0]>0&&p[1]>0&&p[0]<=512&&p[1]<=512&&p[2].length===p[0]*p[1]*4).sort((a,b)=>Math.abs(a[0]*a[1]-1024)-Math.abs(b[0]*b[1]-1024));
 if(!candidates.length)return null;
 try {
  const [w,h,argb]=candidates[0],rgba=new Uint8Array(argb.length);
  for(let i=0;i<argb.length;i+=4){rgba[i]=argb[i+1];rgba[i+1]=argb[i+2];rgba[i+2]=argb[i+3];rgba[i+3]=argb[i];}
  const GdkPixbuf=imports.gi.GdkPixbuf;
  const image=GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(rgba),GdkPixbuf.Colorspace.RGB,true,8,w,h,w*4);
  const scale=32/Math.max(w,h),small=image.scale_simple(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)),GdkPixbuf.InterpType.BILINEAR);
  const [ok,bytes]=small.save_to_bufferv('png',[],[]);
  return ok?'data:image/png;base64,'+GLib.base64_encode(bytes):null;
 }catch{return null;}
};
const bluetooth = () => Object.entries(blue()).filter(([,v])=>v['org.bluez.Device1']).map(([id,v])=>({id,nome:v['org.bluez.Device1'].Alias ?? v['org.bluez.Device1'].Name ?? '',ativo: Boolean(v['org.bluez.Device1'].Paired), conectado:Boolean(v['org.bluez.Device1'].Connected)}));
const wifi = (selected=null) => {
 const dev=selected??wireless()[0]; if(!dev)return {ssid:null,sinal:null,conectado:false,existe:false};
 const ap=props(system,NM,dev.path,NM+'.Device.Wireless').ActiveAccessPoint;
 if(ap==='/'||dev.State!==100)return {ssid:null,sinal:null,conectado:false,existe:true};
 const p=props(system,NM,ap,NM+'.AccessPoint');return {ssid:ssid(p),sinal:p.Strength,conectado:true,existe:true};
};
const battery = () => {const p=props(system,'org.freedesktop.UPower','/org/freedesktop/UPower/devices/DisplayDevice','org.freedesktop.UPower.Device');return p.IsPresent&&p.Type===2?{nivel:Math.round(p.Percentage),carregando:[1,4,5].includes(p.State),minutos:p.TimeToEmpty>0?Math.round(p.TimeToEmpty/60):null}:null;};
const brightness = () => {const n=props(session,'org.gnome.SettingsDaemon.Power','/org/gnome/SettingsDaemon/Power','org.gnome.SettingsDaemon.Power.Screen').Brightness;return typeof n==='number'&&n>=0?n:null;};
const optional = (read,fallback) => {try{return read();}catch{return fallback;}};
try {
 let result;
 switch(input.acao) {
 case 'tipo': {const b=optional(battery,null); result={notebook:!!b,bateria:!!b};break;}
 case 'estado': result={bateria:optional(battery,null),brilho:optional(brightness,null),wifi:optional(wifi,{ssid:null,sinal:null,conectado:false,existe:false}),radios:{...optional(()=>({WiFi:props(system,NM,NM_PATH,NM).WirelessEnabled}),{}),...optional(()=>({Bluetooth:Object.values(blue()).some(v=>v['org.bluez.Adapter1']?.Powered)}),{})}};break;
 case 'redes': {const savedNetworks=profiles().filter(p=>saved(p)).map(p=>new TextDecoder().decode(Uint8Array.from(saved(p)))); const unique=new Map();for(const dev of wireless())for(const ap of aps(dev)){const name=ssid(ap);if(!name)continue;const entry={ssid:name,sinal:ap.Strength,segura:!!(ap.Flags&1),salva:savedNetworks.includes(name)};if(!unique.has(name)||unique.get(name).sinal<entry.sinal)unique.set(name,entry);}result={redes:[...unique.values()].sort((a,b)=>b.sinal-a.sinal)};break;}
 case 'conectar': {
   const dev=wireless().find(d=>aps(d).some(ap=>ssid(ap)===input.ssid));if(!dev)throw Error('rede_indisponivel');
   const ap=aps(dev).find(ap=>ssid(ap)===input.ssid), profile=profiles().find(matching);
   if(profile&&!input.senha)call(system,NM,NM_PATH,NM,'ActivateConnection',new GLib.Variant('(ooo)',[profile.path,dev.path,ap.path]));
   else {
     const secured=!!(ap.Flags&1),security=ap.WpaFlags|ap.RsnFlags,keyMgmt=security&256?'wpa-psk':security&1024?'sae':null;if(secured&&!keyMgmt)throw Error('seguranca_wifi_indisponivel');
     if(secured&&!input.senha)throw Error('senha_necessaria');
     const settings={'connection':{id:new GLib.Variant('s',input.ssid),type:new GLib.Variant('s','802-11-wireless'),uuid:new GLib.Variant('s',GLib.uuid_string_random()),permissions:new GLib.Variant('as',['user:'+GLib.get_user_name()+':'])},'802-11-wireless':{ssid:new GLib.Variant('ay',new TextEncoder().encode(input.ssid)),mode:new GLib.Variant('s','infrastructure')},ipv4:{method:new GLib.Variant('s','auto')},ipv6:{method:new GLib.Variant('s','auto')}};
     if(secured){settings['802-11-wireless-security']={'key-mgmt':new GLib.Variant('s',keyMgmt),psk:new GLib.Variant('s',input.senha)};}
     call(system,NM,NM_PATH,NM,'AddAndActivateConnection',new GLib.Variant('(a{sa{sv}}oo)',[settings,dev.path,ap.path]));
   }
   let connected=false;for(let attempt=0;attempt<40;attempt++){const state=wifi(dev);if(state.conectado&&state.ssid===input.ssid){result={ok:true,wifi:state};connected=true;break;}GLib.usleep(500000);}if(!connected)throw Error('conexao_wifi_nao_confirmada');break;
 }
 case 'esquecer': for(const p of profiles().filter(matching))call(system,NM,p.path,NM+'.Settings.Connection','Delete');result={ok:true};break;
 case 'desconectar': {const dev=wireless().find(d=>d.State===100);if(!dev)throw Error('rede_indisponivel');call(system,NM,dev.path,NM+'.Device','Disconnect');result={ok:true};break;}
 case 'brilho': set(session,'org.gnome.SettingsDaemon.Power','/org/gnome/SettingsDaemon/Power','org.gnome.SettingsDaemon.Power.Screen','Brightness','i',input.nivel);result={ok:true,brilho:brightness()};break;
 case 'radio': if(input.tipo==='WiFi')set(system,NM,NM_PATH,NM,'WirelessEnabled','b',input.ligado);else {const adapters=Object.entries(blue()).filter(([,v])=>v['org.bluez.Adapter1']);if(!adapters.length)throw Error('radio_ausente');for(const [path] of adapters)set(system,'org.bluez',path,'org.bluez.Adapter1','Powered','b',input.ligado);}result={ok:true};break;
 case 'bluetooth': result={aparelhos:bluetooth()};break;
 case 'energia': if(input.tipo==='bloquear')call(session,'org.gnome.ScreenSaver','/org/gnome/ScreenSaver','org.gnome.ScreenSaver','Lock');else {const method={suspender:'Suspend',reiniciar:'Reboot',desligar:'PowerOff'}[input.tipo];if(!method)throw Error('valor_invalido');call(system,'org.freedesktop.login1','/org/freedesktop/login1','org.freedesktop.login1.Manager',method,new GLib.Variant('(b)',[true]));}result={ok:true};break;
 case 'bandeja': case 'abrirDaBandeja': {
   const names=call(session,'org.kde.StatusNotifierWatcher','/StatusNotifierWatcher','org.freedesktop.DBus.Properties','Get',new GLib.Variant('(ss)',['org.kde.StatusNotifierWatcher','RegisteredStatusNotifierItems']))[0];
   const items=names.map(name=>{const slash=name.indexOf('/');return {name,service:slash<0?name:name.slice(0,slash),path:slash<0?'/StatusNotifierItem':name.slice(slash)};});
   if(input.acao==='abrirDaBandeja'){const item=items.find(i=>i.name===input.caminho);if(!item)throw Error('valor_invalido');call(session,item.service,item.path,'org.kde.StatusNotifierItem','Activate',new GLib.Variant('(ii)',[0,0]));result={ok:true};}
   else result={itens:items.map(i=>{const p=props(session,i.service,i.path,'org.kde.StatusNotifierItem');return {caminho:i.name,nome:p.Title||p.Id||i.service,dica:typeof p.ToolTip?.[2]==='string'?p.ToolTip[2]:null,icone:trayIcon(p),iconeGnome:p.IconName||null};})};break;
 }
 default: throw Error('acao_indisponivel');
 }
 print(JSON.stringify(result));
} catch(error) {const expected=['rede_indisponivel','seguranca_wifi_indisponivel','senha_necessaria','conexao_wifi_nao_confirmada','radio_ausente','valor_invalido','acao_indisponivel'];print(JSON.stringify({erro:expected.includes(error.message)?error.message:'controle_linux_indisponivel'}));}
`;

type Executor = typeof comandoLinux;
let previousCpu: {busy:number;total:number} | null = null;
function cpuLoad() {
  const sum=cpus().reduce((a,c)=>({busy:a.busy+c.times.user+c.times.nice+c.times.sys+c.times.irq,total:a.total+Object.values(c.times).reduce((n,v)=>n+v,0)}),{busy:0,total:0});
  const previous=previousCpu;previousCpu=sum;
  return previous&&sum.total>previous.total?Math.round((sum.busy-previous.busy)/(sum.total-previous.total)*100):null;
}
function streamLevel(node: {info?:{params?:{Props?:Record<string,unknown>[]}}}) {
  const props=node.info?.params?.Props?.find(p=>Array.isArray(p.channelVolumes)||typeof p.volume==='number');
  if(!props)return null;
  const channels=Array.isArray(props.channelVolumes)?props.channelVolumes:[props.volume];
  const gains=channels.filter((n): n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0);
  if(!gains.length)return null;
  return {volume:Math.min(100,Math.round(Math.cbrt(Math.max(...gains))*100)),mudo:props.mute===true};
}

const percent = (value: unknown) => {
  const n=Number(value); if(!Number.isFinite(n)) throw new Error("valor_invalido"); return Math.min(100,Math.max(0,Math.round(n)));
};
const volume = (text: string) => {
  const match=/Volume:\s+([0-9.]+)(.*)/.exec(text); if(!match) throw new Error("audio_indisponivel");
  return {volume:percent(Number(match[1])*100),mudo:match[2].includes("MUTED")};
};

export async function pedirSistemaLinux(input: Record<string, unknown>, run: Executor = comandoLinux): Promise<unknown> {
  const action = input.acao;
  if(action==="audio") {
    const device=async(id:string)=>{try{return volume(await run('/usr/bin/wpctl',['get-volume',id]));}catch{return null;}};
    const [saida,entrada]=await Promise.all([device('@DEFAULT_AUDIO_SINK@'),device('@DEFAULT_AUDIO_SOURCE@')]);
    if(!saida&&!entrada) throw new Error('audio_indisponivel');
    const nodes=JSON.parse(await run('/usr/bin/pw-dump',['-N']));
    const streams=nodes.filter((node: {type?:string;info?:{props?:Record<string,unknown>}})=>node.type==='PipeWire:Interface:Node'&&String(node.info?.props?.['media.class']).startsWith('Stream/Output/Audio')).slice(0,64);
    const sessoes=[];
    for(const node of streams){const p=node.info.props;const pid=Number(p['application.process.id']);if(!Number.isSafeInteger(pid)||pid<1)continue;const level=streamLevel(node)??await device(String(node.id));if(!level)continue;sessoes.push({pid,sistema:false,ativa:node.info.state==='running',...level,nome:p['application.name']||p['node.description']||'',caminho:null,icone:null});}
    return {saida,entrada,sessoes};
  }
  if(action==='volume'||action==='mudo') {
    if(input.fluxo!==0&&input.fluxo!==1)throw new Error('valor_invalido');
    const id=input.fluxo===0?'@DEFAULT_AUDIO_SINK@':'@DEFAULT_AUDIO_SOURCE@';
    await run('/usr/bin/wpctl',action==='volume'?['set-volume',id,percent(input.valor)+'%']:['set-mute',id,input.mudo===true?'1':'0']);return {ok:true};
  }
  if(action==='sessao') {
    const pids=Array.isArray(input.pids)?input.pids:[];
    if(!pids.length||pids.length>64||pids.some(p=>!Number.isSafeInteger(p)||Number(p)<1))throw new Error('valor_invalido');
    const nodes=JSON.parse(await run('/usr/bin/pw-dump',['-N']));
    const selected=nodes.filter((node: {id:number;info?:{props?:Record<string,unknown>}})=>Number.isSafeInteger(node.id)&&node.id>0&&pids.includes(Number(node.info?.props?.['application.process.id']))&&String(node.info?.props?.['media.class']).startsWith('Stream/Output/Audio'));
    if(!selected.length)throw new Error('audio_indisponivel');
    for(const node of selected){if(input.volume!==-1)await run('/usr/bin/wpctl',['set-volume',String(node.id),percent(input.volume)+'%']);if(input.mudo!==-1)await run('/usr/bin/wpctl',['set-mute',String(node.id),input.mudo===1?'1':'0']);}return {ok:true};
  }
  if(action==='tema'||action==='definirTema') {
    if(action==='definirTema')await run('/usr/bin/gsettings',['set','org.gnome.desktop.interface','color-scheme',input.escuro===true?'prefer-dark':'default']);
    return {escuro:(await run('/usr/bin/gsettings',['get','org.gnome.desktop.interface','color-scheme'])).trim()==="'prefer-dark'"};
  }
  if(action==='configuracoes'||action==='ferramenta'&&input.nome==='papelDeParede') {
    const panel=input.nome==='papelDeParede'?'appearance':input.pagina==='wifi'?'wifi':input.pagina==='bluetooth'?'bluetooth':'power';
    await run('/usr/bin/gnome-control-center',[panel]);return {ok:true};
  }
  if(action==='iniciar'||action==='ferramenta')return pedirJanelasLinux(action==='iniciar'?'iniciar':'ferramenta',String(input.nome??''));
  if(action==='computador') {
    const info=async(path:string)=>{try{return (await readFile(path,'utf8')).trim();}catch{return '';}};
    const [page,ticks]=await Promise.all([run('/usr/bin/getconf',['PAGESIZE']),run('/usr/bin/getconf',['CLK_TCK'])]);
    const pageSize=Number(page),ticksPerSecond=Number(ticks);
    if(!Number.isFinite(pageSize)||!Number.isFinite(ticksPerSecond)||ticksPerSecond<1)throw new Error('controle_linux_indisponivel');
    const names=await readdir('/proc');const programs=new Map<string,{nome:string;processos:number;memoria_mb:number;cpu_segundos:number}>();
    for(const pid of names.filter(p=>/^\d+$/.test(p))){try {const stat=await info('/proc/'+pid+'/stat');const end=stat.lastIndexOf(')');const fields=stat.slice(end+2).split(' ');const name=stat.slice(stat.indexOf('(')+1,end);if(!name||fields.length<22)continue;const p=programs.get(name)??{nome:name,processos:0,memoria_mb:0,cpu_segundos:0};p.processos++;p.memoria_mb+=Number(fields[21])*pageSize/1048576;p.cpu_segundos+=(Number(fields[11])+Number(fields[12]))/ticksPerSecond;programs.set(name,p);}catch{}}
    const system=await pedirSistemaLinux({acao:'estado'},run) as Record<string,unknown>;
    const disks=[];
    let mounts: string[]=[];
    try {mounts=(await readFile('/proc/self/mountinfo','utf8')).split('\n').filter(line=>/ - (ext[234]|btrfs|xfs|zfs|vfat|ntfs|fuseblk) /.test(line)).map(line=>line.split(' ')[4].replace(/\\([0-7]{3})/g,(_m,n)=>String.fromCharCode(parseInt(n,8))));} catch {mounts=['/',homedir()];}
    for(const path of [...new Set(mounts)]){try{const fs=await statfs(path);disks.push({unidade:path,nome:'',total_gb:fs.blocks*fs.bsize/1073741824,livre_gb:fs.bavail*fs.bsize/1073741824});}catch{}}
    const gpu=[];
    try{for(const card of (await readdir('/sys/class/drm')).filter(n=>/^card\d+$/.test(n))){const vendor=await info('/sys/class/drm/'+card+'/device/vendor');const model=await info('/sys/class/drm/'+card+'/device/device');const driver=(await info('/sys/class/drm/'+card+'/device/uevent')).split('\n').find(l=>l.startsWith('DRIVER='))?.slice(7);gpu.push([driver,vendor,model].filter(Boolean).join(' '));}}catch{}
    const ips=Object.entries(networkInterfaces()).flatMap(([name,addresses])=>(addresses??[]).filter(a=>a.family==='IPv4'&&!a.internal).map(a=>({interface:name,ip:a.address})));
    let bt:unknown[]=[];try{bt=(await pedirSistemaLinux({acao:'bluetooth'},run) as {aparelhos:unknown[]}).aparelhos;}catch{}
    let windows:unknown[]=[];try{const result=await pedirJanelasLinux('listar') as {janelas:{nome:string;titulo:string}[]};windows=result.janelas.map(win=>({programa:win.nome,titulo:win.titulo}));}catch{}
    return {nome:hostname(),sistema:'Linux '+release(),fabricante:await info('/sys/class/dmi/id/sys_vendor'),modelo:await info('/sys/class/dmi/id/product_name'),processador:cpus()[0]?.model??'',nucleos:cpus().length,uso_cpu_pct:cpuLoad(),memoria_total_gb:totalmem()/1073741824,memoria_livre_gb:freemem()/1073741824,ligado_ha_horas:uptime()/3600,placa_de_video:gpu,discos:disks,bateria:system.bateria,wifi:system.wifi,ips,bluetooth:bt,programas_mais_memoria:[...programs.values()].sort((a,b)=>b.memoria_mb-a.memoria_mb).slice(0,12),programas_mais_cpu_acumulada:[...programs.values()].sort((a,b)=>b.cpu_segundos-a.cpu_segundos).slice(0,8),janelas_abertas:windows,total_processos:names.filter(p=>/^\d+$/.test(p)).length};
  }
  const allowed=['tipo','estado','redes','conectar','esquecer','desconectar','brilho','radio','bluetooth','energia','bandeja','abrirDaBandeja'];
  if(!allowed.includes(String(action)))throw new Error('acao_indisponivel');
  if(action==='energia'&&!['bloquear','suspender','reiniciar','desligar'].includes(String(input.tipo)))throw new Error('valor_invalido');
  if(action==='brilho')input={...input,nivel:percent(input.nivel)};
  const result=JSON.parse(await run('/usr/bin/gjs',['-c',SCRIPT],JSON.stringify(input)));
  if(result.erro)throw new Error(result.erro);
  if(action==='bandeja')await aplicarIconesLinux(result.itens);
  return result;
}
