#[cfg(target_os = "linux")]
mod dock_linux;
use std::collections::HashSet;
#[cfg(windows)]
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(windows)]
use std::sync::atomic::AtomicIsize;
use std::sync::Mutex;
use std::time::Duration;

#[cfg(windows)]
use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri::WebviewWindow;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
#[cfg(target_os = "linux")]
mod atalho_ilha_linux;

#[cfg(windows)]
mod barra_windows;
#[cfg(windows)]
mod janela_frente;
#[cfg(windows)]
mod miniaturas;

const PORTA: u16 = 47831;
#[cfg(windows)]
const ALTURA_ILHA: f64 = 720.0;
#[cfg(windows)]
const ALTURA_DOCK: f64 = 250.0;

#[cfg(windows)]
#[derive(Deserialize, Clone, Copy)]
struct Retangulo {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Saida {
    tentativa: u64,
    participantes: HashSet<String>,
    pendentes: HashSet<String>,
}

struct Estado {
    #[cfg(windows)]
    areas: Mutex<HashMap<String, Vec<Retangulo>>>,
    token: String,
    ponte: Mutex<Option<Child>>,
    saida: Mutex<Option<Saida>>,
}

#[cfg(windows)]
fn gerar_token() -> String {
    use windows::Win32::Security::Cryptography::{BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG};
    let mut bytes = [0u8; 32];
    let status = unsafe { BCryptGenRandom(None, &mut bytes, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
    assert!(status.is_ok(), "falha ao gerar o token da ponte");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(target_os = "linux")]
fn gerar_token() -> String {
    use std::io::Read;
    let mut bytes = [0u8; 32];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut arquivo| arquivo.read_exact(&mut bytes))
        .expect("falha ao gerar o token da ponte");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
#[cfg(windows)]
fn area_interativa(janela: String, retangulos: Vec<Retangulo>, estado: tauri::State<Estado>) {
    if let Ok(mut areas) = estado.areas.lock() {
        areas.insert(janela, retangulos);
    }
}

#[cfg(target_os = "linux")]
fn validar_tamanho_ilha(largura: f64, altura: f64) -> Result<(), String> {
    if !largura.is_finite() || !altura.is_finite() || !(120.0..=800.0).contains(&largura) || !(30.0..=430.0).contains(&altura) {
        return Err("tamanho_ilha_invalido".into());
    }
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "linux")]
fn dimensionar_ilha(janela: WebviewWindow, largura: f64, altura: f64) -> Result<(), String> {
    if janela.label() != "ilha" {
        return Err("janela_invalida".into());
    }
    validar_tamanho_ilha(largura, altura)?;
    janela.set_size(tauri::LogicalSize::new(largura, altura)).map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg(target_os = "linux")]
fn dimensionar_dock(janela: WebviewWindow, largura: f64, altura: f64) -> Result<(), String> {
    if janela.label() != "dock" || !largura.is_finite() || !altura.is_finite() ||
        !(60.0..=4096.0).contains(&largura) || !(60.0..=600.0).contains(&altura) {
        return Err("tamanho_dock_invalido".into());
    }
    janela.set_size(tauri::LogicalSize::new(largura, altura)).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_ponte(estado: tauri::State<Estado>) -> String {
    estado.token.clone()
}

#[tauri::command]
fn porta_ponte() -> u16 {
    PORTA
}

#[tauri::command]
fn mostrar_sistema(app: AppHandle) {
    mostrar(&app);
}

#[cfg(windows)]
static ULTIMA_FRENTE: AtomicIsize = AtomicIsize::new(0);

#[cfg(windows)]
fn registrar_frente(app: &AppHandle) {
    let frente = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() }.0 as isize;
    if frente == 0 {
        return;
    }
    let sobreposta = ["ilha", "dock"].iter().any(|r| app.get_webview_window(r).and_then(|j| j.hwnd().ok()).map(|h| h.0 as isize == frente).unwrap_or(false));
    if !sobreposta {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

#[tauri::command]
fn alternar_sistema(app: AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let visivel = janela.is_visible().unwrap_or(false) && !janela.is_minimized().unwrap_or(false);
        #[cfg(windows)]
        let focada = janela.hwnd().map(|h| h.0 as isize == ULTIMA_FRENTE.load(Ordering::Relaxed)).unwrap_or(false);
        #[cfg(target_os = "linux")]
        let focada = janela.is_focused().unwrap_or(false);
        if visivel && focada {
            let _ = janela.minimize();
        } else {
            mostrar(&app);
        }
    }
}

#[tauri::command]
#[cfg(windows)]
fn abrir_link(url: String) -> Result<(), String> {
    abrir_endereco(validar_link(&url)?)
}

#[tauri::command]
#[cfg(target_os = "linux")]
async fn abrir_link(url: String) -> Result<(), String> {
    let endereco = validar_link(&url)?.to_owned();
    tauri::async_runtime::spawn_blocking(move || abrir_endereco(&endereco))
        .await.map_err(|_| "falha_ao_abrir".to_string())?
}

fn validar_link(url: &str) -> Result<&str, String> {
    let endereco = url.trim();
    if !(endereco.starts_with("https://") || endereco.starts_with("http://")) || endereco.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("link_invalido".into());
    }
    Ok(endereco)
}

#[cfg(target_os = "linux")]
fn abrir_endereco(endereco: &str) -> Result<(), String> {
    executar_abridor("xdg-open", endereco)
}

#[cfg(target_os = "linux")]
fn executar_abridor(programa: &str, endereco: &str) -> Result<(), String> {
    Command::new(programa).arg(endereco).status()
        .map_err(|_| "falha_ao_abrir".to_string())
        .and_then(|status| if status.success() { Ok(()) } else { Err("falha_ao_abrir".into()) })
}

#[cfg(windows)]
fn abrir_endereco(endereco: &str) -> Result<(), String> {
    let largo: Vec<u16> = endereco.encode_utf16().chain(std::iter::once(0)).collect();
    let resultado = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(largo.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if resultado.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

#[tauri::command]
fn sair(app: AppHandle) {
    sair_salvando(&app);
}

static TENTATIVA_SAIDA: AtomicU64 = AtomicU64::new(0);

fn cancelar_saida(app: &AppHandle, tentativa: u64) {
    let estado = app.state::<Estado>();
    let mut saida = estado.saida.lock().unwrap();
    if saida.as_ref().map(|s| s.tentativa) != Some(tentativa) { return; }
    *saida = None;
    ENCERRANDO.store(false, Ordering::Relaxed);
    drop(saida);
    mostrar(app);
    let _ = app.emit("niko://saida-cancelada", ());
}

fn registrar_confirmacao(saida: &mut Option<Saida>, tentativa: u64, rotulo: &str, salvo: bool) -> Option<bool> {
    let atual = saida.as_mut()?;
    if atual.tentativa != tentativa || !atual.participantes.contains(rotulo) { return None; }
    // Uma nova escrita revoga inclusive a confirmação de uma janela já pronta.
    if !salvo { return Some(false); }
    if !atual.pendentes.remove(rotulo) { return None; }
    if atual.pendentes.is_empty() { Some(true) } else { None }
}

#[tauri::command]
fn confirmar_saida(app: AppHandle, janela: WebviewWindow, tentativa: u64, salvo: bool) {
    let estado = app.state::<Estado>();
    let mut saida = estado.saida.lock().unwrap();
    match registrar_confirmacao(&mut saida, tentativa, janela.label(), salvo) {
        Some(true) => {
            *saida = None;
            drop(saida);
            app.exit(0);
        }
        Some(false) => {
            *saida = None;
            ENCERRANDO.store(false, Ordering::Relaxed);
            drop(saida);
            mostrar(&app);
            let _ = app.emit("niko://saida-cancelada", ());
        }
        None => {}
    }
}

fn sair_salvando(app: &AppHandle) {
    if ENCERRANDO.swap(true, Ordering::Relaxed) { return; }
    let tentativa = TENTATIVA_SAIDA.fetch_add(1, Ordering::Relaxed) + 1;
    let janelas: HashSet<String> = app.webview_windows().into_keys().collect();
    *app.state::<Estado>().saida.lock().unwrap() = Some(Saida { tentativa, participantes: janelas.clone(), pendentes: janelas });
    if app.emit("niko://saindo", tentativa).is_err() {
        cancelar_saida(app, tentativa);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // Timeout cancela a saída: nenhuma espera fixa comprova uma gravação.
        std::thread::sleep(Duration::from_secs(10));
        cancelar_saida(&app, tentativa);
    });
}

fn mostrar(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

#[cfg(windows)]
fn criar_sobreposta(app: &AppHandle, rotulo: &str, y: f64, x: f64, largura: f64, altura: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, rotulo, WebviewUrl::App("index.html".into()))
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
        .inner_size(largura, altura)
        .build()
}

#[cfg(windows)]
fn vigiar_cursor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut fora: HashMap<String, bool> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_millis(45));
            registrar_frente(&app);
            let areas = match app.state::<Estado>().areas.lock() {
                Ok(a) => a.clone(),
                Err(_) => continue,
            };
            for rotulo in ["ilha", "dock"] {
                let Some(janela) = app.get_webview_window(rotulo) else { continue };
                let (Ok(cursor), Ok(origem), Ok(escala)) = (janela.cursor_position(), janela.outer_position(), janela.scale_factor()) else { continue };
                let x = (cursor.x - origem.x as f64) / escala;
                let y = (cursor.y - origem.y as f64) / escala;
                let dentro = areas.get(rotulo).map(|lista| lista.iter().any(|r| x >= r.x - 4.0 && x <= r.x + r.w + 4.0 && y >= r.y - 4.0 && y <= r.y + r.h + 4.0)).unwrap_or(false);
                let estava_fora = *fora.get(rotulo).unwrap_or(&false);
                let agora_fora = !dentro;
                if !fora.contains_key(rotulo) || estava_fora != agora_fora {
                    let _ = janela.set_ignore_cursor_events(agora_fora);
                    if agora_fora {
                        let _ = janela.emit_to(rotulo, "niko://cursor-fora", ());
                    }
                    fora.insert(rotulo.to_string(), agora_fora);
                }
            }
        }
    });
}

