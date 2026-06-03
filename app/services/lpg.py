from __future__ import annotations

import io
import re
from datetime import date, datetime
from typing import Any

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain import InventoryLedger, ManualERV, Mismatch, Notification, TruckMovement


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
    text = payload.decode("utf-8", errors="ignore")
    if not text.strip():
        text = filename
    numbers = re.findall(r"[A-Z]{0,4}\d{5,}", text.upper())
    truck = re.search(r"\b[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4}\b", text.upper())
    qty_match = re.search(r"(?:QTY|QUANTITY|CYLINDER|CYLINDERS)[^\d]{0,12}(\d{1,6})", text.upper())
    material = re.search(r"\bM\d{5}\b", text.upper())
    amount = re.search(r"(?:AMOUNT|TOTAL)[^\d]{0,12}(\d+(?:\.\d{1,2})?)", text.upper())
    return {
        "source_filename": filename,
        "candidate_document_numbers": numbers[:5],
        "truck_number": truck.group(0).replace(" ", "") if truck else None,
        "material_code": material.group(0) if material else None,
        "quantity": int(qty_match.group(1)) if qty_match else 0,
        "amount": float(amount.group(1)) if amount else 0,
        "raw_text_preview": text[:1000],
        "engine": "qr_ocr_stub",
        "status": "EXTRACTED" if numbers or truck or qty_match else "NEEDS_REVIEW",
    }


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
