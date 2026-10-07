import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Niko from './production.js';

export default class MonitorProbe extends Niko {
    enable() {
        super.enable();
        let step = 0;
        let waits = 0;
        let busy = false;
        const assert = (condition, message) => { if (!condition) throw Error(message); };
        const finish = message => {
            GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), message + '\n');
            if (this._probe) GLib.source_remove(this._probe);
            this._probe = 0;
            return GLib.SOURCE_REMOVE;
        };
        const bus = Gio.DBus.session;
        const dest = 'org.gnome.Mutter.DisplayConfig';
        const path = '/org/gnome/Mutter/DisplayConfig';
        const call = (iface, method, params) => new Promise((resolve, reject) => bus.call(dest, path, iface, method, params, null, Gio.DBusCallFlags.NO_AUTO_START, 3000, null, (connection, result) => {
            try { resolve(connection.call_finish(result).deep_unpack()); } catch (e) { reject(e); }
        }));
        const state = () => call(dest, 'GetCurrentState', null);
        const ownerPid = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [dest]), null, Gio.DBusCallFlags.NO_AUTO_START, 1000, null).deep_unpack()[0];
        const expectedPid = Number(new TextDecoder().decode(GLib.file_get_contents(GLib.getenv('NIKO_NATIVE_LAB') + '/shell.pid')[1]));
        assert(ownerPid === expectedPid, 'DisplayConfig owner is not nested compositor');
        const mode = monitor => monitor[1].find(m => m[6]['is-current']?.deep_unpack()) ?? monitor[1][0];
        const configure = async (fractional, single = false) => {
            const current = await state();
            const monitors = current[1];
            assert(monitors.length === 2, 'two dummy physical monitors not exposed');
            const first = mode(monitors[0]);
            const second = mode(monitors[1]);
            const scale = fractional ? 1.25 : 2;
            assert(second[5].includes(scale), `scale ${scale} not supported: ${second[5]}`);
            const config = [[0, 0, 1, 0, single, [[monitors[0][0][0], first[0], {}]]]];
            if (!single) config.push([first[1], 0, scale, 0, true, [[monitors[1][0][0], second[0], {}]]]);
            const props = {'layout-mode': new GLib.Variant('u', 1)};
            await call(dest, 'ApplyMonitorsConfig', new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [current[0], 0, config, props]));
            await call(dest, 'ApplyMonitorsConfig', new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [(await state())[0], 1, config, props]));
            console.log(`MONITORS apply fractional=${fractional} single=${single} config=${JSON.stringify(config)}`);
        };
        const anchor = () => {
            const win = this._findWindow();
            assert(win, 'island not mapped');
            const frame = win.get_frame_rect();
            const monitor = Main.layoutManager.primaryMonitor;
            assert(win.get_monitor() === monitor.index, 'island on wrong monitor');
            assert(frame.x === monitor.x + Math.max(0, Math.floor((monitor.width - frame.width) / 2)), 'island horizontal anchor wrong');
            assert(frame.y === monitor.y + Main.panel.height + 8, 'island vertical anchor wrong');
            assert(frame.width <= monitor.width && frame.height + Main.panel.height + 8 <= monitor.height, 'island exceeds available logical monitor');
            console.log(`MONITORS anchored index=${monitor.index} x=${frame.x} y=${frame.y} width=${frame.width} height=${frame.height} primaryX=${monitor.x} monitors=${Main.layoutManager.monitors.length}`);
        };
        this._probe = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            if (busy) return GLib.SOURCE_CONTINUE;
            busy = true;
            (async () => { try {
                if (Main.layoutManager._startingUp) return GLib.SOURCE_CONTINUE;
                Main.overview.hide();
                if (step === 0) {
                    const allowed = (await call('org.freedesktop.DBus.Properties', 'Get', new GLib.Variant('(ss)', [dest, 'ApplyMonitorsConfigAllowed'])))[0].deep_unpack();
                    assert(allowed, 'monitor configuration unavailable');
                    const current = await state();
                    GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_LAB') + '/monitors-initial.json', JSON.stringify(current));
                    assert(Main.layoutManager.monitors.length === 2, 'two nested logical monitors required');
                    this._show();
                } else if (step === 1) {
                    if (!this._findWindow() && ++waits < 15) { this._show(); return GLib.SOURCE_CONTINUE; }
                    anchor();
                    await configure(false);
                } else if (step === 2) {
                    anchor();
                    assert(Main.layoutManager.primaryMonitor.x > 0, 'primary was not displaced');
                    assert((await state())[2].find(m => m[4])[2] === 2, 'integer scale was not applied');
                    await configure(true);
                } else if (step === 3) {
                    anchor();
                    const current = await state();
                    assert(current[2].find(m => m[4])[2] === 1.25, 'fractional scale was not applied');
                    await configure(false, true);
                } else {
                    assert(Main.layoutManager.monitors.length === 1, 'logical monitor not disabled');
                    anchor();
                    super.disable();
                    assert(!this._window && !this._pending && !this._activation, 'disable leaked resources');
                    return finish('PASS: real Tauri island; two nested monitors; displaced primary; scales 100%,200%,125%; logical monitor disable; anchor/cleanup');
                }
                step++;
                return GLib.SOURCE_CONTINUE;
            } catch (e) { finish(`FAIL: monitor step=${step}: ${e.message}`); }
            })().finally(() => { busy = false; });
            return GLib.SOURCE_CONTINUE;
        });
    }
    disable() {
        if (this._probe) GLib.source_remove(this._probe);
        this._probe = 0;
        if (this._button) super.disable();
    }
}
