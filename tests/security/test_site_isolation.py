import asyncio, base64, hashlib, hmac, json, os
from pathlib import Path
import pytest
from utils.site_context import verify_identity, SITE_IDENTITY, current_site, require_owned_path

def token(payload,key=b'test-key-only-32-bytes-long-enough'):
    body=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    return body+'.'+base64.urlsafe_b64encode(hmac.new(key,body.encode(),hashlib.sha256).digest()).decode().rstrip('=')

def test_identity_cannot_be_forged_or_expired():
    key=b'test-key-only-32-bytes-long-enough'; p={'aud':'presenton-site','site':'1','user':'7','exp':1500}
    assert verify_identity(token(p),key,1000)['site']=='1'
    for changes in [{'site':'all'},{'site':'../2'},{'user':'0'},{'exp':1000},{'exp':1700},{'aud':'other'}]:
        with pytest.raises(ValueError):verify_identity(token(p|changes),key,1000)
    with pytest.raises(ValueError):verify_identity(token(p),b'other-key-with-sufficient-length-32',1000)

def test_files_cannot_cross_sites_or_follow_symlinks(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_DATA_DIRECTORY',str(tmp_path));monkeypatch.setenv('TEMP_DIRECTORY',str(tmp_path/'temp'))
    a=tmp_path/'sites/1/images';b=tmp_path/'sites/2/images';a.mkdir(parents=True);b.mkdir(parents=True)
    (a/'own.png').write_bytes(b'a');(b/'other.png').write_bytes(b'b');(a/'link.png').symlink_to(b/'other.png')
    reset=SITE_IDENTITY.set({'site':'1','user':'7'})
    try:
        assert require_owned_path(str(a/'own.png'))==str(a/'own.png')
        for value in [b/'other.png',a/'link.png',a/'../../2/images/other.png']:
            with pytest.raises(ValueError):require_owned_path(str(value))
    finally:SITE_IDENTITY.reset(reset)

def test_databases_isolate_all_model_types_and_concurrent_contexts(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_DATA_DIRECTORY',str(tmp_path));monkeypatch.setenv('PRESENTON_CUSTOMER_ACCESS','1')
    from services.database import get_async_session, _site_engines
    from models.sql.key_value import KeyValueSqlModel
    from models.sql.image_asset import ImageAsset
    from sqlmodel import select
    _site_engines.clear()
    async def work(site):
        reset=SITE_IDENTITY.set({'site':site,'user':'7'})
        try:
            async for s in get_async_session():
                s.add(KeyValueSqlModel(key='site',value={'owner':site}));s.add(ImageAsset(path=site+'.png'))
                await s.commit(); await asyncio.sleep(0)
                values=(await s.scalars(select(KeyValueSqlModel))).all()
                images=(await s.scalars(select(ImageAsset))).all()
                assert len(values)==len(images)==1 and values[0].value['owner']==site and images[0].path==site+'.png'
        finally:SITE_IDENTITY.reset(reset)
    async def run():await asyncio.gather(work('101'),work('102'))
    asyncio.run(run())
    with pytest.raises(ValueError):current_site()

def test_usage_limit_is_per_site_and_persists(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_DATA_DIRECTORY',str(tmp_path));monkeypatch.setenv('PRESENTON_DAILY_SITE_OPERATIONS','2')
    from utils.site_usage import reserve_operation,record_tokens
    for site in ['1','2']:
        reset=SITE_IDENTITY.set({'site':site,'user':'7'})
        try:
            assert reserve_operation() and reserve_operation() and not reserve_operation()
            record_tokens(123,'test')
        finally:SITE_IDENTITY.reset(reset)
