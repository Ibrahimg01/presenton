"""Server-side per-site usage ledger and a conservative operation limit."""
import os
import sqlite3
import time
from pathlib import Path
from utils.site_context import current_site, site_data_root

def connection():
    root=Path(site_data_root());root.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(str(root/'usage.db'),timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS usage (at INTEGER NOT NULL, tokens INTEGER NOT NULL, source TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS operations (day INTEGER PRIMARY KEY, count INTEGER NOT NULL)')
    return db

def reserve_operation():
    maximum=int(os.getenv('PRESENTON_DAILY_SITE_OPERATIONS','100'))
    if maximum<1: raise ValueError('A positive site operation limit is required')
    db=connection()
    try:
        db.execute('BEGIN IMMEDIATE')
        day=int(time.time())//86400
        row=db.execute('SELECT count FROM operations WHERE day=?',(day,)).fetchone()
        if row and row[0]>=maximum:
            db.rollback();return False
        db.execute('INSERT INTO operations(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1',(day,))
        db.commit();return True
    finally:db.close()

def record_tokens(tokens,source):
    db=connection()
    try:
        db.execute('INSERT INTO usage(at,tokens,source) VALUES (?,?,?)',(int(time.time()),max(0,int(tokens)),str(source)[:120]));db.commit()
    finally:db.close()
