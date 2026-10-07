use std::process::Command;
use std::sync::Mutex;

static CONFIGURACAO: Mutex<()> = Mutex::new(());

const CAMINHO: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/niko-ilha/";
const ESQUEMA: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
const MODIFICADORES: [&str; 4] = ["<Control><Alt>", "<Control><Shift>", "<Super><Alt>", "<Super><Shift>"];

fn validar(atalho: &str) -> Result<(), String> {
    if MODIFICADORES.iter().any(|m| atalho.strip_prefix(m).is_some_and(|tecla|
        tecla.len() == 1 && tecla.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))) {
        Ok(())
    } else {
        Err("Escolha uma combinação e uma letra ou número.".into())
    }
}

fn gsettings(args: &[&str]) -> Result<String, String> {
    let saida = Command::new("/usr/bin/gsettings").args(args).output()
        .map_err(|e| format!("Não foi possível acessar os atalhos do Ubuntu: {e}"))?;
    if !saida.status.success() {
        return Err(format!("Não foi possível acessar os atalhos do Ubuntu: {}", String::from_utf8_lossy(&saida.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&saida.stdout).trim().to_owned())
}

fn configurar(atalho: Option<String>) -> Result<String, String> {
    configurar_com(atalho, gsettings)
}

fn configurar_com(atalho: Option<String>, mut gsettings: impl FnMut(&[&str]) -> Result<String, String>) -> Result<String, String> {
    let _guarda = CONFIGURACAO.lock().map_err(|_| "Falha ao serializar configuração do atalho.".to_owned())?;
    let lista = gsettings(&["get", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings"])?;
    if !lista.contains(&format!("'{CAMINHO}'")) {
        return Err("O atalho da ilha ainda não está configurado nos atalhos personalizados do Ubuntu.".into());
    }
    let esquema = format!("{ESQUEMA}:{CAMINHO}");
    let anterior = gsettings(&["get", &esquema, "binding"])?;
    if let Some(novo) = atalho {
        validar(&novo)?;
        // Re-registra mesmo a combinação atual: necessário neste serviço media-keys.
        gsettings(&["set", &esquema, "binding", "''"])?;
        let valor = format!("'{novo}'");
        let resultado = (|| {
            gsettings(&["set", &esquema, "binding", &valor])?;
            if gsettings(&["get", &esquema, "binding"])? != valor {
                return Err("O Ubuntu não confirmou o atalho salvo.".into());
            }
            Ok(())
        })();
        if let Err(erro) = resultado {
            return match gsettings(&["set", &esquema, "binding", &anterior]) {
                Ok(_) => Err(erro),
                Err(restauracao) => Err(format!("{erro} Não foi possível restaurar o atalho anterior: {restauracao}")),
            };
        }
        return Ok(novo);
    }
    Ok(anterior.trim_matches('\'').to_owned())
}

#[tauri::command]
pub async fn atalho_ilha_linux(janela: tauri::WebviewWindow, atalho: Option<String>) -> Result<String, String> {
    if janela.label() != "sistema" { return Err("janela_invalida".into()); }
    tauri::async_runtime::spawn_blocking(move || configurar(atalho)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn atalho_real_persiste_em_backend_keyfile_isolado() {
        let pasta = std::env::temp_dir().join(format!("niko-gsettings-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&pasta).unwrap();
        let executar = |args: &[&str]| -> Result<String, String> {
            let saida = std::process::Command::new("/usr/bin/gsettings")
                .env("GSETTINGS_BACKEND", "keyfile").env("XDG_CONFIG_HOME", &pasta)
                .env_remove("DBUS_SESSION_BUS_ADDRESS").args(args).output().map_err(|e| e.to_string())?;
            if !saida.status.success() { return Err(String::from_utf8_lossy(&saida.stderr).into_owned()); }
            Ok(String::from_utf8_lossy(&saida.stdout).trim().to_owned())
        };
        let esquema = format!("{}:{}", super::ESQUEMA, super::CAMINHO);
        executar(&["set", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings",
            &format!("['{}']", super::CAMINHO)]).unwrap();
        executar(&["set", &esquema, "binding", "'<Control><Alt>i'"]).unwrap();
        assert_eq!(super::configurar_com(Some("<Super><Shift>2".into()), executar).unwrap(), "<Super><Shift>2");
        assert_eq!(super::configurar_com(None, executar).unwrap(), "<Super><Shift>2");
        assert!(super::configurar_com(Some("<Alt>F4".into()), executar).is_err());
        assert_eq!(super::configurar_com(None, executar).unwrap(), "<Super><Shift>2");
        std::fs::remove_dir_all(pasta).unwrap();
    }

    #[test]
    fn configuracoes_concorrentes_nao_intercalam_transacoes() {
        use std::sync::{Arc, Barrier, atomic::{AtomicUsize, Ordering}};
        let inicio = Arc::new(Barrier::new(8));
        let ativas = Arc::new(AtomicUsize::new(0));
        let threads: Vec<_> = (0..8).map(|_| {
            let inicio = inicio.clone();
            let ativas = ativas.clone();
            std::thread::spawn(move || {
                inicio.wait();
                let resultado = super::configurar_com(None, |args| {
                    if args[2] == "custom-keybindings" {
                        assert_eq!(ativas.fetch_add(1, Ordering::SeqCst), 0);
                        std::thread::sleep(std::time::Duration::from_millis(5));
                        Ok(format!("['{}']", super::CAMINHO))
                    } else {
                        assert_eq!(ativas.fetch_sub(1, Ordering::SeqCst), 1);
                        Ok("'<Control><Alt>i'".into())
                    }
                });
                assert_eq!(resultado.unwrap(), "<Control><Alt>i");
            })
        }).collect();
        for thread in threads { thread.join().unwrap(); }
        assert_eq!(ativas.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn falhas_de_gravacao_ou_confirmacao_restauram_anterior() {
        for falha in [Err("falha_gravacao".into()), Err("falha_leitura".into()), Ok("'<Control><Alt>x'".into())] {
            let mut respostas = std::collections::VecDeque::from([
                Ok(format!("['{}']", super::CAMINHO)), Ok("'<Control><Alt>i'".into()), Ok(String::new()),
                Ok(String::new()), falha, Ok(String::new()),
            ]);
            if respostas[4].as_ref().is_err_and(|e: &String| e == "falha_gravacao") { respostas.remove(3); }
            let mut chamadas = Vec::new();
            let resultado = super::configurar_com(Some("<Control><Alt>j".into()), |args| {
                chamadas.push(args.iter().map(|s| s.to_string()).collect::<Vec<_>>());
                respostas.pop_front().unwrap()
            });
            assert!(resultado.is_err());
            assert_eq!(chamadas.last().unwrap().last().unwrap(), "'<Control><Alt>i'");
            assert!(respostas.is_empty());
        }
    }

    #[test]
    fn falha_de_restauracao_e_reportada() {
        let mut respostas = std::collections::VecDeque::from([
            Ok(format!("['{}']", super::CAMINHO)), Ok("'<Control><Alt>i'".into()), Ok(String::new()),
            Err("falha_gravacao".into()), Err("falha_restore".into()),
        ]);
        let erro = super::configurar_com(Some("<Control><Alt>j".into()), |_| respostas.pop_front().unwrap()).unwrap_err();
        assert!(erro.contains("restaurar") && erro.contains("falha_restore"));
    }
    #[test]
    fn valida_apenas_combinacoes_limitadas_sem_sintaxe_executavel() {
        for s in ["<Control><Alt>i", "<Super><Shift>2"] { assert!(super::validar(s).is_ok()); }
        for s in ["i", "<Control>c", "<Alt>F4", "<Control><Alt>'", "<Control><Alt>i;id", "<Control><Alt>é"] {
            assert!(super::validar(s).is_err());
        }
    }
}
