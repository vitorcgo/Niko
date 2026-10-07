import os
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gio, GLib, Gtk

app = Gtk.Application(application_id='com.niko.desktop', flags=Gio.ApplicationFlags.NON_UNIQUE)
xml = '''<node><interface name="org.SingleInstance.DBus"><method name="ExecuteCallback"><arg type="as" direction="in"/><arg type="s" direction="in"/></method><method name="Test"><arg type="s" direction="in"/></method></interface></node>'''
owner = None
denied = False
resources = []

def activate(application):
    global owner
    island = Gtk.ApplicationWindow(application=application, title='Ilha do Niko — experimental')
    island.set_default_size(400, 120)
    island.set_decorated(False)
    other = Gtk.ApplicationWindow(application=application, title='Janela de controle')
    other.set_default_size(300, 200)
    def call(connection, sender, path, interface, method, parameters, invocation):
        global denied
        print(method, parameters.unpack(), flush=True)
        if method == 'ExecuteCallback':
            if denied:
                invocation.return_dbus_error('org.freedesktop.DBus.Error.AccessDenied', 'fictitious permission denied')
                return
            island.show_all()
            if os.environ.get('NIKO_NATIVE_SHOW_ONLY') != '1':
                delay = int(os.environ.get('NIKO_NATIVE_PRESENT_DELAY_MS', '0'))
                if not 0 <= delay <= 1000:
                    raise ValueError('present delay must be between 0 and 1000 ms')
                if delay:
                    def present():
                        island.present()
                        return GLib.SOURCE_REMOVE
                    GLib.timeout_add(delay, present)
                else:
                    island.present()
        else:
            action = parameters.unpack()[0]
            if action == 'hide': island.set_visible(False)
            elif action == 'other': other.present()
            elif action == 'fullscreen':
                other.fullscreen()
                other.present()
            elif action == 'unfullscreen': other.unfullscreen()
            elif action == 'deny': denied = True
            elif action == 'release': Gio.bus_unown_name(owner)
        invocation.return_value(GLib.Variant('()', ()))
    connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    resources.extend([island, other, connection, call])
    connection.register_object('/com/niko/desktop/SingleInstance', Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0], call, None, None)
    owner = Gio.bus_own_name_on_connection(connection, 'com.niko.desktop.SingleInstance', Gio.BusNameOwnerFlags.NONE, None, None)
    print('client active, owner', owner, flush=True)
    application.hold()
app.connect('activate', activate)
app.run([])
