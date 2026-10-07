import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const executar = promisify(execFile);
const SCRIPT = String.raw`
const {Gio, GLib} = imports.gi;
function request(acao, janela) {
let fase="proprietario";
try {
    const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
    const call = (name, path, iface, method, args, type) => bus.call_sync(name, path, iface, method,
        args, new GLib.VariantType(type), Gio.DBusCallFlags.NO_AUTO_START, 2000, null).deep_unpack()[0];
    const owner = call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
        'GetNameOwner', new GLib.Variant('(s)', ['org.gnome.Shell']), '(s)');
    fase='versao';
    const version = call(owner, '/com/niko/Janelas', 'org.freedesktop.DBus.Properties',
        'Get', new GLib.Variant('(ss)', ['com.niko.Janelas', 'Versao']), '(v)').deep_unpack();
    if (version.split('.')[0] !== '46') throw Error('gnome_incompativel');
    fase='acao';
    const result = call(owner, '/com/niko/Janelas', 'com.niko.Janelas', acao === 'iniciar' ? 'Iniciar' : acao === 'ferramenta' ? 'Ferramenta' : acao === 'listar' ? 'Listar' : acao === 'niko' ? 'AlternarNiko' : acao === 'miniatura' ? 'Miniatura' : acao === 'estado' ? 'EstadoDock' : acao === 'reservar' ? 'ReservarDock' : 'Agir',
        ['listar', 'niko', 'estado', 'iniciar'].includes(acao) ? null : acao === 'reservar' ? new GLib.Variant('(b)', [janela === 'true']) : ['miniatura', 'ferramenta'].includes(acao) ? new GLib.Variant('(s)', [janela]) : new GLib.Variant('(ss)', [acao, janela]), '(s)');
    return JSON.parse(result);
} catch (e) {
    const error = ['gnome_incompativel', 'sessao_bloqueada', 'janela_invalida', 'acao_indisponivel', 'acesso_janelas_recusado'].find(code => String(e).includes(code));
    const timeout=e.matches?.(Gio.io_error_quark(),Gio.IOErrorEnum.TIMED_OUT)||e.matches?.(Gio.dbus_error_quark(),Gio.DBusError.NO_REPLY);
    return {erro: error || 'integracao_janelas_indisponivel', diagnostico:{fase,timeout:Boolean(timeout),dominio:Number(e.domain)||0,codigo:Number(e.code)||0}};
}

}
const loop = new GLib.MainLoop(null, false);
const input = new Gio.DataInputStream({base_stream: new Gio.UnixInputStream({fd: 0, close_fd: false})});
function read() {
    input.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
        try {
            const [line] = stream.read_line_finish_utf8(result);
            if (line === null) { loop.quit(); return; }
            const command = JSON.parse(line);
            print(JSON.stringify({...request(command.acao, command.janela), id: command.id}));
        } catch { loop.quit(); return; }
        read();
    });
}
read(); loop.run();
`;
let processo: ChildProcessWithoutNullStreams | null = null;
let contador = 0;
let ocioso: ReturnType<typeof setTimeout> | null = null;
const aguardando = new Map<number, {resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();

export function encerrarJanelasLinux() {
  if (ocioso) clearTimeout(ocioso);
  ocioso = null;
  const atual=processo;processo=null;atual?.kill();
  for(const pending of aguardando.values()){clearTimeout(pending.timer);pending.reject(new Error("integracao_janelas_indisponivel"));}
  aguardando.clear();
}

function consultar(acao: string, janela: string): Promise<Record<string, unknown>> {
  if(ocioso)clearTimeout(ocioso);
  if(!processo){
    const child=spawn("/usr/bin/gjs",["-c",SCRIPT],{stdio:["pipe","pipe","pipe"]});
    processo=child;
    child.stdin.on("error",()=>undefined);
    child.stderr.resume();
    child.once("error",()=>{if(processo===child)encerrarJanelasLinux();});
    child.once("exit",()=>{if(processo===child)encerrarJanelasLinux();});
    createInterface({input:child.stdout}).on("line",line=>{
      if(processo!==child)return;
      if(Buffer.byteLength(line)>1024*1024){encerrarJanelasLinux();return;}
      try{
        const {id,...result}=JSON.parse(line);const pending=aguardando.get(id);
        if(!pending)return;
        aguardando.delete(id);clearTimeout(pending.timer);
        if(result.erro){
          const lab=process.env.NIKO_NATIVE_LAB;
          if(lab?.startsWith('/tmp/niko-tauri.')&&process.env.HOME===lab+'/home'&&result.diagnostico)console.warn('GNOME privado: '+JSON.stringify(result.diagnostico));
          pending.reject(new Error(result.erro));
        }else pending.resolve(result);
        // ponytail: um cliente GJS enquanto há consultas; encerrar após 5s ocioso.
        if(!aguardando.size)ocioso=setTimeout(encerrarJanelasLinux,5000);
      }catch{encerrarJanelasLinux();}
    });
  }
  const id=++contador;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(encerrarJanelasLinux,8000);
    aguardando.set(id,{resolve,reject,timer});
    processo!.stdin.write(JSON.stringify({id,acao,janela})+"\n");
  });
}

