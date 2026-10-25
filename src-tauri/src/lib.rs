use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;

mod atalhos;
mod docks;
mod plataforma;
mod salvamento;

use plataforma::{barra, janela_frente, miniaturas};

const PORTA: u16 = 47831;
const PORTAS_RESERVA: u16 = 20;
const ESPERA_PELA_PORTA: Duration = Duration::from_secs(5);
static PORTA_ATUAL: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(PORTA);

fn porta_livre(porta: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", porta)).is_ok()
}

// A porta padrão costuma estar ocupada só pela ponte de um Niko que acabou de fechar, que sai em até 3 s;
// por isso espera um pouco antes de trocar, já que os ganchos do Claude Code guardam a porta.
// Só se outro programa a mantiver ocupada a ponte vai para uma das portas seguintes.
fn escolher_porta() -> u16 {
    let limite = std::time::Instant::now() + ESPERA_PELA_PORTA;
    while std::time::Instant::now() < limite {
        if porta_livre(PORTA) {
            return PORTA;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    (PORTA + 1..=PORTA + PORTAS_RESERVA).find(|p| porta_livre(*p)).unwrap_or(PORTA)
}
const ALTURA_ILHA: f64 = 720.0;
const ALTURA_DOCK: f64 = 400.0;

#[derive(Deserialize, Clone, Copy)]
struct Retangulo {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Estado {
    areas: Mutex<HashMap<String, Vec<Retangulo>>>,
    token: String,
    ponte: Mutex<Option<Child>>,
    sinais: Mutex<HashMap<String, std::time::Instant>>,
}

const LOG_DE_EVENTOS_MAXIMO: u64 = 256 * 1024;

// Linhas curtas sobre abrir, recarregar e encerrar, para diagnosticar relatos de "o Niko não abre mais".
fn anotar(app: &AppHandle, texto: &str) {
    let Ok(pasta) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&pasta);
    let caminho = pasta.join("niko-eventos.log");
    if std::fs::metadata(&caminho).is_ok_and(|m| m.len() > LOG_DE_EVENTOS_MAXIMO) {
        let _ = std::fs::remove_file(&caminho);
    }
    let segundos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Ok(mut arquivo) = std::fs::OpenOptions::new().create(true).append(true).open(caminho) {
        use std::io::Write;
        let _ = writeln!(arquivo, "{segundos} {texto}");
    }
}

#[tauri::command]
fn sinal_de_vida(janela: WebviewWindow, estado: tauri::State<Estado>) {
    if let Ok(mut sinais) = estado.sinais.lock() {
        sinais.insert(janela.label().to_string(), std::time::Instant::now());
    }
}

const ESPERA_PELO_SINAL: Duration = Duration::from_secs(8);

// Uma página que já respondeu e não volta a responder depois de mostrada morreu (o processo do WebView caiu
// ou travou). Sem isso, o "Abrir" mostra uma janela vazia e o Niko parece não abrir mais.
fn conferir_janelas_vivas(app: &AppHandle) {
    let mostradas_em = std::time::Instant::now();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(ESPERA_PELO_SINAL).await;
        if ENCERRANDO.load(Ordering::Relaxed) { return; }
        let sinais = match app.state::<Estado>().sinais.lock() {
            Ok(s) => s.clone(),
            Err(_) => return,
        };
        for (rotulo, janela) in app.webview_windows() {
            if !janela.is_visible().unwrap_or(false) { continue; }
            let Some(ultimo) = sinais.get(&rotulo) else { continue };
            if *ultimo < mostradas_em {
                anotar(&app, &format!("janela {rotulo} sem resposta depois de mostrada; recarregando"));
                let _ = janela.reload();
            }
        }
    });
}

const LIMITE_PARA_ENCERRAR: Duration = Duration::from_secs(6);

