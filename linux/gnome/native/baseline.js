import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class Baseline extends Extension {
    enable() {
        let step = 0;
        let attempts = 0;
        const call = (method, variant) => Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance', 'org.SingleInstance.DBus', method, variant, null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null, null);
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            if (Main.layoutManager._startingUp) return GLib.SOURCE_CONTINUE;
            Main.overview.hide();
            const win = global.display.list_all_windows().find(w => w.get_title() === 'Ilha do Niko — experimental');
            const phase = step % 3;
            if (phase === 0) call('ExecuteCallback', new GLib.Variant('(ass)', [['niko', '--mostrar-ilha'], '']));
            if (phase === 1) {
                if (!win && ++attempts < 5) return GLib.SOURCE_CONTINUE;
                if (!win) {
                    GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), `FAIL: baseline map cycle ${step}\n`);
                    this._timer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                attempts = 0;
                call('Test', new GLib.Variant('(s)', ['hide']));
            }
            if (phase === 2) {
                if (win) {
                    GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), `FAIL: baseline hide cycle ${step}\n`);
                    this._timer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                call('Test', new GLib.Variant('(s)', ['other']));
            }
            if (++step >= 15) {
                GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), 'PASS: baseline five GTK hide/remap cycles without production extension\n');
                this._timer = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }
    disable() { if (this._timer) GLib.source_remove(this._timer); }
}
