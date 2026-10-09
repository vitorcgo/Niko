use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::{windows_taskbar, create_overlay, AppState, DOCK_HEIGHT, ISLAND_HEIGHT};

pub const PRIMARY_LABEL: &str = "dock";
const SELECTION_ALL: &str = "todos";
const MONITOR_INTERVAL: Duration = Duration::from_secs(2);

static ENABLED: AtomicBool = AtomicBool::new(false);
static SELECTION: Mutex<String> = Mutex::new(String::new());
static SIGNATURE: Mutex<String> = Mutex::new(String::new());
static SYNCHRONIZATION_LOCK: Mutex<()> = Mutex::new(());
static ISLAND_MONITOR: Mutex<String> = Mutex::new(String::new());

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NikoMonitor {
    #[serde(rename = "nome")]
    name: String,
    #[serde(rename = "rotulo")]
    label: String,
    #[serde(rename = "numero")]
    number: usize,
    #[serde(rename = "principal")]
    primary: bool,
    #[serde(rename = "largura")]
    width: u32,
    #[serde(rename = "altura")]
    height: u32,
}

pub fn is_dock(label: &str) -> bool {
    label == PRIMARY_LABEL || label.starts_with("dock-")
}

fn monitor_name(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| format!("{}x{}", monitor.position().x, monitor.position().y))
}

fn monitor_label(name: &str, primary: bool) -> String {
    if primary {
        return PRIMARY_LABEL.to_string();
    }
    let clean: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    format!("dock-{}", if clean.is_empty() { "monitor".to_string() } else { clean })
}

fn sorted_monitors(app: &AppHandle) -> Vec<(Monitor, NikoMonitor)> {
    let primary_name = app.primary_monitor().ok().flatten().map(|m| monitor_name(&m));
    let mut list = app.available_monitors().unwrap_or_default();
    list.sort_by_key(|m| (Some(monitor_name(m)) != primary_name, m.position().x, m.position().y));
    list
        .into_iter()
        .enumerate()
        .map(|(i, monitor)| {
            let name = monitor_name(&monitor);
            let primary = i == 0;
            let info = NikoMonitor { label: monitor_label(&name, primary), number: i + 1, primary, width: monitor.size().width, height: monitor.size().height, name };
            (monitor, info)
        })
        .collect()
}

pub fn is_monitor_selected(selection: &str, info: &NikoMonitor, list: &[NikoMonitor]) -> bool {
    if list.len() < 2 {
        return info.primary;
    }
    if selection.is_empty() || selection == SELECTION_ALL {
        return true;
    }
    if list.iter().any(|m| m.name == selection) {
        return info.name == selection;
    }
    info.primary
}

pub fn position_dock(window: &WebviewWindow, monitor: &Monitor) {
    let scale = monitor.scale_factor();
    let (position, size) = if windows_taskbar::is_taskbar_hidden() {
        (*monitor.position(), *monitor.size())
    } else {
        let area = monitor.work_area();
        (area.position, area.size)
    };
    let height = (DOCK_HEIGHT * scale).round() as i32;
    let destination = PhysicalPosition::new(position.x, position.y + size.height as i32 - height);
    let _ = window.set_position(destination);
    let _ = window.set_size(PhysicalSize::new(size.width, height as u32));
    let _ = window.set_position(destination);
}

pub fn monitor_island(selection: &str, list: &[NikoMonitor]) -> usize {
    list.iter().position(|m| !selection.is_empty() && m.name == selection).unwrap_or(0)
}

pub fn position_island(app: &AppHandle) {
    let Some(window) = app.get_webview_window("ilha") else { return };
    let selection = ISLAND_MONITOR.lock().map(|e| e.clone()).unwrap_or_default();
    let mut monitors = sorted_monitors(app);
    if monitors.is_empty() {
        return;
    }
    let infos: Vec<NikoMonitor> = monitors.iter().map(|(_, i)| i.clone()).collect();
    let (monitor, _) = monitors.swap_remove(monitor_island(&selection, &infos));
    let height = (ISLAND_HEIGHT * monitor.scale_factor()).round() as u32;
    let destination = *monitor.position();
    let _ = window.set_position(destination);
    let _ = window.set_size(PhysicalSize::new(monitor.size().width, height));
    let _ = window.set_position(destination);
}

