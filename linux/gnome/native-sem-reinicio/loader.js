// Protótipo de laboratório: não distribuído nem usado pela instalação do Niko.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class Loader extends Extension {
    enable() {
        void this._load().catch(error => console.error(`NIKO laboratory load failed: ${error.message}`));
    }
    async _load() {
        const generation = this._generation = (this._generation ?? 0) + 1;
        this._enabled = true;
        GLib.file_set_contents(GLib.build_filenamev([GLib.getenv('NIKO_GNOME_LAB'), 'loading.json']), JSON.stringify({generation}));
        const manifest = JSON.parse(new TextDecoder().decode(this.dir.get_child('current.json').load_contents(null)[1]));
        if (!/^implementation-[a-f0-9]{64}\.js$/.test(manifest.file)) throw new Error('invalid payload');
        try {
            const file = this.dir.get_child(manifest.file);
            const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            if (info.get_file_type() !== Gio.FileType.REGULAR) throw new Error('invalid payload file');
            const bytes = file.load_contents(null)[1];
            const hash = GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes);
            if (manifest.file !== `implementation-${hash}.js`) throw new Error('payload hash mismatch');
            const module = await import(file.get_uri());
            if (!this._enabled || generation !== this._generation) return;
            const candidate = new module.default({...this.metadata, dir: this.dir, path: this.path});
            try { candidate.enable(); }
            catch (error) { candidate.disable(); throw error; }
            this._implementation = candidate;
            this._implementationActive = true;
            this._revision = manifest.file;
        } catch (error) {
            if (!this._enabled || generation !== this._generation) return;
            if (!this._implementation) throw error;
            this._implementation.enable();
            this._implementationActive = true;
            console.warn(`NIKO laboratory rollback: ${error.message}`);
        }
        GLib.file_set_contents(GLib.build_filenamev([GLib.getenv('NIKO_GNOME_LAB'), 'loaded.json']), JSON.stringify({
            generation, revision: this._revision, pid: new Gio.Credentials().get_unix_pid(),
            panelOwned: Main.panel.statusArea[this.uuid] === this._implementation._button,
            legacyPanelAbsent: this.uuid === 'niko-ilha-runtime@local' ? !Main.panel.statusArea['niko-ilha@local'] : null,
        }));
    }
    disable() {
        this._enabled = false;
        this._generation = (this._generation ?? 0) + 1;
        if (this._implementationActive) {
            this._implementationActive = false;
            this._implementation.disable();
        }
    }
}