// Se o encerramento travar (o Explorer pode demorar a responder ao devolver a barra de tarefas), o processo
// continuaria vivo segurando a instância única, e abrir o Niko de novo não faria nada.
fn garantir_encerramento(app: &AppHandle) {
    anotar(app, "encerrando");
    std::thread::spawn(|| {
        std::thread::sleep(LIMITE_PARA_ENCERRAR);
        std::process::exit(0);
    });
}

fn gerar_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("falha ao gerar o token da ponte");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
fn area_interativa(app: AppHandle, janela: String, retangulos: Vec<Retangulo>, estado: tauri::State<Estado>) {
    let caixas: Vec<[f64; 4]> = retangulos.iter().map(|r| [r.x, r.y, r.w, r.h]).collect();
    if let Ok(mut areas) = estado.areas.lock() {
        areas.insert(janela.clone(), retangulos);
    }
    if let Some(alvo) = app.get_webview_window(&janela) {
        plataforma::definir_area_de_entrada(&alvo, caixas);
    }
}

#[tauri::command]
fn token_ponte(estado: tauri::State<Estado>) -> String {
    estado.token.clone()
}

#[tauri::command]
fn porta_ponte() -> u16 {
    PORTA_ATUAL.load(Ordering::Relaxed)
}

#[tauri::command]
fn mostrar_sistema(app: AppHandle) {
    mostrar(&app);
}

static ABERTURA_PENDENTE: AtomicBool = AtomicBool::new(false);
const LIMITE_DA_ABERTURA: Duration = Duration::from_secs(9);

fn liberar_abertura(app: &AppHandle) {
    if ABERTURA_PENDENTE.swap(false, Ordering::Relaxed) {
        mostrar_inicial(app);
    }
}

fn mostrar_inicial(app: &AppHandle) {
    mostrar(app);
}

#[tauri::command]
fn liberar_sistema_inicial(app: AppHandle) {
    liberar_abertura(&app);
}

#[tauri::command]
async fn tempo_ocioso_ms() -> u64 {
    tauri::async_runtime::spawn_blocking(plataforma::tempo_ocioso_ms).await.unwrap_or(0)
}

// Ativar ou minimizar a janela de outro app espera a resposta dele; com o app "Não respondendo",
// isso na thread principal congelaria o Niko inteiro.
#[tauri::command]
async fn agir_na_janela(acao: String, janela: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || janela.parse::<isize>().is_ok_and(|id| plataforma::agir_na_janela(&acao, id))).await.unwrap_or(false)
}

#[tauri::command]
async fn devolver_foco() {
    let _ = tauri::async_runtime::spawn_blocking(plataforma::devolver_foco).await;
}

#[tauri::command]
fn alternar_sistema(app: AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let visivel = janela.is_visible().unwrap_or(false) && !janela.is_minimized().unwrap_or(false);
        if visivel && plataforma::janela_em_foco(&janela) {
            let _ = janela.minimize();
        } else {
            mostrar(&app);
        }
    }
}

#[tauri::command]
fn abrir_link(url: String) -> Result<(), String> {
    let endereco = url.trim();
    if !(endereco.starts_with("https://") || endereco.starts_with("http://")) || endereco.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("link_invalido".into());
    }
    plataforma::abrir_no_sistema(endereco)
}

#[tauri::command]
fn sair(app: AppHandle) {
    sair_salvando(&app);
}

fn sair_salvando(app: &AppHandle) {
    if ENCERRAMENTO_PEDIDO.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if salvamento::salvar(&app).await.is_ok() {
            ENCERRANDO.store(true, Ordering::Relaxed);
            app.exit(0);
        } else {
            ENCERRAMENTO_PEDIDO.store(false, Ordering::Relaxed);
            mostrar(&app);
        }
    });
}