pub fn reposition_all(app: &AppHandle) {
    position_island(app);
    position_assistive(app);
    for (monitor, info) in sorted_monitors(app) {
        if let Some(window) = app.get_webview_window(&info.label) {
            position_dock(&window, &monitor);
        }
    }
}

pub fn position_assistive(app: &AppHandle) {
    let Some(window) = app.get_webview_window("assistive") else { return };
    let Some(monitor) = sorted_monitors(app).into_iter().next().map(|(m, _)| m) else { return };
    let area = monitor.work_area();
    let _ = window.set_position(area.position);
    let _ = window.set_size(area.size);
    let _ = window.set_position(area.position);
}

fn signature(list: &[(Monitor, NikoMonitor)]) -> String {
    list
        .iter()
        .map(|(m, i)| format!("{}:{}:{}:{}:{}:{}:{}", i.name, i.primary, m.position().x, m.position().y, m.size().width, m.size().height, m.scale_factor()))
        .collect::<Vec<_>>()
        .join("|")
}

pub fn synchronize(app: &AppHandle) {
    let Ok(_guard) = SYNCHRONIZATION_LOCK.lock() else { return };
    let enabled = ENABLED.load(Ordering::SeqCst);
    let selection = SELECTION.lock().map(|e| e.clone()).unwrap_or_default();
    let monitors = sorted_monitors(app);
    let infos: Vec<NikoMonitor> = monitors.iter().map(|(_, i)| i.clone()).collect();
    let desired: Vec<String> = monitors.iter().filter(|(_, i)| i.primary || (enabled && is_monitor_selected(&selection, i, &infos))).map(|(_, i)| i.label.clone()).collect();

    for (label, window) in app.webview_windows() {
        if label == PRIMARY_LABEL || !is_dock(&label) || desired.contains(&label) {
            continue;
        }
        windows_taskbar::reserve_space_dock(&window, false);
        if let Ok(mut areas) = app.state::<AppState>().areas.lock() {
            areas.remove(&label);
        }
        let _ = window.destroy();
    }

    for (monitor, info) in &monitors {
        if !desired.contains(&info.label) {
            continue;
        }
        let window = match app.get_webview_window(&info.label) {
            Some(j) => j,
            None => match create_overlay(app, &info.label, 0.0, 0.0, 400.0, DOCK_HEIGHT) {
                Ok(j) => {
                    let _ = j.set_ignore_cursor_events(true);
                    j
                }
                Err(_) => continue,
            },
        };
        position_dock(&window, monitor);
    }

    position_island(app);
    position_assistive(app);
    if let Ok(mut current) = SIGNATURE.lock() {
        *current = signature(&monitors);
    }
    let _ = app.emit("niko://monitores", infos);
}

pub fn monitors(app: AppHandle) -> Vec<NikoMonitor> {
    sorted_monitors(&app).into_iter().map(|(_, i)| i).collect()
}

pub async fn set_docks(app: AppHandle, enabled: bool, selection: String) {
    ENABLED.store(enabled, Ordering::SeqCst);
    if let Ok(mut current) = SELECTION.lock() {
        *current = selection.chars().take(200).collect();
    }
    synchronize(&app);
}

pub fn set_island_monitor(app: AppHandle, selection: String) {
    if let Ok(mut current) = ISLAND_MONITOR.lock() {
        *current = selection.chars().take(200).collect();
    }
    position_island(&app);
}

pub fn watch_monitors(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(MONITOR_INTERVAL);
        let current = signature(&sorted_monitors(&app));
        let changed = SIGNATURE.lock().map(|a| *a != current).unwrap_or(false);
        if changed {
            synchronize(&app);
        }
    });
}
