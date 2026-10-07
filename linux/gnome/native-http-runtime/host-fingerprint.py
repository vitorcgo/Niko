import hashlib
import json
from pathlib import Path

base = Path('/usr/share/niko/gnome')
files = {str(p.relative_to(base)): hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted(base.rglob('*')) if p.is_file()}
print(json.dumps({'exists': base.exists(), 'files': files}, sort_keys=True))
