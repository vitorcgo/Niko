use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};

use super::super::encosta_na_base;
use super::x11;
use super::RECT;

const VALIDADE_DA_LEITURA: Duration = Duration::from_millis(300);
const DESTINO_DA_EXTENSAO: &str = "org.gnome.Shell";
const CAMINHO_DA_EXTENSAO: &str = "/org/gnome/Shell/Extensions/Windows";
const INTERFACE_DA_EXTENSAO: &str = "org.gnome.Shell.Extensions.Windows";
const TIPO_AREA_DE_TRABALHO_NO_MUTTER: u64 = 1;

#[derive(Serialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TipoDaFrente {
    #[default]
    AreaDeTrabalho,
    Sobreposta,
    App,
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaFrente {
    cobre: bool,
    tela_cheia: bool,
    maximizada: bool,
    na_base: bool,
    frente: TipoDaFrente,
    programa: String,
}

#[derive(Clone, Copy, PartialEq)]
struct Monitor {
    x: i32,
    y: i32,
    largura: i32,
    altura: i32,
    escala_unitaria: bool,
}

impl Monitor {
    fn contem_o_centro(&self, g: x11::Geometria) -> bool {
        let cx = g.x + g.largura as i32 / 2;
        let cy = g.y + g.altura as i32 / 2;
        cx >= self.x && cx < self.x + self.largura && cy >= self.y && cy < self.y + self.altura
    }

    fn retangulo(&self) -> RECT {
        RECT { left: self.x, top: self.y, right: self.x + self.largura, bottom: self.y + self.altura }
    }

    fn coberto_por(&self, g: x11::Geometria) -> bool {
        g.x <= self.x && g.y <= self.y && g.x + g.largura as i32 >= self.x + self.largura && g.y + g.altura as i32 >= self.y + self.altura
    }
}

struct Janela {
    pid: u32,
    maximizada: bool,
    tela_cheia: bool,
    minimizada: bool,
    area_de_trabalho: bool,
    geometria: Option<x11::Geometria>,
}

static LEITURA: Mutex<Option<(Instant, Monitor, EstadoDaFrente)>> = Mutex::new(None);
static ULTIMO_APP: Mutex<Option<(Monitor, EstadoDaFrente)>> = Mutex::new(None);

fn programa_do_processo(pid: u32) -> String {
    std::fs::read_to_string(format!("/proc/{pid}/comm")).map(|nome| nome.trim().to_lowercase()).unwrap_or_default()
}

fn janela_do_x11() -> Option<Janela> {
    let id = x11::janela_dona(x11::janela_ativa()?);
    let j = x11::ler_janela(id)?;
    Some(Janela { pid: j.pid, maximizada: j.maximizada, tela_cheia: j.tela_cheia, minimizada: j.minimizada, area_de_trabalho: j.area_de_trabalho, geometria: j.geometria })
}

fn chamar_extensao(metodo: &str, id: Option<u64>) -> Option<serde_json::Value> {
    let mut comando = super::comando_do_sistema("busctl");
    comando.args(["--user", "--json=short", "--timeout=1", "call", DESTINO_DA_EXTENSAO, CAMINHO_DA_EXTENSAO, INTERFACE_DA_EXTENSAO, metodo]);
    if let Some(id) = id {
        comando.args(["u", &id.to_string()]);
    }
    let saida = comando.stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    if !saida.status.success() {
        return None;
    }
    let resposta: serde_json::Value = serde_json::from_slice(&saida.stdout).ok()?;
    serde_json::from_str(resposta.get("data")?.get(0)?.as_str()?).ok()
}

