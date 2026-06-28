from __future__ import annotations

import io
import base64
import os
import re
from datetime import date, datetime
from typing import Any, Literal

import pandas as pd
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain import InventoryLedger, ManualERV, Mismatch, Notification, TruckMovement

try:
    import pdfplumber
except ImportError:  # pragma: no cover - optional runtime dependency
    pdfplumber = None

try:
    from pdf2image import convert_from_bytes
except ImportError:  # pragma: no cover - optional runtime dependency
    convert_from_bytes = None

try:
    from PIL import ImageEnhance, ImageOps
except ImportError:  # pragma: no cover - optional runtime dependency
    ImageEnhance = None
    ImageOps = None

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - optional runtime dependency
    OpenAI = None


class ExtractedItem(BaseModel):
    material_code: str = Field(default="")
    description: str = Field(default="")
    quantity: int = Field(default=0, ge=0)

    @field_validator("material_code")
    @classmethod
    def clean_material_code(cls, value: str) -> str:
        return re.sub(r"\s+", "", str(value or "").upper())

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()


class GateDocumentExtraction(BaseModel):
    document_type: Literal["TAX_INVOICE", "DELIVERY_CHALLAN_ERV", "UNKNOWN"] = "UNKNOWN"
    sap_document_number: str = Field(default="")
    truck_number: str = Field(default="")
    distributor_code: str = Field(default="")
    distributor_name: str = Field(default="")
    items: list[ExtractedItem] = Field(default_factory=list)

    @field_validator("truck_number")
    @classmethod
    def clean_truck_number(cls, value: str) -> str:
        return normalize_truck_number(value)

    @field_validator("sap_document_number", "distributor_code")
    @classmethod
    def clean_identifier(cls, value: str) -> str:
        return re.sub(r"\s+", "", str(value or "").strip())

    @field_validator("distributor_name")
    @classmethod
    def clean_distributor_name(cls, value: str) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_truck_number(value: str | None) -> str:
    text = str(value or "").upper()
    text = text.replace(" ", "").replace("-", "").replace(".", "")
    text = re.sub(r"[^A-Z0-9]", "", text)
    match = re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([A-Z0-9]{3,5})$", text)
    if not match:
        return text
    state, district, letters, tail = match.groups()
    tail = tail.replace("O", "0").replace("I", "1").replace("S", "5").replace("B", "8")
    return f"{state}{district}{letters}{tail}"


def _openai_client() -> Any | None:
    if OpenAI is None:
        return None
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    return OpenAI(api_key=api_key)


def _extraction_instructions(source: str) -> str:
    return f"""
Extract only operational Indane LPG Gate-2 fields from this {source}.

Supported layouts:
1. TAX INVOICE: fields include SAP Doc no, T.T.No / Truck No, Recipient (Ship to party)
   distributor code/name, and item table with material code / description / quantity.
2. DELIVERY CHALLAN (ERV): fields include SAP Document No, Truck NO, Distributor Details
   SAP Code, Distributor Name, and AC4 / challan item quantities.

Return only the strict schema. Do not extract GSTIN, PAN, IRN, HSN, rate, tax, amount,
address, signature, bank details, terms or any monetary detail.
If a value is uncertain, leave it blank rather than guessing wildly.
"""


def _parse_with_openai_text(text: str) -> GateDocumentExtraction | None:
    client = _openai_client()
    if client is None:
        return None
    response = client.beta.chat.completions.parse(
        model=os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini"),
        temperature=0,
        response_format=GateDocumentExtraction,
        messages=[
            {"role": "system", "content": _extraction_instructions("native PDF text")},
            {"role": "user", "content": text[:50000]},
        ],
    )
    return response.choices[0].message.parsed


def _parse_with_openai_image(image_base64: str) -> GateDocumentExtraction | None:
    client = _openai_client()
    if client is None:
        return None
    response = client.beta.chat.completions.parse(
        model=os.getenv("OPENAI_VISION_MODEL", "gpt-4o"),
        temperature=0,
        response_format=GateDocumentExtraction,
        messages=[
            {"role": "system", "content": _extraction_instructions("rendered invoice/ERV image")},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Read this IOCL invoice or ERV image and extract the operational fields only."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                ],
            },
        ],
    )
    return response.choices[0].message.parsed