fn mostrar(app: &AppHandle) {
    ABERTURA_PENDENTE.store(false, Ordering::Relaxed);
    if let Some(janela) = app.get_webview_window("sistema") {
        let conteudo: &tauri::Webview = janela.as_ref();
        let _ = conteudo.show();
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

fn reabrir(app: &AppHandle) {
    anotar(app, if ENCERRANDO.load(Ordering::Relaxed) { "reabrir durante o encerramento" } else { "reabrir" });
    mostrar(app);
    reavivar_sobrepostas(app);
    conferir_janelas_vivas(app);
}

fn esconder_sistema(janela: &WebviewWindow) {
    let _ = janela.hide();
    let conteudo: &tauri::Webview = janela.as_ref();
    let _ = conteudo.hide();
}

#[tauri::command]
fn ocultar_sistema(app: AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        esconder_sistema(&janela);
    }
}

fn reavivar_sobrepostas(app: &AppHandle) {
    for (rotulo, janela) in app.webview_windows() {
        if rotulo == "ilha" || docks::eh_dock(&rotulo) {
            let _ = janela.show();
            let _ = janela.set_always_on_top(true);
        }
    }
    let _ = app.emit("niko://reavivar", ());
    let alvo = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !ENCERRANDO.load(Ordering::Relaxed) {
            docks::sincronizar(&alvo);
        }
    });
}

fn dock_sob_o_cursor(app: &AppHandle) -> Option<WebviewWindow> {
    let docks: Vec<(String, WebviewWindow)> = app.webview_windows().into_iter().filter(|(r, j)| docks::eh_dock(r) && j.is_visible().unwrap_or(false)).collect();
    let cursor = app.cursor_position().ok();
    let sob_o_cursor = cursor.and_then(|c| {
        docks.iter().find(|(_, j)| {
            let Ok(Some(m)) = j.current_monitor() else { return false };
            let (p, t) = (m.position(), m.size());
            c.x >= p.x as f64 && c.x < p.x as f64 + t.width as f64 && c.y >= p.y as f64 && c.y < p.y as f64 + t.height as f64
        })
    });
    sob_o_cursor.or_else(|| docks.iter().find(|(r, _)| r == "dock")).or(docks.first()).map(|(_, j)| j.clone())
}

fn executar_atalho(app: &AppHandle, acao: &str) {
    match acao {
        "lupa" => abrir_lupa(app),
        "sistema" => alternar_sistema(app.clone()),
        "captura" => {
            mostrar(app);
            let _ = app.emit_to("sistema", "niko://captura", ());
        }
        "pedido" | "proximaAba" | "terminal" => atalhos::avisar_janela(app, "ilha", acao),
        _ => atalhos::avisar_janela(app, "sistema", acao),
    }
}

fn abrir_lupa(app: &AppHandle) {
    let Some(dock) = dock_sob_o_cursor(app) else { return };
    let _ = dock.set_focusable(true);
    let _ = dock.set_focus();
    let _ = dock.emit_to(dock.label(), "niko://lupa", ());
}

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
        .focusable(plataforma::SOBREPOSTA_FOCAVEL_AO_CRIAR)
        .disable_drag_drop_handler()
        .visible(false)
        .position(x, y)
        .inner_size(largura, altura)
        .build()
}

fn vigiar_cursor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut fora: HashMap<String, bool> = HashMap::new();
        loop {
            tokio::time::sleep(Duration::from_millis(45)).await;
            if ENCERRANDO.load(Ordering::Relaxed) { return; }
            let alvo = app.clone();
            match tauri::async_runtime::spawn_blocking(move || atualizar_cursor(&alvo, fora)).await {
                Ok(atual) => fora = atual,
                Err(_) => return,
            }
        }
    });
}