const icones = new Map<string, string | null>();
const ICONES = String.raw`
imports.gi.versions.Gtk = '3.0';
const {Gtk, Gio, GLib} = imports.gi;
Gtk.init(null);
const theme = Gtk.IconTheme.get_default();
print(JSON.stringify(JSON.parse(ARGV[0]).map(name => {
    try {
        const info = theme.lookup_by_gicon(Gio.Icon.new_for_string(name), 32, Gtk.IconLookupFlags.FORCE_SIZE);
        const pixbuf = info?.load_icon();
        if (!pixbuf) return null;
        const [ok, bytes] = pixbuf.save_to_bufferv('png', [], []);
        return ok ? 'data:image/png;base64,' + GLib.base64_encode(bytes) : null;
    } catch { return null; }
})));
`;
let leituraLista: Promise<unknown> | null = null;
let leituraEstado: Promise<unknown> | null = null;

export async function aplicarIconesLinux(itens: {iconeGnome?: string; icone?: string | null}[]): Promise<void> {
  const nomes = [...new Set<string>(itens.map((item: {iconeGnome?: string}) => item.iconeGnome).filter((nome: unknown): nome is string => typeof nome === "string" && nome.length <= 4096))].filter(nome => !icones.has(nome));
  if (nomes.length) {
    try {
      const {stdout: imagens} = await executar("/usr/bin/gjs", ["-c", ICONES, JSON.stringify(nomes)], {timeout: 8000, maxBuffer: 1024 * 1024});
      const valores = JSON.parse(imagens);
      nomes.forEach((nome, i) => icones.set(nome, valores[i] ?? null));
      // ponytail: cache de até 256 ícones; limpa se a sessão ultrapassar esse limite.
      if (icones.size > 256) icones.clear();
    } catch { /* Tema ausente mantém a inicial como fallback. */ }
  }
  for (const item of itens) {
    item.icone = item.icone ?? icones.get(item.iconeGnome ?? "") ?? null;
    delete item.iconeGnome;
  }
}

async function executarPedido(acao: "listar" | "focar" | "minimizar" | "fechar" | "niko" | "miniatura" | "estado" | "reservar" | "iniciar" | "ferramenta", janela?: string): Promise<unknown> {
  if (!["listar", "focar", "minimizar", "fechar", "niko", "miniatura", "estado", "reservar", "iniciar", "ferramenta"].includes(acao)) throw new Error("acao_invalida");
  if (!["listar", "niko", "estado", "reservar", "iniciar", "ferramenta"].includes(acao) && !/^[a-f0-9-]{36}\/\d{1,10}$/.test(janela ?? "")) throw new Error("janela_invalida");
  if (acao === "ferramenta" && !["captura", "teclado", "iniciar"].includes(janela ?? "")) throw new Error("acao_invalida");
  if (acao === "reservar" && !["true", "false"].includes(janela ?? "")) throw new Error("acao_invalida");
  try {
    const resultado = await consultar(acao, janela ?? "");
    if (resultado.erro) throw new Error(String(resultado.erro));
    if (acao === "listar" && Array.isArray(resultado.janelas)) await aplicarIconesLinux(resultado.janelas);
    return resultado;
  } catch (error) {
    if (error instanceof Error && ["gnome_incompativel", "sessao_bloqueada", "janela_invalida", "acao_indisponivel", "integracao_janelas_indisponivel", "acesso_janelas_recusado"].includes(error.message)) throw error;
    throw new Error("integracao_janelas_indisponivel");
  }
}

export function pedirJanelasLinux(acao: Parameters<typeof executarPedido>[0], janela?: string): Promise<unknown> {
  // Apenas consultas simultâneas compartilham processo; ações nunca são suprimidas.
  if (acao === "listar") {
    if (!leituraLista) leituraLista = executarPedido(acao, janela).finally(() => { leituraLista = null; });
    return leituraLista;
  }
  if (acao === "estado") {
    if (!leituraEstado) leituraEstado = executarPedido(acao, janela).finally(() => { leituraEstado = null; });
    return leituraEstado;
  }
  return executarPedido(acao, janela);
}
