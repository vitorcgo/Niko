#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
lab=$(mktemp -d /tmp/niko-msdk-format.XXXXXX)
printf 'Evidence directory: %s\n' "$lab"
mkdir -p "$lab"/{home,config,data,cache,runtime,plugins}
chmod 700 "$lab/runtime"
ln -s /usr/lib/x86_64-linux-gnu/gstreamer-1.0/libgstmsdk.so "$lab/plugins/libgstmsdk.so"
env -i PATH=/usr/bin:/bin HOME="$lab/home" XDG_CONFIG_HOME="$lab/config" XDG_DATA_HOME="$lab/data" XDG_CACHE_HOME="$lab/cache" XDG_RUNTIME_DIR="$lab/runtime" GST_PLUGIN_SYSTEM_PATH_1_0="$lab/plugins" GST_REGISTRY="$lab/registry.bin" GST_REGISTRY_FORK=no gdb --batch --nx -x "${NIKO_MSDK_GDB_SCRIPT:-$repo/linux/diagnostico-gstreamer/msdk-format.gdb}" --args gst-inspect-1.0 > "$lab/format.log" 2>&1
cat "$lab/format.log"
