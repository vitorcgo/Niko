#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
lab=$(mktemp -d /tmp/niko-native-integracao.XXXXXX)
export NIKO_GNOME_NATIVE_LAB="$lab" NIKO_GNOME_NATIVE_REPO="$repo"
printf 'Evidence directory: %s\n' "$lab"
mkdir -p "$lab/runtime" "$lab/config" "$lab/origem" "$lab/data/gnome-shell/extensions/niko-ilha@local"
chmod 700 "$lab/runtime"
if [[ "${WAYLAND_DISPLAY:-}" != /* ]]; then export WAYLAND_DISPLAY="${XDG_RUNTIME_DIR:?}/${WAYLAND_DISPLAY:?}"; fi
export XDG_RUNTIME_DIR="$lab/runtime"
cp "$repo/linux/gnome/niko-ilha@local/extension.js" "$lab/origem/"
python3 - "$repo" "$lab" <<'PY'
import json, pathlib, shutil, sys
repo, lab = map(pathlib.Path, sys.argv[1:])
metadata = json.loads((repo/'linux/gnome/niko-ilha@local/metadata.json').read_text())
metadata['version'] = 2
(lab/'origem/metadata.json').write_text(json.dumps(metadata))
for filename in ['metadata.json', 'extension.js']:
    shutil.copyfile(lab/'origem'/filename, lab/'data/gnome-shell/extensions/niko-ilha@local'/filename)
PY
sha256sum "$repo/linux/gnome/niko-ilha@local/extension.js" "$repo/servidor/gnomeIlhaLinux.ts" > "$lab/revision.sha256"
mkdir -p "$lab/services"
cat > "$lab/services/org.gnome.Shell.Extensions.service" <<'SERVICE'
[D-BUS Service]
Name=org.gnome.Shell.Extensions
Exec=/usr/bin/gjs -m /usr/share/gnome-shell/org.gnome.Shell.Extensions
SERVICE
cat > "$lab/bus.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=/tmp</listen><auth>EXTERNAL</auth><servicedir>$lab/services</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
exec dbus-run-session --config-file="$lab/bus.conf" -- bash -c '
set -euo pipefail
export XDG_CACHE_HOME="$NIKO_GNOME_NATIVE_LAB/cache" XDG_STATE_HOME="$NIKO_GNOME_NATIVE_LAB/state"
export XDG_CONFIG_HOME="$NIKO_GNOME_NATIVE_LAB/config" XDG_DATA_HOME="$NIKO_GNOME_NATIVE_LAB/data" GSETTINGS_BACKEND=keyfile XDG_CURRENT_DESKTOP=GNOME
export GIO_USE_VFS=local NO_AT_BRIDGE=1 GTK_A11Y=none
unset APPDATA
gsettings set org.gnome.shell enabled-extensions "[]"
gsettings set org.gnome.shell disable-user-extensions false
socket="niko-integracao-$$"
gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="$socket" > "$NIKO_GNOME_NATIVE_LAB/shell.log" 2>&1 &
shell_pid=$!
monitor_pid=""
trap '\''[[ -z "$monitor_pid" ]] || kill "$monitor_pid" 2>/dev/null || true; kill "$shell_pid" 2>/dev/null || true; wait 2>/dev/null || true'\'' EXIT
for ((i=0;i<150;i++)); do
    kill -0 "$shell_pid" || { cat "$NIKO_GNOME_NATIVE_LAB/shell.log"; exit 1; }
    grep -q "GNOME Shell started" "$NIKO_GNOME_NATIVE_LAB/shell.log" && break
    sleep .1
done
grep -q "GNOME Shell started" "$NIKO_GNOME_NATIVE_LAB/shell.log"
for ((i=0;i<150;i++)); do
    kill -0 "$shell_pid" || { cat "$NIKO_GNOME_NATIVE_LAB/shell.log"; exit 1; }
    if gdbus call --session --timeout 1 --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions --method org.gnome.Shell.Extensions.GetExtensionInfo niko-ilha@local > "$NIKO_GNOME_NATIVE_LAB/info-before" 2>/dev/null && grep -q "version" "$NIKO_GNOME_NATIVE_LAB/info-before"; then break; fi
    sleep .1
done
grep -q "version" "$NIKO_GNOME_NATIVE_LAB/info-before"
dbus-monitor --session "type='\''method_call'\'',destination='\''org.gnome.Shell.Extensions'\'',interface='\''org.gnome.Shell.Extensions'\'',member='\''EnableExtension'\''" > "$NIKO_GNOME_NATIVE_LAB/enable-calls.log" 2>&1 &
monitor_pid=$!
sleep .2
node_bin="${NIKO_TEST_NODE:-node}"
"$node_bin" --test "$NIKO_GNOME_NATIVE_REPO/linux/gnome/native-integracao/integracao.test.mjs" > "$NIKO_GNOME_NATIVE_LAB/test.log" 2>&1 || { cat "$NIKO_GNOME_NATIVE_LAB/test.log"; exit 1; }
cat "$NIKO_GNOME_NATIVE_LAB/test.log"
if grep -E "stack_position|has_last_sent_configuration|Gtk-CRITICAL|JS ERROR|TypeError|Segmentation fault" "$NIKO_GNOME_NATIVE_LAB/shell.log"; then exit 1; fi
'
