// O subprocesso recebe segredos somente por stdin e recusa coleções já bloqueadas.
export const SCRIPT_SEGREDOS_LINUX = String.raw`
const {Gio, GLib} = imports.gi;
try {
    const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
    const owner = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'NameHasOwner', new GLib.Variant('(s)', ['org.freedesktop.secrets']),
        new GLib.VariantType('(b)'), Gio.DBusCallFlags.NO_AUTO_START, 1000, null).deep_unpack()[0];
    if (!owner) throw new Error('cofre_indisponivel');
    const Secret = imports.gi.Secret;
    const service = Secret.Service.get_sync(Secret.ServiceFlags.NONE, null);
    const collection = Secret.Collection.for_alias_sync(service, 'default', Secret.CollectionFlags.NONE, null);
    if (!collection) throw new Error('cofre_nao_configurado');
    if (collection.get_locked()) throw new Error('cofre_bloqueado');
    const input = new Gio.DataInputStream({base_stream: new Gio.UnixInputStream({fd: 0, close_fd: false})});
    const [line] = input.read_line_utf8(null);
    const pedido = JSON.parse(line);
    const schema = Secret.Schema.new('com.niko.desktop.Credencial', Secret.SchemaFlags.NONE,
        {alvo: Secret.SchemaAttributeType.STRING});
    const attributes = {alvo: pedido.alvo};
    let resposta;
    if (pedido.acao === 'gravar') {
        resposta = {ok: Secret.password_store_sync(schema, attributes, Secret.COLLECTION_DEFAULT,
            pedido.alvo, pedido.segredo, null)};
    } else if (pedido.acao === 'ler') {
        resposta = {valor: Secret.password_lookup_sync(schema, attributes, null)};
    } else if (pedido.acao === 'apagar') {
        Secret.password_clear_sync(schema, attributes, null);
        resposta = {ok: true};
    } else throw new Error('cofre_falha');
    print(JSON.stringify(resposta));
} catch (error) {
    const detalhe = String(error);
    const negado = error instanceof GLib.Error &&
        (error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.PERMISSION_DENIED) ||
        error.matches(Gio.dbus_error_quark(), Gio.DBusError.ACCESS_DENIED));
    const conhecidos = ['cofre_indisponivel', 'cofre_nao_configurado', 'cofre_bloqueado'];
    const erro = conhecidos.find(c => detalhe === 'Error: ' + c) ||
        (negado || /AccessDenied|PermissionDenied/.test(detalhe) ? 'cofre_acesso_negado' :
        /IsLocked/.test(detalhe) ? 'cofre_bloqueado' :
        /ServiceUnknown|NameHasNoOwner|Disconnected/.test(detalhe) ? 'cofre_indisponivel' : 'cofre_falha');
    print(JSON.stringify({erro}));
}
`;
