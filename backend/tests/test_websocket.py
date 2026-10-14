import asyncio

from backend.app.websocket_hub import ConnectionManager


class FakeSocket:
    def __init__(self, fail=False):
        self.fail = fail
        self.sent = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_text(self, text):
        if self.fail:
            raise RuntimeError("closed")
        self.sent.append(text)


def test_broadcast_reaches_clients_and_drops_dead_ones():
    manager = ConnectionManager()
    alive, dead = FakeSocket(), FakeSocket(fail=True)

    async def scenario():
        await manager.broadcast({"type": "IGNORED"})  # no clients: nothing to do
        await manager.connect(alive)
        await manager.connect(dead)
        await manager.broadcast({"type": "TEAMS_UPDATED"})

    asyncio.run(scenario())

    assert alive.accepted
    assert alive.sent == ['{"type": "TEAMS_UPDATED"}']
    assert manager.active_connections == [alive]

    manager.disconnect(alive)
    manager.disconnect(alive)  # unknown socket is ignored
    assert manager.active_connections == []


def test_websocket_endpoint_registers_and_removes_client(client):
    from backend.app.websocket_hub import ws_manager

    with client.websocket_connect("/ws") as ws:
        ws.send_text("ping")
        assert len(ws_manager.active_connections) == 1
    # Closing the socket unregisters it on the server
    for _ in range(50):
        if not ws_manager.active_connections:
            break
        asyncio.run(asyncio.sleep(0.01))
    assert ws_manager.active_connections == []
