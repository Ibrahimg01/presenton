import importlib.util
import json
import sqlite3
from pathlib import Path

spec = importlib.util.spec_from_file_location('migration', Path(__file__).parents[2] / 'security/migrate-multisite-storage.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def test_migration_keeps_other_site_records_and_assets_out(tmp_path):
    (tmp_path / 'images').mkdir()
    for name in ['one', 'two', 'orphan']:
        (tmp_path / 'images' / (name + '.png')).write_bytes(name.encode())
    with sqlite3.connect(tmp_path / 'fastapi.db') as db:
        db.executescript('CREATE TABLE presentations(id TEXT PRIMARY KEY, tenant_id TEXT, content TEXT); CREATE TABLE slides(id TEXT, presentation TEXT, content TEXT); CREATE TABLE imageasset(id TEXT,path TEXT); CREATE TABLE keyvaluesqlmodel(key TEXT,value TEXT);')
        for site, name in [('1', 'one'), ('2', 'two')]:
            db.execute('INSERT INTO presentations VALUES(?,?,?)', (name, site, name))
            db.execute('INSERT INTO slides VALUES(?,?,?)', (name, name, json.dumps({'image': '/app_data/images/' + name + '.png'})))
            db.execute('INSERT INTO imageasset VALUES(?,?)', (name, '/app_data/images/' + name + '.png'))
        db.execute('INSERT INTO keyvaluesqlmodel VALUES(?,?)', ('global', 'private'))
    before = (tmp_path / 'fastapi.db').read_bytes()
    migration.migrate(tmp_path, True)
    assert (tmp_path / 'fastapi.db').read_bytes() == before
    with sqlite3.connect(tmp_path / 'sites/1/fastapi.db') as db:
        assert db.execute('SELECT id FROM presentations').fetchall() == [('one',)]
        assert db.execute('SELECT count(*) FROM keyvaluesqlmodel').fetchone()[0] == 0
        assert '/app_data/sites/1/images/one.png' in db.execute('SELECT content FROM slides').fetchone()[0]
    assert (tmp_path / 'sites/1/images/one.png').exists()
    assert not (tmp_path / 'sites/1/images/two.png').exists()
    assert not (tmp_path / 'sites/1/images/orphan.png').exists()
    import pytest
    with pytest.raises(ValueError, match='already exists'):
        migration.migrate(tmp_path, True)
