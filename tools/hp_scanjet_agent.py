"""
HP ScanJet Pro 2000 s2 bridge for INDANE SALES MONITORING.

Why this exists:
    A browser page, especially a public HTTPS page hosted on Vercel, cannot
    directly control a USB/WIA/TWAIN scanner. This local Windows agent sits on
    the PC connected to the HP scanner, watches the HP Scan output folder, and
    automatically submits each new PDF/JPG/TIFF scan to the portal OCR API.

Recommended gate workflow:
    1. Configure HP Scan / HP Smart to save each scan as PDF into SCAN_FOLDER.
    2. Run this agent on the scanner PC.
    3. Driver places Invoice / ERV in the scanner feeder and presses Scan.
    4. Agent detects the new file, submits it to /api/lpg/ocr/extract, and
       stores the extracted JSON in OUTPUT_FOLDER for audit and retry.

Optional:
    If pywin32 is installed and the scanner exposes WIA, --scan-once can invoke
    the scanner directly. Folder-watch mode remains the most reliable option
    across HP TWAIN/WIA driver variations.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".bmp"}


@dataclass
class AgentConfig:
    portal_base_url: str
    username: str
    password: str
    scan_folder: Path
    output_folder: Path
    poll_seconds: float = 2.0
    stable_wait_seconds: float = 1.5
    bridge_host: str = "127.0.0.1"
    bridge_port: int = 8765
    processed_manifest: Path | None = None

    @classmethod
    def from_env(cls) -> "AgentConfig":
        scan_folder = Path(os.getenv("SCAN_FOLDER", "scanner-inbox")).resolve()
        output_folder = Path(os.getenv("SCAN_OUTPUT_FOLDER", "scanner-output")).resolve()
        return cls(
            portal_base_url=os.getenv("PORTAL_BASE_URL", "http://127.0.0.1:8000").rstrip("/"),
            username=os.getenv("PORTAL_USERNAME", "security_loni_1"),
            password=os.getenv("PORTAL_PASSWORD", "Indane@12345"),
            scan_folder=scan_folder,
            output_folder=output_folder,
            poll_seconds=float(os.getenv("SCAN_POLL_SECONDS", "2")),
            stable_wait_seconds=float(os.getenv("SCAN_STABLE_WAIT_SECONDS", "1.5")),
            bridge_host=os.getenv("SCAN_BRIDGE_HOST", "127.0.0.1"),
            bridge_port=int(os.getenv("SCAN_BRIDGE_PORT", "8765")),
            processed_manifest=output_folder / "processed-files.json",
        )


class PortalClient:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.token: str | None = None

    def login(self) -> None:
        form = urllib.parse.urlencode({"username": self.username, "password": self.password}).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/api/auth/login",
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        self.token = payload["access_token"]

    def extract_document(self, path: Path) -> dict[str, Any]:
        if not self.token:
            self.login()
        boundary = f"----indane-scanjet-{int(time.time() * 1000)}"
        body = self._multipart_body(boundary, path)
        request = urllib.request.Request(
            f"{self.base_url}/api/lpg/ocr/extract",
            data=body,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                self.token = None
                self.login()
                return self.extract_document(path)
            body_text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"OCR API HTTP {exc.code}: {body_text}") from exc

    @staticmethod
    def _multipart_body(boundary: str, path: Path) -> bytes:
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        head = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
            f"Content-Type: {mime_type}\r\n\r\n"
        ).encode("utf-8")
        tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
        return head + path.read_bytes() + tail


class ScanFolderAgent:
    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.config.scan_folder.mkdir(parents=True, exist_ok=True)
        self.config.output_folder.mkdir(parents=True, exist_ok=True)
        self.client = PortalClient(config.portal_base_url, config.username, config.password)
        self.processed = self._load_processed()
        self.queue_path = self.config.output_folder / "scan-queue.json"
        self.queue = self._load_queue()

    def run_forever(self) -> None:
        self._log(f"Watching {self.config.scan_folder}")
        self._log(f"Portal: {self.config.portal_base_url} | User: {self.config.username}")
        self._start_bridge_server()
        while True:
            self.process_pending()
            time.sleep(self.config.poll_seconds)

    def process_pending(self) -> None:
        files = sorted(
            [p for p in self.config.scan_folder.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS],
            key=lambda p: p.stat().st_mtime,
        )
        for path in files:
            key = self._file_key(path)
            if key in self.processed:
                continue
            if not self._is_stable(path):
                continue
            self._process_file(path)

    def _process_file(self, path: Path) -> None:
        self._log(f"Submitting scan: {path.name}")
        try:
            result = self.client.extract_document(path)
            result["_agent"] = {
                "source_file": str(path),
                "processed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "portal_base_url": self.config.portal_base_url,
            }
            out = self.config.output_folder / f"{path.stem}.ocr.json"
            out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            self._enqueue_scan(path, out, result)
            self.processed[self._file_key(path)] = {"file": str(path), "json": str(out), "at": time.time()}
            self._save_processed()
            status = result.get("status", "UNKNOWN")
            sap = result.get("sap_doc_no") or result.get("sap_document_number") or ""
            truck = result.get("tt_number") or result.get("truck_number") or ""
            self._log(f"OK {status}: SAP={sap} Truck={truck} Output={out.name}")
        except Exception as exc:
            fail = self.config.output_folder / f"{path.stem}.error.json"
            fail.write_text(json.dumps({"file": str(path), "error": str(exc), "at": time.time()}, indent=2), encoding="utf-8")
            self._log(f"ERROR: {path.name}: {exc}")

    def _is_stable(self, path: Path) -> bool:
        size_a = path.stat().st_size
        time.sleep(self.config.stable_wait_seconds)
        return path.exists() and path.stat().st_size == size_a and size_a > 0

    def _file_key(self, path: Path) -> str:
        stat = path.stat()
        return f"{path.resolve()}|{stat.st_size}|{int(stat.st_mtime)}"

    def _load_processed(self) -> dict[str, Any]:
        manifest = self.config.processed_manifest
        if not manifest or not manifest.exists():
            return {}

    def _load_queue(self) -> list[dict[str, Any]]:
        if not self.queue_path.exists():
            return []
        try:
            data = json.loads(self.queue_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _save_queue(self) -> None:
        self.queue_path.write_text(json.dumps(self.queue[-200:], indent=2, ensure_ascii=False), encoding="utf-8")

    def _enqueue_scan(self, source: Path, json_path: Path, result: dict[str, Any]) -> None:
        scan_id = hashlib.sha1(f"{source.resolve()}|{source.stat().st_size}|{source.stat().st_mtime}".encode("utf-8")).hexdigest()[:16]
        if any(row.get("id") == scan_id for row in self.queue):
            return
        self.queue.append(
            {
                "id": scan_id,
                "status": "PENDING_SECURITY_ACCEPTANCE",
                "source_file": str(source),
                "json_file": str(json_path),
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "result": result,
            }
        )
        self._save_queue()

    def latest_pending(self) -> dict[str, Any] | None:
        for row in reversed(self.queue):
            if row.get("status") == "PENDING_SECURITY_ACCEPTANCE":
                return row
        return None

    def mark_scan(self, scan_id: str, status: str) -> dict[str, Any]:
        for row in self.queue:
            if row.get("id") == scan_id:
                row["status"] = status
                row["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                self._save_queue()
                return row
        raise KeyError(scan_id)

    def _start_bridge_server(self) -> None:
        handler = self._handler_class()
        server = ThreadingHTTPServer((self.config.bridge_host, self.config.bridge_port), handler)
        thread = threading.Thread(target=server.serve_forever, name="scanjet-local-bridge", daemon=True)
        thread.start()
        self._log(f"Local scanner popup bridge: http://{self.config.bridge_host}:{self.config.bridge_port}")

    def _handler_class(self) -> type[BaseHTTPRequestHandler]:
        agent = self

        class ScannerBridgeHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:
                return

            def _send_json(self, payload: Any, status: int = 200) -> None:
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self) -> None:
                self._send_json({"ok": True})

            def do_GET(self) -> None:
                if self.path.startswith("/health"):
                    self._send_json({"ok": True, "agent": "hp_scanjet_agent", "pending": len([q for q in agent.queue if q.get("status") == "PENDING_SECURITY_ACCEPTANCE"])})
                    return
                if self.path.startswith("/next"):
                    row = agent.latest_pending()
                    self._send_json({"pending": bool(row), "scan": row})
                    return
                if self.path.startswith("/queue"):
                    self._send_json({"queue": agent.queue[-50:]})
                    return
                self._send_json({"error": "Not found"}, 404)

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}") if length else {}
                if self.path.startswith("/accept"):
                    try:
                        row = agent.mark_scan(str(payload.get("id", "")), "ACCEPTED_BY_SECURITY")
                        self._send_json({"ok": True, "scan": row})
                    except KeyError:
                        self._send_json({"ok": False, "error": "Scan id not found"}, 404)
                    return
                if self.path.startswith("/reject"):
                    try:
                        row = agent.mark_scan(str(payload.get("id", "")), "REJECTED_BY_SECURITY")
                        self._send_json({"ok": True, "scan": row})
                    except KeyError:
                        self._send_json({"ok": False, "error": "Scan id not found"}, 404)
                    return
                self._send_json({"error": "Not found"}, 404)

        return ScannerBridgeHandler
        try:
            return json.loads(manifest.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _save_processed(self) -> None:
        manifest = self.config.processed_manifest
        if manifest:
            manifest.write_text(json.dumps(self.processed, indent=2), encoding="utf-8")

    @staticmethod
    def _log(message: str) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def scan_once_with_wia(output_folder: Path) -> Path:
    """Try direct WIA scan. Falls back with a clear error if driver is TWAIN-only."""
    try:
        import win32com.client  # type: ignore
    except ImportError as exc:
        raise RuntimeError("pywin32 is required for direct WIA scan. Use folder-watch mode or install pywin32.") from exc

    output_folder.mkdir(parents=True, exist_ok=True)
    dialog = win32com.client.Dispatch("WIA.CommonDialog")
    image = dialog.ShowAcquireImage()
    if image is None:
        raise RuntimeError("No image returned by WIA scanner.")
    path = output_folder / f"wia_scan_{int(time.time())}.jpg"
    if path.exists():
        path.unlink()
    image.SaveFile(str(path))
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="HP ScanJet bridge for Indane Gate IN/OUT OCR.")
    parser.add_argument("--portal", default=os.getenv("PORTAL_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--username", default=os.getenv("PORTAL_USERNAME", "security_loni_1"))
    parser.add_argument("--password", default=os.getenv("PORTAL_PASSWORD", "Indane@12345"))
    parser.add_argument("--scan-folder", type=Path, default=Path(os.getenv("SCAN_FOLDER", "scanner-inbox")))
    parser.add_argument("--output-folder", type=Path, default=Path(os.getenv("SCAN_OUTPUT_FOLDER", "scanner-output")))
    parser.add_argument("--once", action="store_true", help="Process current folder files once and exit.")
    parser.add_argument("--scan-once", action="store_true", help="Use Windows WIA to scan one page before processing.")
    parser.add_argument("--bridge-host", default=os.getenv("SCAN_BRIDGE_HOST", "127.0.0.1"))
    parser.add_argument("--bridge-port", type=int, default=int(os.getenv("SCAN_BRIDGE_PORT", "8765")))
    args = parser.parse_args()

    config = AgentConfig(
        portal_base_url=args.portal.rstrip("/"),
        username=args.username,
        password=args.password,
        scan_folder=args.scan_folder.resolve(),
        output_folder=args.output_folder.resolve(),
        bridge_host=args.bridge_host,
        bridge_port=args.bridge_port,
        processed_manifest=args.output_folder.resolve() / "processed-files.json",
    )
    agent = ScanFolderAgent(config)

    if args.scan_once:
        scanned = scan_once_with_wia(config.scan_folder)
        print(f"Scanned: {scanned}")

    if args.once:
        agent.process_pending()
        return 0

    agent.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
