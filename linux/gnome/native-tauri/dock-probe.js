import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Niko from './production.js';

export default class Probe extends Niko {
    enable() {
        if (GLib.getenv('NIKO_TAURI_HEADLESS') !== '1') throw Error('Cliques virtuais exigem compositor headless privado');
        super.enable();
        if (GLib.getenv('NIKO_CONTROLES_NATIVE') === '1') {
            this._toolsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                if (Main.screenshotUI.visible) { GLib.file_set_contents(lab + '/capture-ui-pass', 'PASS'); Main.screenshotUI.close(); }
                if (Main.keyboard.visible) { GLib.file_set_contents(lab + '/keyboard-ui-pass', 'PASS'); Main.keyboard.close(); }
                return GLib.SOURCE_CONTINUE;
            });
        }
        this._focusTrace = global.display.connect('notify::focus-window', () => console.log(`FOCUS TRACE ${global.display.focus_window?.get_title()} last=${this._lastAppWindow?.get_title()}`));
        this._mapTrace = global.window_manager.connect('map', (_manager, actor) => console.log(`MAP TRACE ${actor.meta_window?.get_title()}`));
        this._toggleCount = 0;
        const toggle = this._toggleSystem.bind(this);
        this._toggleSystem = () => { this._toggleCount++; console.log('NIKO TOGGLE FROM HTTP'); return toggle(); };
        const act = this._actWindow.bind(this);
        this._actWindow = (action, id) => { console.log(`DOCK ACTION ${action}`); return act(action, id); };
        this._previewCount = 0;
        const preview = this._preview.bind(this);
        this._preview = id => { this._previewCount++; return preview(id); };
        let step = 0, waits = 0, inputStep = 0, beforeHover = 0;
        const lab = GLib.getenv("NIKO_NATIVE_LAB");
        const mode = GLib.getenv('NIKO_DOCK_MODO') ?? 'fixo';
        const click = (x, y, press = true) => {
            this._pointer ??= Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
            const time = GLib.get_monotonic_time();
            const offset = this._pointerOffset ?? [0, 0];
            this._pointer.notify_absolute_motion(time, x + offset[0], y + offset[1]);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                // Nested backend usa coordenadas da superfície externa; calibrar pelo ponteiro do Shell.
                const [actualX, actualY] = global.get_pointer();
                this._pointerOffset = [offset[0] + x - actualX, offset[1] + y - actualY];
                if (Math.abs(actualX - x) > 1 || Math.abs(actualY - y) > 1)
                    this._pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + this._pointerOffset[0], y + this._pointerOffset[1]);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    const [px, py] = global.get_pointer();
                    if (Math.abs(px - x) > 1 || Math.abs(py - y) > 1) {
                        finish(`FAIL: ponteiro nested não alcançou ${x},${y}: ${px},${py}`);
                        return GLib.SOURCE_REMOVE;
                    }
                    if (!press) return GLib.SOURCE_REMOVE;
                    const chain = [];
                    for (let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, px, py); actor; actor = actor.get_parent())
                        chain.push(actor.constructor.name + ':' + (actor.meta_window?.get_title() ?? actor.get_name()));
                    const frame = this._dock.win.get_frame_rect(), buffer = this._dock.win.get_buffer_rect();
                    console.log(`CLICK ${px},${py} target=${chain.join('/')} frame=${frame.x},${frame.y},${frame.width}x${frame.height} buffer=${buffer.x},${buffer.y},${buffer.width}x${buffer.height}`);
                    this._pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                        this._pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
                        return GLib.SOURCE_REMOVE;
                    });
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            });
        };
        const finish = message => { GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_RESULT'), message + '\n'); this._probe = 0; return GLib.SOURCE_REMOVE; };
        const assert = (ok, message) => { if (!ok) throw Error(message); };
        this._probe = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            try {
                if (Main.layoutManager._startingUp) return GLib.SOURCE_CONTINUE;
                if (inputStep !== 4) Main.overview.hide();
                const windows = global.display.list_all_windows();
                const dock = windows.find(win => this._isDock(win));
                const system = windows.find(win => win.get_title() === 'Niko');
                if (step === 0) {
                    if ((!dock || !system) && ++waits < 30) return GLib.SOURCE_CONTINUE;
                    assert(dock && system, 'dock/system não mapeados');
                    assert(dock.get_compositor_private()?.mapped, 'dock sem ator mapeado');
                    assert(!global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).includes(dock), 'dock vazou AltTab');
                    if (this._dockTimer) return GLib.SOURCE_CONTINUE; // aguarda a restauração explicitamente adiada após map
                    assert(global.display.focus_window !== dock, `dock roubou foco last=${this._lastAppWindow?.get_title()} previous=${this._dock?.previous?.get_title()} systemVisible=${system.showing_on_its_workspace()} dockTimer=${this._dockTimer}`);
                    const frame = dock.get_frame_rect(), monitor = Main.layoutManager.primaryMonitor;
                    assert(frame.y === monitor.y + monitor.height - frame.height && frame.x === monitor.x + Math.floor((monitor.width - frame.width) / 2), `dock sem âncora ${frame.x},${frame.y},${frame.width}x${frame.height} monitor=${monitor.x},${monitor.y},${monitor.width}x${monitor.height}`);
                    assert(frame.width < monitor.width && frame.height <= 200, `dock intercepta tela excessiva frame=${frame.x},${frame.y},${frame.width}x${frame.height} monitor=${monitor.width}x${monitor.height}`);
                    const area = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor.index);
                    const reservationReady=this._reserveDock === (mode === 'fixo') && area.y + area.height === monitor.y + monitor.height - (mode === 'fixo' ? 62 : 0);
                    if(!reservationReady && ++waits < 20)return GLib.SOURCE_CONTINUE;
                    assert(reservationReady, 'reserva de espaço não confirmou após inicialização do frontend');
                    const fixture = Gio.Subprocess.new(['/usr/bin/gjs', '-m', GLib.getenv('NIKO_NATIVE_REPO') + '/linux/gnome/native-tauri/dock-fixture.js'], Gio.SubprocessFlags.NONE);
                    GLib.file_set_contents(GLib.getenv('NIKO_NATIVE_LAB') + '/fixture.pid', fixture.get_identifier());
                    const child = Gio.Subprocess.new([GLib.getenv('NIKO_NATIVE_REPO') + '/src-tauri/recursos/node', GLib.getenv('NIKO_NATIVE_REPO') + '/linux/gnome/native-tauri/dock-client.mjs'], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
                    step = 1;
                    child.communicate_utf8_async(null, null, (process, result) => {
                        try {
                            const [, stdout, stderr] = process.communicate_utf8_finish(result);
                            console.log(stdout); if (stderr) console.log(stderr);
                            assert(process.get_successful() && stdout.includes('PASS:'), 'backend de janelas falhou');
                            assert(inputStep === 4, 'entrada gráfica não terminou');
                            Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance', 'org.SingleInstance.DBus', 'ExecuteCallback', new GLib.Variant('(ass)', [['niko'], '']), null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null, null);
                            step = 2;
                        } catch (error) { finish(`FAIL: ${error.message}`); }
                    });
                } else if (step === 1) {
                    const fixture = windows.find(win => win.get_title() === 'Fixture dock privada');
                    const monitor = Main.layoutManager.primaryMonitor;
                    if (inputStep === 0 && fixture && GLib.file_test(lab + '/fixture-ready', GLib.FileTest.EXISTS)) {
                        fixture.move_resize_frame(false, monitor.x + 100, monitor.y + 100, 600, mode === 'inteligente' ? 500 : 400);
                        Main.activateWindow(fixture, global.get_current_time());
                        click(monitor.x + monitor.width / 2, dock.get_frame_rect().y + 10);
                        inputStep = 1;
                    } else if (inputStep === 1) {
                        assert(global.display.focus_window === fixture, `região transparente interceptou clique: foco=${global.display.focus_window?.get_title()} fixture=${JSON.stringify([fixture?.get_frame_rect().x,fixture?.get_frame_rect().y,fixture?.get_frame_rect().width,fixture?.get_frame_rect().height])} ponteiro=${global.get_pointer()}`);
                        if (mode === 'inteligente') assert(!fixture.maximized_horizontally && !fixture.maximized_vertically && JSON.parse(this._stateDock()).cobre, 'janela sem maximização sobreposta não ocultou dock');
                        const stream = Gio.File.new_for_path(lab + '/dock.png').replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
                        const texture = dock.get_compositor_private().paint_to_content(null).get_texture();
                        void Shell.Screenshot.composite_to_stream(texture, 0, 0, -1, -1, 1, null, 0, 0, 1, stream)
                            .then(() => stream.close(null)).catch(error => console.error(error));
                        if (mode !== 'fixo') {
                            click(monitor.x + monitor.width / 2 - 30, monitor.y + monitor.height - 31);
                            inputStep = 1.1;
                        } else {
                            click(monitor.x + monitor.width / 2 - 30, monitor.y + monitor.height - 31);
                            inputStep = 2;
                        }
                    } else if (inputStep === 1.1) {
                        assert(global.display.focus_window !== dock && this._toggleCount === 0, 'dock oculto recebeu clique de conteúdo');
                        Main.activateWindow(fixture, global.get_current_time());
                        click(monitor.x + monitor.width / 2, monitor.y + monitor.height - 2, false);
                        inputStep = 1.5;
                    } else if (inputStep === 1.5) {
                        click(monitor.x + monitor.width / 2 - 30, monitor.y + monitor.height - 31);
                        inputStep = 2;
                    } else if (inputStep === 2) {
                        assert(global.display.focus_window === system, `clique no logo não ativou sistema: foco=${global.display.focus_window?.get_title()} ultimo=${this._lastAppWindow?.get_title()} chamadas=${this._toggleCount}`);
                        beforeHover = this._previewCount;
                        click(monitor.x + monitor.width / 2 + 30, monitor.y + monitor.height - 31, false);
                        inputStep = 2.5;
                    } else if (inputStep === 2.5) {
                        assert(this._previewCount > beforeHover, 'frontend não solicitou miniatura ao passar mouse');
                        const stream = Gio.File.new_for_path(lab + '/dock-preview.png').replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
                        const texture = dock.get_compositor_private().paint_to_content(null).get_texture();
                        void Shell.Screenshot.composite_to_stream(texture, 0, 0, -1, -1, 1, null, 0, 0, 1, stream)
                            .then(() => stream.close(null)).catch(error => console.error(error));
                        click(monitor.x + monitor.width / 2 + 30, monitor.y + monitor.height - 31);
                        inputStep = 3;
                    } else if (inputStep === 3) {
                        assert(global.display.focus_window === fixture, `clique no app não passou por frontend/HTTP: foco=${global.display.focus_window?.get_title()} minimizada=${fixture?.minimized}`);
                        inputStep = 4;
                        GLib.file_set_contents(lab + '/input-pass', 'PASS');
                    }
                } else if (step === 2) {
                    assert(system && dock, 'sistema não reabriu');
                    system.make_fullscreen(); Main.activateWindow(system, global.get_current_time()); step = 3;
                } else if (step === 3) {
                    assert(dock && !dock.get_compositor_private()?.visible && this._dock?.hidden, 'fullscreen não ocultou dock');
                    assert(global.display.focus_window === system, 'fullscreen perdeu foco');
                    const area = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(Main.layoutManager.primaryMonitor.index);
                    assert(area.y + area.height === Main.layoutManager.primaryMonitor.y + Main.layoutManager.primaryMonitor.height, 'fullscreen manteve reserva');
                    system.unmake_fullscreen(); step = 4;
                } else if (step === 4) {
                    assert(dock?.get_compositor_private()?.visible && !this._dock?.hidden, 'dock não restaurou');
                    assert(global.display.focus_window === system, 'restauração roubou foco');
                    this._show();step=4.5;waits=0;
                } else if (step === 4.5) {
                    const island=this._findWindow();
                    if((!island||!island.get_compositor_private()?.mapped||this._pending||this._activation)&&++waits<10)return GLib.SOURCE_CONTINUE;
                    assert(island?.get_compositor_private()?.mapped,'ilha privada não abriu antes da recarga');
                    this._beforeReloadIsland=island;
                    this._beforeReloadFocus=global.display.focus_window;this._beforeReloadDock=dock;
                    Niko.prototype.disable.call(this);Niko.prototype.enable.call(this);step=5;
                } else if (step === 5) {
                    const monitor=Main.layoutManager.primaryMonitor,frame=dock?.get_frame_rect();
                    assert(dock===this._beforeReloadDock && this._dock?.win===dock,'dock existente não adotado após recarga '+JSON.stringify({mesmo:dock===this._beforeReloadDock,adotado:!!this._dock,mapped:dock?.get_compositor_private()?.mapped,visible:dock?.get_compositor_private()?.visible}));
                    assert(frame.x===monitor.x+Math.floor((monitor.width-frame.width)/2)&&frame.y===monitor.y+monitor.height-frame.height,'recarga deixou dock solto');
                    assert(this._window===this._beforeReloadIsland,'ilha existente não adotada após recarga');
                    const islandFrame=this._window.get_frame_rect();
                    assert(islandFrame.x===monitor.x+Math.max(0,Math.floor((monitor.width-islandFrame.width)/2))&&islandFrame.y===monitor.y+Main.panel.height+8,'recarga deixou ilha solta');
                    assert(global.display.focus_window===this._beforeReloadFocus,'recarga roubou foco');
                    const area=global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor.index);
                    assert(area.y+area.height===monitor.y+monitor.height-(mode==='fixo'?62:0),'reserva não recuperou após recarga');
                    return finish('PASS: dock Tauri/WebKit real, âncora, tamanho, AltTab, modo=' + mode + ', reserva, fullscreen, recarga com janela existente sem foco; Node/GJS ações nativas e stale ID');
                }
                return GLib.SOURCE_CONTINUE;
            } catch (error) { return finish(`FAIL: ${error.message}`); }
        });
    }
    disable() {
        if (this._toolsTimer) { GLib.source_remove(this._toolsTimer); this._toolsTimer = 0; }
        if (this._probe) GLib.source_remove(this._probe);
        this._probe = 0;
        this._pointer?.run_dispose(); this._pointer = null;
        global.display.disconnect(this._focusTrace);
        global.window_manager.disconnect(this._mapTrace);
        super.disable();
    }
}
