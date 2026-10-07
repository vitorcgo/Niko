#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
# Probe namespaces before creating a compositor or running the bridge.
bwrap --unshare-user --unshare-net --ro-bind / / -- /bin/true
lab=$(mktemp -d /tmp/niko-http-runtime.XXXXXX)
printf 'Evidence directory: %s\n' "$lab"
mkdir -p "$lab"/{home,runtime,config,data,cache,state,package}
chmod 700 "$lab/home" "$lab/runtime"
python3 "$repo/linux/gnome/native-http-runtime/host-fingerprint.py" > "$lab/host-before.json"
dpkg-deb -x "$repo/src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb" "$lab/package"
source_dir="$lab/package/usr/share/niko/gnome/niko-ilha-runtime@local"
test -f "$source_dir/current.json"
dest="$lab/data/gnome-shell/extensions/niko-ilha-runtime@local"
mkdir -p "$dest"
cp "$source_dir/"* "$dest/"
# A distinct valid older payload makes the production POST exercise an update.
python3 - "$dest" <<'PY'
import pathlib,json,hashlib,sys
p=pathlib.Path(sys.argv[1]); old=json.loads((p/'current.json').read_text())['file']
code=(p/old).read_bytes()+b'\n// isolated previous HTTP-test revision\n'
name='implementation-'+hashlib.sha256(code).hexdigest()+'.js'
(p/name).write_bytes(code); (p/'current.json').write_text(json.dumps({'file':name}))
PY
outer="${WAYLAND_DISPLAY:?}"; [[ "$outer" = /* ]] || outer="${XDG_RUNTIME_DIR:?}/$outer"
cat > "$lab/bus.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=$lab</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
export NIKO_HTTP_LAB="$lab" NIKO_HTTP_REPO="$repo" NIKO_HTTP_OUTER="$outer" NIKO_HTTP_DISPLAY="${DISPLAY:-}" NIKO_HTTP_HOST_NETNS="$(readlink /proc/self/ns/net)"
sha256sum "$repo/src-tauri/target/release/bundle/deb/Niko_0.2.0_amd64.deb" "$lab/package/usr/lib/Niko/recursos/ponte.mjs" "$source_dir/extension.js" > "$lab/revision.sha256"
exec env -u DBUS_SESSION_BUS_ADDRESS -u APPDATA -u LOCALAPPDATA -u APPDIR -u GNOME_KEYRING_CONTROL -u SSH_AUTH_SOCK -u PULSE_SERVER -u PIPEWIRE_REMOTE -u DISPLAY \
HOME="$lab/home" XDG_RUNTIME_DIR="$lab/runtime" XDG_CONFIG_HOME="$lab/config" XDG_DATA_HOME="$lab/data" XDG_CACHE_HOME="$lab/cache" XDG_STATE_HOME="$lab/state" \
GSETTINGS_BACKEND=keyfile GIO_USE_VFS=local NO_AT_BRIDGE=1 GTK_A11Y=none XDG_CURRENT_DESKTOP=GNOME \
dbus-run-session --config-file="$lab/bus.conf" -- bash "$repo/linux/gnome/native-http-runtime/session.sh"
