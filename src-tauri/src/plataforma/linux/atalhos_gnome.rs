// No GNOME em Wayland o compositor só entrega teclas a apps X11 que estão em foco, então os atalhos
// globais do plugin não funcionam com outro app na frente. Aqui eles viram atalhos personalizados do
// próprio GNOME, que rodam `niko --acao <ação>`; a instância única repassa a ação ao Niko aberto.

use std::process::Stdio;
use std::sync::Mutex;

const ESQUEMA: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CHAVE_DA_LISTA: &str = "custom-keybindings";
const RAIZ: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/";
const PREFIXO: &str = "niko-";

static SINCRONIZANDO: Mutex<()> = Mutex::new(());

fn no_gnome_wayland() -> bool {
    let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|s| s.eq_ignore_ascii_case("wayland"));
    let gnome = std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|d| d.split(':').any(|p| p.eq_ignore_ascii_case("gnome")));
    wayland && gnome
}

fn gsettings(args: &[&str]) -> Option<String> {
    let saida = super::comando_do_sistema("gsettings").args(args).stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    saida.status.success().then(|| String::from_utf8_lossy(&saida.stdout).trim().to_string())
}

// Texto no formato de GVariant: entre aspas simples, com barra e aspas escapadas.
fn variante(texto: &str) -> String {
    format!("'{}'", texto.replace('\\', "\\\\").replace('\'', "\\'"))
}

// O GNOME separa o comando como um shell; aspas simples protegem caminhos com espaço.
fn argumento_de_shell(texto: &str) -> String {
    format!("'{}'", texto.replace('\'', "'\\''"))
}

fn tecla_do_gnome(tecla: &str) -> Option<String> {
    let tecla = tecla.strip_prefix("Key").unwrap_or(tecla);
    let tecla = tecla.strip_prefix("Digit").unwrap_or(tecla);
    if tecla.len() == 1 && tecla.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Some(tecla.to_ascii_lowercase());
    }
    if let Some(n) = tecla.strip_prefix('F').or_else(|| tecla.strip_prefix('f')).and_then(|n| n.parse::<u8>().ok()) {
        return (1..=12).contains(&n).then(|| format!("F{n}"));
    }
    let nome = match tecla.to_ascii_lowercase().as_str() {
        "space" => "space",
        "backquote" => "grave",
        "minus" => "minus",
        "equal" => "equal",
        "bracketleft" => "bracketleft",
        "bracketright" => "bracketright",
        "backslash" => "backslash",
        "semicolon" => "semicolon",
        "quote" => "apostrophe",
        "comma" => "comma",
        "period" => "period",
        "slash" => "slash",
        _ => return None,
    };
    Some(nome.to_string())
}

pub fn atalho_do_gnome(teclas: &str) -> Option<String> {
    let mut partes: Vec<&str> = teclas.split('+').map(str::trim).filter(|p| !p.is_empty()).collect();
    let tecla = tecla_do_gnome(partes.pop()?)?;
    let mut saida = String::new();
    for m in partes {
        saida.push_str(match m.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => "<Control>",
            "alt" => "<Alt>",
            "shift" => "<Shift>",
            "super" | "meta" => "<Super>",
            _ => return None,
        });
    }
    saida.push_str(&tecla);
    Some(saida)
}

fn caminhos_salvos(texto: &str) -> Vec<String> {
    texto.split('\'').skip(1).step_by(2).map(str::to_string).collect()
}

fn lista_de_caminhos(caminhos: &[String]) -> String {
    if caminhos.is_empty() {
        return "@as []".to_string();
    }
    format!("[{}]", caminhos.iter().map(|c| variante(c)).collect::<Vec<_>>().join(", "))
}

fn executavel() -> Option<String> {
    // No AppImage o executável fica numa pasta temporária que muda a cada abertura.
    std::env::var("APPIMAGE").ok().filter(|c| !c.is_empty()).or_else(|| std::env::current_exe().ok().map(|c| c.to_string_lossy().to_string()))
}

fn sincronizar(atalhos: Vec<(String, String)>) {
    let Ok(_vez) = SINCRONIZANDO.lock() else { return };
    let Some(programa) = executavel() else { return };
    let Some(atual) = gsettings(&["get", ESQUEMA, CHAVE_DA_LISTA]) else { return };
    let mut caminhos: Vec<String> = caminhos_salvos(&atual).into_iter().filter(|c| !c.starts_with(&format!("{RAIZ}{PREFIXO}"))).collect();
    for (acao, teclas) in atalhos {
        let Some(atalho) = atalho_do_gnome(&teclas) else { continue };
        let caminho = format!("{RAIZ}{PREFIXO}{acao}/");
        let esquema = format!("{ESQUEMA}.custom-keybinding:{caminho}");
        let comando = format!("{} --acao {acao}", argumento_de_shell(&programa));
        let ok = [("name", format!("Niko: {acao}")), ("command", comando), ("binding", atalho)]
            .iter()
            .all(|(chave, valor)| gsettings(&["set", &esquema, chave, &variante(valor)]).is_some());
        if ok {
            caminhos.push(caminho);
        }
    }
    let _ = gsettings(&["set", ESQUEMA, CHAVE_DA_LISTA, &lista_de_caminhos(&caminhos)]);
}

pub fn atalhos_do_sistema(atalhos: Vec<(String, String)>) {
    if !no_gnome_wayland() {
        return;
    }
    std::thread::spawn(move || sincronizar(atalhos));
}

#[cfg(test)]
mod testes {
    use super::{atalho_do_gnome, caminhos_salvos, lista_de_caminhos};

    #[test]
    fn converte_atalhos_do_niko() {
        assert_eq!(atalho_do_gnome("ctrl+alt+KeyB").as_deref(), Some("<Control><Alt>b"));
        assert_eq!(atalho_do_gnome("ctrl+alt+space").as_deref(), Some("<Control><Alt>space"));
        assert_eq!(atalho_do_gnome("super+shift+Digit3").as_deref(), Some("<Super><Shift>3"));
        assert_eq!(atalho_do_gnome("F9").as_deref(), Some("F9"));
        assert_eq!(atalho_do_gnome("ctrl+alt+Quote").as_deref(), Some("<Control><Alt>apostrophe"));
        assert_eq!(atalho_do_gnome("ctrl+Enter"), None);
    }

    #[test]
    fn preserva_atalhos_do_usuario() {
        let salvos = caminhos_salvos("['/a/custom0/', '/a/niko-lupa/']");
        assert_eq!(salvos, vec!["/a/custom0/".to_string(), "/a/niko-lupa/".to_string()]);
        assert_eq!(lista_de_caminhos(&[]), "@as []");
        assert_eq!(lista_de_caminhos(&["/a/custom0/".to_string()]), "['/a/custom0/']");
    }
}
