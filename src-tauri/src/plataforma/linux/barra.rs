use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Monitor, WebviewWindow};

#[allow(clippy::upper_case_acronyms)]
#[derive(Clone, Copy, Default)]
pub struct RECT {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

const DOCKS_DO_GNOME: [&str; 2] = ["ubuntu-dock@ubuntu.com", "dash-to-dock@micxgx.gmail.com"];
const PREFIXO_GNOME: &str = "gnome:";
const PREFIXO_CINNAMON: &str = "cinnamon:";
const ATRASO_DO_PAINEL_MS: &str = "1500";

static OCULTA: AtomicBool = AtomicBool::new(false);
static ALTERANDO_BARRA: Mutex<()> = Mutex::new(());

pub fn barra_oculta() -> bool {
    OCULTA.load(Ordering::SeqCst)
}

fn arquivo_recuperacao(app: &AppHandle) -> Option<PathBuf> {
    let pasta = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&pasta);
    Some(pasta.join("barra-linux.flag"))
}

fn saida_de(programa: &str, argumentos: &[&str]) -> Option<String> {
    let saida = super::comando_do_sistema(programa).args(argumentos).stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    saida.status.success().then(|| String::from_utf8_lossy(&saida.stdout).into_owned())
}

fn rodar(programa: &str, argumentos: &[&str]) -> bool {
    super::comando_do_sistema(programa).args(argumentos).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success())
}

fn docks_do_gnome_ligados() -> Vec<&'static str> {
    let Some(ligadas) = saida_de("gnome-extensions", &["list", "--enabled"]) else { return Vec::new() };
    DOCKS_DO_GNOME.into_iter().filter(|uuid| ligadas.lines().any(|l| l.trim() == *uuid)).collect()
}

fn valor_em_todos_os_paineis(original: &str, valor: &str) -> String {
    let itens: Vec<String> = original
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .filter_map(|item| {
            let limpo = item.trim().trim_matches('\'');
            let (painel, _) = limpo.split_once(':')?;
            Some(format!("'{painel}:{valor}'"))
        })
        .collect();
    format!("[{}]", itens.join(", "))
}

fn paineis_escondidos(original: &str) -> String {
    valor_em_todos_os_paineis(original, "true")
}

fn mudar_chave_do_cinnamon(chave: &str, novo: impl Fn(&str) -> String, desfazer: &mut Vec<String>) {
    let Some(original) = saida_de("gsettings", &["get", "org.cinnamon", chave]) else { return };
    let alvo = novo(&original);
    if alvo != "[]" && alvo != original.trim() && rodar("gsettings", &["set", "org.cinnamon", chave, &alvo]) {
        desfazer.push(format!("{PREFIXO_CINNAMON}{chave}={}", original.trim()));
    }
}

fn esconder_barras_do_sistema() -> Vec<String> {
    let mut desfazer = Vec::new();
    for uuid in docks_do_gnome_ligados() {
        if rodar("gnome-extensions", &["disable", uuid]) {
            desfazer.push(format!("{PREFIXO_GNOME}{uuid}"));
        }
    }
    mudar_chave_do_cinnamon("panels-autohide", paineis_escondidos, &mut desfazer);
    if desfazer.iter().any(|d| d.starts_with(PREFIXO_CINNAMON)) {
        mudar_chave_do_cinnamon("panels-show-delay", |o| valor_em_todos_os_paineis(o, ATRASO_DO_PAINEL_MS), &mut desfazer);
    }
    desfazer
}

fn mostrar_barras_do_sistema(desfazer: &str) {
    for linha in desfazer.lines() {
        if let Some(uuid) = linha.strip_prefix(PREFIXO_GNOME) {
            rodar("gnome-extensions", &["enable", uuid]);
        } else if let Some(resto) = linha.strip_prefix(PREFIXO_CINNAMON) {
            let (chave, original) = resto.split_once('=').unwrap_or(("panels-autohide", resto));
            rodar("gsettings", &["set", "org.cinnamon", chave, original]);
        }
    }
}

fn reposicionar_dock(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(600)).await;
        if crate::ENCERRANDO.load(Ordering::Relaxed) { return; }
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if !crate::ENCERRANDO.load(Ordering::Relaxed) { crate::docks::reposicionar_todos(&app); }
        }).await;
    });
}

pub fn ocultar(app: &AppHandle) {
    let Ok(_vez) = ALTERANDO_BARRA.lock() else { return };
    if crate::ENCERRANDO.load(Ordering::Relaxed) || OCULTA.swap(true, Ordering::SeqCst) {
        return;
    }
    let arquivo = arquivo_recuperacao(app);
    let pendente = arquivo.as_ref().and_then(|a| std::fs::read_to_string(a).ok()).unwrap_or_default();
    let desfazer = esconder_barras_do_sistema();
    let todos: Vec<&str> = pendente.lines().chain(desfazer.iter().map(String::as_str)).filter(|l| !l.is_empty()).collect();
    if let Some(arquivo) = arquivo {
        if !todos.is_empty() {
            let _ = std::fs::write(arquivo, todos.join("\n"));
        }
    }
    reposicionar_dock(app);
}

pub fn restaurar(app: &AppHandle) {
    let Ok(_vez) = ALTERANDO_BARRA.lock() else { return };
    let estava_oculta = OCULTA.swap(false, Ordering::SeqCst);
    let arquivo = arquivo_recuperacao(app);
    let Some(desfazer) = arquivo.as_ref().and_then(|a| std::fs::read_to_string(a).ok()) else {
        if estava_oculta { reposicionar_dock(app); }
        return;
    };
    mostrar_barras_do_sistema(&desfazer);
    if let Some(arquivo) = arquivo {
        let _ = std::fs::remove_file(arquivo);
    }
    reposicionar_dock(app);
}

pub fn retangulo_reservado(_dock: &WebviewWindow, _monitor: &Monitor) -> Option<RECT> {
    None
}

pub fn retangulo_da_sobreposta(reserva: RECT, altura: i32) -> RECT {
    RECT { left: reserva.left, top: reserva.bottom - altura, right: reserva.right, bottom: reserva.bottom }
}

pub fn reservar_espaco_do_dock(_dock: &WebviewWindow, _reservar: bool) {}

#[tauri::command]
pub fn reservar_dock(_window: WebviewWindow, _reservar: bool, _altura: Option<f64>) {}

#[tauri::command]
pub async fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if ocultar_barra {
            ocultar(&app);
        } else {
            restaurar(&app);
        }
    })
    .await;
}

#[cfg(test)]
mod testes_da_barra {
    use super::{paineis_escondidos, valor_em_todos_os_paineis};

    #[test]
    fn esconde_todos_os_paineis_do_cinnamon() {
        assert_eq!(paineis_escondidos("['1:false']"), "['1:true']");
        assert_eq!(paineis_escondidos("['1:intel', '2:false']\n"), "['1:true', '2:true']");
        assert_eq!(paineis_escondidos("@as []"), "[]");
    }

    #[test]
    fn atrasa_o_painel_do_cinnamon_em_todos_os_paineis() {
        assert_eq!(valor_em_todos_os_paineis("['1:0', '2:250']", "1500"), "['1:1500', '2:1500']");
    }
}