fn atualizar_cursor(app: &AppHandle, mut fora: HashMap<String, bool>) -> HashMap<String, bool> {
    if ENCERRANDO.load(Ordering::Relaxed) { return fora; }
    plataforma::registrar_frente(app);
    let areas = match app.state::<Estado>().areas.lock() {
        Ok(a) => a.clone(),
        Err(_) => return fora,
    };
    let Ok(cursor) = app.cursor_position() else { return fora };
    let pressionado = plataforma::botao_do_mouse_pressionado();
    let clicou = pressionado && !BOTAO_PRESSIONADO.swap(pressionado, Ordering::Relaxed);
    let sobrepostas: Vec<(String, WebviewWindow)> = app.webview_windows().into_iter().filter(|(r, _)| r == "ilha" || r == "assistive" || docks::eh_dock(r)).collect();
    fora.retain(|r, _| sobrepostas.iter().any(|(s, _)| s == r));
    for (rotulo, janela) in &sobrepostas {
        if ENCERRANDO.load(Ordering::Relaxed) { break; }
        let rotulo = rotulo.as_str();
        if !janela.is_visible().unwrap_or(false) { continue; }
        let dentro = if let Some(lista) = areas.get(rotulo).filter(|a| !a.is_empty()) {
            let (Ok(origem), Ok(escala)) = (janela.outer_position(), janela.scale_factor()) else { continue };
            let x = (cursor.x - origem.x as f64) / escala;
            let y = (cursor.y - origem.y as f64) / escala;
            lista.iter().any(|r| x >= r.x - 4.0 && x <= r.x + r.w + 4.0 && y >= r.y - 4.0 && y <= r.y + r.h + 4.0)
        } else { false };
        let agora_fora = !dentro;
        if clicou && agora_fora {
            let _ = janela.emit_to(rotulo, "niko://clique-fora", ());
        }
        if fora.get(rotulo) != Some(&agora_fora) {
            if !plataforma::ignorar_cursor(janela, agora_fora) { continue; }
            if agora_fora {
                let _ = janela.emit_to(rotulo, "niko://cursor-fora", ());
            }
            fora.insert(rotulo.to_string(), agora_fora);
        }
    }
    fora
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

fn pasta_de_dados_antes_do_app() -> Option<std::path::PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(std::path::PathBuf::from)
    } else {
        std::env::var_os("XDG_DATA_HOME").map(std::path::PathBuf::from).or_else(|| std::env::var_os("HOME").map(|casa| std::path::PathBuf::from(casa).join(".local").join("share")))
    };
    base.map(|pasta| pasta.join("com.niko.desktop"))
}

fn registrar_falha_ao_iniciar(erro: &str) {
    let Some(pasta) = pasta_de_dados_antes_do_app() else {
        return;
    };
    let _ = std::fs::create_dir_all(&pasta);
    let segundos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let _ = std::fs::write(pasta.join("niko.log"), format!("falha ao iniciar (unix {segundos}): {erro}\n"));
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
    let node = plataforma::node_da_ponte(&recursos);
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
    comando.arg("ponte.mjs").env("NIKO_PORTA", PORTA_ATUAL.load(Ordering::Relaxed).to_string()).env("NIKO_TOKEN", token).env("NIKO_PAI", std::process::id().to_string());
    plataforma::esconder_console(&mut comando);
    let estado = app.state::<Estado>();
    let Ok(mut ponte) = estado.ponte.lock() else { return };
    if ENCERRANDO.load(Ordering::Relaxed) { return; }
    if ponte.as_mut().is_some_and(|filho| !matches!(filho.try_wait(), Ok(Some(_)))) { return; }
    match comando.spawn() {
        Ok(filho) => {
            registrar(format!("ponte iniciada: {} {} (pid {})", node.display(), script.display(), filho.id()));
            *ponte = Some(filho);
        }
        Err(erro) => registrar(format!("falha ao iniciar a ponte: {} {} {}", node.display(), script.display(), erro)),
    }
}

fn parar_ponte(app: &AppHandle) {
    ENCERRANDO.store(true, Ordering::Relaxed);
    let filho = app.state::<Estado>().ponte.lock().ok().and_then(|mut ponte| ponte.take());
    if let Some(mut filho) = filho {
        let _ = filho.kill();
        let _ = filho.wait();
    }
}

