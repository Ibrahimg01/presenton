from urllib.parse import parse_qsl, urlencode
from starlette.responses import JSONResponse
from utils.site_context import enabled, verify_identity, SITE_IDENTITY

class SiteIdentityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not enabled():
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            if headers.get(b"sec-fetch-site") == b"cross-site":
                raise ValueError()
            identity = verify_identity(headers.get(b"x-presenton-identity", b"").decode())
            site = str(identity["site"])
            query = parse_qsl(scope.get("query_string", b"").decode(), keep_blank_values=True)
            if any(k == "tenant" and v != site for k, v in query):
                raise ValueError()
        except (ValueError, UnicodeError):
            return await JSONResponse({"error": "Verified site access required"}, status_code=403)(scope, receive, send)
        scope = dict(scope)
        scope["query_string"] = urlencode([(k,v) for k,v in query if k != "tenant"] + [("tenant", site)]).encode()
        token = SITE_IDENTITY.set(identity)
        try:
            import re
            paid = re.search(r"^/api/v1/ppt/(images/generate|slide/edit|outlines/stream/|presentation/(stream/|generate|edit|derive))", scope["path"])
            if paid:
                from utils.site_usage import reserve_operation
                if not reserve_operation():
                    return await JSONResponse({"error":"Daily site generation limit reached"}, status_code=429)(scope, receive, send)
            await self.app(scope, receive, send)
        finally:
            SITE_IDENTITY.reset(token)
