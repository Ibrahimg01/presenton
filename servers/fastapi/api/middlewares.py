from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse
from urllib.parse import urlparse
from fastapi import Request
import os

from utils.ai_usage_tracker import (
    CALLBACK_SECRET_CONTEXT,
    CALLBACK_URL_CONTEXT,
    SITE_URL_CONTEXT,
)


class CallbackContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            try:
                wrong_origin = bool(origin and urlparse(origin).netloc != request.headers.get("host"))
            except ValueError:
                wrong_origin = True
            if wrong_origin or request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"error": "Same-origin requests required"}, status_code=403)
        callback_url_token = CALLBACK_URL_CONTEXT.set(
            os.getenv("PRESENTON_USAGE_CALLBACK_URL")
        )
        callback_secret_token = CALLBACK_SECRET_CONTEXT.set(
            os.getenv("PRESENTON_USAGE_CALLBACK_SECRET")
        )
        site_url_token = SITE_URL_CONTEXT.set(None)

        try:
            response: Response = await call_next(request)
        finally:
            CALLBACK_URL_CONTEXT.reset(callback_url_token)
            CALLBACK_SECRET_CONTEXT.reset(callback_secret_token)
            SITE_URL_CONTEXT.reset(site_url_token)

        return response
