#!/usr/bin/env bash
set -euo pipefail
ip link set lo up
exec python3 "$NIKO_MEDIA_REPO/linux/diagnostico-gstreamer/webkit-media.py"
