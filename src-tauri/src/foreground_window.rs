use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsZoomed};

const SHELL_CLASSES: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

#[derive(Serialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ForegroundType {
    #[default]
    #[serde(rename = "area_de_trabalho")]
    Desktop,
    #[serde(rename = "sobreposta")]
    Overlay,
    App,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundState {
    #[serde(rename = "cobre")]
    covers: bool,
    #[serde(rename = "telaCheia")]
    fullscreen: bool,
    #[serde(rename = "maximizada")]
    maximized: bool,
    #[serde(rename = "frente")]
    front: ForegroundType,
    #[serde(skip)]
    #[serde(rename = "outroMonitor")]
    other_monitor: bool,
}

fn is_windows_fullscreen() -> bool {
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

unsafe fn rectangle_covers_monitor(window: HWND, monitor: HMONITOR) -> bool {
    let mut rectangle = RECT::default();
    if GetWindowRect(window, &mut rectangle).is_err() {
        return false;
    }
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    if !GetMonitorInfoW(monitor, &mut info).as_bool() {
        return false;
    }
    let screen = info.rcMonitor;
    rectangle.left <= screen.left && rectangle.top <= screen.top && rectangle.right >= screen.right && rectangle.bottom >= screen.bottom
}

fn is_system_window(app: &AppHandle, window: HWND) -> bool {
    app.get_webview_window("sistema").and_then(|j| j.hwnd().ok()).map(|h| h.0 == window.0).unwrap_or(false)
}

unsafe fn read_foreground_window(app: &AppHandle, monitor_target: HMONITOR) -> ForegroundState {
    let front = GetForegroundWindow();
    if front.is_invalid() {
        return ForegroundState::default();
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(front, Some(&mut pid));
    if pid == std::process::id() {
        if is_system_window(app, front) {
            return ForegroundState { front: ForegroundType::App, maximized: IsZoomed(front).as_bool(), ..Default::default() };
        }
        return ForegroundState { front: ForegroundType::Overlay, ..Default::default() };
    }
    let mut class_name = [0u16; 64];
    let size = GetClassNameW(front, &mut class_name).max(0) as usize;
    let name = String::from_utf16_lossy(&class_name[..size]);
    if SHELL_CLASSES.contains(&name.as_str()) {
        return ForegroundState::default();
    }
    let monitor = MonitorFromWindow(front, MONITOR_DEFAULTTONEAREST);
    if monitor != monitor_target {
        return ForegroundState { front: ForegroundType::App, other_monitor: true, ..Default::default() };
    }
    let maximized = IsZoomed(front).as_bool();
    let covers_monitor = rectangle_covers_monitor(front, monitor);
    ForegroundState { covers: maximized || covers_monitor, fullscreen: !maximized && covers_monitor, maximized, front: ForegroundType::App, other_monitor: false }
}

pub fn foreground_covers_screen(app: AppHandle, window: WebviewWindow) -> ForegroundState {
    let monitor_target = match window.hwnd() {
        Ok(h) => unsafe { MonitorFromWindow(HWND(h.0), MONITOR_DEFAULTTONEAREST) },
        Err(_) => unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) },
    };
    let window = unsafe { read_foreground_window(&app, monitor_target) };
    let fullscreen = window.fullscreen || (!window.other_monitor && is_windows_fullscreen());
    ForegroundState { covers: window.covers || fullscreen, fullscreen, maximized: window.maximized, front: if fullscreen { ForegroundType::App } else { window.front }, other_monitor: window.other_monitor }
}