fn sem_prefixo(caminho: std::path::PathBuf) -> std::path::PathBuf {
    let texto = caminho.to_string_lossy().to_string();
    match texto.strip_prefix(r"\\?\UNC\") {
        Some(resto) => std::path::PathBuf::from(format!(r"\\{}", resto)),
        None => match texto.strip_prefix(r"\\?\") {
            Some(resto) => std::path::PathBuf::from(resto),
            None => caminho,
        },
    }
}

fn iniciar_ponte(app: &AppHandle, token: &str, reinicio: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let dados = app.path().app_data_dir().ok();
    let registrar = |texto: String| {
        if let Some(pasta) = &dados {
            let _ = std::fs::create_dir_all(pasta);
            let _ = std::fs::write(pasta.join("niko.log"), texto);
        }
    };
    let Ok(pasta) = app.path().resource_dir() else {
        registrar("sem pasta de recursos".into());
        return;
    };
    let recursos = sem_prefixo(pasta.join("recursos"));
    let node = recursos.join(if cfg!(windows) { "node.exe" } else { "node" });
    let script = recursos.join("ponte.mjs");
    let saida_erro = dados.as_ref().and_then(|p| {
        let caminho = sem_prefixo(p.join("ponte.log"));
        if reinicio {
            std::fs::OpenOptions::new().create(true).append(true).open(caminho).ok()
        } else {
            std::fs::File::create(caminho).ok()
        }
    });
    let mut comando = Command::new(&node);
    comando.current_dir(&recursos).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null());
    match saida_erro {
        Some(arquivo) => {
            comando.stderr(arquivo);
        }
        None => {
            comando.stderr(std::process::Stdio::null());
        }
    }
    comando.arg("ponte.mjs").env("NIKO_PORTA", PORTA.to_string()).env("NIKO_TOKEN", token).env("NIKO_PAI", std::process::id().to_string());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        comando.creation_flags(0x0800_0000);
    }
    match comando.spawn() {
        Ok(filho) => {
            registrar(format!("ponte iniciada: {} {} (pid {})", node.display(), script.display(), filho.id()));
            if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
                *ponte = Some(filho);
            }
        }
        Err(erro) => registrar(format!("falha ao iniciar a ponte: {} {} {}", node.display(), script.display(), erro)),
    }
}

