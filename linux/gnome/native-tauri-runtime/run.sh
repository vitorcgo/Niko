#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$repo"
"$repo/src-tauri/recursos/node" "$repo/linux/validar-pacote.mjs"
lab=$(mktemp -d /tmp/niko-tauri.XXXXXX)
printf 'Evidence directory: %s\n' "$lab"
export NIKO_NATIVE_LAB="$lab" NIKO_NATIVE_REPO="$repo"
export NIKO_HOST_NETNS="$(readlink /proc/self/ns/net)"
export NIKO_TAURI_BASELINE="${NIKO_TAURI_BASELINE:-0}"
export NIKO_TAURI_DMABUF="${NIKO_TAURI_DMABUF:-1}"
export NIKO_TAURI_MONITORS="${NIKO_TAURI_MONITORS:-1}"
[[ "$NIKO_TAURI_MONITORS" = 1 || "$NIKO_TAURI_MONITORS" = 2 ]]
outer="${WAYLAND_DISPLAY:?}"
[[ "$outer" = /* ]] || outer="${XDG_RUNTIME_DIR:?}/$outer"
export NIKO_OUTER_WAYLAND="$outer" NIKO_OUTER_DISPLAY="${DISPLAY:-}"
mkdir -p "$lab/runtime" "$lab/home" "$lab/config" "$lab/data/gnome-shell/extensions" "$lab/package"
chmod 700 "$lab/runtime" "$lab/home"
dpkg-deb -x "$repo/src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb" "$lab/package"
runtime="$lab/package/usr/share/niko/gnome/niko-ilha-runtime@local"
cp -r "$runtime" "$lab/data/gnome-shell/extensions/"
probe="$lab/data/gnome-shell/extensions/niko-runtime-probe@local"
mkdir -p "$probe"
printf '%s\n' '{"uuid":"niko-runtime-probe@local","name":"Niko isolated runtime probe","description":"Isolated diagnostic only","shell-version":["46"],"version":1}' > "$probe/metadata.json"
cp "$repo/linux/gnome/native-tauri-runtime/probe.js" "$probe/extension.js"
sha256sum "$lab/package/usr/bin/niko" "$lab/package/usr/lib/Niko/recursos/ponte.mjs" "$runtime/"* > "$lab/revision.sha256"
export NIKO_RUNTIME_REVISION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["file"])' "$runtime/current.json")"
cat > "$lab/bus.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=$lab</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
# Falha antes do app se o host não permitir isolamento da porta e da rede.
unshare --user --map-current-user --keep-caps --net /bin/true
exec env -u APPDATA -u LOCALAPPDATA -u APPDIR -u DISPLAY -u DBUS_SESSION_BUS_ADDRESS -u GNOME_KEYRING_CONTROL -u SSH_AUTH_SOCK -u PULSE_SERVER -u PIPEWIRE_REMOTE -u WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS \
HOME="$NIKO_NATIVE_LAB/home" XDG_RUNTIME_DIR="$NIKO_NATIVE_LAB/runtime" \
XDG_CONFIG_HOME="$NIKO_NATIVE_LAB/config" XDG_DATA_HOME="$NIKO_NATIVE_LAB/data" \
XDG_CACHE_HOME="$NIKO_NATIVE_LAB/cache" XDG_STATE_HOME="$NIKO_NATIVE_LAB/state" \
GSETTINGS_BACKEND=keyfile GIO_USE_VFS=local NO_AT_BRIDGE=1 GTK_A11Y=none XDG_CURRENT_DESKTOP=GNOME \
dbus-run-session --config-file="$NIKO_NATIVE_LAB/bus.conf" -- bash "$NIKO_NATIVE_REPO/linux/gnome/native-tauri-runtime/session.sh"
