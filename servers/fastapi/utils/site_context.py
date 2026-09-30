"""Request identity established by the trusted gateway, never by tenant query input."""
import base64
import hashlib
import hmac
import json
import os
import re
import time
from contextvars import ContextVar
from pathlib import Path

SITE_IDENTITY = ContextVar("presenton_site_identity", default=None)

def enabled():
    return os.getenv("PRESENTON_CUSTOMER_ACCESS") == "1"

def verify_identity(token, key=None, now=None):
    try:
        if not isinstance(token, str) or len(token) > 4096:
            raise ValueError()
        body, signature = token.split(".")
        key = key or Path("/run/presenton/site-signing-key").read_bytes()
        if len(key) < 32:
            raise ValueError()
        expected = base64.urlsafe_b64encode(hmac.new(key, body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(expected, signature):
            raise ValueError()
        identity = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        now = int(time.time()) if now is None else now
        if identity.get("aud") != "presenton-site" or not re.fullmatch(r"[1-9][0-9]{0,9}", str(identity.get("site", ""))):
            raise ValueError()
        if not re.fullmatch(r"[1-9][0-9]{0,19}", str(identity.get("user", ""))):
            raise ValueError()
        if type(identity.get("exp")) is not int or not now < identity["exp"] <= now + 600:
            raise ValueError()
        return identity
    except (ValueError, TypeError, KeyError, OSError, UnicodeError):
        raise ValueError("Verified site identity required") from None

def current_site():
    identity = SITE_IDENTITY.get()
    if not identity:
        raise ValueError("Verified site identity required")
    return str(identity["site"])

def site_data_root():
    return str(Path(os.getenv("APP_DATA_DIRECTORY") or "/app_data") / "sites" / current_site())

def site_temp_root():
    return str(Path(os.getenv("TEMP_DIRECTORY") or "/tmp/presenton") / "sites" / current_site())

def require_owned_path(value, *, must_exist=True):
    candidate = Path(value).resolve(strict=must_exist)
    roots = [Path(site_data_root()).resolve(), Path(site_temp_root()).resolve()]
    if not any(root in candidate.parents for root in roots):
        raise ValueError("File does not belong to the current site")
    return str(candidate)


def render_headers():
    if not enabled():
        return {}
    identity = dict(SITE_IDENTITY.get() or {})
    identity["exp"] = int(time.time()) + 300
    body = base64.urlsafe_b64encode(json.dumps(identity).encode()).decode().rstrip("=")
    key = Path("/run/presenton/site-signing-key").read_bytes()
    signature = base64.urlsafe_b64encode(hmac.new(key, body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return {"Cookie": "presenton_render=" + body + "." + signature}
