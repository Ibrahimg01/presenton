import os
import sys
import importlib
from pathlib import Path
import pytest


def test_upload_paths_cannot_escape_the_document_directory(tmp_path,monkeypatch):
    root=tmp_path/'documents'
    monkeypatch.setenv('TEMP_DIRECTORY',str(root))
    sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'servers/fastapi'))
    module=importlib.import_module('services.temp_file_service')
    service=module.TempFileService()
    folder=service.create_temp_dir('batch')
    assert Path(service.create_temp_file_path('document.txt',folder)).is_relative_to(root)
    for name in ['../secret','/tmp/secret','a/b.txt','a\\b.txt','..','']:
        with pytest.raises(ValueError): service.create_temp_file_path(name,folder)
    with pytest.raises(ValueError): service.create_temp_file_path('document.txt',str(tmp_path))
    outside=tmp_path/'private.txt';outside.write_text('private')
    (Path(folder)/'link.txt').symlink_to(outside)
    with pytest.raises(ValueError): service.create_temp_file_path('link.txt',folder)
