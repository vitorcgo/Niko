import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BUS = 'com.niko.Ilha.Integracao';
const PATH = '/com/niko/Ilha/Integracao';
const XML = `<node><interface name="${BUS}">
<property name="State" type="s" access="read"/>
<property name="Revision" type="s" access="read"/>
<property name="Generation" type="u" access="read"/>
<property name="LastError" type="s" access="read"/>
</interface></node>`;

export default class NikoLoader extends Extension {
    enable() {
        const busEpoch = this._busEpoch = (this._busEpoch ?? 0) + 1;
        this._enabled = true;
        this._state = 'loading';
        this._error = '';
        this._dbus = Gio.DBusExportedObject.wrapJSObject(XML, {
            get State() { return this.loader._state; },
            get Revision() { return this.loader._revision ?? ''; },
            get Generation() { return this.loader._generation ?? 0; },
            get LastError() { return this.loader._error; },
            loader: this,
        });
        this._dbus.export(Gio.DBus.session, PATH);
        this._owner = Gio.bus_own_name(Gio.BusType.SESSION, BUS, Gio.BusNameOwnerFlags.NONE,
            null, null, () => {
                if (!this._enabled || busEpoch !== this._busEpoch) return;
                this._generation = (this._generation ?? 0) + 1;
                this._state = 'error';
                this._error = 'bus_unavailable';
                if (this._implementationActive) {
                    this._implementationActive = false;
                    try { this._implementation.disable(); }
                    catch { this._error = 'cleanup_failed'; }
                }
            });
        void this._load();
    }

    _read(name, maximum) {
        const file = this.dir.get_child(name);
        const info = file.query_info('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > maximum)
            throw new Error('invalid_file');
        const bytes = file.load_contents(null)[1];
        if (bytes.length > maximum) throw new Error('invalid_file');
        return {file, bytes};
    }

    async _load() {
        const generation = this._generation = (this._generation ?? 0) + 1;
        try {
            const manifest = JSON.parse(new TextDecoder().decode(this._read('current.json', 1024).bytes));
            if (!/^implementation-[a-f0-9]{64}\.js$/.test(manifest.file)) throw new Error('invalid_manifest');
            const {file, bytes} = this._read(manifest.file, 128 * 1024);
            const hash = GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes);
            if (manifest.file !== `implementation-${hash}.js`) throw new Error('invalid_hash');
            // O instalador deve criar arquivos imutáveis por hash, nunca sobrescrever uma URI importada.
            const module = await import(file.get_uri());
            if (!this._enabled || generation !== this._generation) return;
            const candidate = new module.default({...this.metadata, dir: this.dir, path: this.path});
            try { candidate.enable(); }
            catch (error) { candidate.disable(); throw error; }
            this._implementation = candidate;
            this._implementationActive = true;
            this._revision = manifest.file;
            this._state = 'active';
        } catch (error) {
            if (!this._enabled || generation !== this._generation) return;
            this._error = ['invalid_file', 'invalid_manifest', 'invalid_hash'].includes(error.message)
                ? error.message : 'load_failed';
            this._state = 'error';
            if (this._implementation) {
                try {
                    this._implementation.enable();
                    this._implementationActive = true;
                    this._state = 'rollback';
                } catch { this._error = 'rollback_failed'; }
            }
        }
    }

    disable() {
        this._busEpoch = (this._busEpoch ?? 0) + 1;
        this._enabled = false;
        this._generation = (this._generation ?? 0) + 1;
        try {
            if (this._implementationActive) {
                this._implementationActive = false;
                this._implementation.disable();
            }
        } finally {
            this._dbus?.unexport();
            this._dbus = null;
            if (this._owner) Gio.bus_unown_name(this._owner);
            this._owner = 0;
            this._state = 'disabled';
        }
    }
}
