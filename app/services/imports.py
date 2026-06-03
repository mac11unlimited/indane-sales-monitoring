from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import pandas as pd

from app.services.metrics import cylinders_to_loads, kg_to_cylinders, loads_to_cylinders


@dataclass
class DistributorRow:
    sap_code: str
    name: str
    lsa_name: str
    district: str
    urban_rural: str | None
    supply_plant: str


@dataclass
class SpdRow:
    sap_code: str
    target_loads: int
    target_cylinders: int
    backlog_qty: int = 0
    priority_level: str = "Normal"


@dataclass
class McsiRow:
    sale_date: date
    ship_to_party: str
    sales_office: str | None
    lsa_name: str | None
    plant: str | None
    material: str | None
    billing_document: str | None
    quantity_kg: float
    quantity_cylinders: int
    quantity_loads: int


def read_tabular_upload(filename: str, payload: bytes) -> pd.DataFrame:
    lower = filename.lower()
    if lower.endswith((".xlsx", ".xlsm", ".xls")):
        return pd.read_excel(io.BytesIO(payload))
    if lower.endswith(".csv"):
        return pd.read_csv(io.BytesIO(payload))
    text = payload.decode("utf-8", errors="ignore")
    return parse_mcsi_text_dump(text)


def clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [re.sub(r"\s+", " ", str(col)).strip() for col in df.columns]
    return df


def parse_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    return pd.to_datetime(text, dayfirst=True).date()


def number(value: Any) -> float:
    if pd.isna(value):
        return 0
    return float(str(value).replace(",", "").strip() or 0)


def parse_indent_planning(df: pd.DataFrame) -> tuple[list[DistributorRow], list[SpdRow]]:
    df = clean_columns(df)
    distributors: list[DistributorRow] = []
    spd_rows: list[SpdRow] = []
    for _, row in df.iterrows():
        sap_code = str(row.get("SAP Code", "")).strip()
        if not sap_code or sap_code.lower() == "nan":
            continue
        target_loads = int(number(row.get("Final Planning", 0)))
        distributors.append(
            DistributorRow(
                sap_code=sap_code,
                name=str(row.get("Distributor name", "")).strip(),
                lsa_name=str(row.get("LSA", "")).strip(),
                district=str(row.get("District", "")).strip(),
                urban_rural=str(row.get("Urban/Rural", "")).strip() or None,
                supply_plant=str(row.get("Supply Plant", "")).strip(),
            )
        )
        spd_rows.append(
            SpdRow(
                sap_code=sap_code,
                target_loads=target_loads,
                target_cylinders=loads_to_cylinders(target_loads),
                priority_level="High" if target_loads >= 2 else "Normal",
            )
        )
    return distributors, spd_rows


def parse_mcsi_sales(df: pd.DataFrame) -> list[McsiRow]:
    df = clean_columns(df)
    rows: list[McsiRow] = []
    for _, row in df.iterrows():
        if "Date" not in df.columns:
            continue
        qty_kg = number(row.get("Net", row.get("Inv. Qty", 0)))
        unit = str(row.get("Net.1", row.get("Inv. Qty.1", row.get("Unit", "KG")))).upper()
        if unit == "EA":
            cylinders = int(number(row.get("Inv. Qty", 0)))
            qty_kg = cylinders * 14.2
        else:
            cylinders = kg_to_cylinders(abs(qty_kg))
        rows.append(
            McsiRow(
                sale_date=parse_date(row.get("Date")),
                ship_to_party=str(row.get("Ship-To Party", row.get("Sold-To Party", ""))).strip(),
                sales_office=str(row.get("Sales Office", "")).strip() or None,
                lsa_name=str(row.get("Sales Group", "")).strip() or None,
                plant=str(row.get("Plant", row.get("Shipping Point/Receiving Pt", ""))).strip() or None,
                material=str(row.get("Material", "")).strip() or None,
                billing_document=str(row.get("Billing Document", "")).strip() or None,
                quantity_kg=abs(qty_kg),
                quantity_cylinders=cylinders,
                quantity_loads=cylinders_to_loads(cylinders),
            )
        )
    return rows


def parse_mcsi_text_dump(text: str) -> pd.DataFrame:
    lines = [line.strip(" |\t") for line in text.splitlines() if line.strip(" |\t")]
    split_rows = [re.split(r"\s{2,}|\t|\|", line) for line in lines]
    if not split_rows:
        return pd.DataFrame()
    header_idx = next((idx for idx, row in enumerate(split_rows) if any("Date" in cell for cell in row)), 0)
    header = [cell.strip() for cell in split_rows[header_idx]]
    data = split_rows[header_idx + 1 :]
    width = len(header)
    normalized = [row[:width] + [""] * max(0, width - len(row)) for row in data]
    return pd.DataFrame(normalized, columns=header)
