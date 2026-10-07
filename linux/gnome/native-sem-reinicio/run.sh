#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
mode=${1:-clean}
[[ "$mode" = clean || "$mode" = loader || "$mode" = migration || "$mode" = candidate || "$mode" = runtime-helper || "$mode" = runtime-helper-clean || "$mode" = legacy-update ]]
lab=$(mktemp -d /tmp/niko-sem-reinicio.XXXXXX)
printf 'Evidence directory: %s\n' "$lab"
mkdir -p "$lab"/{home,runtime,config,data,cache,state,services,origem}
chmod 700 "$lab/home" "$lab/runtime"
cp "$repo/linux/gnome/niko-ilha@local/"{extension.js,metadata.json} "$lab/origem/"
if [[ "$mode" = loader || "$mode" = migration || "$mode" = candidate || "$mode" = runtime-helper ]]; then
    uuid=niko-ilha@local
    if [[ "$mode" = migration || "$mode" = candidate || "$mode" = runtime-helper ]]; then
        legacy="$lab/data/gnome-shell/extensions/niko-ilha@local"
        mkdir -p "$legacy"
        cp "$lab/origem/"{extension.js,metadata.json} "$legacy/"
        python3 - "$legacy/extension.js" <<'PY_LEGACY'
import pathlib,sys
path=pathlib.Path(sys.argv[1])
source=path.read_text().replace('export default class NikoIlha', 'class NikoIlha')
source += """
export default class LegacyProbe extends NikoIlha {
    enable() {
        this._testOriginal = Meta.Display.prototype.get_tab_list;
        super.enable();
        this._testGeneration = (this._testGeneration ?? 0) + 1;
        GLib.file_set_contents(GLib.build_filenamev([GLib.getenv('NIKO_GNOME_LAB'), 'legacy-loaded.json']), JSON.stringify({
            generation: this._testGeneration,
            panelOwned: Main.panel.statusArea[this.uuid] === this._button,
            tabFilterInstalled: Meta.Display.prototype.get_tab_list !== this._testOriginal,
        }));
    }
    disable() {
        super.disable();
        GLib.file_set_contents(GLib.build_filenamev([GLib.getenv('NIKO_GNOME_LAB'), 'legacy-disabled.json']), JSON.stringify({
            generation: this._testGeneration, panelAbsent: !Main.panel.statusArea[this.uuid],
            tabFilterRestored: Meta.Display.prototype.get_tab_list === this._testOriginal,
        }));
    }
}
"""
path.write_text(source)
PY_LEGACY

        uuid=niko-ilha-runtime@local
    fi
    dest="$lab/data/gnome-shell/extensions/$uuid"
    mkdir -p "$dest"
    cp "$repo/linux/gnome/native-sem-reinicio/loader.js" "$dest/extension.js"
    if [[ "$mode" = candidate || "$mode" = runtime-helper ]]; then
        cp "$repo/linux/gnome/candidato-sem-reinicio/extension.js" "$dest/candidate.js"
        cat > "$dest/extension.js" <<'CANDIDATE'
import Loader from './candidate.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class CandidateProbe extends Loader {
    async _load() {
        const generation = (this._generation ?? 0) + 1;
        GLib.file_set_contents(GLib.build_filenamev([GLib.getenv('NIKO_GNOME_LAB'), 'loading.json']), JSON.stringify({generation}));
        await super._load();
        if (!this._enabled || generation !== this._generation || !this._implementationActive) return;
        GLib.file_set_contents(GLib.build_filenamev([GLib.getenv('NIKO_GNOME_LAB'), 'loaded.json']), JSON.stringify({
            generation, revision: this._revision, pid: new Gio.Credentials().get_unix_pid(),
            panelOwned: Main.panel.statusArea[this.uuid] === this._implementation._button,
            legacyPanelAbsent: !Main.panel.statusArea['niko-ilha@local'],
        }));
    }
}
CANDIDATE
    fi
    if [[ "$mode" = runtime-helper ]]; then
        cp "$repo/linux/gnome/candidato-sem-reinicio/extension.js" "$dest/extension.js"
        rm "$dest/candidate.js"
    fi
    cp "$lab/origem/metadata.json" "$dest/metadata.json"
    NIKO_GNOME_MODE="$mode" python3 - "$lab" "$dest" "$uuid" <<'PY'
import hashlib,json,pathlib,sys
lab,dest=map(pathlib.Path,sys.argv[1:3])
metadata=json.loads((dest/'metadata.json').read_text())
metadata['uuid']=sys.argv[3]
if __import__('os').environ.get('NIKO_GNOME_MODE') == 'runtime-helper': metadata['version']=1
(dest/'metadata.json').write_text(json.dumps(metadata))
code=(lab/'origem/extension.js').read_bytes()
name='implementation-'+hashlib.sha256(code).hexdigest()+'.js'
(dest/name).write_bytes(code)
(dest/'current.json').write_text(json.dumps({'file':name}))
PY
fi
if [[ "$mode" = legacy-update ]]; then
    legacy="$lab/data/gnome-shell/extensions/niko-ilha@local"
    mkdir -p "$legacy" "$lab/source/niko-ilha@local"
    cp "$lab/origem/"{extension.js,metadata.json} "$lab/source/niko-ilha@local/"
    cp "$lab/origem/metadata.json" "$legacy/metadata.json"
    python3 - "$legacy/metadata.json" <<'PY_META'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); value=json.loads(p.read_text()); value['version']=1; p.write_text(json.dumps(value))
PY_META
    cat > "$legacy/extension.js" <<'LEGACY'
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
export default class Legacy extends Extension {
    enable() { this.button=new PanelMenu.Button(0,'Fixture ilha antiga'); this.button.add_child(new St.Label({text:'Fixture Niko'})); Main.panel.addToStatusArea(this.uuid,this.button); GLib.file_set_contents(GLib.getenv('NIKO_GNOME_LAB')+'/old-loaded','yes'); }
    disable() {this.button.destroy();}
}
LEGACY
fi
outer="${WAYLAND_DISPLAY:?}"; [[ "$outer" = /* ]] || outer="${XDG_RUNTIME_DIR:?}/$outer"
cat > "$lab/services/org.gnome.Shell.Extensions.service" <<'SERVICE'
[D-BUS Service]
Name=org.gnome.Shell.Extensions
Exec=/usr/bin/gjs -m /usr/share/gnome-shell/org.gnome.Shell.Extensions
SERVICE
cat > "$lab/bus.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=$lab</listen><auth>EXTERNAL</auth><servicedir>$lab/services</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>
XML
export NIKO_GNOME_LAB="$lab" NIKO_GNOME_REPO="$repo" NIKO_GNOME_MODE="$mode"
export NIKO_GNOME_OUTER="$outer" NIKO_GNOME_DISPLAY="${DISPLAY:-}"
exec env -u DBUS_SESSION_BUS_ADDRESS -u APPDATA -u LOCALAPPDATA -u SSH_AUTH_SOCK \
HOME="$lab/home" XDG_RUNTIME_DIR="$lab/runtime" XDG_CONFIG_HOME="$lab/config" \
XDG_DATA_HOME="$lab/data" XDG_CACHE_HOME="$lab/cache" XDG_STATE_HOME="$lab/state" \
GSETTINGS_BACKEND=keyfile GIO_USE_VFS=local NO_AT_BRIDGE=1 GTK_A11Y=none XDG_CURRENT_DESKTOP=GNOME \
dbus-run-session --config-file="$lab/bus.conf" -- bash "$repo/linux/gnome/native-sem-reinicio/session.sh"
