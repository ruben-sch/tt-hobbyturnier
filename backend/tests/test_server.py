import socket

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routers import server


class FakeSocket:
    def __init__(self, ip=None, error=False):
        self.ip = ip
        self.error = error

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def connect(self, addr):
        if self.error:
            raise OSError("no route")

    def getsockname(self):
        return (self.ip, 12345)


def test_server_info_returns_lan_url_with_request_port(monkeypatch):
    monkeypatch.setattr(server, "get_lan_ip", lambda: "192.168.8.10")
    res = TestClient(app, base_url="http://localhost:8000").get("/api/server/info")
    assert res.status_code == 200
    assert res.json() == {"lan_url": "http://192.168.8.10:8000"}


def test_server_info_without_lan_ip(monkeypatch):
    monkeypatch.setattr(server, "get_lan_ip", lambda: None)
    res = TestClient(app).get("/api/server/info")
    assert res.json() == {"lan_url": None}


def test_get_lan_ip_uses_routed_interface(monkeypatch):
    monkeypatch.setattr(socket, "socket", lambda *a: FakeSocket(ip="10.0.0.5"))
    assert server.get_lan_ip() == "10.0.0.5"


def test_get_lan_ip_falls_back_to_hostname(monkeypatch):
    monkeypatch.setattr(socket, "socket", lambda *a: FakeSocket(error=True))
    monkeypatch.setattr(socket, "gethostbyname", lambda name: "192.168.1.20")
    assert server.get_lan_ip() == "192.168.1.20"


def test_get_lan_ip_ignores_loopback(monkeypatch):
    monkeypatch.setattr(socket, "socket", lambda *a: FakeSocket(error=True))
    monkeypatch.setattr(socket, "gethostbyname", lambda name: "127.0.1.1")
    assert server.get_lan_ip() is None


def test_get_lan_ip_without_any_address(monkeypatch):
    def fail(name):
        raise OSError("unknown host")
    monkeypatch.setattr(socket, "socket", lambda *a: FakeSocket(error=True))
    monkeypatch.setattr(socket, "gethostbyname", fail)
    assert server.get_lan_ip() is None
