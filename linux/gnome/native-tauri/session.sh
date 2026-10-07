#!/usr/bin/env bash
set -euo pipefail
lab="$NIKO_NATIVE_LAB"
export NIKO_NATIVE_RESULT="$lab/result"
# Serviços de sistema também ficam no barramento privado vazio do laboratório.
export DBUS_SYSTEM_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"
export PIPEWIRE_RUNTIME_DIR="$lab/runtime" PIPEWIRE_REMOTE=niko-private-ausente
printf '%s' "$DBUS_SESSION_BUS_ADDRESS" > "$lab/bus-address"
if [[ "${NIKO_TAURI_DOCK:-0}" = 1 || "${NIKO_TAURI_SILENCIO:-0}" = 1 ]]; then
    "$NIKO_NATIVE_REPO/src-tauri/recursos/node" "$NIKO_NATIVE_REPO/linux/gnome/native-tauri/seed-dock.mjs"
fi
if [[ "${NIKO_TAURI_DOCK:-0}" = 1 ]]; then
    mkdir -p "$XDG_DATA_HOME/applications"
    cat > "$XDG_DATA_HOME/applications/org.niko.DockFixture.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Fixture dock privada
Exec=false
Icon=utilities-terminal
StartupWMClass=org.niko.DockFixture
DESKTOP
fi
if [[ "${NIKO_CONTROLES_NATIVE:-0}" = 1 ]]; then
    gsettings set org.gnome.desktop.a11y.applications screen-keyboard-enabled true
fi
gsettings set org.gnome.shell enabled-extensions '["niko-ilha@local"]'
gsettings set org.gnome.shell disable-user-extensions false
if [[ "$NIKO_TAURI_MONITORS" = 2 ]]; then
    gsettings set org.gnome.mutter experimental-features '["scale-monitor-framebuffer"]'
fi
dummy_modes=""; dummy_scales=1
if [[ "$NIKO_TAURI_MONITORS" = 2 ]]; then
    dummy_modes=1920x1080; dummy_scales=1,2
fi
socket="niko-tauri-$$"
export NIKO_NESTED_SOCKET="$socket"
shell_pid=""; app_pid=""; watcher_pid=""
cleanup() {
    for pid in "$app_pid" "$watcher_pid" "$shell_pid"; do
        [[ -z "$pid" ]] || kill -- "-$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    for ((i=0;i<50;i++)); do
        [[ -z "$app_pid" ]] || ! kill -0 -- "-$app_pid" 2>/dev/null || { sleep .1; continue; }
        printf 'PASS: app process group ended\n' > "$lab/cleanup"
        return
    done
    printf 'FAIL: app process group still present\n' > "$lab/cleanup"
    exit 1
}
trap cleanup EXIT
if [[ "${NIKO_TAURI_HEADLESS:-0}" = 1 ]]; then
    [[ "$NIKO_TAURI_MONITORS" = 1 ]] || { printf 'Headless probe requires one virtual monitor\n' >&2; exit 1; }
    env -u DISPLAY -u WAYLAND_DISPLAY LIBGL_ALWAYS_SOFTWARE="${NIKO_TAURI_SOFTWARE:-1}" setsid gnome-shell --mode=user --headless --wayland --no-x11 --sm-disable --virtual-monitor="${NIKO_VIRTUAL_MONITOR:-800x600}" --wayland-display="$socket" > "$lab/shell.log" 2>&1 &
else
    DISPLAY="$NIKO_OUTER_DISPLAY" WAYLAND_DISPLAY="$NIKO_OUTER_WAYLAND" MUTTER_DEBUG_NUM_DUMMY_MONITORS="$NIKO_TAURI_MONITORS" MUTTER_DEBUG_DUMMY_MONITOR_SCALES="$dummy_scales" MUTTER_DEBUG_DUMMY_MODE_SPECS="$dummy_modes" setsid gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="$socket" > "$lab/shell.log" 2>&1 &
fi
shell_pid=$!
export NIKO_NESTED_PID="$shell_pid"
printf '%s' "$shell_pid" > "$lab/shell.pid"
setsid python3 "$NIKO_NATIVE_REPO/linux/gnome/native-tauri/watcher.py" > "$lab/watcher.log" 2>&1 &
watcher_pid=$!
for ((i=0;i<150;i++)); do
    [[ ! -S "$XDG_RUNTIME_DIR/$socket" ]] || break
    kill -0 "$shell_pid"; sleep .1
done
[[ -S "$XDG_RUNTIME_DIR/$socket" ]]
for ((i=0;i<50;i++)); do
    if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher | rg -q true; then break; fi
    sleep .1
done
gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.kde.StatusNotifierWatcher | rg -q true
if [[ "$NIKO_TAURI_DMABUF" = 1 ]]; then export WEBKIT_DISABLE_DMABUF_RENDERER=1; else unset WEBKIT_DISABLE_DMABUF_RENDERER; fi
WAYLAND_DEBUG="${NIKO_WAYLAND_DEBUG:-}" GDK_BACKEND=wayland WAYLAND_DISPLAY="$socket" setsid unshare --user --map-current-user --keep-caps --net bash -c '
set -euo pipefail
ip link set lo up
readlink /proc/self/ns/net > "$NIKO_NATIVE_LAB/netns"
[[ "$(readlink /proc/self/ns/net)" != "$NIKO_HOST_NETNS" ]]
exec "$NIKO_NATIVE_LAB/package/usr/bin/niko"
' > "$lab/app.log" 2>&1 &
app_pid=$!
printf '%s\n' "$app_pid" > "$lab/app.pid"
for ((i=0;i<1200;i++)); do
    if [[ -f "$lab/result" ]]; then
        cat "$lab/result"
        grep -q '^PASS:' "$lab/result"
        if rg 'libmutter-CRITICAL|stack_position|has_last_sent_configuration|Gtk-CRITICAL|JS ERROR|TypeError|Segmentation fault' "$lab/shell.log" "$lab/app.log"; then
            printf 'FAIL: native critical in logs\n' >> "$lab/result"; exit 1
        fi
        # A primeira abertura cria niko.log depois do spawn; stderr pode ser /dev/null.
        cat "/proc/$app_pid/net/tcp" > "$lab/tcp"
        if ! rg -q '0100007F:BAD7 .* 0A ' "$lab/tcp"; then
            printf 'FAIL: isolated bridge listener absent\n' >> "$lab/result"; exit 1
        fi
        exit 0
    fi
    kill -0 "$shell_pid"; kill -0 "$app_pid"; sleep .1
done
printf 'FAIL: Tauri probe timed out\n' > "$lab/result"
cat "$lab/result"; exit 1
