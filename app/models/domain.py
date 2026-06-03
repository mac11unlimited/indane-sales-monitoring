from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True)
    phone_number: Mapped[str | None] = mapped_column(String(15))
    work_profile: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Distributor(Base):
    __tablename__ = "distributors"

    sap_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), index=True)
    lsa_name: Mapped[str] = mapped_column(String(100), index=True)
    district: Mapped[str] = mapped_column(String(100), index=True)
    urban_rural: Mapped[str | None] = mapped_column(String(20))
    supply_plant: Mapped[str] = mapped_column(String(50), index=True)
    email: Mapped[str | None] = mapped_column(String(100))
    phone_number: Mapped[str | None] = mapped_column(String(15))
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    spd_rows: Mapped[list["DailySPD"]] = relationship(back_populates="distributor")


class DailySPD(Base):
    __tablename__ = "daily_spd"
    __table_args__ = (UniqueConstraint("planning_date", "sap_code", name="uq_daily_spd_date_sap"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    planning_date: Mapped[date] = mapped_column(Date, index=True)
    sap_code: Mapped[str] = mapped_column(ForeignKey("distributors.sap_code"), index=True)
    target_cylinders: Mapped[int] = mapped_column(Integer)
    target_loads: Mapped[int] = mapped_column(Integer)
    priority_level: Mapped[str] = mapped_column(String(20), default="Normal", index=True)
    backlog_qty: Mapped[int] = mapped_column(Integer, default=0)
    is_overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    override_reason: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[str | None] = mapped_column(String(50))
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    distributor: Mapped[Distributor] = relationship(back_populates="spd_rows")


class PlantExecution(Base):
    __tablename__ = "plant_execution"
    __table_args__ = (UniqueConstraint("execution_date", "sap_code", name="uq_plant_execution_date_sap"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    execution_date: Mapped[date] = mapped_column(Date, index=True)
    sap_code: Mapped[str] = mapped_column(ForeignKey("distributors.sap_code"), index=True)
    loads_invoiced: Mapped[int] = mapped_column(Integer, default=0)
    sap_indent_available: Mapped[bool] = mapped_column(Boolean, default=True)
    fund_shortage_block: Mapped[bool] = mapped_column(Boolean, default=False)
    other_issue_flag: Mapped[str | None] = mapped_column(Text)
    entered_by: Mapped[str | None] = mapped_column(String(50))
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class MonthlyBaseline(Base):
    __tablename__ = "monthly_baselines"
    __table_args__ = (UniqueConstraint("fiscal_year", "month", "sap_code", name="uq_baseline_month_sap"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fiscal_year: Mapped[str] = mapped_column(String(9), index=True)
    month: Mapped[int] = mapped_column(Integer, index=True)
    sap_code: Mapped[str] = mapped_column(ForeignKey("distributors.sap_code"), index=True)
    last_year_volume_mt: Mapped[float] = mapped_column(Numeric(12, 3))
    growth_target_pct: Mapped[float] = mapped_column(Numeric(6, 2), default=0)


class Holiday(Base):
    __tablename__ = "holidays"

    holiday_date: Mapped[date] = mapped_column(Date, primary_key=True)
    label: Mapped[str] = mapped_column(String(120))


class McsiSale(Base):
    __tablename__ = "mcsi_sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_date: Mapped[date] = mapped_column(Date, index=True)
    ship_to_party: Mapped[str] = mapped_column(String(150), index=True)
    sales_office: Mapped[str | None] = mapped_column(String(100), index=True)
    lsa_name: Mapped[str | None] = mapped_column(String(100), index=True)
    plant: Mapped[str | None] = mapped_column(String(50), index=True)
    material: Mapped[str | None] = mapped_column(String(150))
    billing_document: Mapped[str | None] = mapped_column(String(30))
    quantity_kg: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    quantity_cylinders: Mapped[int] = mapped_column(Integer, default=0)
    quantity_loads: Mapped[int] = mapped_column(Integer, default=0)
    source_file: Mapped[str | None] = mapped_column(String(255))


class AlertLog(Base):
    __tablename__ = "alert_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_type: Mapped[str] = mapped_column(String(50), index=True)
    sap_code: Mapped[str | None] = mapped_column(String(20), index=True)
    message: Mapped[str] = mapped_column(Text)
    sent_to: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class TransporterMaster(Base):
    __tablename__ = "transporter_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    sap_code: Mapped[str | None] = mapped_column(String(30), index=True)
    phone_number: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MaterialMaster(Base):
    __tablename__ = "material_master"

    material_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    cylinder_type: Mapped[str] = mapped_column(String(50), index=True)
    tare_weight_kg: Mapped[float | None] = mapped_column(Numeric(8, 2))
    capacity_kg: Mapped[float | None] = mapped_column(Numeric(8, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TruckMaster(Base):
    __tablename__ = "truck_master"

    truck_number: Mapped[str] = mapped_column(String(20), primary_key=True)
    transporter_name: Mapped[str | None] = mapped_column(String(150), index=True)
    rfid_id: Mapped[str | None] = mapped_column(String(80), unique=True, index=True)
    driver_name: Mapped[str | None] = mapped_column(String(120))
    driver_mobile: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TruckMovement(Base):
    __tablename__ = "truck_movement"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    flow_type: Mapped[str] = mapped_column(String(20), index=True)
    truck_number: Mapped[str] = mapped_column(String(20), index=True)
    driver_name: Mapped[str | None] = mapped_column(String(120))
    driver_mobile: Mapped[str | None] = mapped_column(String(20))
    transporter_name: Mapped[str | None] = mapped_column(String(150), index=True)
    distributor_name: Mapped[str | None] = mapped_column(String(150), index=True)
    distributor_sap_code: Mapped[str | None] = mapped_column(String(20), index=True)
    load_slip_no: Mapped[str | None] = mapped_column(String(50), index=True)
    route: Mapped[str | None] = mapped_column(String(100))
    destination: Mapped[str | None] = mapped_column(String(150))
    expected_quantity: Mapped[int] = mapped_column(Integer, default=0)
    physical_quantity: Mapped[int] = mapped_column(Integer, default=0)
    current_stage: Mapped[str] = mapped_column(String(40), default="GATE0", index=True)
    match_status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    queue_position: Mapped[int | None] = mapped_column(Integer)
    expected_loading_time: Mapped[datetime | None] = mapped_column(DateTime)
    loading_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    loading_completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    loader_details: Mapped[str | None] = mapped_column(String(150))
    entered_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    exited_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class GateEvent(Base):
    __tablename__ = "gate_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    movement_id: Mapped[int | None] = mapped_column(ForeignKey("truck_movement.id"), index=True)
    gate_no: Mapped[str] = mapped_column(String(20), index=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    security_user: Mapped[str | None] = mapped_column(String(50))
    remarks: Mapped[str | None] = mapped_column(Text)
    event_time: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class RFIDEvent(Base):
    __tablename__ = "rfid_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    movement_id: Mapped[int | None] = mapped_column(ForeignKey("truck_movement.id"), index=True)
    rfid_id: Mapped[str] = mapped_column(String(80), index=True)
    truck_number: Mapped[str | None] = mapped_column(String(20), index=True)
    reader_id: Mapped[str | None] = mapped_column(String(80))
    raw_payload: Mapped[str | None] = mapped_column(Text)
    event_time: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class Invoice(Base):
    __tablename__ = "invoice"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    movement_id: Mapped[int | None] = mapped_column(ForeignKey("truck_movement.id"), index=True)
    invoice_number: Mapped[str | None] = mapped_column(String(50), index=True)
    sap_document_number: Mapped[str | None] = mapped_column(String(50), index=True)
    truck_number: Mapped[str | None] = mapped_column(String(20), index=True)
    material_code: Mapped[str | None] = mapped_column(String(20), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    distributor_name: Mapped[str | None] = mapped_column(String(150))
    gst: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    qr_data: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(30), default="MANUAL")
    extraction_status: Mapped[str] = mapped_column(String(30), default="PENDING")
    uploaded_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class ERV(Base):
    __tablename__ = "erv"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    movement_id: Mapped[int | None] = mapped_column(ForeignKey("truck_movement.id"), index=True)
    ac4_number: Mapped[str | None] = mapped_column(String(50), index=True)
    delivery_challan_number: Mapped[str | None] = mapped_column(String(50), index=True)
    truck_number: Mapped[str | None] = mapped_column(String(20), index=True)
    distributor_name: Mapped[str | None] = mapped_column(String(150))
    material_code: Mapped[str | None] = mapped_column(String(20), index=True)
    cylinder_type: Mapped[str | None] = mapped_column(String(50))
    returned_quantity: Mapped[int] = mapped_column(Integer, default=0)
    safety_caps: Mapped[int] = mapped_column(Integer, default=0)
    empty_cylinder_quantity: Mapped[int] = mapped_column(Integer, default=0)
    qr_data: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(30), default="MANUAL")
    extraction_status: Mapped[str] = mapped_column(String(30), default="PENDING")
    uploaded_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class ManualERV(Base):
    __tablename__ = "manual_erv"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    manual_erv_number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    truck_number: Mapped[str] = mapped_column(String(20), index=True)
    driver_name: Mapped[str | None] = mapped_column(String(120))
    driver_mobile: Mapped[str | None] = mapped_column(String(20))
    transporter_name: Mapped[str | None] = mapped_column(String(150))
    distributor_name: Mapped[str | None] = mapped_column(String(150), index=True)
    distributor_sap_code: Mapped[str | None] = mapped_column(String(20), index=True)
    document_type: Mapped[str] = mapped_column(String(60))
    document_number: Mapped[str | None] = mapped_column(String(80))
    remarks: Mapped[str | None] = mapped_column(Text)
    attachment_refs: Mapped[str | None] = mapped_column(Text)
    total_quantity: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="PENDING_ONLINE_ERV", index=True)
    actual_erv_number: Mapped[str | None] = mapped_column(String(60), index=True)
    variance: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str | None] = mapped_column(String(50))
    approved_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class ManualERVLine(Base):
    __tablename__ = "manual_erv_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    manual_erv_id: Mapped[int] = mapped_column(ForeignKey("manual_erv.id"), index=True)
    material_code: Mapped[str] = mapped_column(String(20), index=True)
    cylinder_type: Mapped[str] = mapped_column(String(50))
    empty_quantity: Mapped[int] = mapped_column(Integer, default=0)
    safety_cap_quantity: Mapped[int] = mapped_column(Integer, default=0)
    damaged_quantity: Mapped[int] = mapped_column(Integer, default=0)


class StockTransfer(Base):
    __tablename__ = "stock_transfer"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_number: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    truck_number: Mapped[str | None] = mapped_column(String(20), index=True)
    transfer_type: Mapped[str] = mapped_column(String(40), index=True)
    vendor_name: Mapped[str | None] = mapped_column(String(150), index=True)
    vendor_code: Mapped[str | None] = mapped_column(String(40), index=True)
    transfer_date: Mapped[date] = mapped_column(Date, index=True)
    expected_return_date: Mapped[date | None] = mapped_column(Date, index=True)
    material_code: Mapped[str] = mapped_column(String(20), index=True)
    cylinder_type: Mapped[str] = mapped_column(String(50))
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    condition: Mapped[str | None] = mapped_column(String(40))
    attachment_refs: Mapped[str | None] = mapped_column(Text)
    return_date: Mapped[date | None] = mapped_column(Date, index=True)
    returned_quantity: Mapped[int] = mapped_column(Integer, default=0)
    rejected_quantity: Mapped[int] = mapped_column(Integer, default=0)
    scrap_quantity: Mapped[int] = mapped_column(Integer, default=0)
    repair_quantity: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="OPEN", index=True)
    remarks: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class SAPYM89(Base):
    __tablename__ = "sap_ym89"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_type: Mapped[str] = mapped_column(String(20), index=True)
    document_number: Mapped[str | None] = mapped_column(String(60), index=True)
    truck_number: Mapped[str | None] = mapped_column(String(20), index=True)
    distributor_name: Mapped[str | None] = mapped_column(String(150), index=True)
    material_code: Mapped[str | None] = mapped_column(String(20), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    posting_date: Mapped[date | None] = mapped_column(Date, index=True)
    raw_payload: Mapped[str | None] = mapped_column(Text)
    upload_batch: Mapped[str | None] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class Mismatch(Base):
    __tablename__ = "mismatch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mismatch_type: Mapped[str] = mapped_column(String(50), index=True)
    severity: Mapped[str] = mapped_column(String(20), default="RED", index=True)
    truck_number: Mapped[str | None] = mapped_column(String(20), index=True)
    material_code: Mapped[str | None] = mapped_column(String(20), index=True)
    expected_quantity: Mapped[int] = mapped_column(Integer, default=0)
    actual_quantity: Mapped[int] = mapped_column(Integer, default=0)
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="OPEN", index=True)
    resolved_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel: Mapped[str] = mapped_column(String(20), index=True)
    recipient_role: Mapped[str | None] = mapped_column(String(50), index=True)
    recipient: Mapped[str | None] = mapped_column(String(150))
    subject: Mapped[str] = mapped_column(String(180))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="QUEUED", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str | None] = mapped_column(String(50), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(80), index=True)
    before_state: Mapped[str | None] = mapped_column(Text)
    after_state: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class ShiftReport(Base):
    __tablename__ = "shift_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shift_date: Mapped[date] = mapped_column(Date, index=True)
    shift_name: Mapped[str] = mapped_column(String(30), index=True)
    gate_no: Mapped[str | None] = mapped_column(String(20), index=True)
    security_user: Mapped[str | None] = mapped_column(String(50), index=True)
    trucks_entered: Mapped[int] = mapped_column(Integer, default=0)
    trucks_exited: Mapped[int] = mapped_column(Integer, default=0)
    mismatches: Mapped[int] = mapped_column(Integer, default=0)
    remarks: Mapped[str | None] = mapped_column(Text)


class InventoryLedger(Base):
    __tablename__ = "inventory_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_type: Mapped[str] = mapped_column(String(40), index=True)
    material_code: Mapped[str] = mapped_column(String(20), index=True)
    cylinder_type: Mapped[str | None] = mapped_column(String(50))
    quantity_delta: Mapped[int] = mapped_column(Integer)
    reference_type: Mapped[str | None] = mapped_column(String(50), index=True)
    reference_id: Mapped[str | None] = mapped_column(String(80), index=True)
    remarks: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
