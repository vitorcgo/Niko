use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass, SHAppBarMessage, ABE_BOTTOM, ABM_ACTIVATE, ABM_GETSTATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABM_SETSTATE, ABM_WINDOWPOSCHANGED, ABN_POSCHANGED, ABN_STATECHANGE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW, IsWindowVisible, PostMessageW, ShowWindow, SW_HIDE, SW_SHOWNA, WM_ACTIVATE, WM_APP, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_NCDESTROY, WM_WINDOWPOSCHANGED};

static OCULTA: AtomicBool = AtomicBool::new(false);
static GERACAO_DA_BARRA: AtomicU64 = AtomicU64::new(0);
static ALTERANDO_BARRA: Mutex<()> = Mutex::new(());

pub fn barra_oculta() -> bool {
    OCULTA.load(Ordering::SeqCst)
}

fn arquivo_recuperacao(app: &AppHandle) -> Option<PathBuf> {
    let pasta = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&pasta);
    Some(pasta.join("barra-windows.flag"))
}

fn barras_do_windows() -> Vec<HWND> {
    let mut lista = Vec::new();
    if let Ok(principal) = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) } {
        lista.push(principal);
    }
    let mut anterior: Option<HWND> = None;
    while let Ok(secundaria) = unsafe { FindWindowExW(None, anterior, w!("Shell_SecondaryTrayWnd"), None) } {
        if secundaria.is_invalid() {
            break;
        }
        lista.push(secundaria);
        anterior = Some(secundaria);
    }
    lista
}

fn dados_appbar(estado: u32) -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, lParam: LPARAM(estado as isize), ..Default::default() }
}

fn estado_da_barra() -> u32 {
    let mut dados = dados_appbar(0);
    unsafe { SHAppBarMessage(ABM_GETSTATE, &mut dados) as u32 }
}

fn definir_estado_da_barra(estado: u32) {
    let mut dados = dados_appbar(estado);
    unsafe {
        SHAppBarMessage(ABM_SETSTATE, &mut dados);
    }
}

fn esconder_barras() {
    for barra in barras_do_windows() {
        if unsafe { IsWindowVisible(barra) }.as_bool() {
            let _ = unsafe { ShowWindow(barra, SW_HIDE) };
        }
    }
}

fn reposicionar_dock(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        if crate::ENCERRANDO.load(Ordering::Relaxed) { return; }
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if !crate::ENCERRANDO.load(Ordering::Relaxed) { crate::docks::reposicionar_todos(&app); }
        }).await;
    });
}

fn vigia_valida(geracao: u64, atual: u64, oculta: bool) -> bool {
    oculta && geracao == atual
}

fn vigiar_barra(geracao: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            if crate::ENCERRANDO.load(Ordering::Relaxed) { return; }
            let continua = tauri::async_runtime::spawn_blocking(move || {
                let Ok(_vez) = ALTERANDO_BARRA.lock() else { return false };
                if crate::ENCERRANDO.load(Ordering::Relaxed) || !vigia_valida(geracao, GERACAO_DA_BARRA.load(Ordering::SeqCst), OCULTA.load(Ordering::SeqCst)) { return false; }
                esconder_barras();
                true
            }).await.unwrap_or(false);
            if !continua { return; }
            tokio::time::sleep(Duration::from_millis(1000)).await;
        }
    });
}

pub fn ocultar(app: &AppHandle) {
    let Ok(_vez) = ALTERANDO_BARRA.lock() else { return };
    if crate::ENCERRANDO.load(Ordering::Relaxed) { return; }
    if OCULTA.swap(true, Ordering::SeqCst) {
        return;
    }
    let original = estado_da_barra();
    if let Some(arquivo) = arquivo_recuperacao(app) {
        if !arquivo.exists() {
            let _ = std::fs::write(&arquivo, original.to_string());
        }
    }
    definir_estado_da_barra(original | ABS_AUTOHIDE);
    esconder_barras();
    let geracao = GERACAO_DA_BARRA.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    vigiar_barra(geracao);
    reposicionar_dock(app);
}

pub fn restaurar(app: &AppHandle) {
    let Ok(_vez) = ALTERANDO_BARRA.lock() else { return };
    GERACAO_DA_BARRA.fetch_add(1, Ordering::SeqCst);
    let arquivo = arquivo_recuperacao(app);
    let guardado = arquivo.as_ref().and_then(|a| std::fs::read_to_string(a).ok()).and_then(|t| t.trim().parse::<u32>().ok());
    let estava_oculta = OCULTA.swap(false, Ordering::SeqCst);
    if guardado.is_none() && !estava_oculta {
        return;
    }
    if let Some(original) = guardado {
        definir_estado_da_barra(original & !ABS_AUTOHIDE);
    }
    for barra in barras_do_windows() {
        let _ = unsafe { ShowWindow(barra, SW_SHOWNA) };
    }
    if let Some(arquivo) = arquivo {
        let _ = std::fs::remove_file(arquivo);
    }
    reposicionar_dock(app);
}

