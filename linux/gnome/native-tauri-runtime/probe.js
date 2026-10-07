import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class Probe extends Extension {
    enable() {
        let phase = 0, cycles = 0, waits = 0;
        const call = (dest, path, iface, method, args, type) => new Promise((resolve, reject) => Gio.DBus.session.call(dest, path, iface, method, args, new GLib.VariantType(type), Gio.DBusCallFlags.NO_AUTO_START, 1500, null, (bus, result) => { try { resolve(bus.call_finish(result).deep_unpack()[0]); } catch (error) { reject(error); } }));
        const finish = message => { GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), message + '\n'); if (this._timer) GLib.source_remove(this._timer); this._timer = 0; return GLib.SOURCE_REMOVE; };
        let busy = false;
        const step = async () => {
            try {
                if (Main.layoutManager._startingUp) return GLib.SOURCE_CONTINUE;
                Main.overview.hide();
                const win = global.display.list_all_windows().find(w => w.get_title() === 'Ilha do Niko — experimental');
                if (phase === 0) {
                    const props = await call('com.niko.Ilha.Integracao', '/com/niko/Ilha/Integracao', 'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', ['com.niko.Ilha.Integracao']), '(a{sv})');
                    if (props.State.deep_unpack() !== 'active' || props.Revision.deep_unpack() !== GLib.getenv('NIKO_RUNTIME_REVISION')) throw Error('runtime revision/state mismatch');
                    const owner = name => call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetNameOwner', new GLib.Variant('(s)', [name]), '(s)');
                    if (await owner('org.gnome.Shell') !== await owner('com.niko.Ilha.Integracao')) throw Error('runtime owner mismatch');
                    Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance', 'org.SingleInstance.DBus', 'ExecuteCallback', new GLib.Variant('(ass)', [['niko','--mostrar-ilha'],'']), null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null, null);
                    phase = 1;
                } else if (phase === 1) {
                    if (!win && ++waits < 15) { phase = 0; return GLib.SOURCE_CONTINUE; }
                    if (!win || !win.get_compositor_private()?.mapped || global.display.focus_window !== win) throw Error('Tauri map/focus mismatch');
                    const rect = win.get_frame_rect(), monitor = Main.layoutManager.primaryMonitor;
                    if (rect.x !== monitor.x + Math.max(0, Math.floor((monitor.width - rect.width)/2)) || rect.y !== monitor.y + Main.panel.height + 8) throw Error('anchor mismatch');
                    if (global.display.get_tab_list(Meta.TabList.NORMAL_ALL,null).includes(win)) throw Error('tablist leak');
                    console.log(`RUNTIME TAURI cycle=${cycles} revision=${GLib.getenv('NIKO_RUNTIME_REVISION')} pid=${win.get_pid()}`);
                    win.delete(global.get_current_time()); phase = 2; waits = 0;
                } else {
                    if (win && ++waits < 10) return GLib.SOURCE_CONTINUE;
                    if (win) throw Error('Tauri hide failed');
                    if (++cycles === 5) return finish(`PASS: runtime package revision=${GLib.getenv('NIKO_RUNTIME_REVISION')}; real Tauri five map/hide/remap; owner/anchor/focus/tablist`);
                    phase = 0; waits = 0;
                }
                return GLib.SOURCE_CONTINUE;
            } catch (error) { return finish(`FAIL: ${error.message}`); }
        };
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            if (!busy) { busy = true; void step().finally(() => { busy = false; }); }
            return GLib.SOURCE_CONTINUE;
        });
    }
    disable() { if (this._timer) GLib.source_remove(this._timer); this._timer = 0; }
}
