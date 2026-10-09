use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABM_GETSTATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOWNA, WM_APP};

static HIDDEN: AtomicBool = AtomicBool::new(false);

pub fn is_taskbar_hidden() -> bool {
    HIDDEN.load(Ordering::SeqCst)
}

fn recovery_file(app: &AppHandle) -> Option<PathBuf> {
    let directory = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&directory);
    Some(directory.join("barra-windows.flag"))
}

fn windows_taskbars() -> Vec<HWND> {
    let mut list = Vec::new();
    if let Ok(primary) = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) } {
        list.push(primary);
    }
    let mut previous: Option<HWND> = None;
    while let Ok(secondary) = unsafe { FindWindowExW(None, previous, w!("Shell_SecondaryTrayWnd"), None) } {
        if secondary.is_invalid() {
            break;
        }
        list.push(secondary);
        previous = Some(secondary);
    }
    list
}

fn appbar_data(state: u32) -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, lParam: LPARAM(state as isize), ..Default::default() }
}

fn taskbar_state() -> u32 {
    let mut payload = appbar_data(0);
    unsafe { SHAppBarMessage(ABM_GETSTATE, &mut payload) as u32 }
}

fn set_taskbar_state(state: u32) {
    let mut payload = appbar_data(state);
    unsafe {
        SHAppBarMessage(ABM_SETSTATE, &mut payload);
    }
}

fn hide_bars() {
    for bar in windows_taskbars() {
        if unsafe { IsWindowVisible(bar) }.as_bool() {
            let _ = unsafe { ShowWindow(bar, SW_HIDE) };
        }
    }
}

fn reposition_dock(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        crate::docks::reposition_all(&app);
    });
}

fn watch_taskbar() {
    std::thread::spawn(|| {
        while HIDDEN.load(Ordering::SeqCst) {
            hide_bars();
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

pub fn hide(app: &AppHandle) {
    if HIDDEN.swap(true, Ordering::SeqCst) {
        return;
    }
    let original = taskbar_state();
    if let Some(file) = recovery_file(app) {
        if !file.exists() {
            let _ = std::fs::write(&file, original.to_string());
        }
    }
    set_taskbar_state(original | ABS_AUTOHIDE);
    hide_bars();
    watch_taskbar();
    reposition_dock(app);
}

pub fn restore(app: &AppHandle) {
    let file = recovery_file(app);
    let stored = file.as_ref().and_then(|a| std::fs::read_to_string(a).ok()).and_then(|t| t.trim().parse::<u32>().ok());
    let was_hidden = HIDDEN.swap(false, Ordering::SeqCst);
    if stored.is_none() && !was_hidden {
        return;
    }
    if let Some(original) = stored {
        set_taskbar_state(original & !ABS_AUTOHIDE);
    }
    for bar in windows_taskbars() {
        let _ = unsafe { ShowWindow(bar, SW_SHOWNA) };
    }
    if let Some(file) = file {
        let _ = std::fs::remove_file(file);
    }
    reposition_dock(app);
}

static RESERVED_DOCKS: Mutex<Option<HashSet<isize>>> = Mutex::new(None);
const RESERVED_DOCK_HEIGHT: f64 = 62.0;

fn data_dock(dock: &WebviewWindow) -> Option<(APPBARDATA, tauri::Monitor)> {
    let window = dock.hwnd().ok()?;
    let monitor = dock.current_monitor().ok()??;
    let payload = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: HWND(window.0),
        uCallbackMessage: WM_APP + 0x4e,
        uEdge: ABE_BOTTOM,
        ..Default::default()
    };
    Some((payload, monitor))
}

pub fn reserve_space_dock(dock: &WebviewWindow, reserve: bool) {
    let Some((mut payload, monitor)) = data_dock(dock) else { return };
    let Ok(mut guard) = RESERVED_DOCKS.lock() else { return };
    let reserved = guard.get_or_insert_with(HashSet::new);
    let key = payload.hWnd.0 as isize;
    if !reserve {
        if reserved.remove(&key) {
            unsafe {
                SHAppBarMessage(ABM_REMOVE, &mut payload);
            }
        }
        return;
    }
    if reserved.insert(key) {
        unsafe {
            SHAppBarMessage(ABM_NEW, &mut payload);
        }
    }
    let height = (RESERVED_DOCK_HEIGHT * monitor.scale_factor()).round() as i32;
    let position = monitor.position();
    let size = monitor.size();
    let base = position.y + size.height as i32;
    payload.rc = RECT { left: position.x, top: base - height, right: position.x + size.width as i32, bottom: base };
    unsafe {
        SHAppBarMessage(ABM_QUERYPOS, &mut payload);
        payload.rc.top = payload.rc.bottom - height;
        SHAppBarMessage(ABM_SETPOS, &mut payload);
    }
}
pub fn reserve_dock(window: WebviewWindow, reserve: bool) {
    reserve_space_dock(&window, reserve);
}

pub fn windows_taskbar(app: AppHandle, hide_taskbar: bool) {
    if hide_taskbar {
        hide(&app);
    } else {
        restore(&app);
    }
}