#[derive(Clone)]
struct ReservaDock {
    app: AppHandle,
    rotulo: String,
    retangulo: Option<RECT>,
}

static RESERVADOS: Mutex<Option<HashMap<isize, ReservaDock>>> = Mutex::new(None);
static ATUALIZANDO_RESERVA: AtomicBool = AtomicBool::new(false);
const ALTURA_RESERVADA_DOCK: f64 = 62.0;
const MENSAGEM_DA_RESERVA: u32 = WM_APP + 0x4e;
const RECALCULAR_RESERVA: u32 = WM_APP + 0x4f;
const SUBCLASSE_DA_RESERVA: usize = 0x4e494b4f;

fn reserva_da_janela(janela: HWND) -> Option<ReservaDock> {
    RESERVADOS.lock().ok()?.as_ref()?.get(&(janela.0 as isize)).cloned()
}

pub fn retangulo_reservado(dock: &WebviewWindow, monitor: &tauri::Monitor) -> Option<RECT> {
    let janela = HWND(dock.hwnd().ok()?.0);
    let r = reserva_da_janela(janela)?.retangulo?;
    let p = monitor.position();
    let t = monitor.size();
    if r.left < p.x || r.right > p.x + t.width as i32 || r.bottom > p.y + t.height as i32 || r.bottom <= p.y {
        return None;
    }
    Some(r)
}

pub fn retangulo_da_sobreposta(reserva: RECT, altura: i32) -> RECT {
    RECT { left: reserva.left, top: reserva.bottom - altura, right: reserva.right, bottom: reserva.bottom }
}

fn mesmos_limites(a: RECT, b: RECT) -> bool {
    a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom
}

unsafe extern "system" fn observar_reserva(janela: HWND, mensagem: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _dados: usize) -> LRESULT {
    if mensagem == WM_NCDESTROY {
        let removida = RESERVADOS.lock().ok().and_then(|mut g| g.as_mut().and_then(|r| r.remove(&(janela.0 as isize))));
        if removida.is_some() {
            let mut dados = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: janela, ..Default::default() };
            SHAppBarMessage(ABM_REMOVE, &mut dados);
        }
        let _ = RemoveWindowSubclass(janela, Some(observar_reserva), SUBCLASSE_DA_RESERVA);
    } else if mensagem == RECALCULAR_RESERVA {
        if let Some(reserva) = reserva_da_janela(janela) {
            if let Some(dock) = reserva.app.get_webview_window(&reserva.rotulo) {
                atualizar_reserva(&dock, true);
            }
        }
        return LRESULT(0);
    } else if !ATUALIZANDO_RESERVA.load(Ordering::SeqCst) && reserva_da_janela(janela).is_some() {
        if (mensagem == MENSAGEM_DA_RESERVA && (wparam.0 as u32 == ABN_POSCHANGED || wparam.0 as u32 == ABN_STATECHANGE)) || mensagem == WM_DISPLAYCHANGE || mensagem == WM_DPICHANGED {
            let _ = PostMessageW(Some(janela), RECALCULAR_RESERVA, WPARAM(0), LPARAM(0));
        } else if mensagem == WM_ACTIVATE || mensagem == WM_WINDOWPOSCHANGED {
            let mut dados = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: janela, ..Default::default() };
            SHAppBarMessage(if mensagem == WM_ACTIVATE { ABM_ACTIVATE } else { ABM_WINDOWPOSCHANGED }, &mut dados);
        }
    }
    DefSubclassProc(janela, mensagem, wparam, lparam)
}

fn dados_do_dock(dock: &WebviewWindow) -> Option<(APPBARDATA, tauri::Monitor)> {
    let janela = dock.hwnd().ok()?;
    let monitor = dock.current_monitor().ok()??;
    let dados = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: HWND(janela.0),
        uCallbackMessage: MENSAGEM_DA_RESERVA,
        uEdge: ABE_BOTTOM,
        ..Default::default()
    };
    Some((dados, monitor))
}

pub fn reservar_espaco_do_dock(dock: &WebviewWindow, reservar: bool) {
    let alvo = dock.clone();
    let _ = dock.run_on_main_thread(move || atualizar_reserva(&alvo, reservar));
}

struct AtualizacaoDaReserva;
impl Drop for AtualizacaoDaReserva {
    fn drop(&mut self) { ATUALIZANDO_RESERVA.store(false, Ordering::SeqCst); }
}