fn janela_da_extensao() -> Option<Janela> {
    let lista = chamar_extensao("List", None)?;
    let focada = lista.as_array()?.iter().find(|j| j.get("focus").and_then(|f| f.as_bool()) == Some(true))?;
    let id = focada.get("id")?.as_u64()?;
    let detalhes = chamar_extensao("Details", Some(id))?;
    let logico = |chave: &str| detalhes.get(chave).and_then(|v| v.as_bool()).unwrap_or(false);
    let numero = |chave: &str| detalhes.get(chave).and_then(|v| v.as_i64());
    let geometria = match (numero("x"), numero("y"), numero("width"), numero("height")) {
        (Some(x), Some(y), Some(l), Some(a)) if l > 0 && a > 0 => Some(x11::Geometria { x: x as i32, y: y as i32, largura: l as u32, altura: a as u32 }),
        _ => None,
    };
    Some(Janela {
        pid: detalhes.get("pid").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        maximizada: logico("maximized_horizontally") && logico("maximized_vertically"),
        tela_cheia: logico("fullscreen"),
        minimizada: logico("minimized"),
        area_de_trabalho: detalhes.get("window_type").and_then(|v| v.as_u64()) == Some(TIPO_AREA_DE_TRABALHO_NO_MUTTER),
        geometria,
    })
}

fn estado_de_janela_do_niko(app: &AppHandle, monitor: Monitor) -> EstadoDaFrente {
    if let Some(sistema) = app.get_webview_window("sistema").filter(|j| j.is_focused().unwrap_or(false)) {
        return EstadoDaFrente { frente: TipoDaFrente::App, maximizada: sistema.is_maximized().unwrap_or(false), ..Default::default() };
    }
    let atras = ULTIMO_APP.lock().ok().and_then(|g| g.clone()).filter(|(m, _)| *m == monitor).map(|(_, e)| e).unwrap_or_default();
    EstadoDaFrente { frente: TipoDaFrente::Sobreposta, ..atras }
}

fn ler(app: &AppHandle, monitor: Monitor) -> EstadoDaFrente {
    let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|s| s.eq_ignore_ascii_case("wayland"));
    let da_extensao = if wayland { janela_da_extensao() } else { None };
    let veio_da_extensao = da_extensao.is_some();
    let Some(mut janela) = da_extensao.or_else(janela_do_x11) else { return EstadoDaFrente::default() };
    if veio_da_extensao && !monitor.escala_unitaria {
        janela.geometria = None;
    }
    if janela.pid == std::process::id() {
        return estado_de_janela_do_niko(app, monitor);
    }
    if janela.area_de_trabalho || janela.minimizada {
        return EstadoDaFrente::default();
    }
    if janela.geometria.is_some_and(|g| !monitor.contem_o_centro(g)) {
        return EstadoDaFrente { frente: TipoDaFrente::App, ..Default::default() };
    }
    let cobre_monitor = janela.geometria.is_some_and(|g| monitor.coberto_por(g));
    let tela_cheia = janela.tela_cheia || (cobre_monitor && !janela.maximizada);
    let na_base = janela.geometria.is_some_and(|g| encosta_na_base(RECT { left: g.x, top: g.y, right: g.x + g.largura as i32, bottom: g.y + g.altura as i32 }, monitor.retangulo()));
    let estado = EstadoDaFrente { cobre: janela.maximizada || tela_cheia, tela_cheia, maximizada: janela.maximizada, na_base, frente: TipoDaFrente::App, programa: programa_do_processo(janela.pid) };
    if let Ok(mut ultimo) = ULTIMO_APP.lock() {
        *ultimo = Some((monitor, estado.clone()));
    }
    estado
}

fn ler_com_validade(app: &AppHandle, monitor: Monitor) -> EstadoDaFrente {
    if let Ok(guarda) = LEITURA.lock() {
        if let Some((quando, m, estado)) = guarda.as_ref() {
            if *m == monitor && quando.elapsed() < VALIDADE_DA_LEITURA {
                return estado.clone();
            }
        }
    }
    let estado = ler(app, monitor);
    if let Ok(mut guarda) = LEITURA.lock() {
        *guarda = Some((Instant::now(), monitor, estado.clone()));
    }
    estado
}

#[tauri::command]
pub async fn frente_cobre_tela(app: AppHandle, window: WebviewWindow) -> EstadoDaFrente {
    let Ok(Some(atual)) = window.current_monitor() else { return EstadoDaFrente::default() };
    let monitor = Monitor { x: atual.position().x, y: atual.position().y, largura: atual.size().width as i32, altura: atual.size().height as i32, escala_unitaria: (atual.scale_factor() - 1.0).abs() < f64::EPSILON };
    tauri::async_runtime::spawn_blocking(move || ler_com_validade(&app, monitor)).await.unwrap_or_default()
}
