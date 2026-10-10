use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

use crate::{barra_windows, criar_sobreposta, Estado, ALTURA_DOCK, ALTURA_ILHA};

pub const ROTULO_PRINCIPAL: &str = "dock";
const ESCOLHA_TODOS: &str = "todos";
const INTERVALO_DOS_MONITORES: Duration = Duration::from_secs(2);

static LIGADO: AtomicBool = AtomicBool::new(false);
static ESCOLHA: Mutex<String> = Mutex::new(String::new());
static ASSINATURA: Mutex<String> = Mutex::new(String::new());
static SINCRONIZANDO: Mutex<()> = Mutex::new(());
static MONITOR_DA_ILHA: Mutex<String> = Mutex::new(String::new());

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDoNiko {
    nome: String,
    rotulo: String,
    numero: usize,
    principal: bool,
    largura: u32,
    altura: u32,
}

pub fn eh_dock(rotulo: &str) -> bool {
    rotulo == ROTULO_PRINCIPAL || rotulo.starts_with("dock-")
}

fn nome_do_monitor(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| format!("{}x{}", monitor.position().x, monitor.position().y))
}

fn rotulo_do_monitor(nome: &str, principal: bool) -> String {
    if principal {
        return ROTULO_PRINCIPAL.to_string();
    }
    let limpo: String = nome.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    format!("dock-{}", if limpo.is_empty() { "monitor".to_string() } else { limpo })
}

fn monitores_ordenados(app: &AppHandle) -> Vec<(Monitor, MonitorDoNiko)> {
    let nome_principal = app.primary_monitor().ok().flatten().map(|m| nome_do_monitor(&m));
    let mut lista = app.available_monitors().unwrap_or_default();
    lista.sort_by_key(|m| (Some(nome_do_monitor(m)) != nome_principal, m.position().x, m.position().y));
    lista
        .into_iter()
        .enumerate()
        .map(|(i, monitor)| {
            let nome = nome_do_monitor(&monitor);
            let principal = i == 0;
            let info = MonitorDoNiko { rotulo: rotulo_do_monitor(&nome, principal), numero: i + 1, principal, largura: monitor.size().width, altura: monitor.size().height, nome };
            (monitor, info)
        })
        .collect()
}

pub fn monitor_escolhido(escolha: &str, info: &MonitorDoNiko, lista: &[MonitorDoNiko]) -> bool {
    if lista.len() < 2 {
        return info.principal;
    }
    if escolha.is_empty() || escolha == ESCOLHA_TODOS {
        return true;
    }
    if lista.iter().any(|m| m.nome == escolha) {
        return info.nome == escolha;
    }
    info.principal
}

pub fn posicionar(janela: &WebviewWindow, monitor: &Monitor) -> bool {
    let escala = monitor.scale_factor();
    let (posicao, tamanho) = if barra_windows::barra_oculta() {
        (*monitor.position(), *monitor.size())
    } else {
        let area = monitor.work_area();
        (area.position, area.size)
    };
    let altura = (ALTURA_DOCK * escala).round() as i32;
    let reserva = barra_windows::retangulo_reservado(janela, monitor);
    let limites = barra_windows::retangulo_da_sobreposta(reserva.unwrap_or(RECT { left: posicao.x, top: posicao.y, right: posicao.x + tamanho.width as i32, bottom: posicao.y + tamanho.height as i32 }), altura);
    if let Ok(h) = janela.hwnd() {
        let mut atual = RECT::default();
        if unsafe { GetWindowRect(HWND(h.0), &mut atual) }.is_ok() && atual.left == limites.left && atual.top == limites.top && atual.right == limites.right && atual.bottom == limites.bottom { return false; }
    }
    let destino = PhysicalPosition::new(limites.left, limites.top);
    let _ = janela.set_position(destino);
    let _ = janela.set_size(PhysicalSize::new((limites.right - limites.left) as u32, altura as u32));
    let _ = janela.set_position(destino);
    true
}

pub fn monitor_da_ilha(escolha: &str, lista: &[MonitorDoNiko]) -> usize {
    lista.iter().position(|m| !escolha.is_empty() && m.nome == escolha).unwrap_or(0)
}

pub fn posicionar_ilha(app: &AppHandle) {
    let Some(janela) = app.get_webview_window("ilha") else { return };
    let escolha = MONITOR_DA_ILHA.lock().map(|e| e.clone()).unwrap_or_default();
    let mut monitores = monitores_ordenados(app);
    if monitores.is_empty() {
        return;
    }
    let infos: Vec<MonitorDoNiko> = monitores.iter().map(|(_, i)| i.clone()).collect();
    let (monitor, _) = monitores.swap_remove(monitor_da_ilha(&escolha, &infos));
    let altura = (ALTURA_ILHA * monitor.scale_factor()).round() as u32;
    let destino = *monitor.position();
    let _ = janela.set_position(destino);
    let _ = janela.set_size(PhysicalSize::new(monitor.size().width, altura));
    let _ = janela.set_position(destino);
}

