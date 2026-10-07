#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
lab=$(mktemp -d /tmp/niko-webkit-media.XXXXXX)
printf 'Evidence directory: %s\n' "$lab"
outer=${WAYLAND_DISPLAY:?}; [[ "$outer" = /* ]] || outer="${XDG_RUNTIME_DIR:?}/$outer"
mkdir -p "$lab"/{home,runtime,config,data,cache,state}
chmod 700 "$lab/runtime"
mkdir -p "$lab/config/wireplumber/main.lua.d" "$lab/config/wireplumber/bluetooth.lua.d"
printf "alsa_monitor.enabled = false\nv4l2_monitor.enabled = false\nlibcamera_monitor.enabled = false\n" > "$lab/config/wireplumber/main.lua.d/85-niko-no-hardware.lua"
printf "bluez_monitor.enabled = false\n" > "$lab/config/wireplumber/bluetooth.lua.d/85-niko-no-hardware.lua"
export NIKO_MEDIA_LAB="$lab" NIKO_MEDIA_REPO="$repo" NIKO_MEDIA_OUTER="$outer" NIKO_MEDIA_DISPLAY="${DISPLAY:-}" NIKO_MEDIA_XAUTHORITY="${XAUTHORITY:-}"
cat > "$lab/bus.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=$lab</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
mkdir -p "$lab/config/pipewire/pipewire-pulse.conf.d"
printf 'pulse.cmd = [ { cmd = "load-module" args = "module-null-sink sink_name=niko_private" } ]\n' > "$lab/config/pipewire/pipewire-pulse.conf.d/90-niko-null.conf"
printf 'pcm.!default { type null }\n' > "$lab/alsa.conf"
exec env -i PATH=/usr/bin:/bin HOME="$lab/home" XDG_RUNTIME_DIR="$lab/runtime" XDG_CONFIG_HOME="$lab/config" XDG_DATA_HOME="$lab/data" XDG_CACHE_HOME="$lab/cache" XDG_STATE_HOME="$lab/state" NIKO_MEDIA_LAB="$lab" NIKO_MEDIA_REPO="$repo" NIKO_MEDIA_OUTER="$outer" NIKO_MEDIA_DISPLAY="${DISPLAY:-}" NIKO_MEDIA_XAUTHORITY="${XAUTHORITY:-}" GSETTINGS_BACKEND=keyfile GIO_USE_VFS=local GTK_A11Y=none NO_AT_BRIDGE=1 PULSE_SERVER="unix:$lab/runtime/pulse/native" DBUS_SYSTEM_BUS_ADDRESS="unix:path=$lab/no-system-bus" ALSA_CONFIG_PATH="$lab/alsa.conf" GST_DEBUG=2 GST_DEBUG_NO_COLOR=1 GST_REGISTRY="$lab/registry.bin" dbus-run-session --config-file="$lab/bus.conf" -- bash -c '
set -euo pipefail
lab=$NIKO_MEDIA_LAB
python3 - "$lab/silence.wav" <<PY
import sys,wave
with wave.open(sys.argv[1],"wb") as f:
 f.setparams((1,2,8000,8000,"NONE","not compressed"));f.writeframes(bytes(16000))
PY
gst-launch-1.0 -q videotestsrc num-buffers=30 pattern=ball ! video/x-raw,width=160,height=90,framerate=30/1 ! videoconvert ! theoraenc ! oggmux ! filesink location="$lab/sample.ogv" > "$lab/generate-video.log" 2>&1
socket="niko-media-$$"
env -u DBUS_SYSTEM_BUS_ADDRESS XAUTHORITY="$NIKO_MEDIA_XAUTHORITY" DISPLAY="$NIKO_MEDIA_DISPLAY" WAYLAND_DISPLAY="$NIKO_MEDIA_OUTER" setsid gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="$socket" > "$lab/shell.log" 2>&1 &
shell_pid=$!; client_pid=""; pw_pid=""; pulse_pid=""; wp_pid=""
cleanup() { [[ -z "$wp_pid" ]] || kill -- "-$wp_pid" 2>/dev/null || true; [[ -z "$pulse_pid" ]] || kill -- "-$pulse_pid" 2>/dev/null || true; [[ -z "$pw_pid" ]] || kill -- "-$pw_pid" 2>/dev/null || true; [[ -z "$client_pid" ]] || kill -- "-$client_pid" 2>/dev/null || true; kill -- "-$shell_pid" 2>/dev/null || true; wait 2>/dev/null || true; for pid in "$wp_pid" "$pulse_pid" "$pw_pid" "$client_pid" "$shell_pid"; do [[ -z "$pid" ]] || ! kill -0 -- "-$pid" 2>/dev/null || { printf "FAIL: process group remains\n" > "$lab/cleanup"; exit 1; }; done; printf "PASS: owned process groups ended\n" > "$lab/cleanup"; }
trap cleanup EXIT
for ((i=0;i<150;i++)); do [[ ! -S "$XDG_RUNTIME_DIR/$socket" ]] || break; kill -0 "$shell_pid"; sleep .1; done
[[ -S "$XDG_RUNTIME_DIR/$socket" ]]
setsid pipewire > "$lab/pipewire.log" 2>&1 &
pw_pid=$!
for ((i=0;i<50;i++)); do [[ ! -S "$XDG_RUNTIME_DIR/pipewire-0" ]] || break; kill -0 "$pw_pid"; sleep .1; done
[[ -S "$XDG_RUNTIME_DIR/pipewire-0" ]]
setsid pipewire-pulse > "$lab/pulse.log" 2>&1 &
pulse_pid=$!
for ((i=0;i<50;i++)); do [[ ! -S "$XDG_RUNTIME_DIR/pulse/native" ]] || break; kill -0 "$pulse_pid"; sleep .1; done
[[ -S "$XDG_RUNTIME_DIR/pulse/native" ]]
setsid wireplumber > "$lab/wireplumber.log" 2>&1 &
wp_pid=$!
sleep 1
kill -0 "$wp_pid"
pw-cli ls Node > "$lab/audio-nodes.log"
GDK_BACKEND=wayland WAYLAND_DISPLAY="$socket" setsid unshare --user --map-current-user --keep-caps --net bash "$NIKO_MEDIA_REPO/linux/diagnostico-gstreamer/webkit-private-client.sh" > "$lab/webkit.log" 2>&1 &
client_pid=$!
wait "$client_pid"
cat "$lab/media-result.json"
'
