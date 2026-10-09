use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;

mod shortcuts;
mod windows_taskbar;
mod docks;
mod legacy_commands;
mod foreground_window;
mod thumbnails;

const PORT: u16 = 47831;
const ISLAND_HEIGHT: f64 = 720.0;
const DOCK_HEIGHT: f64 = 400.0;

#[derive(Deserialize, Clone, Copy)]
struct Rectangle {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct AppState {
    areas: Mutex<HashMap<String, Vec<Rectangle>>>,
    token: String,
    bridge: Mutex<Option<Child>>,
}

fn generate_token() -> String {
    use windows::Win32::Security::Cryptography::{BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG};
    let mut bytes = [0u8; 32];
    let status = unsafe { BCryptGenRandom(None, &mut bytes, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
    assert!(status.is_ok(), "falha ao gerar o token da ponte");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn set_interactive_area(window: String, rectangles: Vec<Rectangle>, state: tauri::State<AppState>) {
    if let Ok(mut areas) = state.areas.lock() {
        areas.insert(window, rectangles);
    }
}

pub fn bridge_token(state: tauri::State<AppState>) -> String {
    state.token.clone()
}

pub fn bridge_port() -> u16 {
    PORT
}

pub fn show_system(app: AppHandle) {
    show(&app);
}

static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
static OPENING_PENDING: AtomicBool = AtomicBool::new(false);
const OPENING_TIMEOUT: Duration = Duration::from_secs(9);

fn release_opening(app: &AppHandle) {
    if OPENING_PENDING.swap(false, Ordering::Relaxed) {
        show(app);
    }
}

pub fn release_initial_system_window(app: AppHandle) {
    release_opening(&app);
}

pub fn idle_time_ms() -> u64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0;
    }
    u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
}

fn register_foreground(app: &AppHandle) {
    let front = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() }.0 as isize;
    if front == 0 {
        return;
    }
    let overlay = app.webview_windows().iter().any(|(r, j)| (r == "ilha" || r == "assistive" || docks::is_dock(r)) && j.hwnd().map(|h| h.0 as isize == front).unwrap_or(false));
    if !overlay {
        LAST_FOREGROUND.store(front, Ordering::Relaxed);
    }
}

pub fn restore_focus() {
    let previous = LAST_FOREGROUND.load(Ordering::Relaxed);
    if previous != 0 {
        let window = windows::Win32::Foundation::HWND(previous as *mut core::ffi::c_void);
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow(window);
        }
    }
}

pub fn toggle_system(app: AppHandle) {
    if let Some(window) = app.get_webview_window("sistema") {
        let visible = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
        let focused = window.hwnd().map(|h| h.0 as isize == LAST_FOREGROUND.load(Ordering::Relaxed)).unwrap_or(false);
        if visible && focused {
            let _ = window.minimize();
        } else {
            show(&app);
        }
    }
}

pub fn open_link(url: String) -> Result<(), String> {
    let address = url.trim();
    if !(address.starts_with("https://") || address.starts_with("http://")) || address.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("link_invalido".into());
    }
    let wide: Vec<u16> = address.encode_utf16().chain(std::iter::once(0)).collect();
    let result = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(wide.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

pub fn exit(app: AppHandle) {
    exit_with_save(&app);
}

const SAVE_WAIT: Duration = Duration::from_millis(700);

fn exit_with_save(app: &AppHandle) {
    if SHUTTING_DOWN.swap(true, Ordering::Relaxed) {
        return;
    }
    let _ = app.emit("niko://saindo", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SAVE_WAIT);
        app.exit(0);
    });
}

