#!/usr/bin/env bash
set -euo pipefail
lab="$NIKO_GNOME_LAB"
[[ "$lab" = /tmp/niko-sem-reinicio.* && "$GSETTINGS_BACKEND" = keyfile && "$XDG_CONFIG_HOME" = "$lab/config" && "$XDG_DATA_HOME" = "$lab/data" && "$XDG_RUNTIME_DIR" = "$lab/runtime" && "$HOME" = "$lab/home" ]] || { printf "Refusing non-isolated GNOME test environment\n" >&2; exit 1; }
gsettings set org.gnome.shell enabled-extensions '[]'
if [[ "$NIKO_GNOME_MODE" = legacy-update ]]; then gsettings set org.gnome.shell enabled-extensions "['niko-ilha@local']"; fi
export DBUS_SYSTEM_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"
gsettings set org.gnome.shell disable-user-extensions false
DISPLAY="$NIKO_GNOME_DISPLAY" WAYLAND_DISPLAY="$NIKO_GNOME_OUTER" setsid gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="niko-sem-reinicio-$$" > "$lab/shell.log" 2>&1 &
pid=$!
client_pid=""
cleanup() {
    [[ -z "$client_pid" ]] || kill -- "-$client_pid" 2>/dev/null || true
    kill -- "-$pid" 2>/dev/null || true
    [[ -z "$client_pid" ]] || wait "$client_pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    if kill -0 -- "-$pid" 2>/dev/null || { [[ -n "$client_pid" ]] && kill -0 -- "-$client_pid" 2>/dev/null; }; then
        printf 'FAIL: laboratory process group remains\n' > "$lab/cleanup"
        exit 1
    fi
    printf 'PASS: compositor and client groups ended\n' > "$lab/cleanup"
}
trap cleanup EXIT
printf '%s' "$pid" > "$lab/shell.pid"
for ((i=0;i<200;i++)); do
    kill -0 "$pid"
    if [[ -f "$lab/shell.log" ]] && rg -q 'GNOME Shell started' "$lab/shell.log"; then break; fi
    sleep .1
done
rg -q 'GNOME Shell started' "$lab/shell.log"
setsid gjs "$NIKO_GNOME_REPO/linux/gnome/native-sem-reinicio/service-client.js" > "$lab/client.log" 2>&1 &
client_pid=$!
for ((i=0;i<50;i++)); do
    if [[ -f "$lab/client.log" ]] && rg -q '^READY' "$lab/client.log"; then break; fi
    kill -0 "$client_pid"; sleep .1
done
rg -q '^READY' "$lab/client.log"
node_bin="${NIKO_TEST_NODE:-node}"
test_file=diagnostico.test.mjs
[[ "$NIKO_GNOME_MODE" != legacy-update ]] || test_file=legacy-update.test.mjs
[[ "$NIKO_GNOME_MODE" != runtime-helper && "$NIKO_GNOME_MODE" != runtime-helper-clean ]] || test_file=runtime-helper.test.mjs
"$node_bin" --test "$NIKO_GNOME_REPO/linux/gnome/native-sem-reinicio/$test_file" > "$lab/test.log" 2>&1 || { cat "$lab/test.log"; exit 1; }
cat "$lab/test.log"
if rg 'libmutter-CRITICAL|Gtk-CRITICAL|JS ERROR|TypeError|Segmentation fault' "$lab/shell.log"; then exit 1; fi