def _extract_pdf_text(payload: bytes) -> tuple[str, list[str]]:
    warnings: list[str] = []
    if pdfplumber is None:
        return "", ["pdfplumber is not installed; native PDF text extraction skipped."]
    try:
        with pdfplumber.open(io.BytesIO(payload)) as pdf:
            pages = [(page.extract_text(x_tolerance=1, y_tolerance=3) or "") for page in pdf.pages]
        text = "\n".join(pages).strip()
        if len(text) < 50:
            warnings.append("Graphical Image PDF detected: native text length below 50 characters.")
        return text, warnings
    except Exception as exc:
        return "", [f"pdfplumber extraction failed: {exc}"]


def _render_pdf_to_jpeg_base64(payload: bytes) -> tuple[str, list[str]]:
    warnings: list[str] = []
    if convert_from_bytes is None:
        return "", ["pdf2image is not installed; graphical PDF vision fallback unavailable."]
    try:
        poppler_path = os.getenv("POPPLER_PATH") or None
        pages = convert_from_bytes(payload, dpi=200, first_page=1, last_page=1, fmt="jpeg", poppler_path=poppler_path)
        if not pages:
            return "", ["pdf2image returned no pages."]
        page = pages[0].convert("L")
        if ImageOps is not None and ImageEnhance is not None:
            page = ImageOps.autocontrast(page)
            page = ImageEnhance.Contrast(page).enhance(1.8)
            page = ImageEnhance.Sharpness(page).enhance(1.5)
        buffer = io.BytesIO()
        page.convert("RGB").save(buffer, format="JPEG", quality=92, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode("ascii"), warnings
    except Exception as exc:
        return "", [f"pdf2image render failed: {exc}. Install Poppler and set POPPLER_PATH if required."]


def _image_to_base64(payload: bytes) -> str:
    return base64.b64encode(payload).decode("ascii")


def _regex_fallback(text: str, filename: str) -> GateDocumentExtraction:
    source = text or filename
    flat = re.sub(r"\s+", " ", source)
    upper = flat.upper()
    doc_type = "DELIVERY_CHALLAN_ERV" if re.search(r"\bERV\b|DELIVERY\s+CHALLAN|AC4", upper) and not re.search(r"TAX\s+INVOICE", upper) else "TAX_INVOICE" if re.search(r"TAX\s+INVOICE|SAP\s+DOC", upper) else "UNKNOWN"
    sap = _first_match(flat, [
        r"SAP\s*Doc\s*no\.?\s*[:\-]?\s*(\d{8,12})",
        r"SAP\s*Document\s*No\.?\s*[:\-]?\s*(\d{8,12})",
        r"\b(7\d{9})\b",
        r"Document\s*No\.?\s*[:\-]?\s*(\d{6,12})",
    ])
    truck = _first_match(flat, [
        r"T\.?T\.?\s*No\.?\s*[:\-]?\s*([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{3,5})",
        r"Truck\s*No\.?\s*[:\-]?\s*([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{3,5})",
        r"Vehicle\s*No\.?\s*[:\-]?\s*([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{3,5})",
    ])
    dist_code = _first_match(flat, [
        r"PAYER\s*-\s*(\d{5,8})",
        r"Ordering Party\(Bill to party\)\s*:\s*(\d{5,8})",
        r"Distributor\s*Details\s*SAP\s*Code\s*0*(\d{5,8})",
        r"Recipient\s*\(Ship\s*to\s*party\).*?\b0?(\d{5,8})\b",
    ])
    dist_name = _first_match(flat, [
        r"PAYER\s*-\s*\d{5,8}\s+(.+?)(?:\s+Reverse Charge|\s+Ordering Party|\s+GSTIN|\s+Shop)",
        r"Recipient\s*\(Ship\s*to\s*party\).*?\d{5,8}(?:\s+\(Mob[^)]*\))?\s+(.+?)\s+(?:Shop|GSTIN|PAYER|Ordering)",
        r"Distributor\s*Name\s+(.+?)\s+SAP\s*Plant\s*Name",
    ])
    items: list[ExtractedItem] = []
    for material, desc, qty in re.findall(r"\b(M\d{5})\s+(.{3,90}?)\s+(-?\d+(?:\.\d+)?)\s+(?:EA|NOS|NO)\b", flat, flags=re.I):
        if re.search(r"tax|rate|total|rounding|hsn", desc, re.I):
            continue
        quantity = max(0, int(round(float(qty))))
        if quantity:
            items.append(ExtractedItem(material_code=material, description=desc, quantity=quantity))
    return GateDocumentExtraction(
        document_type=doc_type,
        sap_document_number=sap,
        truck_number=truck,
        distributor_code=dist_code,
        distributor_name=dist_name,
        items=items,
    )


def _first_match(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I | re.S)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip()
    return ""


def _legacy_response(
    *,
    filename: str,
    extraction: GateDocumentExtraction,
    engine: str,
    status: str,
    warnings: list[str],
    raw_text_preview: str = "",
) -> dict[str, Any]:
    item = extraction.items[0] if extraction.items else ExtractedItem()
    return {
        "source_filename": filename,
        "document_type": extraction.document_type,
        "sap_document_number": extraction.sap_document_number,
        "sap_doc_no": extraction.sap_document_number,
        "truck_number": extraction.truck_number,
        "tt_number": extraction.truck_number,
        "distributor_code": extraction.distributor_code,
        "distributor_name": extraction.distributor_name,
        "items": [line.model_dump() for line in extraction.items],
        "candidate_document_numbers": [extraction.sap_document_number] if extraction.sap_document_number else [],
        "material_code": item.material_code,
        "quantity": item.quantity,
        "raw_text_preview": raw_text_preview[:1000],
        "engine": engine,
        "status": status,
        "warnings": warnings,
    }


def manual_erv_number(today: date, sequence: int) -> str:
    return f"MERV-{today:%Y%m%d}-{sequence:04d}"


async def next_manual_erv_number(session: AsyncSession) -> str:
    today = date.today()
    prefix = f"MERV-{today:%Y%m%d}-"
    count = await session.scalar(select(func.count(ManualERV.id)).where(ManualERV.manual_erv_number.like(f"{prefix}%")))
    return manual_erv_number(today, int(count or 0) + 1)


def match_status(expected: int, actual: int) -> str:
    if expected <= 0 and actual <= 0:
        return "PENDING"
    return "GREEN" if expected == actual else "RED"


async def create_mismatch_if_needed(
    session: AsyncSession,
    *,
    mismatch_type: str,
    truck_number: str | None,
    material_code: str | None = None,
    expected_quantity: int,
    actual_quantity: int,
    details: str,
) -> None:
    if expected_quantity == actual_quantity:
        return
    session.add(
        Mismatch(
            mismatch_type=mismatch_type,
            severity="RED",
            truck_number=truck_number,
            material_code=material_code,
            expected_quantity=expected_quantity,
            actual_quantity=actual_quantity,
            details=details,
        )
    )
    session.add(
        Notification(
            channel="APP",
            recipient_role="S&D_OFFICER",
            subject=f"{mismatch_type} mismatch",
            message=details,
            status="QUEUED",
        )
    )


async def post_inventory(
    session: AsyncSession,
    *,
    transaction_type: str,
    material_code: str,
    cylinder_type: str | None,
    quantity_delta: int,
    reference_type: str,
    reference_id: str,
    remarks: str | None = None,
) -> None:
    session.add(
        InventoryLedger(
            transaction_type=transaction_type,
            material_code=material_code,
            cylinder_type=cylinder_type,
            quantity_delta=quantity_delta,
            reference_type=reference_type,
            reference_id=reference_id,
            remarks=remarks,
        )
    )


def extract_document_fields(filename: str, payload: bytes) -> dict[str, Any]:
    warnings: list[str] = []
    lower = filename.lower()
    raw_text = ""
    engine = "regex_fallback"
    extraction: GateDocumentExtraction | None = None

    try:
        if lower.endswith(".pdf"):
            raw_text, pdf_warnings = _extract_pdf_text(payload)
            warnings.extend(pdf_warnings)
            if len(raw_text.strip()) >= 50:
                extraction = _parse_with_openai_text(raw_text)
                engine = "pdfplumber_gpt_4o_mini" if extraction else "pdfplumber_regex_fallback"
            if extraction is None:
                image_base64, image_warnings = _render_pdf_to_jpeg_base64(payload)
                warnings.extend(image_warnings)
                if image_base64:
                    extraction = _parse_with_openai_image(image_base64)
                    engine = "pdf2image_gpt_4o_vision" if extraction else "pdf2image_regex_fallback"
        elif re.search(r"\.(png|jpe?g|webp|bmp|tiff?)$", lower):
            image_base64 = _image_to_base64(payload)
            extraction = _parse_with_openai_image(image_base64)
            engine = "image_gpt_4o_vision" if extraction else "image_regex_fallback"
        else:
            raw_text = payload.decode("utf-8", errors="ignore")
            extraction = _parse_with_openai_text(raw_text) if raw_text.strip() else None
            engine = "text_gpt_4o_mini" if extraction else "text_regex_fallback"
    except ValidationError as exc:
        warnings.append(f"OpenAI schema validation failed: {exc}")
        extraction = None
    except Exception as exc:
        warnings.append(f"AI extraction failed: {exc}")
        extraction = None

    if extraction is None:
        if not raw_text:
            raw_text = payload.decode("utf-8", errors="ignore")
        extraction = _regex_fallback(raw_text, filename)

    status = "EXTRACTED" if extraction.sap_document_number or extraction.truck_number or extraction.items else "NEEDS_REVIEW"
    if _openai_client() is None:
        warnings.append("OPENAI_API_KEY/openai package not available; used deterministic fallback where possible.")
    return _legacy_response(filename=filename, extraction=extraction, engine=engine, status=status, warnings=warnings, raw_text_preview=raw_text)


def read_ym89(filename: str, payload: bytes) -> pd.DataFrame:
    lower = filename.lower()
    if lower.endswith(".csv"):
        return pd.read_csv(io.BytesIO(payload))
    try:
        return pd.read_excel(io.BytesIO(payload))
    except Exception:
        text = payload.decode("utf-8", errors="ignore")
        return pd.read_html(io.StringIO(text))[0] if "<table" in text.lower() else pd.DataFrame()


def normalize_ym89(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    df = df.copy()
    df.columns = [re.sub(r"\s+", " ", str(col)).strip() for col in df.columns]
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        text = " ".join(str(value) for value in row.to_dict().values() if str(value) != "nan")
        if not text.strip():
            continue
        material = next((str(row[col]).strip() for col in df.columns if "material" in col.lower() and str(row[col]).strip()), None)
        qty_value = 0
        for col in df.columns:
            if any(key in col.lower() for key in ("qty", "quantity", "cylinder", "issue", "receipt")):
                try:
                    qty_value = int(float(str(row[col]).replace(",", "")))
                    break
                except ValueError:
                    pass
        truck_match = re.search(r"\b[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4}\b", text.upper())
        doc_match = re.search(r"\b\d{6,12}\b", text)
        rows.append(
            {
                "document_number": doc_match.group(0) if doc_match else None,
                "truck_number": truck_match.group(0).replace(" ", "") if truck_match else None,
                "distributor_name": str(row.get("Distributor", row.get("Ship-To Party", ""))).strip() or None,
                "material_code": material,
                "quantity": qty_value,
                "posting_date": None,
                "raw_payload": text[:2000],
            }
        )
    return rows


async def movement_dashboard(session: AsyncSession) -> dict[str, Any]:
    today = date.today()
    total_entered = await session.scalar(select(func.count(TruckMovement.id)).where(func.date(TruckMovement.created_at) == today))
    total_exited = await session.scalar(select(func.count(TruckMovement.id)).where(TruckMovement.exited_at.is_not(None), func.date(TruckMovement.exited_at) == today))
    inside = await session.scalar(select(func.count(TruckMovement.id)).where(TruckMovement.exited_at.is_(None)))
    pending = await session.scalar(select(func.count(TruckMovement.id)).where(TruckMovement.match_status == "PENDING"))
    mismatches = await session.scalar(select(func.count(Mismatch.id)).where(Mismatch.status == "OPEN"))
    manual_pending = await session.scalar(select(func.count(ManualERV.id)).where(ManualERV.status != "CLOSED"))
    return {
        "truck_kpis": {
            "entered": int(total_entered or 0),
            "exited": int(total_exited or 0),
            "inside": int(inside or 0),
            "pending": int(pending or 0),
            "average_turnaround_minutes": 0,
        },
        "sap_kpis": {
            "matched": int((total_exited or 0) - (mismatches or 0)) if total_exited else 0,
            "mismatch_cases": int(mismatches or 0),
            "pending_reconciliation": int(pending or 0),
            "aging_24h": 0,
            "aging_48h": 0,
        },
        "manual_erv": {
            "pending": int(manual_pending or 0),
            "resolved_today": 0,
            "aging_24h": 0,
            "aging_48h": 0,
            "aging_72h": 0,
        },
    }