fn parar_ponte(app: &AppHandle) {
    ENCERRANDO.store(true, Ordering::Relaxed);
    if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
        if let Some(mut filho) = ponte.take() {
            let _ = filho.kill();
        }
    }
}

static ENCERRANDO: AtomicBool = AtomicBool::new(false);
const MAXIMO_REINICIOS_DA_PONTE: u32 = 5;

fn vigiar_ponte(app: AppHandle, token: String) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        let mut reinicios = 0u32;
        let mut estavel_desde = std::time::Instant::now();
        loop {
            std::thread::sleep(Duration::from_secs(3));
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            let caiu = match app.state::<Estado>().ponte.lock() {
                Ok(mut ponte) => match ponte.as_mut() {
                    Some(filho) => matches!(filho.try_wait(), Ok(Some(_))),
                    None => false,
                },
                Err(_) => false,
            };
            if !caiu {
                if estavel_desde.elapsed() > Duration::from_secs(120) {
                    reinicios = 0;
                }
                continue;
            }
            if reinicios >= MAXIMO_REINICIOS_DA_PONTE {
                return;
            }
            reinicios += 1;
            std::thread::sleep(Duration::from_secs(u64::from(reinicios) * 2));
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            iniciar_ponte(&app, &token, true);
            estavel_desde = std::time::Instant::now();
        }
    });
}

