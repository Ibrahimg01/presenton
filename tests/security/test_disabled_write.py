import ast
from pathlib import Path
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.testclient import TestClient

def test_legacy_write_endpoint_cannot_modify_a_file(tmp_path):
    # Load the actual endpoint without importing unrelated document/ML packages.
    source=Path(__file__).resolve().parents[2]/'servers/fastapi/api/v1/ppt/endpoints/files.py'
    module=ast.parse(source.read_text())
    function=next(n for n in module.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='update_files')
    router=APIRouter()
    namespace={'FILES_ROUTER':router,'HTTPException':HTTPException}
    exec(compile(ast.Module(body=[function],type_ignores=[]),str(source),'exec'),namespace)
    app=FastAPI();app.include_router(router)
    target=tmp_path/'protected.txt';target.write_text('original')
    with TestClient(app) as client:
        for payload in [{},{'file_path':str(target),'content':'overwrite'},[{'file_path':str(target),'content':'overwrite'}]]:
            assert client.post('/update',json=payload).status_code==410
    assert target.read_text()=='original'
