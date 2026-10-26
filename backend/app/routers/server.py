import socket
from typing import Optional

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/server", tags=["Server"])


def get_lan_ip() -> Optional[str]:
    # Connecting a UDP socket sends no packet; it only picks the interface the
    # OS would route through, i.e. the address phones on the router can reach.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
    except OSError:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except OSError:
            return None
    return None if ip.startswith("127.") else ip


@router.get("/info")
def get_server_info(request: Request):
    """LAN address of this server, for the QR codes on monitor and match sheets."""
    ip = get_lan_ip()
    port = request.url.port or 8000
    return {"lan_url": f"http://{ip}:{port}" if ip else None}
