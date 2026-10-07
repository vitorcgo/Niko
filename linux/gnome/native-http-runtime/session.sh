#!/usr/bin/env bash
set -euo pipefail
lab="$NIKO_HTTP_LAB"
[[ "$lab" = /tmp/niko-http-runtime.* && "$HOME" = "$lab/home" && "$XDG_DATA_HOME" = "$lab/data" && "$XDG_CONFIG_HOME" = "$lab/config" && "$GSETTINGS_BACKEND" = keyfile ]] || exit 1
gsettings set org.gnome.shell enabled-extensions '[]'
gsettings set org.gnome.shell disable-user-extensions false
shell_pid=""; test_pid=""
cleanup() {
    for pid in "$test_pid" "$shell_pid"; do [[ -z "$pid" ]] || kill -- "-$pid" 2>/dev/null || true; done
    wait 2>/dev/null || true
    for pid in "$test_pid" "$shell_pid"; do
        if [[ -n "$pid" ]] && kill -0 -- "-$pid" 2>/dev/null; then printf 'FAIL: laboratory process group remains\n' > "$lab/cleanup"; exit 1; fi
    done
    printf 'PASS: laboratory process groups ended\n' > "$lab/cleanup"
}
trap cleanup EXIT
DISPLAY="$NIKO_HTTP_DISPLAY" WAYLAND_DISPLAY="$NIKO_HTTP_OUTER" setsid gnome-shell --mode=user --nested --wayland --no-x11 --sm-disable --wayland-display="niko-http-$$" > "$lab/shell.log" 2>&1 &
shell_pid=$!
printf '%s' "$shell_pid" > "$lab/shell.pid"
for ((i=0;i<200;i++)); do
    kill -0 "$shell_pid"
    if rg -q 'GNOME Shell started' "$lab/shell.log"; then break; fi
    sleep .1
done
rg -q 'GNOME Shell started' "$lab/shell.log"
# All overlays are confined to the bubblewrap mount namespace. No host path is written.
setsid bwrap --die-with-parent --unshare-user --unshare-net --cap-add CAP_NET_ADMIN \
--ro-bind / / --bind "$lab" "$lab" --tmpfs /usr/share/niko --dir /usr/share/niko/gnome \
--ro-bind "$lab/package/usr/share/niko/gnome" /usr/share/niko/gnome --dev /dev --proc /proc \
-- /bin/bash -c 'set -euo pipefail; ip -brief link show lo | rg -q "<[^>]*UP"; readlink /proc/self/ns/net > "$NIKO_HTTP_LAB/netns"; [[ "$(readlink /proc/self/ns/net)" != "$NIKO_HTTP_HOST_NETNS" ]]; exec "$NIKO_HTTP_LAB/package/usr/lib/Niko/recursos/node" "$NIKO_HTTP_REPO/linux/gnome/native-http-runtime/endpoint.test.mjs"' > "$lab/test.log" 2>&1 &
test_pid=$!
wait "$test_pid" || { cat "$lab/test.log"; exit 1; }
cat "$lab/test.log"
python3 "$NIKO_HTTP_REPO/linux/gnome/native-http-runtime/host-fingerprint.py" > "$lab/host-after.json"
cmp "$lab/host-before.json" "$lab/host-after.json"
if rg 'libmutter-CRITICAL|Gtk-CRITICAL|JS ERROR|TypeError|Segmentation fault' "$lab/shell.log"; then exit 1; fi
