#!/usr/bin/env bash
set -euo pipefail
lab=$(mktemp -d /tmp/niko-gstreamer.XXXXXX)
printf 'Evidence directory: %s\n' "$lab"
mkdir -p "$lab"/{home,data,config,cache,runtime,plugins}
chmod 700 "$lab/runtime"
plugin=/usr/lib/x86_64-linux-gnu/gstreamer-1.0/libgstmsdk.so
[[ -f "$plugin" ]]
ln -s "$plugin" "$lab/plugins/libgstmsdk.so"
isolated=(env -i PATH=/usr/bin:/bin HOME="$lab/home" XDG_DATA_HOME="$lab/data" XDG_CONFIG_HOME="$lab/config" XDG_CACHE_HOME="$lab/cache" XDG_RUNTIME_DIR="$lab/runtime" GST_DEBUG_NO_COLOR=1)
"${isolated[@]}" GST_REGISTRY="$lab/all-registry.bin" GST_DEBUG=GST_PLUGIN_LOADING:6 gst-inspect-1.0 > "$lab/all.txt" 2> "$lab/all-errors.txt"
"${isolated[@]}" GST_REGISTRY="$lab/msdk-registry.bin" GST_PLUGIN_SYSTEM_PATH_1_0="$lab/plugins" GST_DEBUG='msdk*:6' gst-inspect-1.0 > "$lab/msdk.txt" 2> "$lab/msdk-errors.txt"
python3 - "$lab/silence.wav" <<'PY'
import sys, wave
with wave.open(sys.argv[1], 'wb') as audio:
    audio.setparams((1, 2, 8000, 8000, 'NONE', 'not compressed'))
    audio.writeframes(bytes(16000))
PY
"${isolated[@]}" GST_REGISTRY="$lab/audio-registry.bin" gst-launch-1.0 filesrc location="$lab/silence.wav" '!' wavparse '!' audioconvert '!' fakesink > "$lab/audio.txt" 2>&1
grep -q 'Got EOS' "$lab/audio.txt"
if command -v gdb >/dev/null; then
    "${isolated[@]}" GST_REGISTRY="$lab/stack-registry.bin" GST_PLUGIN_SYSTEM_PATH_1_0="$lab/plugins" GST_REGISTRY_FORK=no G_DEBUG=fatal-criticals gdb --batch --nx -ex run -ex 'bt 15' --args gst-inspect-1.0 > "$lab/stack.txt" 2>&1
fi
dpkg-query -W gstreamer1.0-plugins-bad gstreamer1.0-plugins-base libgstreamer1.0-0 libwebkit2gtk-4.1-0 > "$lab/versions.txt"
sha256sum "$plugin" > "$lab/plugin.sha256"
if grep -q '_dma_fmt_to_dma_drm_fmts' "$lab/msdk-errors.txt"; then
    printf '%s\n' 'REPRODUCED: msdk registry scan critical; not a passing stability gate.'
else
    printf '%s\n' 'NOT REPRODUCED: msdk critical absent in this environment; compare GPU access.'
fi
printf '%s\n' 'Audio PCM pipeline reached EOS through fakesink; no physical audio output.'
