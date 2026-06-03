from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class ProfileUpdate(BaseModel):
    phone_number: str | None = Field(default=None, max_length=15)
    email: EmailStr | None = None
    work_profile: str | None = None


class DistributorIn(BaseModel):
    sap_code: str
    name: str
    lsa_name: str
    district: str
    urban_rural: str | None = None
    supply_plant: str
    email: EmailStr | None = None
    phone_number: str | None = None
    address: str | None = None
    is_active: bool = True


class DailySPDIn(BaseModel):
    planning_date: date
    sap_code: str
    target_cylinders: int = Field(ge=0)
    priority_level: str = "Normal"
    backlog_qty: int = 0
    is_overridden: bool = False
    override_reason: str | None = None


class PlantExecutionIn(BaseModel):
    execution_date: date
    sap_code: str
    loads_invoiced: int = Field(ge=0)
    sap_indent_available: bool = True
    fund_shortage_block: bool = False
    other_issue_flag: str | None = None


class HolidayIn(BaseModel):
    holiday_date: date
    label: str


class BaselineGenerateRequest(BaseModel):
    planning_date: date
    growth_target_pct: float = 0
    fiscal_year: str = "2025-26"


class DashboardMetric(BaseModel):
    label: str
    value: float | int | str
    unit: str | None = None


class AlertOut(BaseModel):
    id: int
    alert_type: str
    sap_code: str | None
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MaterialIn(BaseModel):
    material_code: str
    cylinder_type: str
    tare_weight_kg: float | None = None
    capacity_kg: float | None = None
    is_active: bool = True


class GateEntryIn(BaseModel):
    flow_type: str = "FILLED_DISPATCH"
    truck_number: str
    driver_name: str | None = None
    driver_mobile: str | None = None
    transporter_name: str | None = None
    rfid_id: str | None = None
    distributor_name: str | None = None
    distributor_sap_code: str | None = None
    load_slip_no: str | None = None
    route: str | None = None
    destination: str | None = None
    expected_quantity: int = Field(default=0, ge=0)
    physical_quantity: int = Field(default=0, ge=0)


class GateAdvanceIn(BaseModel):
    movement_id: int
    gate_no: str
    event_type: str
    physical_quantity: int | None = Field(default=None, ge=0)
    remarks: str | None = None


class InvoiceIn(BaseModel):
    movement_id: int | None = None
    invoice_number: str | None = None
    sap_document_number: str | None = None
    truck_number: str | None = None
    material_code: str | None = None
    quantity: int = Field(default=0, ge=0)
    distributor_name: str | None = None
    gst: float = 0
    amount: float = 0
    qr_data: str | None = None
    source_type: str = "MANUAL"


class ERVIn(BaseModel):
    movement_id: int | None = None
    ac4_number: str | None = None
    delivery_challan_number: str | None = None
    truck_number: str | None = None
    distributor_name: str | None = None
    material_code: str | None = None
    cylinder_type: str | None = None
    returned_quantity: int = Field(default=0, ge=0)
    safety_caps: int = Field(default=0, ge=0)
    empty_cylinder_quantity: int = Field(default=0, ge=0)
    qr_data: str | None = None
    source_type: str = "MANUAL"


class ManualERVLineIn(BaseModel):
    material_code: str
    cylinder_type: str
    empty_quantity: int = Field(default=0, ge=0)
    safety_cap_quantity: int = Field(default=0, ge=0)
    damaged_quantity: int = Field(default=0, ge=0)


class ManualERVIn(BaseModel):
    truck_number: str
    driver_name: str | None = None
    driver_mobile: str | None = None
    transporter_name: str | None = None
    distributor_name: str | None = None
    distributor_sap_code: str | None = None
    document_type: str
    document_number: str | None = None
    remarks: str | None = None
    attachment_refs: str | None = None
    lines: list[ManualERVLineIn] = Field(default_factory=list)


class LinkManualERVIn(BaseModel):
    manual_erv_number: str
    actual_erv_number: str
    actual_quantity: int = Field(ge=0)


class StockTransferIn(BaseModel):
    transfer_number: str
    truck_number: str | None = None
    transfer_type: str
    vendor_name: str | None = None
    vendor_code: str | None = None
    transfer_date: date
    expected_return_date: date | None = None
    material_code: str
    cylinder_type: str
    quantity: int = Field(default=0, ge=0)
    condition: str | None = None
    attachment_refs: str | None = None
    remarks: str | None = None


class StockTransferReturnIn(BaseModel):
    transfer_number: str
    return_date: date
    returned_quantity: int = Field(default=0, ge=0)
    rejected_quantity: int = Field(default=0, ge=0)
    scrap_quantity: int = Field(default=0, ge=0)
    repair_quantity: int = Field(default=0, ge=0)
    remarks: str | None = None


class ResolveMismatchIn(BaseModel):
    mismatch_id: int
    status: str = "RESOLVED"
    remarks: str | None = None
