import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('gatilho GNOME abre somente por clique, ancora e restaura recursos', async () => {
    let dbusImplementation;
    const timers = new Map();
    const activationTimers = new Map();
    const workspace = {};
    let windowWorkspace = workspace;
    const handlers = new Map();
    const calls = [];
    const replies = [];
    const maps = new Map();
    const monitorChanges = new Map();
    const attentionSignals = new Map();
    const sessionSignals = new Map();
    const watches = new Map();
    const unwatched = [];
    let watchId = 0;
    let timerId = 0;
    let activationId = 100000;
    let fullscreen = false;
    let nativeMonitorCount = 3;
    let managed = true;
    let actorWindow;
    let signalId = 0;
    const actor = {mapped: true, visible: true, hide() { this.visible = false; }, show() { this.visible = true; }};
    const win = {
        get_gtk_application_id: () => 'com.niko.desktop', get_title: () => 'Ilha do Niko — experimental',
        get_monitor: () => 1, get_frame_rect: () => ({x: 30, y: 40, width: 300}), is_above: () => false,
        connect: (signal, cb) => { handlers.set(signal, cb); return ++signalId; },
        disconnect: id => calls.push(['disconnect', id]),
        make_above: () => calls.push(['above']), unmake_above: () => calls.push(['restore-above']),
        move_frame: (...args) => { assert.ok(managed, 'não mover Meta.Window unmanaged'); calls.push(['move', ...args]); },
        move_to_monitor: id => { assert.ok(managed, 'não trocar monitor de Meta.Window unmanaged'); calls.push(['monitor', id]); },
        showing_on_its_workspace: () => true, located_on_workspace: () => true, get_compositor_private: () => actor, get_workspace: () => windowWorkspace,
        change_workspace: value => { windowWorkspace = value; calls.push(['workspace']); },
        activate: () => calls.push(['focus']),
    };
    class Button {
        constructor() { this.handlers = new Map(); this.visible = true; this.container = { visible: true, show() { this.visible = true; }, hide() { this.visible = false; } }; }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        connect(event, cb) { this.handlers.set(event, cb); }
        add_child() {}
        destroy() { calls.push(['destroy']); }
    }
    class Base {}
    const principal = {...win, get_title: () => 'Niko'};
    const outro = {...win, get_gtk_application_id: () => 'outro.app'};
    class Display { get_tab_list() { return [win, principal, outro]; } }
    class App { get_windows() { return [win, principal, outro]; } }
    class Workspace { _isOverviewWindow(w) { return !w.skip_taskbar; } }
    class InjectionManager {
        constructor() { this.originals = []; }
        overrideMethod(object, name, factory) {
            this.originals.push([object, name, object[name]]);
            object[name] = factory(object[name]);
        }
        clear() {
            for (const [object, name, original] of this.originals) object[name] = original;
            this.originals = [];
        }
    }
    const context = {
        Extension: Base, PanelMenu: {Button}, St: {Label: class {}},
        InjectionManager, Meta: {Display}, Shell: {App}, Workspace: {Workspace},
        Clutter: {ActorAlign: {CENTER: 0}, EVENT_PROPAGATE: 0, EVENT_STOP: 1},
        GLib: {uuid_string_random: () => '00000000-0000-0000-0000-000000000000', PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, SOURCE_CONTINUE: true, Variant: class { constructor(type, value) { this.value = value; } }, FileTest: {IS_EXECUTABLE: 1},
            path_is_absolute: () => true, file_test: () => true,
            timeout_add: (_, ms, cb) => {
                if (ms === 250) { activationTimers.set(++activationId, cb); return activationId; }
                timers.set(++timerId, cb); return timerId;
            }, source_remove: id => { timers.delete(id); activationTimers.delete(id); }},
        Gio: {DBusExportedObject: {wrapJSObject: (_xml, implementation) => { dbusImplementation = implementation; return {export() {}, unexport() {}}; }}, BusType: {SESSION: 0}, BusNameWatcherFlags: {NONE: 0},
            bus_watch_name: (type, name, flags, appeared, vanished) => {
                assert.equal(type, 0);
                assert.equal(name, 'com.niko.desktop.SingleInstance');
                assert.equal(flags, 0);
                watches.set(++watchId, {appeared, vanished});
                return watchId;
            },
            bus_unwatch_name: id => { unwatched.push(id); watches.delete(id); },
            DBusCallFlags: {NO_AUTO_START: 1}, DBus: {session: {
            call: (...args) => { calls.push(['dbus', args[4].value]); replies.push(() => args[9]({call_finish() {}}, {})); },
        }}},
        Main: {activateWindow: w => { assert.ok(managed); w.activate(); }, sessionMode: {isLocked: false, connect: (name, cb) => { sessionSignals.set(name, cb); return name; }, disconnect: id => sessionSignals.delete(id)}, notify: () => calls.push(['notify']),
            panel: {height: 24, addToStatusArea(_name, button) { button.container.show(); }}, layoutManager: {monitors: [{index: 0}, {index: 1}, {index: 2}], primaryMonitor: {x: 0, y: 0, width: 1200, index: 0}, connect: (name, cb) => { monitorChanges.set(name, cb); return name; }, disconnect: id => monitorChanges.delete(id)}},
        global: {workspace_manager: {get_active_workspace: () => workspace}, window_manager: {connect: (name, cb) => { maps.set(name, cb); return name; }, disconnect: id => maps.delete(id)}, get_window_actors: () => [{meta_window: win}], display: {connect: (signal, cb) => { attentionSignals.set(signal, cb); return signal; }, disconnect: id => attentionSignals.delete(id), list_all_windows: () => actorWindow ? [actorWindow] : [], get_n_monitors: () => nativeMonitorCount, get_monitor_in_fullscreen: index => { assert.ok(index >= 0 && index < nativeMonitorCount, "índice nativo válido"); assert.equal(index, context.Main.layoutManager.primaryMonitor.index); return fullscreen; }}, get_current_time: () => 1},
        console,
    };
    const source = readFileSync(new URL('./niko-ilha@local/extension.js', import.meta.url), 'utf8')
        .replace(/^import .*\n/gm, '').replace('export default class ', 'class ');
    const Klass = vm.runInNewContext(source + '\nNikoIlha;', context);
    const extension = new Klass();
    extension.metadata = {'niko-executable': '/tmp/niko', name: 'Niko'};
    actorWindow = win;
    extension.enable();
    extension._authorizeWindows = () => {};
    const request = (method, params = []) => new Promise(resolve => {
        dbusImplementation[method + 'Async'](params, {get_sender: () => ':1.2', return_value: value => resolve(JSON.parse(value.value[0]))});
    });
    assert.equal((await request('Agir', ['bogus', 'fake'])).erro, 'acao_invalida');
    context.Main.sessionMode.isLocked = true;
    assert.equal((await request('Listar')).erro, 'sessao_bloqueada');
    assert.equal((await request('AlternarNiko')).erro, 'sessao_bloqueada');
    context.Main.sessionMode.isLocked = false;
    assert.equal(extension._button.container.visible, false, 'sem daemon o botão inicia oculto');
    const primeiraWatch = watches.get(1);
    primeiraWatch.vanished();
    assert.equal(extension._button.container.visible, false);
    primeiraWatch.appeared();
    assert.equal(extension._button.container.visible, true, 'daemon presente mostra botão');
    assert.deepEqual(new Display().get_tab_list(), [principal, outro]);
    assert.deepEqual(new App().get_windows(), [principal, outro]);
    assert.equal(new Workspace()._isOverviewWindow(win), false);
    assert.equal(new Workspace()._isOverviewWindow(principal), true);
    assert.equal(new Workspace()._isOverviewWindow({...outro, skip_taskbar: true}), false);
    maps.get('map')(null, {meta_window: outro});
    assert.equal(extension._window, win, 'janela existente foi adotada sem depender de map');
    maps.get('map')(null, {meta_window: win});
    assert.equal(extension._window, win, 'ancora abertura pela bandeja sem clique no painel');
    assert.equal(calls.some(c => c[0] === 'focus'), false, 'não ativar dentro do map');
    const flushActivation = () => { for (const [id, callback] of [...activationTimers]) { activationTimers.delete(id); callback(); } };
    flushActivation();
    assert.equal(calls.filter(c => c[0] === 'focus').length, 1, 'ativação após map traz ilha para frente');
    const focusBeforeAttention = calls.filter(c => c[0] === 'focus').length;
    attentionSignals.get('window-demands-attention')(null, outro);
    assert.equal(activationTimers.size, 0, 'atenção de outro app não toma foco');
    attentionSignals.get('window-demands-attention')(null, win);
    flushActivation();
    assert.equal(calls.filter(c => c[0] === 'focus').length, focusBeforeAttention + 1, 'atalho ativa ilha já mapeada sem novo map');
    attentionSignals.get('window-marked-urgent')(null, win);
    flushActivation();
    assert.equal(calls.filter(c => c[0] === 'focus').length, focusBeforeAttention + 2);
    windowWorkspace = {};
    extension._activateLater(win);
    flushActivation();
    assert.equal(windowWorkspace, workspace, 'traz ilha ao workspace do aplicativo atual');
    const focusBeforeHidden = calls.filter(c => c[0] === 'focus').length;
    const compositorPrivate = win.get_compositor_private;
    win.get_compositor_private = () => ({mapped: false});
    extension._activateLater(win);
    flushActivation();
    assert.equal(calls.filter(c => c[0] === 'focus').length, focusBeforeHidden, 'não ativar ilha oculta');
    win.get_compositor_private = compositorPrivate;
    assert.ok(calls.some(c => c[0] === 'move' && c[2] === 450 && c[3] === 32));
    const originalRect = win.get_frame_rect;
    win.get_frame_rect = () => ({x: 90, y: 200, width: 660});
    handlers.get('size-changed')();
    assert.ok(calls.some(c => c[0] === 'move' && c[2] === 270 && c[3] === 32), 'recentraliza ao trocar tamanho/aba');
    win.get_frame_rect = originalRect;
    const primary = context.Main.layoutManager.primaryMonitor;
    context.Main.layoutManager.primaryMonitor = {x: -1600, y: 120, width: 1600, index: 2};
    monitorChanges.get('monitors-changed')();
    assert.ok(calls.some(c => c[0] === 'monitor' && c[1] === 2), 'troca para monitor primário atual');
    assert.ok(calls.some(c => c[0] === 'move' && c[2] === -950 && c[3] === 152), 'coordenadas lógicas de monitor deslocado');
    nativeMonitorCount = 1;
    assert.doesNotThrow(() => monitorChanges.get('monitors-changed')(), 'layout antigo durante remoção de monitor');
    assert.doesNotThrow(() => extension._show());
    extension._activateLater(win);
    assert.doesNotThrow(flushActivation);
    nativeMonitorCount = 3;
    context.Main.layoutManager.primaryMonitor = null;
    const movesWithoutMonitor = calls.filter(c => c[0] === 'move' || c[0] === 'monitor').length;
    monitorChanges.get('monitors-changed')();
    extension._show();
    assert.equal(calls.filter(c => c[0] === 'move' || c[0] === 'monitor').length, movesWithoutMonitor, 'monitor ausente não move janela');
    context.Main.layoutManager.primaryMonitor = primary;
    calls.length = 0;
    assert.equal(extension._button.handlers.has('enter-event'), false);
    extension._button.handlers.get('button-press-event')();
    replies.shift()();
    timers.get(1)();
    timers.delete(1);
    assert.equal(calls[0][0], 'dbus');
    assert.equal(calls[0][1][0][1], '--mostrar-ilha');
    assert.ok(calls.some(c => c[0] === 'move' && c[2] === 450 && c[3] === 32));
    assert.ok(handlers.has('position-changed'));
    handlers.get('position-changed')();
    const countBeforeUnmanaged = calls.filter(c => c[0] === 'move' || c[0] === 'monitor').length;
    managed = false;
    actorWindow = null;
    handlers.get('unmanaging')();
    assert.equal(extension._window, null);
    assert.equal(activationTimers.size, 0, 'unmanaging cancela ativação');
    assert.equal(extension._button.container.visible, true, 'ocultar ilha não implica saída do daemon');
    assert.equal(extension._isManaged(win), false, 'ator de animação não é janela gerenciada');
    assert.equal(extension._findWindow(), undefined);
    assert.equal(calls.filter(c => c[0] === 'move' || c[0] === 'monitor').length, countBeforeUnmanaged);
    managed = true;
    actorWindow = {...win};
    extension._anchor(actorWindow);
    const reentrant = {...win, move_to_monitor: () => {
        managed = false;
        actorWindow = null;
        handlers.get('unmanaging')();
    }};
    actorWindow = reentrant;
    assert.doesNotThrow(() => extension._anchor(reentrant));
    assert.equal(extension._window, null);
    managed = true;
    actorWindow = {...win};
    extension._anchor(actorWindow);
    actorWindow = {...win, move_frame: () => {
        calls.push(['move-reentrant']);
        handlers.get('position-changed')();
    }};
    assert.doesNotThrow(() => extension._anchor(actorWindow));
    assert.equal(calls.filter(c => c[0] === 'move-reentrant').length, 1);
    actorWindow = {...win};
    extension._anchor(actorWindow);
    fullscreen = true;
    const focusBeforeSuppression = calls.filter(c => c[0] === 'focus').length;
    attentionSignals.get('in-fullscreen-changed')?.();
    assert.equal(actor.visible, false, 'ilha já mapeada deve ficar oculta em fullscreen');
    const movesBeforeFullscreen = calls.filter(c => c[0] === 'move' || c[0] === 'monitor').length;
    maps.get('map')(null, {meta_window: actorWindow});
    monitorChanges.get('monitors-changed')();
    assert.equal(calls.filter(c => c[0] === 'move' || c[0] === 'monitor').length, movesBeforeFullscreen);
    const focusBeforeFullscreen = calls.filter(c => c[0] === 'focus').length;
    flushActivation();
    assert.equal(calls.filter(c => c[0] === 'focus').length, focusBeforeFullscreen);
    extension._show();
    assert.equal(calls.filter(c => c[0] === 'dbus').length, 1);
    fullscreen = false;
    attentionSignals.get('in-fullscreen-changed')?.();
    assert.equal(actor.visible, true, 'sair fullscreen restaura ilha');
    flushActivation();
    assert.equal(calls.filter(c => c[0] === 'focus').length, focusBeforeSuppression, 'restaurar ilha não rouba foco');
    context.Main.sessionMode.isLocked = true;
    sessionSignals.get('updated')();
    assert.equal(actor.visible, false, 'bloqueio oculta ilha');
    context.Main.sessionMode.isLocked = false;
    sessionSignals.get('updated')();
    assert.equal(actor.visible, true, 'desbloqueio restaura sem ativar');
    actor.visible = false;
    fullscreen = true;
    attentionSignals.get('in-fullscreen-changed')();
    fullscreen = false;
    attentionSignals.get('in-fullscreen-changed')();
    assert.equal(actor.visible, false, 'não revela ator oculto por outro componente');
    actor.visible = true;
    fullscreen = true;
    attentionSignals.get('in-fullscreen-changed')();
    const showing = actorWindow.showing_on_its_workspace;
    actorWindow.showing_on_its_workspace = () => false;
    fullscreen = false;
    attentionSignals.get('in-fullscreen-changed')();
    assert.equal(actor.visible, false, 'não revela janela minimizada ou em outro workspace');
    actorWindow.showing_on_its_workspace = showing;
    actor.visible = true;
    fullscreen = true;
    attentionSignals.get('in-fullscreen-changed')();
    actorWindow.located_on_workspace = () => false;
    fullscreen = false;
    attentionSignals.get('in-fullscreen-changed')();
    assert.equal(actor.visible, false, 'showing=true em workspace diferente não revela ator');
    actorWindow.located_on_workspace = () => true;
    actor.visible = true;
    const compositor = actorWindow.get_compositor_private;
    actorWindow.get_compositor_private = () => null;
    assert.doesNotThrow(() => attentionSignals.get('in-fullscreen-changed')());
    actorWindow.get_compositor_private = compositor;
    extension._show();
    extension._show();
    replies.shift()();
    assert.equal(timers.size, 0, 'resposta antiga não cria timer');
    replies.shift()();
    assert.equal(timers.size, 1);
    extension._show();
    primeiraWatch.vanished();
    assert.equal(extension._button.container.visible, false, 'saída do daemon oculta botão');
    assert.equal(timers.size, 0, 'saída cancela busca pendente');
    primeiraWatch.appeared();
    assert.equal(extension._button.container.visible, true, 'reabrir daemon restaura botão');
    extension.disable();
    assert.ok(unwatched.includes(1));
    assert.equal(watches.size, 0);
    assert.equal(activationTimers.size, 0);
    assert.doesNotThrow(() => { primeiraWatch.appeared(); primeiraWatch.vanished(); });
    assert.equal(maps.size, 0);
    assert.equal(monitorChanges.size, 0);
    assert.equal(attentionSignals.size, 0);
    assert.equal(sessionSignals.size, 0);
    assert.deepEqual(new Display().get_tab_list(), [win, principal, outro]);
    assert.deepEqual(new App().get_windows(), [win, principal, outro]);
    assert.equal(new Workspace()._isOverviewWindow(win), true);
    extension.enable();
    assert.equal(extension._button.container.visible, false);
    primeiraWatch.appeared();
    assert.equal(extension._button.container.visible, false, 'callback anterior não mostra botão da nova sessão');
    const segundaWatch = watches.get(2);
    segundaWatch.appeared();
    assert.equal(extension._button.container.visible, true);
    primeiraWatch.vanished();
    assert.equal(extension._button.container.visible, true, 'callback anterior não oculta nova sessão');
    replies.shift()();
    assert.equal(timers.size, 0, 'resposta de sessão anterior não reativa extensão');
    actorWindow = {...win};
    extension._anchor(actorWindow);
    fullscreen = true;
    attentionSignals.get('in-fullscreen-changed')();
    assert.equal(actor.visible, false);
    managed = false;
    actorWindow = null;
    handlers.get('unmanaging')();
    fullscreen = false;
    attentionSignals.get('in-fullscreen-changed')();
    assert.equal(actor.visible, false, 'unmanaged nunca revive ator oculto');
    managed = true;
    actor.visible = true;
    actorWindow = {...win};
    extension._anchor(actorWindow);
    context.Main.layoutManager.monitors = [{index: 0}];
    const beforeRemovedRestore = calls.length;
    extension.disable();
    assert.equal(calls.slice(beforeRemovedRestore).some(c => c[0] === 'monitor' && c[1] === 1), false, 'disable não restaura monitor removido');
    assert.ok(unwatched.includes(2));
    assert.equal(watches.size, 0);
    assert.equal(activationTimers.size, 0);
    assert.ok(calls.some(c => c[0] === 'disconnect' && c[1] === 3));
    assert.equal(calls.some(c => c[0] === 'above' || c[0] === 'restore-above'), false, 'sem make_above/unmake_above redundantes');
    assert.ok(calls.some(c => c[0] === 'move' && c[2] === 30 && c[3] === 40));
});
