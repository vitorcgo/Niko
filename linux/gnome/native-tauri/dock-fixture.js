import Gtk from 'gi://Gtk?version=3.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
if (!GLib.getenv('HOME')?.startsWith('/tmp/niko-tauri.') || !GLib.getenv('DBUS_SESSION_BUS_ADDRESS')?.includes(GLib.getenv('NIKO_NATIVE_LAB')))
    throw Error('fixture requer HOME/barramento privado');
const socket = GLib.getenv('NIKO_NESTED_SOCKET');
if (!socket?.startsWith('niko-tauri-') || GLib.getenv('XDG_RUNTIME_DIR') !== GLib.getenv('NIKO_NATIVE_LAB') + '/runtime')
    throw Error('fixture requer socket nested privado');
GLib.setenv('GDK_BACKEND', 'wayland', true);
GLib.setenv('WAYLAND_DISPLAY', socket, true);
const app = new Gtk.Application({application_id: 'org.niko.DockFixture', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({application: app, title: 'Fixture dock privada', default_width: 400, default_height: 300});
    window.add(new Gtk.Label({label: 'Somente janela de teste, sem dados pessoais'}));
    window.show_all();
});
app.run([]);
