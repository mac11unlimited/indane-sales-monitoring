from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import traceback
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


def load_files() -> dict[str, tuple[bytes, str]]:
    files: dict[str, tuple[bytes, str]] = {}
    candidates = [INDEX]
    for folder_name in ("static", "data"):
        folder = ROOT / folder_name
        if folder.is_dir():
            candidates.extend(path for path in folder.rglob("*") if path.is_file())
    for path in candidates:
        if not path.is_file():
            continue
        try:
            relative = "/" + path.relative_to(ROOT).as_posix()
            content_type = MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")
            files[relative] = (path.read_bytes(), content_type)
        except OSError:
            continue
    if INDEX.is_file():
        files["/"] = (INDEX.read_bytes(), MIME_TYPES[".html"])
    return files


DEBUG_LOG = ROOT / "static-http-debug.log"


def debug(message: str) -> None:
    with DEBUG_LOG.open("a", encoding="utf-8") as handle:
        handle.write(message + "\n")


class StaticPortalHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        requested = unquote(urlparse(self.path).path)
        key = "/" if requested in ("", "/") else requested
        debug(f"GET {key}")
        path = INDEX if key == "/" else (ROOT / key.lstrip("/")).resolve()
        try:
            path.relative_to(ROOT)
        except ValueError:
            debug(f"MISS {key}")
            self.send_error(404)
            return
        if not path.is_file():
            debug(f"MISS {key}")
            self.send_error(404)
            return

        data = path.read_bytes()
        content_type = MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")
        debug(f"SEND {key} {len(data)}")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True
        debug(f"DONE {key}")


if __name__ == "__main__":
    try:
        debug("START 0.0.0.0:8095")
        ThreadingHTTPServer(("0.0.0.0", 8095), StaticPortalHandler).serve_forever()
    except Exception:
        debug("FATAL\n" + traceback.format_exc())
        raise