#[tauri::command]
async fn preparar_atualizacao(app: AppHandle) -> Result<(), String> {
    if ENCERRAMENTO_PEDIDO.swap(true, Ordering::Relaxed) { return Err("encerramento_em_andamento".into()); }
    if let Err(erro) = salvamento::salvar(&app).await {
        ENCERRAMENTO_PEDIDO.store(false, Ordering::Relaxed);
        return Err(erro);
    }
    ENCERRANDO.store(true, Ordering::Relaxed);
    for (rotulo, janela) in app.webview_windows() {
        if docks::eh_dock(&rotulo) {
            barra::reservar_espaco_do_dock(&janela, false);
        }
    }
    let _ = tauri::async_runtime::spawn_blocking(move || {
        barra::restaurar(&app);
        parar_ponte(&app);
    }).await;
    Ok(())
}

static ENCERRANDO: AtomicBool = AtomicBool::new(false);
static BOTAO_PRESSIONADO: AtomicBool = AtomicBool::new(false);
static ENCERRAMENTO_PEDIDO: AtomicBool = AtomicBool::new(false);
const MAXIMO_REINICIOS_DA_PONTE: u32 = 5;

fn vigiar_ponte(app: AppHandle, token: String) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut reinicios = 0u32;
        let mut estavel_desde = std::time::Instant::now();
        loop {
            tokio::time::sleep(Duration::from_secs(3)).await;
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            let caiu = match app.state::<Estado>().ponte.lock() {
                Ok(mut ponte) => match ponte.as_mut() {
                    Some(filho) => matches!(filho.try_wait(), Ok(Some(_))),
                    None => true,
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
            tokio::time::sleep(Duration::from_secs(u64::from(reinicios) * 2)).await;
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            let alvo = app.clone();
            let chave = token.clone();
            if tauri::async_runtime::spawn_blocking(move || iniciar_ponte(&alvo, &chave, true)).await.is_err() { return; }
            estavel_desde = std::time::Instant::now();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    plataforma::preparar_ambiente();
    let token = gerar_token();
    let escondido = std::env::args().any(|a| a == "--escondido");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| match atalhos::acao_dos_argumentos(&args) {
            Some(acao) => executar_atalho(app, &acao),
            None => reabrir(app),
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--escondido"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, atalho, evento| {
                    if evento.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(acao) = atalhos::acao_de(app, atalho) else { return };
                    executar_atalho(app, &acao);
                })
                .build(),
        )
        .manage(Estado { areas: Mutex::new(HashMap::new()), token: token.clone(), ponte: Mutex::new(None), sinais: Mutex::new(HashMap::new()) })
        .manage(miniaturas::Miniaturas::default())
        .manage(salvamento::ControleSalvamento::default())
        .manage(atalhos::Atalhos::default())
        .invoke_handler(tauri::generate_handler![
            area_interativa,
            token_ponte,
            porta_ponte,
            mostrar_sistema,
            alternar_sistema,
            docks::monitores,
            docks::definir_docks,
            docks::definir_monitor_da_ilha,
            liberar_sistema_inicial,
            ocultar_sistema,
            preparar_atualizacao,
            salvamento::registrar_armazenamento,
            salvamento::confirmar_salvamento,
            tempo_ocioso_ms,
            abrir_link,
            sair,
            barra::barra_windows,
            barra::reservar_dock,
            janela_frente::frente_cobre_tela,
            miniaturas::miniaturas_janelas,
            atalhos::definir_atalhos,
            devolver_foco,
            agir_na_janela,
            sinal_de_vida
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            barra::restaurar(&handle);
            // Aqui, e não no início de run(): uma segunda abertura sai na instância única sem esperar a porta.
            if !cfg!(debug_assertions) {
                let porta = escolher_porta();
                if porta != PORTA {
                    anotar(&handle, &format!("porta {PORTA} ocupada; ponte na porta {porta}"));
                }
                PORTA_ATUAL.store(porta, Ordering::Relaxed);
            }
            let alvo_da_ponte = handle.clone();
            let chave_da_ponte = token.clone();
            tauri::async_runtime::spawn_blocking(move || iniciar_ponte(&alvo_da_ponte, &chave_da_ponte, false));
            vigiar_ponte(handle.clone(), token.clone());

            let monitor = app.primary_monitor()?.or(app.available_monitors()?.into_iter().next());
            let (mx, my, mw, mh) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    let area = m.work_area();
                    (area.position.x as f64 / escala, area.position.y as f64 / escala, area.size.width as f64 / escala, area.size.height as f64 / escala)
                }
                None => (0.0, 0.0, 1920.0, 1040.0),
            };
            let (tela_x, tela_y, tela_largura) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    (m.position().x as f64 / escala, m.position().y as f64 / escala, m.size().width as f64 / escala)
                }
                None => (mx, my, mw),
            };

            let sistema = WebviewWindowBuilder::new(app, "sistema", WebviewUrl::App("index.html".into()))
                .title("Niko")
                .decorations(false)
                .inner_size(1320.0_f64.min(mw - 40.0), 860.0_f64.min(mh - 40.0))
                .min_inner_size(960.0_f64.min(mw - 16.0).max(640.0), 600.0_f64.min(mh - 16.0).max(420.0))
                .background_color(tauri::window::Color(14, 14, 16, 255))
                .disable_drag_drop_handler()
                .center()
                .visible(false)
                .build()?;
            if !escondido && plataforma::abrir_sistema_sem_esperar() {
                let _ = sistema.show();
                let _ = sistema.set_focus();
            } else if !escondido {
                ABERTURA_PENDENTE.store(true, Ordering::Relaxed);
                let reserva = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(LIMITE_DA_ABERTURA).await;
                    liberar_abertura(&reserva);
                });
            }
            let sistema_ref = sistema.clone();
            sistema.on_window_event(move |evento| {
                if let WindowEvent::CloseRequested { api, .. } = evento {
                    api.prevent_close();
                    esconder_sistema(&sistema_ref);
                }
            });

            if plataforma::sobrepostas_transparentes() {
                criar_sobreposta(&handle, "ilha", tela_y, tela_x, tela_largura, ALTURA_ILHA)?;
                criar_sobreposta(&handle, "dock", my + mh - ALTURA_DOCK, mx, mw, ALTURA_DOCK)?;
                criar_sobreposta(&handle, "assistive", my, mx, mw, mh)?;
            } else {
                anotar(&handle, "sem compositor: ilha, dock e AssistiveTouch desligados para não cobrir a janela principal");
            }
            for rotulo in ["ilha", "dock", "assistive"] {
                if let Some(j) = handle.get_webview_window(rotulo) {
                    plataforma::ignorar_cursor(&j, true);
                }
            }
            docks::sincronizar(&handle);
            docks::vigiar_monitores(handle.clone());
            vigiar_cursor(handle.clone());
            plataforma::vigiar_frente(&handle);

            let abrir = MenuItem::with_id(app, "abrir", "Abrir o Niko", true, None::<&str>)?;
            let sair_item = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair_item])?;
            let mut bandeja = TrayIconBuilder::with_id("niko").menu(&menu).show_menu_on_left_click(false).tooltip("Niko");
            if let Some(icone) = app.default_window_icon() {
                bandeja = bandeja.icon(icone.clone());
            }
            bandeja
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => reabrir(app),
                    "sair" => sair_salvando(app),
                    _ => {}
                })
                .on_tray_icon_event(|bandeja, evento| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                        reabrir(bandeja.app_handle());
                    }
                })
                .build(app)?;

            atalhos::registrar_padrao(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|erro| {
            registrar_falha_ao_iniciar(&erro.to_string());
            panic!("falha ao iniciar o Niko: {erro}");
        });

    app.run(|handle, evento| {
        if let RunEvent::Exit = evento {
            ENCERRANDO.store(true, Ordering::Relaxed);
            garantir_encerramento(handle);
            for (rotulo, janela) in handle.webview_windows() {
                if docks::eh_dock(&rotulo) {
                    barra::reservar_espaco_do_dock(&janela, false);
                }
            }
            barra::restaurar(handle);
            parar_ponte(handle);
        }
    });
}
