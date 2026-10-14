pub mod barra;
pub mod janela_frente;
pub mod miniaturas;
mod teclado;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicIsize, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, SetForegroundWindow, SW_SHOWNORMAL};

pub use teclado::digita_com_altgr;
pub use windows::Win32::Foundation::RECT;

static ULTIMA_FRENTE: AtomicIsize = AtomicIsize::new(0);

pub fn preparar_ambiente() {}

pub fn tempo_ocioso_ms() -> u64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0;
    }
    u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
}

pub fn registrar_frente(app: &AppHandle) {
    let frente = unsafe { GetForegroundWindow() }.0 as isize;
    if frente == 0 {
        return;
    }
    let sobreposta = app.webview_windows().iter().any(|(r, j)| (r == "ilha" || r == "assistive" || crate::docks::eh_dock(r)) && j.hwnd().map(|h| h.0 as isize == frente).unwrap_or(false));
    if !sobreposta {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

pub fn devolver_foco() {
    let anterior = ULTIMA_FRENTE.load(Ordering::Relaxed);
    if anterior != 0 {
        unsafe {
            let _ = SetForegroundWindow(HWND(anterior as *mut core::ffi::c_void));
        }
    }
}

pub fn janela_em_foco(janela: &WebviewWindow) -> bool {
    janela.hwnd().map(|h| h.0 as isize == ULTIMA_FRENTE.load(Ordering::Relaxed)).unwrap_or(false)
}

pub fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let largo: Vec<u16> = endereco.encode_utf16().chain(std::iter::once(0)).collect();
    let resultado = unsafe { windows::Win32::UI::Shell::ShellExecuteW(None, windows::core::w!("open"), windows::core::PCWSTR(largo.as_ptr()), None, None, SW_SHOWNORMAL) };
    if resultado.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

pub fn botao_do_mouse_pressionado() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
    [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON].iter().any(|botao| {
        let estado = unsafe { GetAsyncKeyState(i32::from(botao.0)) } as u16;
        estado & 0x8000 != 0 || estado & 1 != 0
    })
}

pub fn ignorar_cursor(janela: &WebviewWindow, ignorar: bool) -> bool {
    janela.set_ignore_cursor_events(ignorar).is_ok()
}

pub fn retangulo_da_janela(janela: &WebviewWindow) -> Option<RECT> {
    let h = janela.hwnd().ok()?;
    let mut atual = RECT::default();
    unsafe { GetWindowRect(HWND(h.0), &mut atual) }.ok()?;
    Some(atual)
}

pub fn node_da_ponte(recursos: &Path) -> PathBuf {
    recursos.join("node.exe")
}

pub fn esconder_console(comando: &mut Command) {
    use std::os::windows::process::CommandExt;
    comando.creation_flags(0x0800_0000);
}
