#!/usr/bin/env bash
set -euo pipefail
if pgrep -x niko >/dev/null; then
    printf '%s\n' 'Já existe Niko ativo. Encerre-o antes de iniciar o laboratório.' >&2
    exit 1
fi
niko_listeners=$(ss -H -ltn 'sport = :47831')
if [[ -n "$niko_listeners" ]]; then
    printf '%s\n' 'Porta da ponte 47831 ocupada. Não iniciar cliente concorrente.' >&2
    exit 1
fi
niko_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
niko_lab=$(mktemp -d /tmp/niko-gnome-lab.XXXXXX)
mkdir -p "$niko_lab/data/gnome-shell/extensions/niko-ilha@local" "$niko_lab/config"
cat > "$niko_lab/bus.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=$niko_lab</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
cp "$niko_repo/linux/gnome/niko-ilha@local/metadata.json" "$niko_repo/linux/gnome/niko-ilha@local/extension.js" "$niko_lab/data/gnome-shell/extensions/niko-ilha@local/"
printf '%s\n' "$niko_lab" > /tmp/niko-gnome-lab-atual
unset APPDATA
export NIKO_LAB="$niko_lab" NIKO_REPO="$niko_repo"
export NIKO_BINARY="${NIKO_TEST_BINARY:-$niko_repo/src-tauri/target/debug/niko}"
exec dbus-run-session --config-file="$NIKO_LAB/bus.conf" -- bash -c '
set -euo pipefail
export GDK_BACKEND=wayland GSETTINGS_BACKEND=keyfile XDG_CONFIG_HOME="$NIKO_LAB/config" XDG_DATA_HOME="$NIKO_LAB/data"
export XDG_CACHE_HOME="$NIKO_LAB/cache" XDG_STATE_HOME="$NIKO_LAB/state"
gsettings set org.gnome.shell enabled-extensions "[\"ubuntu-appindicators@ubuntu.com\", \"niko-ilha@local\"]"
gsettings set org.gnome.shell disable-user-extensions false
niko_socket="niko-lab-$$"
if [[ -n "${NIKO_SHELL_GDB:-}" ]]; then
    gdb --batch --nx -x "$NIKO_SHELL_GDB" --args gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="$niko_socket" > "$NIKO_LAB/shell.log" 2>&1 &
else
    gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="$niko_socket" > "$NIKO_LAB/shell.log" 2>&1 &
fi
niko_shell=$!
niko_client=""
trap '\''if [[ -n "$niko_client" ]]; then kill -TERM "$niko_client" 2>/dev/null || true; fi; kill -TERM "$niko_shell" 2>/dev/null || true'\'' EXIT
for ((i=0; i<100; i++)); do
    if [[ -S "$XDG_RUNTIME_DIR/$niko_socket" ]]; then break; fi
    if ! kill -0 "$niko_shell" 2>/dev/null; then exit 1; fi
    sleep 0.1
done
[[ -S "$XDG_RUNTIME_DIR/$niko_socket" ]]
dbus-update-activation-environment WAYLAND_DISPLAY="$niko_socket" GDK_BACKEND=wayland XDG_CURRENT_DESKTOP=GNOME
for ((i=0; i<100; i++)); do
    if gdbus call --session --timeout 1 --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher | rg -q true; then break; fi
    if ! kill -0 "$niko_shell" 2>/dev/null; then exit 1; fi
    sleep 0.1
done
if ! gdbus call --session --timeout 1 --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher | rg -q true; then
    printf "%s\n" "StatusNotifierWatcher não disponível; não iniciar fallback GTK." >&2
    exit 1
fi
WAYLAND_DISPLAY="$niko_socket" WEBKIT_DISABLE_DMABUF_RENDERER=1 XDG_DATA_HOME="$NIKO_LAB/data" "$NIKO_BINARY" > "$NIKO_LAB/niko.log" 2>&1 &
niko_client=$!
printf "%s\n" "$DBUS_SESSION_BUS_ADDRESS" > "$NIKO_LAB/bus-address"
printf "Laboratório: %s\nProcesso supervisor GNOME nested PID: %s\nNiko PID: %s\n" "$NIKO_LAB" "$niko_shell" "$niko_client"
wait "$niko_shell"
'
