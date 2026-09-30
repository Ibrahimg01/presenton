"""Conservatively copy presentations and referenced assets into site-owned stores.

Unassigned settings, assets, templates and job records remain in the legacy backup.
No source writes. Existing destinations are never overwritten.
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
from pathlib import Path
from urllib.parse import unquote


def migrate(root: Path, apply=False, legacy_temp=None):
    os.umask(0o077)
    root = root.resolve()
    with sqlite3.connect(f'file:{root / "fastapi.db"}?mode=ro', uri=True) as source:
        source.row_factory = sqlite3.Row
        tables = [r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        if any(not re.fullmatch(r'\w+', t) for t in tables):
            raise ValueError('Unexpected table name')
        presentations = [dict(r) for r in source.execute('SELECT * FROM presentations')]
        sites = {str(r['tenant_id']) for r in presentations}
        if not sites or any(not re.fullmatch(r'[1-9][0-9]{0,9}', s) for s in sites):
            raise ValueError('Missing or invalid legacy site ownership')
        plans = []
        for site in sorted(sites):
            destination = root / 'sites' / site
            if destination.exists():
                raise ValueError('Destination already exists: ' + site)
            owned = [r for r in presentations if str(r['tenant_id']) == site]
            ids = {r['id'] for r in owned}
            slides = [dict(r) for r in source.execute('SELECT * FROM slides') if r['presentation'] in ids]
            paths = set()
            supporting = {}
            for row in owned:
                for value in json.loads(row.get('file_paths') or '[]'):
                    if value.startswith('/tmp/presenton/'):
                        relative = Path(value).relative_to('/tmp/presenton')
                        candidate = Path(legacy_temp) / relative if legacy_temp else None
                        if not candidate or '..' in relative.parts or candidate.is_symlink() or not candidate.resolve().is_relative_to(Path(legacy_temp).resolve()) or not candidate.is_file():
                            raise ValueError('Legacy supporting document missing; preserve and review before migration')
                        supporting[value] = (candidate, 'uploads/legacy/' + str(relative))
            def collect(value):
                if isinstance(value, str):
                    try:
                        parsed = json.loads(value)
                    except (ValueError, TypeError):
                        parsed = None
                    if isinstance(parsed, (dict, list)):
                        collect(parsed)
                    for path in re.findall(r'/app_data/[^\s"\'<>\\)]+', value):
                        relative = unquote(path.split('?', 1)[0].split('#', 1)[0][10:])
                        candidate = root / relative
                        if candidate.parts[len(root.parts):][:1] not in [('images',), ('uploads',), ('exports',), ('fonts',)]:
                            raise ValueError('Unexpected referenced storage location')
                        if '..' in Path(relative).parts or candidate.is_symlink() or not candidate.resolve().is_relative_to(root):
                            raise ValueError('Unsafe asset path')
                        if not candidate.is_file():
                            raise ValueError('Missing referenced asset: ' + relative)
                        paths.add(relative)
                elif isinstance(value, dict):
                    for item in value.values(): collect(item)
                elif isinstance(value, list):
                    for item in value: collect(item)
            for row in owned + slides: collect(row)
            assets = []
            if 'imageasset' in tables:
                for row in source.execute('SELECT * FROM imageasset'):
                    if str(row['path']).removeprefix('/app_data/') in paths:
                        assets.append(dict(row))
            plans.append((site, destination, owned, slides, assets, paths, supporting))
        print('Migration plan:', [{'site': p[0], 'presentations': len(p[2]), 'slides': len(p[3]), 'files': len(p[5])} for p in plans])
        if not apply:
            return
        for site, destination, owned, slides, assets, paths, supporting in plans:
            destination.mkdir(parents=True, mode=0o700)
            with sqlite3.connect(destination / 'fastapi.db') as target:
                # Recreate schema without copying other customers' bytes/free pages.
                for row in source.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
                    target.execute(row[0])
                for row in source.execute("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"):
                    target.execute(row[0])
                def rewrite(value):
                    if not isinstance(value, str): return value
                    for old, (_, relative) in supporting.items():
                        value = value.replace(old, '/app_data/' + relative)
                    return value.replace('/app_data/', '/app_data/sites/' + site + '/')
                for table, rows in [('presentations', owned), ('slides', slides), ('imageasset', assets)]:
                    for row in rows:
                        columns = list(row)
                        if any(not re.fullmatch(r'\w+', c) for c in columns): raise ValueError('Invalid column')
                        target.execute('INSERT INTO "' + table + '" (' + ','.join('"' + c + '"' for c in columns) + ') VALUES (' + ','.join('?' for _ in columns) + ')', [rewrite(row[c]) for c in columns])
                assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
                assert target.execute('SELECT count(*) FROM presentations WHERE tenant_id != ?', (site,)).fetchone()[0] == 0
            for relative in paths:
                output = destination / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(root / relative, output)
            for candidate, relative in supporting.values():
                output = destination / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(candidate, output)
        print('Copies complete. Legacy source and unassigned records preserved unchanged.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--legacy-temp', type=Path)
    args = parser.parse_args()
    migrate(args.data_root, args.apply, args.legacy_temp)
