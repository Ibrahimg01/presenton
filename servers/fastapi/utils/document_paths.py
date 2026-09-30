from pathlib import Path
from fastapi import HTTPException
from utils.get_env import get_temp_directory_env


def validate_document_path(value: str) -> str:
    try:
        root = Path(get_temp_directory_env() or '/tmp/presenton').resolve(strict=True)
        candidate = Path(value)
        if not candidate.is_absolute() or root in (Path('/'), Path('/tmp'), Path('/private/tmp')):
            raise ValueError()
        resolved = candidate.resolve(strict=True)
        if root not in resolved.parents or not resolved.is_file():
            raise ValueError()
        if resolved.suffix.lower() not in {'.txt', '.pdf', '.docx', '.doc', '.pptx', '.ppt'}:
            raise ValueError()
        if resolved.stat().st_size > 100 * 1024 * 1024:
            raise ValueError()
        return str(resolved)
    except (ValueError, OSError, TypeError):
        raise HTTPException(status_code=403, detail='Document path is not allowed')