fn show(app: &AppHandle) {
    OPENING_PENDING.store(false, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("sistema") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn dock_under_cursor(app: &AppHandle) -> Option<WebviewWindow> {
    let docks: Vec<(String, WebviewWindow)> = app.webview_windows().into_iter().filter(|(r, j)| docks::is_dock(r) && j.is_visible().unwrap_or(false)).collect();
    let cursor = app.cursor_position().ok();
    let under_o_cursor = cursor.and_then(|c| {
        docks.iter().find(|(_, j)| {
            let Ok(Some(m)) = j.current_monitor() else { return false };
            let (p, t) = (m.position(), m.size());
            c.x >= p.x as f64 && c.x < p.x as f64 + t.width as f64 && c.y >= p.y as f64 && c.y < p.y as f64 + t.height as f64
        })
    });
    under_o_cursor.or_else(|| docks.iter().find(|(r, _)| r == "dock")).or(docks.first()).map(|(_, j)| j.clone())
}

fn open_app_search(app: &AppHandle) {
    let Some(dock) = dock_under_cursor(app) else { return };
    let _ = dock.set_focus();
    let _ = dock.emit_to(dock.label(), "niko://lupa", ());
}

fn create_overlay(app: &AppHandle, label: &str, y: f64, x: f64, width: f64, height: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Niko")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .position(x, y)
        .inner_size(width, height)
        .build()
}

fn watch_cursor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut outside: HashMap<String, bool> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_millis(45));
            register_foreground(&app);
            let areas = match app.state::<AppState>().areas.lock() {
                Ok(a) => a.clone(),
                Err(_) => continue,
            };
            let overlays: Vec<(String, WebviewWindow)> = app.webview_windows().into_iter().filter(|(r, _)| r == "ilha" || r == "assistive" || docks::is_dock(r)).collect();
            outside.retain(|r, _| overlays.iter().any(|(s, _)| s == r));
            for (label, window) in &overlays {
                let label = label.as_str();
                let (Ok(cursor), Ok(origin), Ok(scale)) = (window.cursor_position(), window.outer_position(), window.scale_factor()) else { continue };
                let x = (cursor.x - origin.x as f64) / scale;
                let y = (cursor.y - origin.y as f64) / scale;
                let inside = areas.get(label).map(|list| list.iter().any(|r| x >= r.x - 4.0 && x <= r.x + r.w + 4.0 && y >= r.y - 4.0 && y <= r.y + r.h + 4.0)).unwrap_or(false);
                let was_outside = *outside.get(label).unwrap_or(&false);
                let now_outside = !inside;
                if !outside.contains_key(label) || was_outside != now_outside {
                    let _ = window.set_ignore_cursor_events(now_outside);
                    if now_outside {
                        let _ = window.emit_to(label, "niko://cursor-fora", ());
                    }
                    outside.insert(label.to_string(), now_outside);
                }
            }
        }
    });
}

fn without_path_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    let text = path.to_string_lossy().to_string();
    match text.strip_prefix(r"\\?\UNC\") {
        Some(rest) => std::path::PathBuf::from(format!(r"\\{}", rest)),
        None => match text.strip_prefix(r"\\?\") {
            Some(rest) => std::path::PathBuf::from(rest),
            None => path,
        },
    }
}

fn start_bridge(app: &AppHandle, token: &str, restart: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let payload = app.path().app_data_dir().ok();
    let register = |text: String| {
        if let Some(directory) = &payload {
            let _ = std::fs::create_dir_all(directory);
            let _ = std::fs::write(directory.join("niko.log"), text);
        }
    };
    let Ok(directory) = app.path().resource_dir() else {
        register("sem pasta de recursos".into());
        return;
    };
    let resources = without_path_prefix(directory.join("resources"));
    let node = resources.join("node.exe");
    let script = resources.join("bridge.mjs");
    let output_error = payload.as_ref().and_then(|p| {
        let path = without_path_prefix(p.join("ponte.log"));
        if restart {
            std::fs::OpenOptions::new().create(true).append(true).open(path).ok()
        } else {
            std::fs::File::create(path).ok()
        }
    });
    let mut command = Command::new(&node);
    command.current_dir(&resources).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null());
    match output_error {
        Some(file) => {
            command.stderr(file);
        }
        None => {
            command.stderr(std::process::Stdio::null());
        }
    }
    command.arg("bridge.mjs").env("NIKO_PORTA", PORT.to_string()).env("NIKO_TOKEN", token).env("NIKO_PAI", std::process::id().to_string());
    #[cfg(windows)]
    {
        use std::the::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    match command.spawn() {
        Ok(child) => {
            register(format!("ponte iniciada: {} {} (pid {})", node.display(), script.display(), child.id()));
            if let Ok(mut bridge) = app.state::<AppState>().bridge.lock() {
                *bridge = Some(child);
            }
        }
        Err(error) => register(format!("falha ao iniciar a ponte: {} {} {}", node.display(), script.display(), error)),
    }
}

