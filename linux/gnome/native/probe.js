import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Niko from './production.js';

export default class Probe extends Niko {
    enable() {
        super.enable();
        let step = 0;
        this._waits = 0;
        const assert = (condition, message) => { if (!condition) throw Error(message); };
        const control = action => Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance', 'org.SingleInstance.DBus', 'Test', new GLib.Variant('(s)', [action]), null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null, null);
        const finish = message => GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), message);
        this._probe = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            try {
                if (step === 0) {
                    if (Main.layoutManager._startingUp) return GLib.SOURCE_CONTINUE;
                    Main.overview.hide();
                    if (!this._button.container.visible && ++this._waits < 10) return GLib.SOURCE_CONTINUE;
                    assert(this._button.container.visible, 'service not detected');
                    this._show();
                } else if (step <= 15) {
                    const phase = (step - 1) % 3;
                    if (phase === 0) {
                        const win = this._findWindow();
                        assert(win, `island not mapped locked=${Main.sessionMode.isLocked} greeter=${Main.sessionMode.isGreeter} fullscreen=${global.display.get_monitor_in_fullscreen(Main.layoutManager.primaryMonitor.index)} windows=${global.display.list_all_windows().map(w => w.get_title())}`);
                        const rect = win.get_frame_rect();
                        const monitor = Main.layoutManager.primaryMonitor;
                        assert(rect.x === monitor.x + Math.max(0, Math.floor((monitor.width - rect.width) / 2)), `horizontal anchor x=${rect.x} width=${rect.width} monitor=${JSON.stringify(monitor)} own=${this._window === win}`);
                        assert(rect.y === monitor.y + Main.panel.height + 8, `vertical anchor y=${rect.y} panel=${Main.panel.height}`);
                        assert(global.display.focus_window === win, 'mapped island focus');
                        assert(!global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).includes(win), 'island leaked into tablist');
                        control('hide');
                    } else if (phase === 1) {
                        assert(!this._findWindow(), 'hide did not unmanage island');
                        assert(!this._window, 'stale Meta.Window after hide');
                        control('other');
                    } else {
                        console.log(`TEST show step=${step} locked=${Main.sessionMode.isLocked} greeter=${Main.sessionMode.isGreeter} fullscreen=${global.display.get_monitor_in_fullscreen(Main.layoutManager.primaryMonitor.index)} button=${!!this._button}`);
                        this._show();
                    }
                } else if (step === 16) {
                    control('other');
                } else if (step === 17) {
                    const win = this._findWindow();
                    assert(global.display.focus_window !== win, 'control window did not take focus');
                    win.set_demands_attention();
                } else if (step === 18) {
                    assert(global.display.focus_window === this._findWindow(), 'attention did not restore focus');
                    control('fullscreen');
                } else if (step === 19) {
                    const actor = this._findWindow()?.get_compositor_private();
                    assert(global.display.get_monitor_in_fullscreen(Main.layoutManager.primaryMonitor.index), 'control window not fullscreen');
                    assert(actor && !actor.visible && this._hiddenActor === actor, 'fullscreen did not hide island actor');
                    assert(global.display.focus_window !== this._findWindow(), 'fullscreen lost control focus');
                    this._show();
                    assert(!this._pending && !this._activation, 'fullscreen show scheduled work');
                    control('unfullscreen');
                } else if (step === 20) {
                    assert(this._findWindow()?.get_compositor_private()?.visible && !this._hiddenActor, 'fullscreen exit did not restore actor');
                    assert(global.display.focus_window !== this._findWindow(), 'fullscreen exit stole focus');
                    control('fullscreen');
                } else if (step === 21) {
                    assert(this._hiddenActor, 'second fullscreen did not hide actor');
                    control('hide');
                } else if (step === 22) {
                    assert(!this._findWindow() && !this._window && !this._hiddenActor, 'hide during fullscreen leaked actor/window');
                    control('unfullscreen');
                } else if (step === 23) {
                    assert(!this._findWindow(), 'fullscreen exit revived hidden GTK window');
                    this._show();
                } else if (step === 24) {
                    assert(this._findWindow()?.get_compositor_private()?.visible, 'remap after fullscreen failed');
                    control('fullscreen');
                } else if (step === 25) {
                    const win = this._findWindow();
                    const actor = win?.get_compositor_private();
                    assert(actor && !actor.visible && this._hiddenActor === actor, 'third fullscreen did not hide actor');
                    super.disable();
                    assert(actor.visible && !this._hiddenActor, 'disable did not restore actor it hid');
                    assert(!this._activation && !this._pending && !this._window, 'disable while fullscreen leaked state');
                    super.enable();
                    control('unfullscreen');
                } else if (step === 26) {
                    this._show();
                } else if (step === 27) {
                    assert(this._findWindow()?.get_compositor_private()?.visible, 'enable after fullscreen failed');
                    control('other');
                } else if (step === 28) {
                    this._findWindow().set_demands_attention();
                } else if (step === 29) {
                    assert(global.display.focus_window === this._findWindow(), 'attention after fullscreen failed');
                } else if (step === 30) {
                    assert(global.display.focus_window === this._findWindow(), 'attention did not restore focus');
                    control('deny');
                } else if (step === 31) {
                    this._show();
                } else if (step === 32) {
                    assert(!this._pending, 'denied call left polling timer');
                    const win = this._findWindow();
                    assert(win, 'final remap');
                    super.disable();
                    assert(global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).includes(win), 'disable did not restore tablist');
                    assert(!this._activation && !this._pending && !this._window, 'disable leaked state');
                    super.enable();
                    control('release');
                } else if (step === 33) {
                    this._show();
                } else {
                    assert(!this._pending, 'absent service left polling timer');
                    assert(!this._button.container.visible, 'service disappearance did not hide button');
                    finish('PASS: five hide/remap cycles; native Mutter anchor/focus/tablist; attention focus; disable/enable; permission denial; service disappearance/missing; fullscreen hide/restore/no-focus; hide during fullscreen; disable actor cleanup\n');
                    this._probe = 0;
                    return GLib.SOURCE_REMOVE;
                }
                step++;
                return GLib.SOURCE_CONTINUE;
            } catch (error) {
                finish(`FAIL step ${step}: ${error.message}: ${error.stack}\n`);
                this._probe = 0;
                return GLib.SOURCE_REMOVE;
            }
        });
    }
    disable() {
        if (this._probe) GLib.source_remove(this._probe);
        this._probe = 0;
        super.disable();
    }
}