fn atualizar_reserva(dock: &WebviewWindow, reservar: bool) {
    if ATUALIZANDO_RESERVA.swap(true, Ordering::SeqCst) { return; }
    let _atualizacao = AtualizacaoDaReserva;
    let Ok(janela) = dock.hwnd() else { return };
    let janela = HWND(janela.0);
    let chave = janela.0 as isize;
    if !reservar {
        let removida = RESERVADOS.lock().ok().and_then(|mut g| g.as_mut().and_then(|r| r.remove(&chave)));
        if removida.is_some() {
            let mut dados = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: janela, ..Default::default() };
            unsafe {
                SHAppBarMessage(ABM_REMOVE, &mut dados);
                let _ = RemoveWindowSubclass(janela, Some(observar_reserva), SUBCLASSE_DA_RESERVA);
            }
            if let Ok(Some(monitor)) = dock.current_monitor() {
                crate::docks::posicionar(dock, &monitor);
            }
        }
        return;
    }
    let Some((mut dados, monitor)) = dados_do_dock(dock) else { return };
    let anterior = reserva_da_janela(janela);
    if anterior.is_none() {
        unsafe {
            if !SetWindowSubclass(janela, Some(observar_reserva), SUBCLASSE_DA_RESERVA, 0).as_bool() { return; }
            if SHAppBarMessage(ABM_NEW, &mut dados) == 0 {
                let _ = RemoveWindowSubclass(janela, Some(observar_reserva), SUBCLASSE_DA_RESERVA);
                return;
            }
        }
        if let Ok(mut guarda) = RESERVADOS.lock() {
            guarda.get_or_insert_with(HashMap::new).insert(chave, ReservaDock { app: dock.app_handle().clone(), rotulo: dock.label().to_string(), retangulo: None });
        }
    }
    let altura = (ALTURA_RESERVADA_DOCK * monitor.scale_factor()).round() as i32;
    let posicao = monitor.position();
    let tamanho = monitor.size();
    let base = posicao.y + tamanho.height as i32;
    dados.rc = RECT { left: posicao.x, top: base - altura, right: posicao.x + tamanho.width as i32, bottom: base };
    let mut mudou = false;
    unsafe {
        SHAppBarMessage(ABM_QUERYPOS, &mut dados);
        dados.rc.top = dados.rc.bottom - altura;
        if !anterior.and_then(|r| r.retangulo).is_some_and(|r| mesmos_limites(r, dados.rc)) {
            mudou = true;
            SHAppBarMessage(ABM_SETPOS, &mut dados);
        }
    }
    if dados.rc.right <= dados.rc.left || dados.rc.bottom <= dados.rc.top { return; }
    if let Ok(mut guarda) = RESERVADOS.lock() {
        if let Some(reserva) = guarda.as_mut().and_then(|r| r.get_mut(&chave)) { reserva.retangulo = Some(dados.rc); }
    }
    let moveu = crate::docks::posicionar(dock, &monitor);
    if mudou || moveu {
        unsafe { SHAppBarMessage(ABM_WINDOWPOSCHANGED, &mut dados); }
    }
}

#[cfg(test)]
mod testes_da_reserva {
    use super::*;

    #[test]
    fn religar_a_barra_nao_reativa_a_vigia_anterior() {
        assert!(vigia_valida(1, 1, true));
        assert!(!vigia_valida(1, 2, false));
        assert!(!vigia_valida(1, 3, true));
        assert!(vigia_valida(3, 3, true));
    }

    #[test]
    fn sobreposta_termina_na_base_aprovada_sem_descontar_a_reserva_novamente() {
        let r = retangulo_da_sobreposta(RECT { left: 0, top: 1018, right: 1920, bottom: 1080 }, 400);
        assert_eq!((r.left, r.top, r.right, r.bottom), (0, 680, 1920, 1080));
    }

    #[test]
    fn preserva_deslocamento_de_outra_barra_e_escala_de_150_por_cento() {
        let r = retangulo_da_sobreposta(RECT { left: 1920, top: 1487, right: 4480, bottom: 1580 }, 600);
        assert_eq!((r.left, r.top, r.right, r.bottom), (1920, 980, 4480, 1580));
    }

    #[test]
    fn respeita_monitor_com_coordenadas_negativas() {
        let r = retangulo_da_sobreposta(RECT { left: -1920, top: -62, right: 0, bottom: 0 }, 400);
        assert_eq!((r.left, r.top, r.right, r.bottom), (-1920, -400, 0, 0));
    }
}
#[tauri::command]
pub fn reservar_dock(window: WebviewWindow, reservar: bool) {
    reservar_espaco_do_dock(&window, reservar);
}

#[tauri::command]
pub fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    if ocultar_barra {
        ocultar(&app);
    } else {
        restaurar(&app);
    }
}