#[cfg(target_os = "linux")]
fn pedido_ilha(args: &[String]) -> Option<bool> {
    if args.iter().any(|a| a == "--mostrar-ilha") { Some(true) }
    else if args.iter().any(|a| a == "--ilha-hover") { Some(false) }
    else { None }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = gerar_token();
    let escondido = std::env::args().any(|a| a == "--escondido");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            #[cfg(target_os = "linux")]
            if let Some(foco) = pedido_ilha(&_args) {
                let evento = if foco { "niko://mostrar-ilha" } else { "niko://revelar-ilha" };
                let _ = app.emit_to("ilha", evento, ());
                return;
            }
            mostrar(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--escondido"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _atalho, evento| {
                    if evento.state() == ShortcutState::Pressed {
                        mostrar(app);
                        let _ = app.emit_to("sistema", "niko://captura", ());
                    }
                })
                .build(),
        )
        .manage(Estado {
            #[cfg(windows)]
            areas: Mutex::new(HashMap::new()),
            token: token.clone(), ponte: Mutex::new(None), saida: Mutex::new(None)
        });
    #[cfg(windows)]
    let app = app.manage(miniaturas::Miniaturas::default())
        .invoke_handler(tauri::generate_handler![
            area_interativa,
            token_ponte,
            porta_ponte,
            mostrar_sistema,
            alternar_sistema,
            abrir_link,
            sair, confirmar_saida,
            barra_windows::barra_windows,
            barra_windows::reservar_dock,
            janela_frente::frente_cobre_tela,
            miniaturas::miniaturas_janelas
        ]);
    #[cfg(target_os = "linux")]
    let app = app.invoke_handler(tauri::generate_handler![
        dock_linux::area_interativa, atalho_ilha_linux::atalho_ilha_linux, dimensionar_ilha, dimensionar_dock, token_ponte, porta_ponte, mostrar_sistema,
        alternar_sistema, abrir_link, sair, confirmar_saida
    ]);
    let app = app.setup(move |app| {
            let handle = app.handle().clone();
            #[cfg(windows)]
            barra_windows::restaurar(&handle);
            iniciar_ponte(&handle, &token, false);
            vigiar_ponte(handle.clone(), token.clone());

            let monitor = app.primary_monitor()?.or(app.available_monitors()?.into_iter().next());
            let (_mx, _my, mw, mh) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    let area = m.work_area();
                    (area.position.x as f64 / escala, area.position.y as f64 / escala, area.size.width as f64 / escala, area.size.height as f64 / escala)
                }
                None => (0.0, 0.0, 1920.0, 1040.0),
            };
            #[cfg(windows)]
            let (tela_x, tela_y, tela_largura) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    (m.position().x as f64 / escala, m.position().y as f64 / escala, m.size().width as f64 / escala)
                }
                None => (_mx, _my, mw),
            };

            let sistema = WebviewWindowBuilder::new(app, "sistema", WebviewUrl::App("index.html".into()));
            #[cfg(target_os = "linux")]
            let sistema = sistema.initialization_script("window.__NIKO_PLATAFORMA__ = 'linux';");
            let sistema = sistema
                .title("Niko")
                .decorations(false)
                .inner_size(1320.0_f64.min(mw - 40.0), 860.0_f64.min(mh - 40.0))
                .min_inner_size(960.0, 600.0)
                .background_color(tauri::window::Color(14, 14, 16, 255))
                .disable_drag_drop_handler()
                .center()
                .visible(!escondido)
                .build()?;
            let sistema_ref = sistema.clone();
            sistema.on_window_event(move |evento| {
                if let WindowEvent::CloseRequested { api, .. } = evento {
                    api.prevent_close();
                    let _ = sistema_ref.hide();
                }
            });

            #[cfg(windows)]
            {
                criar_sobreposta(&handle, "ilha", tela_y, tela_x, tela_largura, ALTURA_ILHA)?;
                criar_sobreposta(&handle, "dock", _my + mh - ALTURA_DOCK, _mx, mw, ALTURA_DOCK)?;
                for rotulo in ["ilha", "dock"] {
                    if let Some(j) = handle.get_webview_window(rotulo) {
                        let _ = j.set_ignore_cursor_events(true);
                    }
                }
                vigiar_cursor(handle.clone());
            }

            #[cfg(target_os = "linux")]
            {
                WebviewWindowBuilder::new(app, "dock", WebviewUrl::App("index.html".into()))
                    .title("Dock do Niko — experimental")
                    .decorations(false).skip_taskbar(true)
                    .initialization_script("window.__NIKO_PLATAFORMA__ = 'linux';")
                    .inner_size(320.0, 80.0).transparent(true).resizable(false).focused(false).visible(false)
                    .background_color(tauri::window::Color(0, 0, 0, 0))
                    .disable_drag_drop_handler().build()?;
                // GNOME ancora a ilha; o cliente fica oculto até ativação explícita.
                let ilha = WebviewWindowBuilder::new(app, "ilha", WebviewUrl::App("index.html".into()))
                    .title("Ilha do Niko — experimental")
                    .decorations(false)
                    .skip_taskbar(true)
                    .initialization_script("window.__NIKO_PLATAFORMA__ = 'linux';")
                    .inner_size(272.0, 46.0)
                    .resizable(false)
                    .focused(false)
                    .visible(false)
                    .background_color(tauri::window::Color(14, 14, 16, 255))
                    .disable_drag_drop_handler()
                    .build()?;
                let ilha_ref = ilha.clone();
                ilha.on_window_event(move |evento| {
                    if let WindowEvent::CloseRequested { api, .. } = evento {
                        api.prevent_close();
                        let _ = ilha_ref.hide();
                        let _ = ilha_ref.emit("niko://ocultar-ilha", ());
                    }
                });
            }

            let abrir = MenuItem::with_id(app, "abrir", "Abrir o Niko", true, None::<&str>)?;
            let sair_item = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            #[cfg(windows)]
            let menu = Menu::with_items(app, &[&abrir, &sair_item])?;
            #[cfg(target_os = "linux")]
            let menu = {
                let ilha = MenuItem::with_id(app, "ilha", "Mostrar ilha", true, None::<&str>)?;
                Menu::with_items(app, &[&abrir, &ilha, &sair_item])?
            };
            let mut bandeja = TrayIconBuilder::with_id("niko").menu(&menu).show_menu_on_left_click(false).tooltip("Niko");
            if let Some(icone) = app.default_window_icon() {
                bandeja = bandeja.icon(icone.clone());
            }
            bandeja
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => mostrar(app),
                    #[cfg(target_os = "linux")]
                    "ilha" => { let _ = app.emit_to("ilha", "niko://mostrar-ilha", ()); },
                    "sair" => sair_salvando(app),
                    _ => {}
                })
                .on_tray_icon_event(|bandeja, evento| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                        mostrar(bandeja.app_handle());
                    }
                })
                .build(app)?;

            let _ = app.global_shortcut().register("ctrl+alt+space");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Niko");

    app.run(|handle, evento| {
        if let RunEvent::Exit = evento {
            #[cfg(windows)]
            {
                barra_windows::reservar_espaco_do_dock(handle, false);
                barra_windows::restaurar(handle);
            }
            parar_ponte(handle);
        }
    });
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    #[cfg(target_os = "linux")]
    #[test]
    fn ativacao_da_ilha_distingue_foco() {
        assert_eq!(super::pedido_ilha(&["niko".into()]), None);
        assert_eq!(super::pedido_ilha(&["niko".into(), "--ilha-hover".into()]), Some(false));
        assert_eq!(super::pedido_ilha(&["niko".into(), "--mostrar-ilha".into()]), Some(true));
    }

    use super::*;

    #[test]
    fn saida_aguarda_todas_janelas_e_ignora_confirmacoes_atrasadas() {
        let janelas = HashSet::from(["sistema".into(), "ilha".into()]);
        let mut saida = Some(Saida { tentativa: 2, participantes: janelas.clone(), pendentes: janelas });
        assert_eq!(registrar_confirmacao(&mut saida, 1, "sistema", true), None);
        assert_eq!(registrar_confirmacao(&mut saida, 2, "desconhecida", false), None);
        assert_eq!(registrar_confirmacao(&mut saida, 2, "sistema", false), Some(false));
        assert_eq!(registrar_confirmacao(&mut saida, 2, "sistema", true), None);
        assert_eq!(registrar_confirmacao(&mut saida, 2, "sistema", true), None);
        assert_eq!(registrar_confirmacao(&mut saida, 2, "sistema", false), Some(false));
        assert_eq!(registrar_confirmacao(&mut saida, 2, "ilha", true), Some(true));
        assert_eq!(registrar_confirmacao(&mut None, 2, "ilha", true), None);
    }

    #[test]
    fn tamanho_ilha_linux_rejeita_valores_fora_dos_limites() {
        for (w, h) in [(272.0, 46.0), (692.0, 302.0), (791.0, 419.0)] {
            assert_eq!(validar_tamanho_ilha(w, h), Ok(()));
        }
        for (w, h) in [(f64::NAN, 46.0), (272.0, f64::INFINITY), (119.0, 46.0), (801.0, 46.0), (272.0, 29.0), (272.0, 431.0)] {
            assert!(validar_tamanho_ilha(w, h).is_err());
        }
    }

    #[test]
    fn token_linux_tem_32_bytes_em_hexadecimal() {
        let token = gerar_token();
        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(token, gerar_token());
    }

    #[test]
    fn links_invalidos_nao_chegam_ao_programa_externo() {
        for url in ["file:///etc/passwd", "javascript:alert(1)", "--help", "https://exemplo.com/\nargumento", "https://exemplo.com/a b"] {
            assert_eq!(validar_link(url), Err("link_invalido".into()));
        }
    }

    #[test]
    fn abridor_linux_reporta_sucesso_e_falhas() {
        let url = validar_link(" https://exemplo.com/ ").unwrap();
        assert_eq!(executar_abridor("/bin/true", url), Ok(()));
        assert_eq!(executar_abridor("/bin/false", url), Err("falha_ao_abrir".into()));
        assert_eq!(executar_abridor("/niko-programa-inexistente", url), Err("falha_ao_abrir".into()));
    }
}