fn stop_bridge(app: &AppHandle) {
    SHUTTING_DOWN.store(true, Ordering::Relaxed);
    if let Ok(mut bridge) = app.state::<AppState>().bridge.lock() {
        if let Some(mut child) = bridge.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub async fn prepare_update(app: AppHandle) {
    let _ = app.emit("niko://saindo", ());
    std::thread::sleep(SAVE_WAIT);
    for (label, window) in app.webview_windows() {
        if docks::is_dock(&label) {
            windows_taskbar::reserve_space_dock(&window, false);
        }
    }
    windows_taskbar::restore(&app);
    stop_bridge(&app);
}

static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
const MAX_BRIDGE_RESTARTS: u32 = 5;

fn watch_bridge(app: AppHandle, token: String) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        let mut restarts = 0u32;
        let mut stable_since = std::time::Instant::now();
        loop {
            std::thread::sleep(Duration::from_secs(3));
            if SHUTTING_DOWN.load(Ordering::Relaxed) {
                return;
            }
            let crashed = match app.state::<AppState>().bridge.lock() {
                Ok(mut bridge) => match bridge.as_mut() {
                    Some(child) => matches!(child.try_wait(), Ok(Some(_))),
                    None => false,
                },
                Err(_) => false,
            };
            if !crashed {
                if stable_since.elapsed() > Duration::from_secs(120) {
                    restarts = 0;
                }
                continue;
            }
            if restarts >= MAX_BRIDGE_RESTARTS {
                return;
            }
            restarts += 1;
            std::thread::sleep(Duration::from_secs(u64::from(restarts) * 2));
            if SHUTTING_DOWN.load(Ordering::Relaxed) {
                return;
            }
            start_bridge(&app, &token, true);
            stable_since = std::time::Instant::now();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = generate_token();
    let hidden = std::env::args().any(|a| a == "--escondido");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--escondido"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(action) = shortcuts::action_for(app, shortcut) else { return };
                    match action.as_str() {
                        "lupa" => open_app_search(app),
                        "sistema" => toggle_system(app.clone()),
                        "captura" => {
                            show(app);
                            let _ = app.emit_to("sistema", "niko://captura", ());
                        }
                        "pedido" | "proximaAba" | "terminal" => shortcuts::notify_window(app, "ilha", &action),
                        _ => shortcuts::notify_window(app, "sistema", &action),
                    }
                })
                .build(),
        )
        .manage(AppState { areas: Mutex::new(HashMap::new()), token: token.clone(), bridge: Mutex::new(None) })
        .manage(thumbnails::Thumbnails::default())
        .manage(shortcuts::Shortcuts::default())
        .invoke_handler(tauri::generate_handler![
            legacy_commands::definir_atalhos,
            legacy_commands::reservar_dock,
            legacy_commands::barra_windows,
            legacy_commands::monitores,
            legacy_commands::definir_docks,
            legacy_commands::definir_monitor_da_ilha,
            legacy_commands::frente_cobre_tela,
            legacy_commands::area_interativa,
            legacy_commands::token_ponte,
            legacy_commands::porta_ponte,
            legacy_commands::mostrar_sistema,
            legacy_commands::liberar_sistema_inicial,
            legacy_commands::tempo_ocioso_ms,
            legacy_commands::devolver_foco,
            legacy_commands::alternar_sistema,
            legacy_commands::abrir_link,
            legacy_commands::sair,
            legacy_commands::preparar_atualizacao,
            legacy_commands::miniaturas_janelas
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            windows_taskbar::restore(&handle);
            start_bridge(&handle, &token, false);
            watch_bridge(handle.clone(), token.clone());

            let monitor = app.primary_monitor()?.or(app.available_monitors()?.into_iter().next());
            let (mx, my, mw, mh) = match &monitor {
                Some(m) => {
                    let scale = m.scale_factor();
                    let area = m.work_area();
                    (area.position.x as f64 / scale, area.position.y as f64 / scale, area.size.width as f64 / scale, area.size.height as f64 / scale)
                }
                None => (0.0, 0.0, 1920.0, 1040.0),
            };
            let (screen_x, screen_y, screen_width) = match &monitor {
                Some(m) => {
                    let scale = m.scale_factor();
                    (m.position().x as f64 / scale, m.position().y as f64 / scale, m.size().width as f64 / scale)
                }
                None => (mx, my, mw),
            };

            let system = WebviewWindowBuilder::new(app, "sistema", WebviewUrl::App("index.html".into()))
                .title("Niko")
                .decorations(false)
                .inner_size(1320.0_f64.min(mw - 40.0), 860.0_f64.min(mh - 40.0))
                .min_inner_size(960.0, 600.0)
                .background_color(tauri::window::Color(14, 14, 16, 255))
                .disable_drag_drop_handler()
                .center()
                .visible(false)
                .build()?;
            if !hidden {
                OPENING_PENDING.store(true, Ordering::Relaxed);
                let fallback = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(OPENING_TIMEOUT);
                    release_opening(&fallback);
                });
            }
            let system_ref = system.clone();
            system.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = system_ref.hide();
                }
            });

            create_overlay(&handle, "ilha", screen_y, screen_x, screen_width, ISLAND_HEIGHT)?;
            create_overlay(&handle, "dock", my + mh - DOCK_HEIGHT, mx, mw, DOCK_HEIGHT)?;
            create_overlay(&handle, "assistive", my, mx, mw, mh)?;
            for label in ["ilha", "dock", "assistive"] {
                if let Some(j) = handle.get_webview_window(label) {
                    let _ = j.set_ignore_cursor_events(true);
                }
            }
            docks::synchronize(&handle);
            docks::watch_monitors(handle.clone());
            watch_cursor(handle.clone());

            let open = MenuItem::with_id(app, "abrir", "Abrir o Niko", true, None::<&str>)?;
            let exit_item = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &exit_item])?;
            let mut tray = TrayIconBuilder::with_id("niko").menu(&menu).show_menu_on_left_click(false).tooltip("Niko");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "abrir" => show(app),
                    "sair" => exit_with_save(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            shortcuts::register_defaults(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Niko");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            for (label, window) in handle.webview_windows() {
                if docks::is_dock(&label) {
                    windows_taskbar::reserve_space_dock(&window, false);
                }
            }
            windows_taskbar::restore(handle);
            stop_bridge(handle);
        }
    });
}
