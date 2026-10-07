// Cliente privado persistente: mantém o serviço GNOME Extensions vivo no laboratório.
const {Gio, GLib} = imports.gi;
Gio.DBus.session.call_sync('org.gnome.Shell.Extensions', '/org/gnome/Shell/Extensions',
    'org.gnome.Shell.Extensions', 'GetExtensionInfo', new GLib.Variant('(s)', ['niko-ilha@local']),
    new GLib.VariantType('(a{sv})'), Gio.DBusCallFlags.NONE, 3000, null);
print('READY');
new GLib.MainLoop(null, false).run();