pub fn reposicionar_todos(app: &AppHandle) {
    posicionar_ilha(app);
    posicionar_assistive(app);
    for (monitor, info) in monitores_ordenados(app) {
        if let Some(janela) = app.get_webview_window(&info.rotulo) {
            posicionar(&janela, &monitor);
        }
    }
}

pub fn posicionar_assistive(app: &AppHandle) {
    let Some(janela) = app.get_webview_window("assistive") else { return };
    let Some(monitor) = monitores_ordenados(app).into_iter().next().map(|(m, _)| m) else { return };
    let area = monitor.work_area();
    let _ = janela.set_position(area.position);
    let _ = janela.set_size(area.size);
    let _ = janela.set_position(area.position);
}

fn assinatura(lista: &[(Monitor, MonitorDoNiko)]) -> String {
    lista
        .iter()
        .map(|(m, i)| format!("{}:{}:{}:{}:{}:{}:{}", i.nome, i.principal, m.position().x, m.position().y, m.size().width, m.size().height, m.scale_factor()))
        .collect::<Vec<_>>()
        .join("|")
}

pub fn sincronizar(app: &AppHandle) {
    let Ok(_vez) = SINCRONIZANDO.lock() else { return };
    let ligado = LIGADO.load(Ordering::SeqCst);
    let escolha = ESCOLHA.lock().map(|e| e.clone()).unwrap_or_default();
    let monitores = monitores_ordenados(app);
    let infos: Vec<MonitorDoNiko> = monitores.iter().map(|(_, i)| i.clone()).collect();
    let desejados: Vec<String> = monitores.iter().filter(|(_, i)| i.principal || (ligado && monitor_escolhido(&escolha, i, &infos))).map(|(_, i)| i.rotulo.clone()).collect();

    for (rotulo, janela) in app.webview_windows() {
        if rotulo == ROTULO_PRINCIPAL || !eh_dock(&rotulo) || desejados.contains(&rotulo) {
            continue;
        }
        barra_windows::reservar_espaco_do_dock(&janela, false);
        if let Ok(mut areas) = app.state::<Estado>().areas.lock() {
            areas.remove(&rotulo);
        }
        let _ = janela.destroy();
    }

    for (monitor, info) in &monitores {
        if !desejados.contains(&info.rotulo) {
            continue;
        }
        let janela = match app.get_webview_window(&info.rotulo) {
            Some(j) => j,
            None => match criar_sobreposta(app, &info.rotulo, 0.0, 0.0, 400.0, ALTURA_DOCK) {
                Ok(j) => {
                    let _ = j.set_ignore_cursor_events(true);
                    j
                }
                Err(_) => continue,
            },
        };
        posicionar(&janela, monitor);
    }

    posicionar_ilha(app);
    posicionar_assistive(app);
    if let Ok(mut atual) = ASSINATURA.lock() {
        *atual = assinatura(&monitores);
    }
    let _ = app.emit("niko://monitores", infos);
}

#[tauri::command]
pub fn monitores(app: AppHandle) -> Vec<MonitorDoNiko> {
    monitores_ordenados(&app).into_iter().map(|(_, i)| i).collect()
}

#[tauri::command]
pub async fn definir_docks(app: AppHandle, ligado: bool, escolha: String) {
    LIGADO.store(ligado, Ordering::SeqCst);
    if let Ok(mut atual) = ESCOLHA.lock() {
        *atual = escolha.chars().take(200).collect();
    }
    sincronizar(&app);
}

#[tauri::command]
pub fn definir_monitor_da_ilha(app: AppHandle, escolha: String) {
    if let Ok(mut atual) = MONITOR_DA_ILHA.lock() {
        *atual = escolha.chars().take(200).collect();
    }
    posicionar_ilha(&app);
}

pub fn vigiar_monitores(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(INTERVALO_DOS_MONITORES).await;
            if crate::ENCERRANDO.load(Ordering::Relaxed) { return; }
            let alvo = app.clone();
            if tauri::async_runtime::spawn_blocking(move || {
                if crate::ENCERRANDO.load(Ordering::Relaxed) { return; }
                let atual = assinatura(&monitores_ordenados(&alvo));
                let mudou = ASSINATURA.lock().map(|a| *a != atual).unwrap_or(false);
                if mudou && !crate::ENCERRANDO.load(Ordering::Relaxed) { sincronizar(&alvo); }
            }).await.is_err() { return; }
        }
    });
}
