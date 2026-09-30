from pathlib import Path
import sys
import pytest
from fastapi import HTTPException
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'servers/fastapi'))
from utils.document_paths import validate_document_path

def test_document_loader_rejects_secrets_and_paths_outside_uploads(tmp_path, monkeypatch):
    root = tmp_path / 'documents'; root.mkdir()
    monkeypatch.setenv('TEMP_DIRECTORY', str(root))
    good=root/'notes.txt';good.write_text('notes')
    secret=root/'userConfig.json';secret.write_text('{}')
    outside=tmp_path/'private.txt';outside.write_text('private')
    (root/'link.txt').symlink_to(outside)
    assert validate_document_path(str(good)) == str(good)
    for path in [secret, outside, root/'link.txt', root/'../private.txt', root, Path('notes.txt')]:
        with pytest.raises(HTTPException) as error: validate_document_path(str(path))
        assert error.value.status_code == 403
