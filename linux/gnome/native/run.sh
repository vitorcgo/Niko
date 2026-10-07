#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
lab=$(mktemp -d /tmp/niko-native.XXXXXX)
export NIKO_NATIVE_LAB="$lab" NIKO_NATIVE_REPO="$repo"
printf 'Evidence directory: %s\n' "$lab"
mkdir -p "$lab/runtime"
chmod 700 "$lab/runtime"
if [[ "${WAYLAND_DISPLAY:-}" != /* ]]; then export WAYLAND_DISPLAY="${XDG_RUNTIME_DIR:?}/${WAYLAND_DISPLAY:?}"; fi
export XDG_RUNTIME_DIR="$lab/runtime"
mkdir -p "$lab/data/gnome-shell/extensions/niko-ilha@local" "$lab/config"
cp "$repo/linux/gnome/niko-ilha@local/metadata.json" "$lab/data/gnome-shell/extensions/niko-ilha@local/"
cp "$repo/linux/gnome/niko-ilha@local/extension.js" "$lab/data/gnome-shell/extensions/niko-ilha@local/production.js"
probe=probe.js
[[ "${NIKO_NATIVE_BASELINE:-0}" != 1 ]] || probe=baseline.js
cp "$repo/linux/gnome/native/$probe" "$lab/data/gnome-shell/extensions/niko-ilha@local/extension.js"
sha256sum "$lab/data/gnome-shell/extensions/niko-ilha@local/production.js" > "$lab/revision.sha256"
cat > "$lab/bus.conf" <<'XML'
<busconfig><type>session</type><listen>unix:tmpdir=/tmp</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
exec dbus-run-session --config-file="$lab/bus.conf" -- bash -c '
set -euo pipefail
export XDG_CACHE_HOME="$NIKO_NATIVE_LAB/cache" XDG_STATE_HOME="$NIKO_NATIVE_LAB/state"
export XDG_CONFIG_HOME="$NIKO_NATIVE_LAB/config" XDG_DATA_HOME="$NIKO_NATIVE_LAB/data" GSETTINGS_BACKEND=keyfile XDG_CURRENT_DESKTOP=GNOME
export GIO_USE_VFS=local NO_AT_BRIDGE=1 GTK_A11Y=none
export NIKO_NATIVE_RESULT="$NIKO_NATIVE_LAB/result"
gsettings set org.gnome.shell enabled-extensions "[\"niko-ilha@local\"]"
gsettings set org.gnome.shell disable-user-extensions false
socket="niko-native-$$"
gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="$socket" > "$NIKO_NATIVE_LAB/shell.log" 2>&1 &
shell_pid=$!
client_pid=""
trap '\''[[ -z "$client_pid" ]] || kill "$client_pid" 2>/dev/null || true; kill "$shell_pid" 2>/dev/null || true; wait 2>/dev/null || true'\'' EXIT
for ((i=0;i<100;i++)); do
    [[ ! -S "$XDG_RUNTIME_DIR/$socket" ]] || break
    kill -0 "$shell_pid" || { cat "$NIKO_NATIVE_LAB/shell.log"; exit 1; }
    sleep .1
done
[[ -S "$XDG_RUNTIME_DIR/$socket" ]]
GDK_BACKEND=wayland WAYLAND_DISPLAY="$socket" python3 "$NIKO_NATIVE_REPO/linux/gnome/native/client.py" > "$NIKO_NATIVE_LAB/client.log" 2>&1 &
client_pid=$!
printf "%s" "$DBUS_SESSION_BUS_ADDRESS" > "$NIKO_NATIVE_LAB/bus-address"
for ((i=0;i<900;i++)); do
    if [[ -f "$NIKO_NATIVE_RESULT" ]]; then cat "$NIKO_NATIVE_RESULT"
        grep -q "^PASS:" "$NIKO_NATIVE_RESULT"
        if grep -E "stack_position|has_last_sent_configuration|Gtk-CRITICAL|JS ERROR|TypeError|Segmentation fault" "$NIKO_NATIVE_LAB/shell.log" "$NIKO_NATIVE_LAB/client.log"; then printf "FAIL: native critical in logs\n" >> "$NIKO_NATIVE_RESULT"; exit 1; fi
        exit; fi
    kill -0 "$shell_pid" && kill -0 "$client_pid" || { cat "$NIKO_NATIVE_LAB/shell.log" "$NIKO_NATIVE_LAB/client.log"; exit 1; }
    sleep .1
done
printf "FAIL: native probe timed out\n" >&2
cat "$NIKO_NATIVE_LAB/shell.log" "$NIKO_NATIVE_LAB/client.log"
exit 1
'
