"""
Gate In / Gate Out mobile-camera document extraction utility.

Purpose:
  - Capture TAX INVOICE or DELIVERY CHALLAN (ERV) images from a camera.
  - Send the captured image to a configurable AI Vision endpoint.
  - Validate the returned JSON with Pydantic.
  - Normalize truck number, document number, distributor details and item lines.

Environment variables:
  VISION_API_URL       Required. HTTPS endpoint for your AI Vision gateway.
  VISION_API_KEY       Required. Bearer token/API key for the gateway.
  VISION_MODEL         Optional. Model name understood by the gateway.
  CAMERA_INDEX         Optional. Default 0.
  CAPTURE_DIR          Optional. Default ./captures.

Expected gateway contract:
  POST JSON:
    {
      "model": "...",
      "schema_name": "indane_gate_document_v1",
      "instructions": "...",
      "image_base64": "...",
      "mime_type": "image/jpeg"
    }
  Response JSON may be either the final extraction object directly, or:
    {"data": {...}} / {"result": {...}} / {"content": "{...json...}"}
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

cv2: Any | None = None


def require_cv2() -> Any:
    """Load OpenCV only when camera capture is actually used."""
    global cv2
    if cv2 is not None:
        return cv2
    try:
        import cv2 as loaded_cv2
    except ImportError as exc:  # pragma: no cover - runtime guidance
        raise RuntimeError("OpenCV is required for camera capture. Install with: pip install opencv-python") from exc
    cv2 = loaded_cv2
    return cv2


class DocumentType(str, Enum):
    TAX_INVOICE = "TAX_INVOICE"
    ERV = "DELIVERY_CHALLAN_ERV"


class GateDirection(str, Enum):
    IN = "IN"
    OUT = "OUT"


class CylinderItem(BaseModel):
    material_code: str = Field(..., description="Example: M00087, M00088, M00451")
    description: str
    quantity: int = Field(..., ge=0)
    unit: str = Field(default="EA")

    @field_validator("material_code")
    @classmethod
    def clean_material_code(cls, value: str) -> str:
        return value.strip().upper().replace(" ", "")

    @field_validator("unit")
    @classmethod
    def clean_unit(cls, value: str) -> str:
        return value.strip().upper() or "EA"


class GateDocumentExtraction(BaseModel):
    document_type: DocumentType
    gate_direction: GateDirection
    sap_document_number: str = Field(..., min_length=4)
    truck_number: str = Field(..., min_length=6)
    distributor_code: str = Field(..., min_length=5)
    distributor_name: str = Field(..., min_length=2)
    document_date: str | None = None
    document_time: str | None = None
    delivery_number: str | None = None
    sales_order_number: str | None = None
    ac4_number: str | None = None
    items: list[CylinderItem] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("truck_number")
    @classmethod
    def normalize_truck_number(cls, value: str) -> str:
        return normalize_truck_number(value)

    @field_validator("sap_document_number", "distributor_code", "delivery_number", "sales_order_number", "ac4_number")
    @classmethod
    def clean_identifier(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return re.sub(r"\s+", "", str(value).strip())

    @field_validator("distributor_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()


class Settings(BaseModel):
    vision_api_url: str = ""
    vision_api_key: str = ""
    vision_model: str = "vision-document-extractor"
    camera_index: int = 0
    capture_dir: Path = Path("captures")
    request_timeout_seconds: int = 90

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(Path(".env"))
        return cls(
            vision_api_url=os.getenv("VISION_API_URL", ""),
            vision_api_key=os.getenv("VISION_API_KEY", ""),
            vision_model=os.getenv("VISION_MODEL", "vision-document-extractor"),
            camera_index=int(os.getenv("CAMERA_INDEX", "0") or 0),
            capture_dir=Path(os.getenv("CAPTURE_DIR", "captures")),
            request_timeout_seconds=int(os.getenv("VISION_TIMEOUT_SECONDS", "90") or 90),
        )


def load_dotenv(path: Path) -> None:
    """Tiny .env loader so this tool has no extra runtime dependency."""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def normalize_truck_number(raw: str) -> str:
    """Normalize Indian vehicle number variations from OCR/AI output."""
    value = str(raw or "").upper()
    value = value.replace(" ", "").replace("-", "").replace(".", "")
    value = value.replace("O", "0") if re.match(r"^[A-Z]{2}[O0-9]", value) else value
    value = re.sub(r"[^A-Z0-9]", "", value)
    # Common OCR confusion in numeric tail only.
    match = re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([A-Z0-9]{3,5})$", value)
    if match:
        state, series_no, letters, tail = match.groups()
        tail = tail.replace("O", "0").replace("I", "1").replace("S", "5").replace("B", "8")
        return f"{state}{series_no}{letters}{tail}"
    return value


class CameraCapture:
    def __init__(self, camera_index: int, capture_dir: Path) -> None:
        self.camera_index = camera_index
        self.capture_dir = capture_dir
        self.capture_dir.mkdir(parents=True, exist_ok=True)

    def capture(self) -> Path:
        cv = require_cv2()
        cap = cv.VideoCapture(self.camera_index, cv.CAP_DSHOW)
        if not cap.isOpened():
            raise RuntimeError(f"Camera index {self.camera_index} could not be opened.")

        window = "Indane Gate OCR Capture - SPACE: capture | Q/ESC: quit"
        cv.namedWindow(window, cv.WINDOW_NORMAL)

        saved: Path | None = None
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    raise RuntimeError("Camera frame could not be read.")

                display = self._draw_guide(frame.copy())
                cv.imshow(window, display)
                key = cv.waitKey(1) & 0xFF

                if key in (ord("q"), 27):
                    raise KeyboardInterrupt("Capture cancelled by user.")
                if key == 32:  # spacebar
                    saved = self.capture_dir / f"gate_doc_{int(time.time())}.jpg"
                    cv.imwrite(str(saved), frame, [int(cv.IMWRITE_JPEG_QUALITY), 92])
                    break
        finally:
            cap.release()
            cv.destroyWindow(window)

        if not saved:
            raise RuntimeError("No image captured.")
        return saved

    @staticmethod
    def _draw_guide(frame: Any) -> Any:
        cv = require_cv2()
        h, w = frame.shape[:2]
        margin_x, margin_y = int(w * 0.08), int(h * 0.08)
        x1, y1, x2, y2 = margin_x, margin_y, w - margin_x, h - margin_y
        cv.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 0), 3)
        cv.putText(
            frame,
            "Place complete invoice/ERV inside green box. Press SPACE to capture.",
            (x1, max(32, y1 - 16)),
            cv.FONT_HERSHEY_SIMPLEX,
            0.72,
            (0, 220, 0),
            2,
            cv.LINE_AA,
        )
        return frame


class VisionExtractor:
    def __init__(self, settings: Settings) -> None:
        if not settings.vision_api_url:
            raise ValueError("VISION_API_URL is not configured.")
        if not settings.vision_api_key:
            raise ValueError("VISION_API_KEY is not configured.")
        self.settings = settings

    def extract(self, image_path: Path, expected: Literal["auto", "invoice", "erv"] = "auto") -> GateDocumentExtraction:
        payload = {
            "model": self.settings.vision_model,
            "schema_name": "indane_gate_document_v1",
            "instructions": self._instructions(expected),
            "image_base64": self._encode_image(image_path),
            "mime_type": "image/jpeg",
        }
        raw = self._post_json(payload)
        parsed = self._unwrap_response(raw)
        return GateDocumentExtraction.model_validate(parsed)

    @staticmethod
    def _encode_image(path: Path) -> str:
        return base64.b64encode(path.read_bytes()).decode("ascii")

    @staticmethod
    def _instructions(expected: str) -> str:
        return f"""
