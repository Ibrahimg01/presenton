from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from fastapi import Request

from utils.ai_usage_tracker import (
    CALLBACK_SECRET_CONTEXT,
    CALLBACK_URL_CONTEXT,
    SITE_URL_CONTEXT,
)
from utils.get_env import get_can_change_keys_env
from utils.user_config import update_env_with_user_config


class UserConfigEnvUpdateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if get_can_change_keys_env() != "false":
            update_env_with_user_config()
        return await call_next(request)


class CallbackContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        callback_url_token = CALLBACK_URL_CONTEXT.set(
            request.query_params.get("callback_url")
        )
        callback_secret_token = CALLBACK_SECRET_CONTEXT.set(
            request.query_params.get("callback_secret")
        )
        site_url_token = SITE_URL_CONTEXT.set(request.query_params.get("site_url"))

        try:
            response: Response = await call_next(request)
        finally:
            CALLBACK_URL_CONTEXT.reset(callback_url_token)
            CALLBACK_SECRET_CONTEXT.reset(callback_secret_token)
            SITE_URL_CONTEXT.reset(site_url_token)

        return response
