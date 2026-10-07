# Instalação/habilitação GNOME — testes isolados

Base HEAD b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f mais fonte integrada identificada por hashes abaixo. Node22.23.3; GJS1.80.2.

Comando: `DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/niko-gnome-parent-sentinel-inexistente node --test servidor/gnome-ilha-linux.test.mjs`.

Executado fora sandbox para permitir socket privado, autorização específica de integração isolada. Rerodada final:1 teste externo e1interno passaram,0falhas,23,66s. node --check e git diff --check passaram. Nenhum logout, instalação na sessão pessoal ou alteração de configurações GNOME reais.

## Cobertura

- Serviço ausente=>sem_gnome e nenhuma escrita; encerramento/reabertura consultados novamente.
- Shell47 incompatível e extensões globalmente bloqueadas impedem copiar/habilitar.
- Origem ausente, origem disponível=>instalar, cópia metadata/código e intenção EnableExtension primeira instalação.
- Arquivos instalados com info ausente ou versão carregada diferente=>nova_sessao.
- States1ativa/2e6habilitar/3erro/4incompatível/7e8aguardando; habilitação disabled->active.
- AccessDenied em GetInfo e Enable deve retornar erro+acesso_negado.
- Ativa é no-op inclusive3chamadas concorrentes, sem habilitação redundante ou backup.
- Atualização concorrente3vezes produz uma cópia final íntegra e um backup original completo, inclusive sentinel pessoal fictício.
- Falha filesystem em caminho não diretório preserva sentinel; chmod0500 em diretório temporário negou escrita e não deixou staging parcial neste host não-root.
- Falha simulada no rename final, após backup real, restaura metadata/código/arquivo sentinel originais e remove staging.

## Distinção da evidência

D-Bus daemon/GJS/Gio e filesystem/POSIX chmod rodaram nativamente. GNOME Shell foi completamente simulado pelo serviço GJS, conforme interface XML instalada /usr/share/dbus-1/interfaces/org.gnome.Shell.Extensions.xml. Falha rename foi injetada somente na fonte carregada em memória por Vite, sem alterar produção; movimentos/rollback/pastas são reais temporários. Isso não substitui GNOME nested real nem validação manual do aplicativo instalado.

Teste chmod explica limitação quando executado como root. Interface fake inclui ShellVersion/UserExtensionsEnabled; setter global lança erro, evitando que código teste altere política global.

## Aviso de sessão

`node --test scripts/ilha-aviso.test.mjs`: contrato de fonte portátil passou; extrai condição real do aviso e avalia Linux ativa/inativa/Windows ativa, verifica texto canônico. Não renderiza Configuracoes, não comprova aparência nem visibilidade no aplicativo real. O aviso informa eventual nova sessão após extensão instalar/atualizar; não promete uma única vez para sempre.

## Complemento da revisão final

Helper exige org.gnome.Shell existente e permite ativação somente da API Extensions depois desse guard. Fake possui ambos nomes; caso helper isolado sem Shell retorna sem_gnome e não chama GetInfo/Enable. API de ativação nativa sob demanda pertence à evidência do agente GNOME nested, não é simulada por autostart neste bus sem servicedirs.

Middleware real POST /ponte/ilha/gnome com token errado retornou403; confirmação diferente de ATIVAR_ILHA retornou400/confirmacao_invalida. Requests/responses são streams/objetos simulados. Log de métodos e árvore XDG_DATA_HOME permaneceram idênticos, comprovando ausência de chamada GNOME/escrita nesses casos.

Última rerodada:1externo+1interno,0falhas,23,66s, após todos esses complementos. Fonte integrada inclui correção da posição da rota real.

## Regressões adicionais da revisão

- Symlink nos ancestrais gnome-shell, extensions ou no diretório backups retorna erro/caminho_inseguro nos modos estado e instalar, preservando diretório alvo e sentinel.
- ShellVersion omitida no serviço fictício retorna aguardando, sem escrever extensão.
- Info state3/4 sem version continua erro/incompativel, antes de avaliação de cache.
- JavaScript substituído com metadata.version2 inalterado e Shell state1 ou2 cria marcador niko-pendente.json com busID/owner. Instalação e duas consultas GET retornam nova_sessao; GET preserva conteúdo do marcador. Novo owner Shell no mesmo bus faz consulta retornar ativa, mantendo histórico do marcador.

Última execução após esses casos passou:1externo+1interno,0falhas,23,66s. Symlinks/arquivos são reais temporários; owners/metadados GNOME são simulados no bus privado.

## Diagnóstico final da API ausente

Fake Shell possui somente org.gnome.Shell, sem org.gnome.Shell.Extensions. Estado e instalar retornam erro (capacidade/API ausente), preservam diretórios e não enviam habilitação. O helper Extensions sem Shell continua sem_gnome. Última rerodada após esta alteração:1externo+1interno,0falhas,23,66s.

## Hashes

- `servidor/gnome-ilha-linux.test.mjs`: `6d28b559122f28f530e018ee4b36378261c2d08602ce1339536feceda1d3aa58`
- `servidor/gnomeIlhaLinux.ts`: `5522e73831ff9d2ee8b40f9065c1cd87791fec0bb39d3e99e24fd6541e4df1f3`
- `servidor/ponte.ts`: `ffe5d06ab58058e66749144a8bacb4e4b5d5cc878b19928da3f4f76ea2269680`
- `scripts/ilha-aviso.test.mjs`: `98f9c6d3f1094e9f36b8b71dc6125a1f708270799ab8ca2e5ebd4815a285078d`
- `src/modulos/configuracoes/Configuracoes.tsx`: `807de09e3affc767f33c1344f315647263986d679bf9d5964b5d9219b58df299`
- `src/textos/textos.ts`: `d2402b2cc34e682a5012392fdb730c9be6329715b078165567ab981d92b39cb5`
