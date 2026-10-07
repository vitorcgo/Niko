#!/usr/bin/env python3
"""Verificação isolada da migração SQLite, incluindo WAL ainda aberto."""
import importlib.util
from pathlib import Path
import sqlite3
import tempfile

spec = importlib.util.spec_from_file_location('migracao', Path(__file__).with_name('migrar-dados-linux.py'))
modulo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modulo)

with tempfile.TemporaryDirectory(prefix='niko-migracao-teste-') as pasta:
    raiz = Path(pasta)
    origem = raiz / 'origem.db'
    destino = raiz / 'perfil' / 'niko.db'
    destino.parent.mkdir()
    outro = destino.parent / 'perfil-webkit.txt'
    outro.write_text('preservado')
    fonte = sqlite3.connect(origem)
    try:
        fonte.execute('PRAGMA journal_mode=WAL')
        fonte.execute('PRAGMA wal_autocheckpoint=0')
        fonte.execute('CREATE TABLE dados (chave TEXT PRIMARY KEY, valor TEXT)')
        fonte.execute('INSERT INTO dados VALUES (?, ?)', ('niko:teste', 'valor-no-wal'))
        fonte.commit()
        assert Path(str(origem) + '-wal').stat().st_size > 0
        backup = modulo.migrar(origem, destino)
        for arquivo in (backup, destino):
            with sqlite3.connect(arquivo) as banco:
                assert banco.execute('PRAGMA integrity_check').fetchone() == ('ok',)
                assert banco.execute('SELECT valor FROM dados').fetchone() == ('valor-no-wal',)
        assert backup.stat().st_ino != destino.stat().st_ino
        with sqlite3.connect(destino) as banco:
            banco.execute("UPDATE dados SET valor='alterado-no-destino'")
        with sqlite3.connect(backup) as banco:
            assert banco.execute('SELECT valor FROM dados').fetchone() == ('valor-no-wal',)
        try:
            modulo.migrar(origem, destino)
        except FileExistsError:
            pass
        else:
            raise AssertionError('migração sobrescreveu destino existente')
        with sqlite3.connect(destino) as banco:
            assert banco.execute('SELECT valor FROM dados').fetchone() == ('alterado-no-destino',)
        assert fonte.execute('SELECT valor FROM dados').fetchone() == ('valor-no-wal',)
        assert outro.read_text() == 'preservado'
        for sufixo in ('-wal', '-shm', '-journal'):
            reservado = destino.parent / ('reservado' + sufixo)
            reservado.write_bytes(b'preservar')
            try:
                modulo.migrar(origem, destino.parent / 'reservado')
            except FileExistsError:
                pass
            else:
                raise AssertionError(f'migração ignorou {sufixo} existente')
            assert reservado.read_bytes() == b'preservar'
    finally:
        fonte.close()
print('OK: WAL ativo, integridade, backup independente, recusas e arquivos preservados')
