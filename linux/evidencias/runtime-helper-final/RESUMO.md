# Integração runtime e pacote — 2026-10-06

Helper incorporado ao caminho padrão Linux; bootstrap estável e payload por SHA256 incluídos no .deb. Atualização confirma owner do Shell e revisão realmente ativada. Rollback restaura manifesto e estado de habilitação; em estado inicialmente duplo prioriza legado para evitar duas injeções.

PASS: tipos, preparador de payload (1 teste), contrato legado em D-Bus privado, helper real no GNOME46 nested (A→B, erro/rollback, runtime inicialmente desabilitado com e sem legado), build release e verificador do .deb. Logs nesta pasta. Sem instalação ou alterações na sessão pessoal.

Pacote: `src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb`.
SHA256: `5d223d579f3981cf0950444dd7821632ba787038f255f0a6730aee1b0a011e8c`.
Node integrado: v24.19.0, compatível com alvo de build node22.

Limites: primeira ativação via extensions.gnome.org depende de publicação/licença e não foi executada; clique no aplicativo instalado/Tauri ainda não validado; colisão D-Bus e crash no meio da transação pendentes. Não prova compatibilidade fora GNOME46 nem encerra as falhas gráficas/GStreamer anteriores. Suite geral não repetida nesta etapa.
