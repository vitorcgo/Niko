import gi
from gi.repository import Gio, GLib

# Apenas contrato SNI privado para impedir fallback GtkStatusIcon do tray real.
xml = '''<node><interface name="org.kde.StatusNotifierWatcher">
<method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
<method name="RegisterStatusNotifierHost"><arg type="s" direction="in"/></method>
<property name="RegisteredStatusNotifierItems" type="as" access="read"/>
<property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
<property name="ProtocolVersion" type="i" access="read"/>
</interface></node>'''
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
def call(connection, sender, path, interface, method, parameters, invocation):
    print(method, parameters.unpack(), flush=True)
    invocation.return_value(GLib.Variant('()', ()))
def get(connection, sender, path, interface, name):
    return {'RegisteredStatusNotifierItems': GLib.Variant('as', []),
            'IsStatusNotifierHostRegistered': GLib.Variant('b', True),
            'ProtocolVersion': GLib.Variant('i', 0)}[name]
bus.register_object('/StatusNotifierWatcher', Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0], call, get, None)
owner = Gio.bus_own_name_on_connection(bus, 'org.kde.StatusNotifierWatcher', Gio.BusNameOwnerFlags.NONE, None, None)
GLib.MainLoop().run()
