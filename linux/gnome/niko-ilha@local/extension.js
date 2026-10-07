import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GdkPixbuf from 'gi://GdkPixbuf';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export default class NikoIlha extends Extension {
    enable() {
        this._lastAppWindow = global.display.focus_window;
        this._systemTimer = 0;
        this._systemRequest = (this._systemRequest ?? 0) + 1;
        this._dock = null;
        this._dockTimer = 0;
        this._reserveDock = false;
        this._reservation = null;
        this._windowEpoch = GLib.uuid_string_random();
        this._previews = new Set();
        const reply = callback => {
            try { return callback(); }
            catch (error) {
                const code = ['sessao_bloqueada', 'janela_invalida', 'acao_indisponivel', 'acao_invalida', 'acesso_janelas_recusado'].includes(error.message)
                    ? error.message : 'integracao_janelas_indisponivel';
                return JSON.stringify({erro: code});
            }
        };
        this._windowsDbus = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="com.niko.Janelas">
            <property name="Versao" type="s" access="read"/>
            <method name="Iniciar"><arg type="s" direction="out"/></method>
            <method name="Ferramenta"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
            <method name="AlternarNiko"><arg type="s" direction="out"/></method>
            <method name="EstadoDock"><arg type="s" direction="out"/></method>
            <method name="ReservarDock"><arg type="b" direction="in"/><arg type="s" direction="out"/></method>
            <method name="Listar"><arg type="s" direction="out"/></method>
            <method name="Miniatura"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
            <method name="Agir"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
            </interface></node>`, {get Versao() { return Config.PACKAGE_VERSION; },
            IniciarAsync: (params, invocation) => this._windowCall(params, invocation, () => {
                this._appWindows(); return JSON.stringify({aberto: Main.overview.visible});
            }, reply),
            FerramentaAsync: (params, invocation) => this._windowCall(params, invocation, async name => {
                this._appWindows();
                if (name === 'iniciar') { Main.overview.toggle(); return JSON.stringify({ok: true, aberto: Main.overview.visible}); }
                if (name === 'captura') { await Main.screenshotUI.open(); return JSON.stringify({ok: true}); }
                if (name === 'teclado') {
                    if (!Main.keyboard.keyboardActor) throw Error('acao_indisponivel');
                    if (Main.keyboard.visible) Main.keyboard.close(); else Main.keyboard.open(this._primaryMonitor().index);
                    return JSON.stringify({ok: true});
                }
                throw Error('acao_invalida');
            }, reply),
            ListarAsync: (params, invocation) => this._windowCall(params, invocation, () => this._listWindows(), reply),
            AgirAsync: (params, invocation) => this._windowCall(params, invocation, (action, id) => this._actWindow(action, id), reply),
            AlternarNikoAsync: (params, invocation) => this._windowCall(params, invocation, () => this._toggleSystem(), reply),
            EstadoDockAsync: (params, invocation) => this._windowCall(params, invocation, () => this._stateDock(), reply),
            ReservarDockAsync: (params, invocation) => this._windowCall(params, invocation, enabled => {
                this._appWindows(); this._reserveDock = enabled; this._positionDock(); return JSON.stringify({ok: true});
            }, reply),
            MiniaturaAsync: (params, invocation) => this._windowCall(params, invocation, id => this._preview(id), reply)});
        this._windowsDbus.export(Gio.DBus.session, '/com/niko/Janelas');
        this._pending = 0;
        this._activation = 0;
        this._request = (this._request ?? 0) + 1;
        this._window = null;
        this._sizeSignal = 0;
        this._positionSignal = 0;
        this._unmanagedSignal = 0;
        this._original = null;
        this._positioning = false;
        this._hiddenActor = null;
        this._injections = new InjectionManager();
        const isIsland = win => this._isIsland(win) || this._isDock(win);
        for (const [prototype, method] of [[Meta.Display.prototype, 'get_tab_list'], [Shell.App.prototype, 'get_windows']]) {
            this._injections.overrideMethod(prototype, method, original => function (...args) {
                return original.apply(this, args).filter(win => !isIsland(win));
            });
        }
        this._injections.overrideMethod(Workspace.Workspace.prototype, '_isOverviewWindow', original => function (win) {
            return !isIsland(win) && original.call(this, win);
        });
        this._button = new PanelMenu.Button(0.0, this.metadata.name, true);
        this._button.add_child(new St.Label({text: 'Niko', y_align: Clutter.ActorAlign.CENTER}));
        this._button.accessible_name = 'Mostrar ilha do Niko';
        this._button.connect('button-press-event', () => {
            this._cancelPending();
            this._show();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._button);
        this._button.container.hide();
        const button = this._button;
        // O serviço existe enquanto o app está aberto, inclusive com a ilha oculta.
        this._busWatch = Gio.bus_watch_name(
            Gio.BusType.SESSION, 'com.niko.desktop.SingleInstance',
            Gio.BusNameWatcherFlags.NONE,
            () => { if (this._button === button) button.container.show(); },
            () => {
                if (this._button !== button) return;
                this._cancelPending();
                button.container.hide();
            });
        this._focusSignal = global.display.connect('notify::focus-window', () => {
            const win = global.display.focus_window;
            if (win && !this._isIsland(win) && !this._isDock(win)) this._lastAppWindow = win;
        });
        this._mapSignal = global.window_manager.connect('map', (_manager, actor) => {
            const win = actor.meta_window;
            if (win && this._isDock(win)) this._anchorDock(win);
            if (win && this._isIsland(win)) {
                this._anchor(win);
                this._activateLater(win);
            }
        });
        this._monitorsSignal = Main.layoutManager.connect('monitors-changed', () => { this._position(); this._positionDock(); });
        this._fullscreenSignal = global.display.connect('in-fullscreen-changed', () => { this._position(); this._positionDock(); });
        this._sessionSignal = Main.sessionMode.connect('updated', () => { this._position(); this._positionDock(); });
        // Um pedido de foco Wayland para uma ilha já mapeada pode virar apenas “está pronta”.
        this._attentionSignals = ['window-demands-attention', 'window-marked-urgent'].map(signal =>
            global.display.connect(signal, (_display, win) => {
                if (!win || !this._isIsland(win)) return;
                this._anchor(win);
                this._activateLater(win);
            }));
        this._adoptWindows();
    }

    _adoptWindows() {
        // Atualização com o app aberto não emite um novo sinal map.
        for (const win of global.display.list_all_windows()) {
            if (!win.get_compositor_private()) continue;
            if (this._isIsland(win)) this._anchor(win);
            else if (this._isDock(win)) this._anchorDock(win, false);
        }
    }

    _authorizeWindows(sender) {
        const call = (method, value) => Gio.DBus.session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', method, new GLib.Variant('(s)', [value]), null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null).deep_unpack()[0];
        try {
            const owner = call('GetNameOwner', 'com.niko.desktop.SingleInstance');
            const rootPid = call('GetConnectionUnixProcessID', owner);
            const executable = GLib.file_read_link(`/proc/${rootPid}/exe`);
            const lab = GLib.getenv('NIKO_NATIVE_LAB');
            // ponytail: pacote .deb; desenvolvimento usa o laboratório privado, sem confiar só no app_id.
            const privatePackage = lab?.startsWith('/tmp/niko-tauri.') && GLib.getenv('HOME') === `${lab}/home` &&
                GLib.getenv('XDG_DATA_HOME') === `${lab}/data` && GLib.getenv('DBUS_SESSION_BUS_ADDRESS')?.includes(lab) &&
                executable === `${lab}/package/usr/bin/niko`;
            if (!['/usr/bin/niko', '/usr/bin/niko (deleted)'].includes(executable) && !privatePackage) throw Error();
            let pid = call('GetConnectionUnixProcessID', sender);
            for (let attempt = 0; attempt < 16 && pid > 1; attempt++) {
                if (pid === rootPid) return;
                const [, bytes] = GLib.file_get_contents(`/proc/${pid}/stat`);
                const stat = new TextDecoder().decode(bytes);
                pid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
            }
        } catch { /* Serviço ausente, processo encerrado ou árvore inacessível: recusar. */ }
        throw new Error('acesso_janelas_recusado');
    }

    _windowCall(params, invocation, action, reply) {
        const finish = result => invocation.return_value(new GLib.Variant('(s)', [result]));
        try {
            this._authorizeWindows(invocation.get_sender());
            Promise.resolve(action(...params)).then(result => {
                this._authorizeWindows(invocation.get_sender());
                finish(result);
            }).catch(error => finish(reply(() => { throw error; })));
        } catch (error) { finish(reply(() => { throw error; })); }
    }

    _isNiko(win) {
        const app = win.get_gtk_application_id() ?? win.get_wm_class();
        return ['com.niko.desktop', 'niko', 'Niko'].includes(app);
    }

    _isDock(win) {
        return this._isNiko(win) && win.get_title() === 'Dock do Niko — experimental';
    }

    _appWindows() {
        if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter) throw new Error('sessao_bloqueada');
        return global.display.list_all_windows().filter(win => !win.skip_taskbar &&
            !this._isNiko(win) &&
            [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(win.get_window_type()));
    }

    _windowId(win) { return `${this._windowEpoch}/${win.get_stable_sequence()}`; }

    _listWindows() {
        const windows = this._appWindows();
        const tracker = Shell.WindowTracker.get_default();
        const focus = global.display.focus_window;
        const active = focus && this._isDock(focus) ? this._lastAppWindow : focus;
        return JSON.stringify({janelas: windows.map(win => {
            const app = tracker.get_window_app(win);
            const name = app?.get_id() ?? win.get_gtk_application_id() ?? win.get_wm_class() ?? '';
            return {id: this._windowId(win), pid: win.get_pid(), titulo: win.get_title() ?? '',
                minimizada: win.minimized, ativa: active === win,
                app: name, nome: app?.get_name() ?? name, caminho: null, icone: null, iconeGnome: app?.get_app_info()?.get_icon()?.to_string() ?? null};
        })});
    }

    _actWindow(action, id) {
        if (!['focar', 'minimizar', 'fechar'].includes(action)) throw new Error('acao_invalida');
        const win = this._appWindows().find(candidate => this._windowId(candidate) === id);
        if (!win) throw new Error('janela_invalida');
        if (action === 'focar') Main.activateWindow(win, global.get_current_time());
        else if (action === 'minimizar') {
            if (!win.can_minimize()) throw new Error('acao_indisponivel');
            win.minimize();
        } else {
            if (!win.can_close()) throw new Error('acao_indisponivel');
            win.delete(global.get_current_time());
        }
        return JSON.stringify({ok: true});
    }

    async _preview(id) {
        const epoch = this._windowEpoch;
        const win = this._appWindows().find(candidate => this._windowId(candidate) === id);
        if (!win) throw new Error('janela_invalida');
        const actor = win.get_compositor_private();
        if (win.minimized || !win.showing_on_its_workspace() || !actor?.visible || !actor.mapped) return JSON.stringify({imagem: null});
        const pending = this._previews;
        if (pending.size >= 4 || pending.has(id)) throw new Error('acao_indisponivel');
        pending.add(id);
        const stream = Gio.MemoryOutputStream.new_resizable();
        try {
            const texture = actor.paint_to_content(null)?.get_texture();
            if (!texture) return JSON.stringify({imagem: null});
            const scale = Math.min(1, 184 / texture.get_width(), 104 / texture.get_height());
            if (!(scale > 0)) return JSON.stringify({imagem: null});
            const pixbuf = await Shell.Screenshot.composite_to_stream(texture, 0, 0, -1, -1, 1, null, 0, 0, 1, stream);
            if (epoch !== this._windowEpoch || !this._appWindows().includes(win)) throw new Error('janela_invalida');
            const small = pixbuf.scale_simple(Math.max(1, Math.floor(texture.get_width() * scale)),
                Math.max(1, Math.floor(texture.get_height() * scale)), GdkPixbuf.InterpType.BILINEAR);
            const [ok, bytes] = small.save_to_bufferv('png', [], []);
            if (!ok) throw new Error('acao_indisponivel');
            stream.close(null);
            return JSON.stringify({imagem: 'data:image/png;base64,' + GLib.base64_encode(bytes)});
        } finally {
            if (!stream.is_closed()) stream.close(null);
            pending.delete(id);
        }
    }

    _stateDock() {
        this._appWindows();
        const monitor = this._primaryMonitor();
        const focused = global.display.focus_window;
        const win = focused && this._isDock(focused) ? this._lastAppWindow : focused;
        const fullscreen = Boolean(monitor && global.display.get_monitor_in_fullscreen(monitor.index));
        const own = win && this._isNiko(win);
        const maximized = Boolean(win && win.get_maximized() === Meta.MaximizeFlags.BOTH);
        const normal = win && [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(win.get_window_type());
        const frame = normal && !own ? win.get_frame_rect() : null;
        // Região ocupada pelo dock, independente de maximização ou encaixe da janela.
        const dockFrame = this._dock?.win.get_frame_rect();
        const left = dockFrame?.x ?? monitor?.x;
        const right = dockFrame ? dockFrame.x + dockFrame.width : monitor ? monitor.x + monitor.width : 0;
        const bottom = monitor ? monitor.y + monitor.height : 0;
        const overlaps = Boolean(frame && monitor && frame.x < right && frame.x + frame.width > left &&
            frame.y < bottom && frame.y + frame.height > bottom - 62);
        const [x, y] = global.get_pointer();
        let picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        const actor = this._dock?.win.get_compositor_private();
        while (picked && picked !== actor) picked = picked.get_parent();
        const near = Boolean(actor && picked === actor || monitor && x >= monitor.x && x < monitor.x + monitor.width &&
            y >= monitor.y + monitor.height - 6 && y < monitor.y + monitor.height);
        return JSON.stringify({geracao: this._windowEpoch, cobre: fullscreen || Boolean(normal && !own && monitor && overlaps),
            telaCheia: fullscreen, maximizada: maximized,
            frente: own ? (this._isIsland(win) || this._isDock(win) ? 'sobreposta' : 'app') : normal ? 'app' : 'area_de_trabalho',
            cursorNoDock: near});
    }

    _removeReservation() {
        if (!this._reservation) return;
        Main.layoutManager.removeChrome(this._reservation);
        this._reservation.destroy();
        this._reservation = null;
    }

    _updateReservation(monitor, enabled) {
        if (!enabled || !monitor) { this._removeReservation(); return; }
        if (!this._reservation) {
            this._reservation = new St.Widget({name: 'niko-dock-reserva', reactive: false, opacity: 0});
            Main.layoutManager.addChrome(this._reservation, {affectsStruts: true, affectsInputRegion: false});
        }
        this._reservation.set_position(monitor.x, monitor.y + monitor.height - 62);
        this._reservation.set_size(monitor.width, 62);
    }

    _systemWindow() {
        return global.display.list_all_windows().find(win => this._isNiko(win) && win.get_title() === 'Niko');
    }

    _toggleSystem() {
        this._appWindows(); // Também recusa bloqueio/greeter.
        const request = ++this._systemRequest;
        if (this._systemTimer) GLib.source_remove(this._systemTimer);
        this._systemTimer = 0;
        const win = this._systemWindow();
        if (win) {
            const focus = global.display.focus_window;
            const wasFocused = focus === win || focus && this._isDock(focus) && this._lastAppWindow === win;
            if (!win.minimized && wasFocused && win.can_minimize()) win.minimize();
            else Main.activateWindow(win, global.get_current_time());
        } else {
            Gio.DBus.session.call('com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance',
                'org.SingleInstance.DBus', 'ExecuteCallback', new GLib.Variant('(ass)', [['niko'], '']),
                null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null, (bus, result) => {
                    try { bus.call_finish(result); } catch { return; }
                    if (request !== this._systemRequest) return;
                    let attempts = 0;
                    this._systemTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                        const target = this._systemWindow();
                        if (request === this._systemRequest && !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter) {
                            if (target) Main.activateWindow(target, global.get_current_time());
                            else if (++attempts < 12) return GLib.SOURCE_CONTINUE;
                        }
                        this._systemTimer = 0;
                        return GLib.SOURCE_REMOVE;
                    });
                });
        }
        return JSON.stringify({ok: true});
    }

    _anchorDock(win, restoreFocus = true) {
        this._restoreDock();
        const frame = win.get_frame_rect();
        this._dock = {win, previous: this._lastAppWindow, original: {x: frame.x, y: frame.y, monitor: win.get_monitor(),
            above: win.is_above(), sticky: win.is_on_all_workspaces()}, signals: [], hidden: null};
        this._dock.signals = [win.connect('size-changed', () => this._positionDock()),
            win.connect('position-changed', () => this._positionDock()),
            win.connect('unmanaging', () => this._restoreDock(false))];
        // Fora de map, sem foco: o dock fica acessível sobre janelas comuns.
        this._dockTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._dockTimer = 0;
            if (this._dock?.win === win && this._isManaged(win)) {
                win.stick(); win.make_above(); this._positionDock();
                const previous = [this._lastAppWindow, this._dock?.previous, this._systemWindow()].find(candidate =>
                    candidate && this._isManaged(candidate) && !candidate.minimized && candidate.showing_on_its_workspace() &&
                    candidate.located_on_workspace(global.workspace_manager.get_active_workspace()));
                // Wayland pode focar um toplevel novo apesar do accept_focus GTK.
                // Restaurar só o foco perdido neste map, nunca sobrescrever foco posterior.
                if (restoreFocus && global.display.focus_window === win && previous && this._isManaged(previous) &&
                    !previous.minimized && previous.showing_on_its_workspace() &&
                    !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter && !this._dock.hidden)
                    Main.activateWindow(previous, global.get_current_time());
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _positionDock() {
        const state = this._dock, monitor = this._primaryMonitor();
        if (!state || state.positioning || !this._isManaged(state.win)) return;
        const {win} = state, actor = win.get_compositor_private();
        const blocked = !monitor || Main.sessionMode.isLocked || Main.sessionMode.isGreeter ||
            global.display.get_monitor_in_fullscreen(monitor.index);
        this._updateReservation(monitor, this._reserveDock && !blocked);
        if (blocked) {
            if (actor?.visible && !state.hidden) { state.hidden = actor; actor.hide(); }
            return;
        }
        if (state.hidden) {
            if (actor === state.hidden && win.showing_on_its_workspace()) actor.show();
            state.hidden = null;
        }
        state.positioning = true;
        try {
            if (win.get_monitor() !== monitor.index) win.move_to_monitor(monitor.index);
            if (this._dock !== state || !this._isManaged(win)) return;
            const frame = win.get_frame_rect();
            const x = monitor.x + Math.max(0, Math.floor((monitor.width - frame.width) / 2));
            const y = monitor.y + Math.max(0, monitor.height - frame.height);
            // Toplevel Wayland é NORMAL: movimento explícito evita a restrição à própria reserva.
            if (frame.x !== x || frame.y !== y) win.move_frame(true, x, y);
        } finally { state.positioning = false; }
    }

    _restoreDock(restore = true) {
        this._removeReservation();
        if (this._dockTimer) GLib.source_remove(this._dockTimer);
        this._dockTimer = 0;
        const state = this._dock;
        this._dock = null;
        if (!state) return;
        const {win, original} = state;
        state.signals.forEach(id => win.disconnect(id));
        if (!restore || !this._isManaged(win)) return;
        if (state.hidden && state.hidden === win.get_compositor_private() && win.showing_on_its_workspace()) state.hidden.show();
        if (!original.above) win.unmake_above();
        if (!original.sticky) win.unstick();
        if (original.monitor >= 0 && original.monitor < global.display.get_n_monitors()) {
            win.move_to_monitor(original.monitor);
            if (this._isManaged(win)) win.move_frame(false, original.x, original.y);
        }
    }

    _cancelPending() {
        this._request++;
        this._cancelActivation();
        if (this._pending) GLib.source_remove(this._pending);
        this._pending = 0;
    }

    _findWindow() {
        return global.display.list_all_windows().find(win => this._isIsland(win));
    }

    _isIsland(win) {
        return this._isNiko(win) && win.get_title() === 'Ilha do Niko — experimental';
    }

    _primaryMonitor() {
        const monitor = Main.layoutManager.primaryMonitor;
        return monitor && monitor.index >= 0 && monitor.index < global.display.get_n_monitors() ? monitor : null;
    }

    _show() {
        if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter) return;
        const monitor = this._primaryMonitor();
        if (!monitor || global.display.get_monitor_in_fullscreen(monitor.index)) return;
        this._cancelPending();
        const request = this._request;
        // Usa o D-Bus da instância única já instalada; não inicia outro processo.
        Gio.DBus.session.call(
            'com.niko.desktop.SingleInstance', '/com/niko/desktop/SingleInstance',
            'org.SingleInstance.DBus', 'ExecuteCallback',
            new GLib.Variant('(ass)', [['niko', '--mostrar-ilha'], '']),
            null, Gio.DBusCallFlags.NO_AUTO_START, 2000, null,
            (connection, result) => {
                try { connection.call_finish(result); }
                catch (error) {
                    console.error(`Niko: falha D-Bus: ${error.message}`);
                    if (this._button && request === this._request) Main.notify('Niko', 'Abra o Niko experimental antes de usar a ilha.');
                    return;
                }
                if (!this._button || request !== this._request) return;
                let attempts = 0;
                this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    if (!this._button || request !== this._request) return GLib.SOURCE_REMOVE;
                    const win = this._findWindow();
                    if (win) {
                        this._anchor(win);
                        this._activateLater(win);
                        this._pending = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    if (++attempts >= 20) {
                        this._pending = 0;
                        Main.notify('Niko', 'A ilha não foi encontrada. Verifique se está habilitada.');
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
            });
    }

    _cancelActivation() {
        if (this._activation) GLib.source_remove(this._activation);
        this._activation = 0;
    }

    _activateLater(win) {
        this._cancelActivation();
        // Ativar fora do sinal map: o compositor precisa terminar de inserir a janela na pilha.
        this._activation = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._activation = 0;
            const monitor = this._primaryMonitor();
            if (!this._button || this._window !== win || !this._isManaged(win) ||
                Main.sessionMode.isLocked || Main.sessionMode.isGreeter || !monitor ||
                global.display.get_monitor_in_fullscreen(monitor.index)) return GLib.SOURCE_REMOVE;
            const actor = win.get_compositor_private();
            if (!actor || !actor.mapped) return GLib.SOURCE_REMOVE;
            const workspace = global.workspace_manager.get_active_workspace();
            if (win.get_workspace() !== workspace) win.change_workspace(workspace);
            if (this._isManaged(win)) Main.activateWindow(win, global.get_current_time());
            return GLib.SOURCE_REMOVE;
        });
    }

    _isManaged(win) {
        return global.display.list_all_windows().includes(win);
    }

    _anchor(win) {
        if (!this._isManaged(win)) return;
        if (this._window !== win) {
            this._restoreWindow();
            this._window = win;
            const frame = win.get_frame_rect();
            this._original = {x: frame.x, y: frame.y, monitor: win.get_monitor()};
            this._sizeSignal = win.connect('size-changed', () => { this._position(); this._positionDock(); });
            this._positionSignal = win.connect('position-changed', () => { this._position(); this._positionDock(); });
            this._unmanagedSignal = win.connect('unmanaging', () => this._restoreWindow(false));
        }
        this._position();

    }

    _position() {
        const win = this._window;
        const monitor = this._primaryMonitor();
        if (this._positioning || !win || !this._isManaged(win)) return;
        const blocked = !monitor || Main.sessionMode.isLocked || Main.sessionMode.isGreeter ||
            global.display.get_monitor_in_fullscreen(monitor.index);
        const actor = win.get_compositor_private();
        if (blocked) {
            this._cancelActivation();
            if (actor?.visible && !this._hiddenActor) {
                this._hiddenActor = actor;
                actor.hide();
            }
            return;
        }
        if (this._hiddenActor) {
            const hiddenActor = this._hiddenActor;
            this._hiddenActor = null;
            if (actor === hiddenActor && win.showing_on_its_workspace() &&
                win.located_on_workspace(global.workspace_manager.get_active_workspace())) actor.show();
        }
        this._positioning = true;
        try {
            if (win.get_monitor() !== monitor.index) win.move_to_monitor(monitor.index);
            if (this._window !== win || !this._isManaged(win)) return;
            const frame = win.get_frame_rect();
            const x = monitor.x + Math.max(0, Math.floor((monitor.width - frame.width) / 2));
            const y = monitor.y + Main.panel.height + 8;
            if (frame.x !== x || frame.y !== y) win.move_frame(false, x, y);
        } finally {
            this._positioning = false;
        }
    }

    _restoreWindow(restore = true) {
        this._cancelActivation();
        const win = this._window;
        const hiddenActor = this._hiddenActor;
        this._hiddenActor = null;
        const original = this._original;
        const signals = [this._sizeSignal, this._positionSignal, this._unmanagedSignal];
        // GTK hide pode destruir o Meta.Window; esquecer antes de qualquer chamada nativa.
        this._window = null;
        this._original = null;
        this._sizeSignal = this._positionSignal = this._unmanagedSignal = 0;
        if (!win) return;
        for (const id of signals) {
            if (id) win.disconnect(id);
        }
        // Nunca mover um cliente retirado do gerenciamento pelo compositor.
        if (!restore || !this._isManaged(win)) return;
        if (hiddenActor && win.get_compositor_private() === hiddenActor && win.showing_on_its_workspace() &&
            win.located_on_workspace(global.workspace_manager.get_active_workspace())) hiddenActor.show();
        if (original.monitor < 0 || original.monitor >= global.display.get_n_monitors() ||
            !Main.layoutManager.monitors.some(m => m.index === original.monitor)) return;
        if (win.get_monitor() !== original.monitor) win.move_to_monitor(original.monitor);
        if (this._isManaged(win)) win.move_frame(false, original.x, original.y);
    }

    disable() {
        this._reserveDock = false;
        this._windowEpoch = null;
        this._systemRequest++;
        if (this._systemTimer) GLib.source_remove(this._systemTimer);
        this._systemTimer = 0;
        this._windowsDbus?.unexport();
        this._windowsDbus = null;
        this._restoreDock();
        Gio.bus_unwatch_name(this._busWatch);
        this._busWatch = 0;
        global.display.disconnect(this._focusSignal);
        this._lastAppWindow = null;
        global.window_manager.disconnect(this._mapSignal);
        Main.layoutManager.disconnect(this._monitorsSignal);
        global.display.disconnect(this._fullscreenSignal);
        Main.sessionMode.disconnect(this._sessionSignal);
        this._attentionSignals.forEach(id => global.display.disconnect(id));
        this._attentionSignals = [];
        this._injections.clear();
        this._cancelPending();
        this._restoreWindow();
        this._button?.destroy();
        this._button = null;
    }
}
