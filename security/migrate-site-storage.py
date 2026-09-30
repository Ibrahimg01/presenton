"""Copy a single-site legacy store into isolated storage; never alter the source."""
import argparse
import json
import shutil
import sqlite3
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--data-root',type=Path,required=True)
parser.add_argument('--legacy-site',required=True)
parser.add_argument('--apply',action='store_true')
parser.add_argument('--stored-root',default='/app_data')
args=parser.parse_args()
if not args.legacy_site.isdecimal() or int(args.legacy_site)<1:raise SystemExit('A numeric WordPress site ID is required')
root=args.data_root.resolve();destination=root/'sites'/args.legacy_site
source=root/'fastapi.db'
with sqlite3.connect(f'file:{source}?mode=ro',uri=True) as db:
    sites={str(row[0]) for row in db.execute('SELECT DISTINCT tenant_id FROM presentations')}
    if sites != {args.legacy_site}:raise SystemExit('Legacy data is not exclusively assigned to this site; manual ownership migration required')
    count=db.execute('SELECT count(*) FROM presentations').fetchone()[0]
    print(f'Validated {count} presentation(s) belonging only to site {args.legacy_site}.')
    if not args.apply:raise SystemExit('Dry run only. Original data unchanged.')
    if destination.exists():raise SystemExit('Destination already exists; refusing to overwrite')
    destination.mkdir(parents=True,mode=0o700)
    target=sqlite3.connect(destination/'fastapi.db');db.backup(target);target.close()
for directory in ['images','uploads','exports','fonts']:
    if (root/directory).is_dir():
        if any(p.is_symlink() for p in (root/directory).rglob('*')):raise SystemExit('Symlink in legacy assets; manual review required')
        shutil.copytree(root/directory,destination/directory,symlinks=False)
old=args.stored_root.rstrip('/')+'/'
new=old+'sites/'+args.legacy_site+'/'
def rewrite(value):
    if isinstance(value,str):return value.replace(old,new)
    if isinstance(value,list):return [rewrite(x) for x in value]
    if isinstance(value,dict):return {k:rewrite(v) for k,v in value.items()}
    return value
with sqlite3.connect(destination/'fastapi.db') as db:
    tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    for table in tables:
        if not table.replace('_','').isalnum():raise SystemExit('Unexpected table name')
        columns=[r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
        for row in db.execute(f'SELECT rowid,* FROM "{table}"').fetchall():
            for index,value in enumerate(row[1:]):
                if not isinstance(value,str) or old not in value:continue
                try:updated=json.dumps(rewrite(json.loads(value)))
                except (ValueError,TypeError):updated=value.replace(old,new)
                column=columns[index]
                if not column.replace('_','').isalnum():raise SystemExit('Unexpected column name')
                db.execute(f'UPDATE "{table}" SET "{column}"=? WHERE rowid=?',(updated,row[0]))
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('Isolated copy created; original database and files preserved.')