You are extracting Indane LPG gate movement data from a mobile camera image.
Document layouts:
1. TAX INVOICE: fields include SAP Doc no, T.T.No, Recipient (Ship to party), PAYER,
   Delivery no, Sales Order, and item table with material codes such as M00087.
   Gate direction must be OUT.
2. DELIVERY CHALLAN (ERV): fields include SAP Document No, Truck NO,
   Distributor Details SAP Code, Distributor Name, AC4 No, Delivery Challan #,
   AC4 Particulars / Delivery Challan Particulars with returned empty cylinder quantities.
   Gate direction must be IN.

Expected document hint: {expected}

Return ONLY valid JSON matching this schema:
{{
  "document_type": "TAX_INVOICE" or "DELIVERY_CHALLAN_ERV",
  "gate_direction": "OUT" or "IN",
  "sap_document_number": "string",
  "truck_number": "string",
  "distributor_code": "string",
  "distributor_name": "string",
  "document_date": "DD-MM-YYYY or visible format",
  "document_time": "HH:MM if visible",
  "delivery_number": "string or null",
  "sales_order_number": "string or null",
  "ac4_number": "string or null",
  "items": [
    {{"material_code": "M00087", "description": "14.2 kg ...", "quantity": 360, "unit": "EA"}}
  ],
  "confidence": 0.0,
  "warnings": ["any uncertain field"]
}}

Rules:
- Do not extract GSTIN, PAN, tax amount, HSN, rate, address, IRN or monetary details.
- For TAX INVOICE, prefer PAYER / Recipient ship-to party as distributor.
- For ERV, use returned/empty cylinder quantities from challan/AC4 particulars.
- If a value is uncertain, still return best reading and add warning.
"""

    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.settings.vision_api_url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.settings.vision_api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.settings.request_timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Vision API HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Vision API connection failed: {exc.reason}") from exc

    @staticmethod
    def _unwrap_response(raw: dict[str, Any]) -> dict[str, Any]:
        candidate: Any = raw.get("data") or raw.get("result") or raw.get("output") or raw
        if isinstance(candidate, dict) and "content" in candidate:
            candidate = candidate["content"]
        if isinstance(candidate, str):
            candidate = candidate.strip()
            candidate = re.sub(r"^```(?:json)?|```$", "", candidate, flags=re.IGNORECASE | re.MULTILINE).strip()
            return json.loads(candidate)
        if isinstance(candidate, dict):
            return candidate
        raise ValueError("Vision API response did not contain a JSON object.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture and extract Indane Gate IN/OUT document data.")
    parser.add_argument("--image", type=Path, help="Existing invoice/ERV image path. If omitted, camera opens.")
    parser.add_argument("--expected", choices=["auto", "invoice", "erv"], default="auto")
    parser.add_argument("--json-out", type=Path, help="Optional path to save validated JSON.")
    args = parser.parse_args()

    settings = Settings.from_env()
    image_path = args.image or CameraCapture(settings.camera_index, settings.capture_dir).capture()

    try:
        extraction = VisionExtractor(settings).extract(image_path, expected=args.expected)
    except ValidationError as exc:
        print("Extraction failed schema validation. Correct image or review AI prompt.", file=sys.stderr)
        print(exc, file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"Extraction failed: {exc}", file=sys.stderr)
        return 1

    output = extraction.model_dump(mode="json")
    print(json.dumps(output, indent=2, ensure_ascii=False))

    if args.json_out:
        args.json_out.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
