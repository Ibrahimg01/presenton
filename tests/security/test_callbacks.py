import os
import sys
from pathlib import Path
import asyncio
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'servers/fastapi'))
from api.middlewares import CallbackContextMiddleware
from utils.ai_usage_tracker import get_callback_context, report_usage_to_wordpress


def test_browser_cannot_override_callback_destination_or_secret(monkeypatch):
    monkeypatch.setenv('PRESENTON_USAGE_CALLBACK_URL', 'https://wordpress.example.test/usage')
    monkeypatch.setenv('PRESENTON_USAGE_CALLBACK_SECRET', 's' * 40)
    app = FastAPI()
    app.add_middleware(CallbackContextMiddleware)
    @app.get('/')
    async def view():
        return get_callback_context()
    with TestClient(app) as client:
        response=client.get('/?callback_url=https://attacker.example.test&callback_secret=leak&site_url=bad')
    assert response.json() == {'callback_url':'https://wordpress.example.test/usage','callback_secret':'s'*40,'site_url':None}
    assert get_callback_context()['callback_secret'] is None


def test_missing_callback_configuration_does_not_use_query_values(monkeypatch):
    monkeypatch.delenv('PRESENTON_USAGE_CALLBACK_URL',raising=False)
    monkeypatch.delenv('PRESENTON_USAGE_CALLBACK_SECRET',raising=False)
    app=FastAPI()
    app.add_middleware(CallbackContextMiddleware)
    @app.get('/')
    async def view():
        return get_callback_context()
    with TestClient(app) as client:
        assert client.get('/?callback_url=https://attacker.example.test&callback_secret=leak').json()['callback_url'] is None


def test_callback_rejects_unsafe_or_missing_configuration_without_network(monkeypatch):
    def forbidden(*args,**kwargs):
        raise AssertionError('No network request should be made')
    monkeypatch.setattr(httpx,'AsyncClient',forbidden)
    for url, secret in [('https://example.test',None),('https://example.test','short'),('http://example.test','s'*40),('https://user:pass@example.test','s'*40)]:
        assert asyncio.run(report_usage_to_wordpress(url,secret,1,0.01)) is False

def test_cross_origin_browser_mutations_are_rejected():
    app=FastAPI()
    app.add_middleware(CallbackContextMiddleware)
    @app.post('/')
    async def change(): return {'changed': True}
    with TestClient(app) as client:
        assert client.post('/', headers={'Origin':'https://attacker.example.test'}).status_code == 403
        assert client.post('/', headers={'Origin':'null'}).status_code == 403
        assert client.post('/', headers={'Sec-Fetch-Site':'cross-site'}).status_code == 403
        assert client.post('/', headers={'Origin':'https://testserver'}).status_code == 200
        assert client.post('/').status_code == 200
