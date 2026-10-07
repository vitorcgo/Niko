#!/usr/bin/env python3
"""Migra apenas SQLite; preserva origem e arquivos existentes do perfil WebKit."""
import argparse
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile


def migrar(origem: Path, destino: Path) -> Path:
    if not origem.is_file() or origem.resolve() == destino.resolve():
        raise ValueError('Origem ausente ou igual ao destino')
    if any(Path(str(destino) + sufixo).exists() for sufixo in ('', '-wal', '-shm', '-journal')):
        raise FileExistsError('Destino SQLite já existe; nenhuma substituição permitida')
    destino.parent.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='migracao-linux-', dir=destino.parent))
    os.chmod(backup, 0o700)
    copia = backup / 'niko.db'
    with sqlite3.connect(origem.resolve().as_uri() + '?mode=ro', uri=True) as fonte:
        with sqlite3.connect(copia) as banco:
            fonte.backup(banco)
            if banco.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Backup SQLite não íntegro')
    os.chmod(copia, 0o600)
    with copia.open('rb') as arquivo:
        os.fsync(arquivo.fileno())
    # link cria o destino atomicamente e recusa sobrescrita, inclusive numa corrida.
    preparada = backup / "destino.db"
    shutil.copyfile(copia, preparada)
    os.chmod(preparada, 0o600)
    with preparada.open("rb") as arquivo:
        os.fsync(arquivo.fileno())
    os.link(preparada, destino)
    preparada.unlink()
    for pasta in (backup, destino.parent):
        fd = os.open(pasta, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    return copia


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('origem', type=Path)
    parser.add_argument('destino', type=Path)
    args = parser.parse_args()
    print('Backup preservado:', migrar(args.origem, args.destino))
