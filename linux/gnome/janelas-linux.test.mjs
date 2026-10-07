import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('janelas GNOME: filtros, identidade stale, ações, sessão bloqueada e dock', async () => {
    const actions = [], windows = [], timers = new Map();
    let timerId = 0;
    const actor = {visible: true, hide() { this.visible = false; }, show() { this.visible = true; }};
    const window = (id, title = 'Fixture', app = 'fixture') => ({
        skip_taskbar: false, minimized: false,
        get_window_type: () => 0, get_stable_sequence: () => id, get_pid: () => 100,
        get_title: () => title, get_gtk_application_id: () => app, get_wm_class: () => app,
        get_maximized: () => 0, can_minimize: () => true, can_close: () => true, minimize() { this.minimized = true; },
        delete: () => actions.push('close'), activate: () => actions.push('focus'),
        get_monitor: () => 0, get_frame_rect: () => ({x: 0, y: 0, width: 300, height: 80}),
        get_compositor_private: () => actor, is_above: () => false, is_on_all_workspaces: () => false,
        located_on_workspace: () => true, showing_on_its_workspace: () => true, connect: () => 1, disconnect() {},
        stick: () => actions.push('stick'), unstick: () => actions.push('unstick'),
        make_above: () => actions.push('above'), unmake_above: () => actions.push('unabove'),
        move_to_monitor() {}, move_frame: (_user, x, y) => actions.push([x, y]),
    });
    const main = window(1), dock = window(2, 'Dock do Niko — experimental', 'com.niko.desktop');
    const island = window(3, 'Ilha do Niko — experimental', 'com.niko.desktop');
    windows.push(main, dock, island, {...window(4), skip_taskbar: true}, {...window(5), get_window_type: () => 9});
    const context = {
        Extension: class {}, Meta: {MaximizeFlags: {BOTH: 3}, WindowType: {NORMAL: 0, DIALOG: 1, MODAL_DIALOG: 2}},
        Shell: {WindowTracker: {get_default: () => ({get_window_app: () => null})}},
        Main: {sessionMode: {}, activateWindow: win => win.activate(), layoutManager: {primaryMonitor: {index: 0, x: -1200, y: 20, width: 1200, height: 800}}},
        GLib: {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, timeout_add: (_p, _ms, cb) => { timers.set(++timerId, cb); return timerId; }, source_remove: id => timers.delete(id)},
        Clutter: {PickMode: {REACTIVE: 1}},
        global: {workspace_manager: {get_active_workspace: () => ({})}, get_pointer: () => [-600, 817], stage: {get_actor_at_pos: () => null}, get_current_time: () => 1, display: {list_all_windows: () => windows, focus_window: main, get_n_monitors: () => 1, get_monitor_in_fullscreen: () => false}},
    };
    const source = readFileSync(new URL('./niko-ilha@local/extension.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace('export default class ', 'class ');
    const Niko = vm.runInNewContext(source + '\nNikoIlha;', context), niko = new Niko();
    context.TextDecoder = TextDecoder;
    let rootExecutable = '/usr/bin/niko', callerPid = 201;
    const parents = new Map([[201, 200], [200, 100], [999, 1]]);
    context.Gio = {DBusCallFlags: {NO_AUTO_START: 1}, DBus: {session: {call_sync: (_d, _p, _i, method, params) => ({deep_unpack: () => [method === 'GetNameOwner' ? ':1.10' : params.value[0] === ':1.10' ? 100 : callerPid]})}}};
    Object.assign(context.GLib, {Variant: class {constructor(_type, value) {this.value = value;}}, getenv: () => null,
      file_read_link: () => rootExecutable, file_get_contents: path => [true, new TextEncoder().encode(`${path.split('/')[2]} (process name) S ${parents.get(Number(path.split('/')[2])) ?? 1} 0 0`)]});
    assert.doesNotThrow(() => niko._authorizeWindows(':1.20'), 'filho da ponte instalado permitido');
    rootExecutable = '/usr/bin/niko (deleted)';
    assert.doesNotThrow(() => niko._authorizeWindows(':1.20'), 'app instalado antigo após atualização ainda autorizado');
    rootExecutable = '/usr/bin/niko';
    callerPid = 999;
    assert.throws(() => niko._authorizeWindows(':1.20'), /acesso_janelas_recusado/, 'processo externo recusado');
    callerPid = 201; rootExecutable = '/tmp/falso-niko';
    assert.throws(() => niko._authorizeWindows(':1.20'), /acesso_janelas_recusado/, 'nome D-Bus não autentica executável falso');
    actor.mapped=true;
    const adopted=[];const originalAnchor=niko._anchor,originalDockAnchor=niko._anchorDock;
    niko._anchor=w=>adopted.push(['island',w]);niko._anchorDock=(w,focus)=>adopted.push(['dock',w,focus]);
    niko._adoptWindows();assert.deepEqual(adopted,[['dock',dock,false],['island',island]],'adota janelas existentes sem ativar foco');
    adopted.length=0;actor.mapped=false;niko._adoptWindows();assert.equal(adopted.length,2,'ator gerenciado aguardando pintura também é adotado');actor.mapped=true;
    niko._anchor=originalAnchor;niko._anchorDock=originalDockAnchor;
    niko._windowEpoch = '00000000-0000-0000-0000-000000000000';
    const list = JSON.parse(niko._listWindows()).janelas;
    assert.equal(list.length, 1); assert.equal(list[0].ativa, true);
    niko._lastAppWindow = main; context.global.display.focus_window = dock;
    assert.equal(JSON.parse(niko._listWindows()).janelas[0].ativa, true, 'clique no dock conserva app anterior');
    context.global.display.focus_window = main;
    main.can_close = () => false;
    assert.throws(() => niko._actWindow('fechar', list[0].id), /acao_indisponivel/);
    main.can_close = () => true;
    niko._actWindow('focar', list[0].id); niko._actWindow('minimizar', list[0].id); niko._actWindow('fechar', list[0].id);
    assert.equal(main.minimized, true); assert.deepEqual(actions, ['focus', 'close']);
    assert.throws(() => niko._actWindow('x', list[0].id), /acao_invalida/);
    assert.throws(() => niko._actWindow('focar', list[0].id.replace('00000000/', '99999999/')), /janela_invalida/);
    windows.splice(0, 1); assert.throws(() => niko._actWindow('focar', list[0].id), /janela_invalida/);
    context.Main.sessionMode.isLocked = true; assert.throws(() => niko._listWindows(), /sessao_bloqueada/);
    assert.throws(() => niko._actWindow('focar', list[0].id), /sessao_bloqueada/);
    context.Main.sessionMode.isLocked = false;
    const previous = window(8); windows.push(previous);
    niko._lastAppWindow = previous; context.global.display.focus_window = dock;
    const focusCount = actions.filter(action => action === 'focus').length;
    niko._anchorDock(dock); assert.equal(actions.includes('above'), false, 'fora do sinal map');
    for (const cb of timers.values()) cb(); timers.clear();
    assert.equal(actions.filter(action => action === 'focus').length, focusCount + 1, 'restaura foco anterior perdido no map');
    assert.ok(actions.includes('above')); assert.ok(actions.some(a => Array.isArray(a) && a[0] === -750 && a[1] === 740));
    context.Main.sessionMode.isLocked = true; niko._positionDock(); assert.equal(actor.visible, false);
    context.Main.sessionMode.isLocked = false; niko._positionDock(); assert.equal(actor.visible, true);
    const system = window(9, 'Niko', 'com.niko.desktop'); windows.push(system);
    niko._systemRequest = 0; niko._systemTimer = 0;
    context.global.display.focus_window = previous;
    const systemFocus = actions.filter(action => action === 'focus').length;
    niko._toggleSystem();
    assert.equal(actions.filter(action => action === 'focus').length, systemFocus + 1);
    context.global.display.focus_window = dock; niko._lastAppWindow = system;
    niko._toggleSystem(); assert.equal(system.minimized, true, 'logo minimiza sistema previamente ativo');
    assert.equal(JSON.parse(niko._listWindows()).janelas.some(win => win.titulo === 'Niko'), false);
    context.global.display.focus_window = previous;
    dock.get_frame_rect = () => ({x: -700, y: 620, width: 300, height: 200});
    previous.get_maximized = () => 3;
    previous.get_frame_rect = () => ({x: -1200, y: 20, width: 1200, height: 800});
    const dockState = JSON.parse(niko._stateDock());
    assert.equal(dockState.cobre, true); assert.equal(dockState.cursorNoDock, true);
    previous.get_maximized = () => 0;
    previous.get_frame_rect = () => ({x: -1100, y: 100, width: 1000, height: 720});
    assert.equal(JSON.parse(niko._stateDock()).cobre, true, 'janela encaixada cobre dock sem estar maximizada');
    previous.get_frame_rect = () => ({x: -1100, y: 100, width: 1000, height: 500});
    assert.equal(JSON.parse(niko._stateDock()).cobre, false, 'janela acima da região não cobre dock');
    context.global.display.focus_window = system;
    assert.equal(JSON.parse(niko._stateDock()).cobre, false, 'sistema próprio segue política Windows');
    const chrome = [];
    context.St = {Widget: class {
        set_position(x, y) { this.position = [x, y]; }
        set_size(w, h) { this.size = [w, h]; }
        destroy() { chrome.push('destroy'); }
    }};
    context.Main.layoutManager.addChrome = (_actor, params) => chrome.push(params.affectsStruts);
    context.Main.layoutManager.removeChrome = () => chrome.push('remove');
    niko._reserveDock = true; niko._positionDock();
    assert.deepEqual(niko._reservation.position, [-1200, 758]);
    assert.deepEqual(niko._reservation.size, [1200, 62]);
    context.Main.sessionMode.isLocked = true; niko._positionDock();
    assert.equal(niko._reservation, null); assert.deepEqual(chrome, [true, 'remove', 'destroy']);
    context.Main.sessionMode.isLocked = false; niko._positionDock();
    assert.ok(niko._reservation, 'reserva volta após bloqueio');
    const previews = [];
    actor.mapped = true;
    actor.paint_to_content = () => ({get_texture: () => ({get_width: () => 800, get_height: () => 600})});
    context.Gio = {MemoryOutputStream: {new_resizable: () => {
        let closed = false;
        return {close() { closed = true; }, is_closed: () => closed, steal_as_bytes: () => ({get_data: () => [137, 80, 78, 71]})};
    }}};
    context.GLib.base64_encode = bytes => Buffer.from(bytes).toString('base64');
    context.GdkPixbuf = {InterpType: {BILINEAR: 2}};
    context.Shell.Screenshot = {composite_to_stream: async () => ({scale_simple: (w, h) => {
        previews.push([w, h]); return {save_to_bufferv: () => [true, [137, 80, 78, 71]]};
    }})};
    niko._previews = new Set();
    const previousId = niko._windowId(previous);
    assert.equal(JSON.parse(await niko._preview(previousId)).imagem, 'data:image/png;base64,iVBORw==');
    assert.deepEqual(previews[0], [138, 104], 'limita imagem mantendo proporção');
    previous.minimized = true;
    assert.equal(JSON.parse(await niko._preview(previousId)).imagem, null);
    previous.minimized = false;
    context.Shell.Screenshot.composite_to_stream = async () => { context.Main.sessionMode.isLocked = true; return {scale_simple: () => ({save_to_bufferv: () => [true, []]})}; };
    await assert.rejects(niko._preview(previousId), /sessao_bloqueada/, 'bloqueio durante captura não entrega pixels');
    assert.equal(niko._previews.size, 0);
    context.Main.sessionMode.isLocked = false;
    context.Shell.Screenshot.composite_to_stream = async () => { niko._windowEpoch = null; return {scale_simple: () => ({save_to_bufferv: () => [true, []]})}; };
    await assert.rejects(niko._preview(previousId), /janela_invalida/, 'desativação invalida captura pendente');
    niko._restoreDock(); assert.ok(actions.includes('unstick')); assert.ok(actions.includes('unabove'));
    assert.equal(niko._dock, null);
});
