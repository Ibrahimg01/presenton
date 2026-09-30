"""Resolve only public addresses and pin aiohttp connections to those results."""
import ipaddress
import socket
from urllib.parse import urlsplit
from aiohttp.abc import AbstractResolver
from aiohttp.resolver import DefaultResolver

class PublicResolver(AbstractResolver):
    def __init__(self): self.resolver = DefaultResolver()
    async def resolve(self, host, port=0, family=socket.AF_INET):
        results = await self.resolver.resolve(host, port, family)
        if not results or any(not ipaddress.ip_address(r['host']).is_global for r in results):
            raise ValueError('Private network destinations are not allowed')
        return results
    async def close(self): await self.resolver.close()

def validate_public_url(url):
    parsed=urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Public HTTPS asset required')
    try: address=ipaddress.ip_address(parsed.hostname)
    except ValueError: return url
    if not address.is_global: raise ValueError('Private network destinations are not allowed')
    return url
