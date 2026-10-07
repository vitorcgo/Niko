#!/usr/bin/env bash
set -euo pipefail
# Reutiliza lifecycle/namespace/cleanup do runner Tauri; somente UUIDs do laboratório diferem.
sed 's/\["niko-ilha@local"\]/["niko-ilha-runtime@local", "niko-runtime-probe@local"]/' "$NIKO_NATIVE_REPO/linux/gnome/native-tauri/session.sh" > "$NIKO_NATIVE_LAB/session.sh"
exec bash "$NIKO_NATIVE_LAB/session.sh"
