import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Niko from './production.js';

const Baseline = GLib.getenv('NIKO_TAURI_BASELINE') === '1';
export default class Probe extends (Baseline ? Extension : Niko) {
    enable() {
        if (!Baseline) super.enable();
        let cycle = 0;
        let phase = 0;
        let waits = 0;
        let fullscreenStep = -1;
        const finish = message => {
            GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), message + '\n');
            this._probe = 0;
            return GLib.SOURCE_REMOVE;
        };
        this._probe = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            try {
                if (Main.layoutManager._startingUp) return GLib.SOURCE_CONTINUE;
                Main.overview.hide();
                const win = global.display.list_all_windows().find(w => w.get_title() === 'Ilha do Niko — experimental');
                if (fullscreenStep >= 0) {
                    const system = global.display.list_all_windows().find(w => w.get_title() === 'Niko');
                    const assert = (ok, message) => { if (!ok) throw Error(message); };
                    const fullscreen = () => global.display.get_monitor_in_fullscreen(Main.layoutManager.primaryMonitor.index);
                    if (fullscreenStep === 0) {
                        Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance', 'org.SingleInstance.DBus', 'ExecuteCallback', new GLib.Variant('(ass)', [['niko'], '']), null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null, null);
                    } else if (fullscreenStep === 1) {
                        assert(system, 'system window missing');
                        system.make_fullscreen();
                        Main.activateWindow(system, global.get_current_time());
                    } else if (fullscreenStep === 2) {
                        assert(fullscreen(), 'Tauri system not fullscreen');
                        assert(win && !win.get_compositor_private()?.visible && this._hiddenActor, 'fullscreen did not hide Tauri island');
                        assert(global.display.focus_window === system, 'fullscreen focus mismatch');
                        this._show();
                        assert(!this._activation && !this._pending, 'fullscreen show scheduled work');
                        system.unmake_fullscreen();
                    } else if (fullscreenStep === 3) {
                        assert(!fullscreen() && win?.get_compositor_private()?.visible && !this._hiddenActor, 'fullscreen exit did not restore Tauri actor');
                        assert(global.display.focus_window === system, 'fullscreen exit stole focus');
                        system.make_fullscreen();
                    } else if (fullscreenStep === 4) {
                        assert(fullscreen() && this._hiddenActor, 'second fullscreen not applied');
                        win.delete(global.get_current_time());
                    } else if (fullscreenStep === 5) {
                        assert(!win && !this._window && !this._hiddenActor, 'hide during fullscreen leaked window/actor');
                        system.unmake_fullscreen();
                    } else if (fullscreenStep === 6) {
                        assert(!win && !fullscreen(), 'fullscreen exit revived Tauri island');
                        this._show();
                    } else {
                        assert(win?.get_compositor_private()?.visible, 'remap after Tauri fullscreen failed');
                        return finish('PASS: five real Tauri/WebKit show/hide/remap cycles; native Tauri fullscreen hide/restore/no-focus; hide during fullscreen; baseline=false');
                    }
                    console.log(`TAURI fullscreen step=${fullscreenStep} fullscreen=${fullscreen()}`);
                    fullscreenStep++;
                    return GLib.SOURCE_CONTINUE;
                }
                if (phase === 0) {
                    Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance',
                        'org.SingleInstance.DBus', 'ExecuteCallback',
                        new GLib.Variant('(ass)', [['niko', '--mostrar-ilha'], '']),
                        null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null,
                        (bus, result) => { try { bus.call_finish(result); } catch (e) { console.error(e); } });
                    phase = 1;
                } else if (phase === 1) {
                    if (!win && ++waits < 15) { phase = 0; return GLib.SOURCE_CONTINUE; }
                    if (!win) throw Error(`Tauri did not map cycle ${cycle}`);
                    if (!win.get_compositor_private()?.mapped) throw Error('actor not mapped');
                    if (!Baseline) {
                        const rect = win.get_frame_rect();
                        const monitor = Main.layoutManager.primaryMonitor;
                        if (rect.x !== monitor.x + Math.max(0, Math.floor((monitor.width - rect.width) / 2)) ||
                            rect.y !== monitor.y + Main.panel.height + 8) throw Error('anchor mismatch');
                        if (global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).includes(win)) throw Error('tablist leak');
                    }
                    if (global.display.focus_window !== win) throw Error('focus mismatch');
                    console.log(`TAURI cycle=${cycle} mapped focus=true pid=${win.get_pid()} size=${JSON.stringify(win.get_frame_rect())}`);
                    // CloseRequested passa pelo handler Rust real que oculta, sem destruir Webview.
                    if (cycle === 4 && !Baseline) {
                        fullscreenStep = 0;
                        return GLib.SOURCE_CONTINUE;
                    }
                    win.delete(global.get_current_time());
                    phase = 2;
                    waits = 0;
                } else {
                    if (win && ++waits < 10) return GLib.SOURCE_CONTINUE;
                    if (win) throw Error(`Tauri did not hide cycle ${cycle}`);
                    if (!Baseline && this._window) throw Error('stale Meta.Window');
                    if (++cycle === 5) return finish(`PASS: five real Tauri/WebKit show/hide/remap cycles; baseline=${Baseline}`);
                    phase = 0;
                    waits = 0;
                }
                return GLib.SOURCE_CONTINUE;
            } catch (e) { return finish(`FAIL: ${e.message}`); }
        });
    }
    disable() {
        if (this._probe) GLib.source_remove(this._probe);
        this._probe = 0;
        if (!Baseline) super.disable();
    }
}
