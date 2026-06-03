from datetime import date, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import Integer, and_, cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import create_access_token, current_user, hash_password, require_roles, verify_password
from app.models.domain import (
    AlertLog,
    AuditLog,
    DailySPD,
    Distributor,
    ERV,
    GateEvent,
    Holiday,
    InventoryLedger,
    Invoice,
    ManualERV,
    ManualERVLine,
    MaterialMaster,
    McsiSale,
    Mismatch,
    MonthlyBaseline,
    Notification,
    PlantExecution,
    RFIDEvent,
    SAPYM89,
    StockTransfer,
    TruckMaster,
    TruckMovement,
    User,
)
from app.schemas.api import (
    AlertOut,
    BaselineGenerateRequest,
    DailySPDIn,
    DistributorIn,
    ERVIn,
    GateAdvanceIn,
    GateEntryIn,
    HolidayIn,
    InvoiceIn,
    LinkManualERVIn,
    ManualERVIn,
    MaterialIn,
    PlantExecutionIn,
    ProfileUpdate,
    ResolveMismatchIn,
    StockTransferIn,
    StockTransferReturnIn,
    TokenOut,
)
from app.services.imports import parse_indent_planning, parse_mcsi_sales, read_tabular_upload
from app.services.lpg import (
    create_mismatch_if_needed,
    extract_document_fields,
    match_status,
    movement_dashboard,
    next_manual_erv_number,
    normalize_ym89,
    post_inventory,
    read_ym89,
)
from app.services.metrics import active_working_days, cylinders_to_loads, daily_baseline_cylinders

router = APIRouter(prefix="/api")


def plant_from_role(role: str) -> str | None:
    mapping = {
        "PLANT_LONI": "Loni BP",
        "PLANT_ALIGARH": "Aligarh BP",
        "PLANT_HARIDWAR": "Haridwar BP",
        "PLANT_KASHIPUR": "Kashipur BP",
        "PLANT_KARNAL": "Karnal BP",
    }
    return mapping.get(role)


@router.post("/auth/login", response_model=TokenOut)
async def login(
    session: Annotated[AsyncSession, Depends(get_session)],
    username: str = Form(),
    password: str = Form(),
) -> TokenOut:
    user = await session.scalar(select(User).where(User.username == username))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenOut(access_token=create_access_token(user.username, user.role), role=user.role)


@router.post("/auth/forgot-password")
async def forgot_password(payload: dict, session: Annotated[AsyncSession, Depends(get_session)]):
    email = payload.get("email", "")
    user = await session.scalar(select(User).where(User.email == email))
    if user:
        session.add(AlertLog(alert_type="PASSWORD_RESET", sap_code=None, message=f"Password reset requested for {user.username}", sent_to=user.email))
        await session.commit()
    return {"status": "accepted", "message": "If the email exists, reset instructions will be sent."}


@router.post("/auth/forgot-password")
async def forgot_password(
    session: Annotated[AsyncSession, Depends(get_session)],
    username: str = Form(),
    channel: str = Form(default="MOBILE"),
):
    user = await session.scalar(select(User).where(User.username == username))
    if user:
        session.add(
            Notification(
                channel=channel.upper(),
                recipient_role=user.role,
                recipient=user.phone_number if channel.upper() == "MOBILE" else user.email,
                subject="Password reset OTP",
                message="Password reset OTP requested. Connect SMS/email gateway before production use.",
                status="QUEUED",
            )
        )
        await session.commit()
    return {"status": "reset_requested"}


@router.post("/auth/reset-password")
async def reset_password(
    session: Annotated[AsyncSession, Depends(get_session)],
    username: str = Form(),
    otp: str = Form(),
    new_password: str = Form(),
):
    user = await session.scalar(select(User).where(User.username == username))
    if not user or not otp:
        raise HTTPException(status_code=400, detail="Invalid reset request")
    user.password_hash = hash_password(new_password)
    session.add(AuditLog(username=username, action="PASSWORD_RESET", entity_type="User", entity_id=username))
    await session.commit()
    return {"status": "password_reset"}


@router.post("/auth/mfa/verify")
async def verify_mfa(
    session: Annotated[AsyncSession, Depends(get_session)],
    username: str = Form(),
    otp: str = Form(),
):
    user = await session.scalar(select(User).where(User.username == username))
    if not user or not otp:
        raise HTTPException(status_code=401, detail="Invalid MFA request")
    return {"status": "verified"}


@router.get("/me")
async def me(user: Annotated[User, Depends(current_user)]):
    return {"username": user.username, "role": user.role, "email": user.email, "phone_number": user.phone_number, "work_profile": user.work_profile}


@router.get("/users")
async def users(
    _: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    rows = (await session.execute(select(User).order_by(User.role, User.username))).scalars().all()
    return [
        {
            "username": row.username,
            "role": row.role,
            "lsa_name": "",
            "email": row.email,
            "work_profile": row.work_profile,
        }
        for row in rows
    ]


@router.put("/me")
async def update_profile(
    payload: ProfileUpdate,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if payload.email:
        user.email = str(payload.email)
    user.phone_number = payload.phone_number
    user.work_profile = payload.work_profile
    await session.commit()
    return {"status": "updated"}


@router.post("/distributors")
async def upsert_distributor(
    payload: DistributorIn,
    _: Annotated[User, Depends(require_roles("ADMIN", "IDO_NOIDA", "IDO_DEHRADUN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    stmt = insert(Distributor).values(**payload.model_dump()).on_conflict_do_update(
        index_elements=[Distributor.sap_code],
        set_=payload.model_dump(exclude={"sap_code"}),
    )
    await session.execute(stmt)
    await session.commit()
    return {"status": "upserted", "sap_code": payload.sap_code}


@router.get("/distributors")
async def list_distributors(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    stmt = select(Distributor).where(Distributor.is_active.is_(True)).order_by(Distributor.lsa_name, Distributor.name)
    plant = plant_from_role(user.role)
    if plant:
        stmt = stmt.where(Distributor.supply_plant == plant)
    rows = (await session.execute(stmt)).scalars().all()
    return rows


@router.post("/spd")
async def upsert_spd(
    payload: DailySPDIn,
    user: Annotated[User, Depends(require_roles("ADMIN", "IDO_NOIDA", "IDO_DEHRADUN", "UPSO_II"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    distributor = await session.get(Distributor, payload.sap_code)
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    values = payload.model_dump()
    values["target_loads"] = cylinders_to_loads(payload.target_cylinders)
    values["approved_by"] = user.username
    stmt = insert(DailySPD).values(**values).on_conflict_do_update(
        constraint="uq_daily_spd_date_sap",
        set_={k: v for k, v in values.items() if k not in {"planning_date", "sap_code"}},
    )
    await session.execute(stmt)
    await session.commit()
    return {"status": "approved", "target_loads": values["target_loads"]}


@router.get("/spd/{planning_date}")
async def get_spd(
    planning_date: date,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    stmt = (
        select(DailySPD, Distributor, PlantExecution)
        .join(Distributor, Distributor.sap_code == DailySPD.sap_code)
        .outerjoin(
            PlantExecution,
            and_(PlantExecution.sap_code == DailySPD.sap_code, PlantExecution.execution_date == DailySPD.planning_date),
        )
        .where(DailySPD.planning_date == planning_date)
        .order_by(DailySPD.priority_level, DailySPD.backlog_qty.desc(), Distributor.name)
    )
    plant = plant_from_role(user.role)
    if plant:
        stmt = stmt.where(Distributor.supply_plant == plant)
    rows = (await session.execute(stmt)).all()
    return [
        {
            "sap_code": d.sap_code,
            "name": d.name,
            "lsa_name": d.lsa_name,
            "supply_plant": d.supply_plant,
            "target_loads": spd.target_loads,
            "target_cylinders": spd.target_cylinders,
            "priority_level": spd.priority_level,
            "backlog_qty": spd.backlog_qty,
            "loads_invoiced": ex.loads_invoiced if ex else 0,
            "sap_indent_available": ex.sap_indent_available if ex else True,
            "fund_shortage_block": ex.fund_shortage_block if ex else False,
            "other_issue_flag": ex.other_issue_flag if ex else "",
        }
        for spd, d, ex in rows
    ]


@router.post("/execution")
async def log_execution(
    payload: PlantExecutionIn,
    user: Annotated[User, Depends(require_roles("PLANT_LONI", "PLANT_ALIGARH", "PLANT_HARIDWAR", "PLANT_KASHIPUR", "PLANT_KARNAL"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    plant = plant_from_role(user.role)
    distributor = await session.get(Distributor, payload.sap_code)
    if not distributor or distributor.supply_plant != plant:
        raise HTTPException(status_code=403, detail="Distributor is outside this plant workspace")
    spd = await session.scalar(select(DailySPD).where(DailySPD.planning_date == payload.execution_date, DailySPD.sap_code == payload.sap_code))
    if not spd:
        raise HTTPException(status_code=409, detail="Execution blocked: approved SPD allocation is required for this operating day")
    values = payload.model_dump()
    values["entered_by"] = user.username
    stmt = insert(PlantExecution).values(**values).on_conflict_do_update(
        constraint="uq_plant_execution_date_sap",
        set_={k: v for k, v in values.items() if k not in {"execution_date", "sap_code"}},
    )
    await session.execute(stmt)
    await session.commit()
    return {"status": "logged"}


@router.post("/upload/indent-planning")
async def upload_indent_planning(
    file: UploadFile,
    planning_date: date = Form(),
    _: User = Depends(require_roles("ADMIN", "IDO_NOIDA", "IDO_DEHRADUN")),
    session: AsyncSession = Depends(get_session),
):
    df = read_tabular_upload(file.filename or "upload.xlsx", await file.read())
    distributors, spd_rows = parse_indent_planning(df)
    for item in distributors:
        values = item.__dict__
        await session.execute(
            insert(Distributor)
            .values(**values)
            .on_conflict_do_update(index_elements=[Distributor.sap_code], set_={k: v for k, v in values.items() if k != "sap_code"})
        )
    for item in spd_rows:
        values = {**item.__dict__, "planning_date": planning_date}
        await session.execute(
            insert(DailySPD)
            .values(**values)
            .on_conflict_do_update(
                constraint="uq_daily_spd_date_sap",
                set_={k: v for k, v in values.items() if k not in {"planning_date", "sap_code"}},
            )
        )
    await session.commit()
    return {"distributors": len(distributors), "spd_rows": len(spd_rows)}


@router.post("/upload/mcsi-sales")
async def upload_mcsi_sales(
    file: UploadFile,
    _: User = Depends(require_roles("ADMIN", "UPSO_II", "IDO_NOIDA", "IDO_DEHRADUN")),
    session: AsyncSession = Depends(get_session),
):
    df = read_tabular_upload(file.filename or "mcsi.txt", await file.read())
    rows = parse_mcsi_sales(df)
    await session.execute(delete(McsiSale).where(McsiSale.source_file == file.filename))
    for row in rows:
        session.add(McsiSale(**row.__dict__, source_file=file.filename))
    await session.commit()
    return {"rows_imported": len(rows)}


@router.post("/upload/backlog")
async def upload_backlog(
    file: UploadFile,
    _: User = Depends(require_roles("ADMIN", "IDO_NOIDA", "IDO_DEHRADUN")),
):
    return {"status": "accepted", "filename": file.filename}


@router.post("/upload/distributors")
async def upload_distributors(
    file: UploadFile,
    _: User = Depends(require_roles("ADMIN", "IDO_NOIDA", "IDO_DEHRADUN")),
):
    return {"status": "accepted", "filename": file.filename}


@router.get("/reports/day.csv")
async def day_report_csv(
    date: date,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    rows = await get_spd(date, user, session)
    header = ["Date", "SAP Code", "Distributor", "LSA", "Plant", "SPD Loads", "SPD Cylinders", "Indent Available", "Fund Short", "Invoiced Loads", "Other Issue"]
    lines = [",".join(header)]
    for row in rows:
        values = [
            date.isoformat(),
            row["sap_code"],
            row["name"],
            row["lsa_name"],
            row["supply_plant"],
            row["target_loads"],
            row["target_cylinders"],
            "Yes" if row["sap_indent_available"] else "No",
            "Yes" if row["fund_shortage_block"] else "No",
            row["loads_invoiced"],
            row["other_issue_flag"],
        ]
        lines.append(",".join(f'"{str(value).replace(chr(34), chr(34) + chr(34))}"' for value in values))
    return Response(
        "\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="indane-spd-dispatch-{date.isoformat()}.csv"'},
    )


@router.post("/holidays")
async def upsert_holiday(
    payload: HolidayIn,
    _: Annotated[User, Depends(require_roles("ADMIN", "UPSO_II"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    await session.execute(
        insert(Holiday)
        .values(**payload.model_dump())
        .on_conflict_do_update(index_elements=[Holiday.holiday_date], set_={"label": payload.label})
    )
    await session.commit()
    return {"status": "saved"}


@router.post("/baseline/generate")
async def generate_baseline(
    payload: BaselineGenerateRequest,
    user: Annotated[User, Depends(require_roles("ADMIN", "UPSO_II", "IDO_NOIDA", "IDO_DEHRADUN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    holidays = set((await session.execute(select(Holiday.holiday_date))).scalars().all())
    working_days = len(active_working_days(payload.planning_date.year, payload.planning_date.month, holidays))
    baselines = (await session.execute(select(MonthlyBaseline).where(MonthlyBaseline.month == payload.planning_date.month))).scalars().all()
    count = 0
    for baseline in baselines:
        cylinders = daily_baseline_cylinders(baseline.last_year_volume_mt, payload.growth_target_pct, working_days)
        values = {
            "planning_date": payload.planning_date,
            "sap_code": baseline.sap_code,
            "target_cylinders": cylinders,
            "target_loads": cylinders_to_loads(cylinders),
            "priority_level": "Normal",
            "approved_by": user.username,
        }
        await session.execute(insert(DailySPD).values(**values).on_conflict_do_update(constraint="uq_daily_spd_date_sap", set_=values))
        count += 1
    await session.commit()
    return {"generated": count, "working_days": working_days}


def audit(user: User, action: str, entity_type: str, entity_id: str | None, after_state: str | None = None) -> AuditLog:
    return AuditLog(username=user.username, action=action, entity_type=entity_type, entity_id=entity_id, after_state=after_state)


@router.get("/lpg/materials")
async def list_materials(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    rows = (await session.execute(select(MaterialMaster).order_by(MaterialMaster.material_code))).scalars().all()
    return rows


@router.post("/lpg/materials")
async def upsert_material(
    payload: MaterialIn,
    user: Annotated[User, Depends(require_roles("ADMIN", "PLANT_INCHARGE"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    material = await session.get(MaterialMaster, payload.material_code)
    if material:
        for key, value in payload.model_dump().items():
            setattr(material, key, value)
    else:
        material = MaterialMaster(**payload.model_dump())
        session.add(material)
    session.add(audit(user, "UPSERT", "MaterialMaster", payload.material_code, payload.model_dump_json()))
    await session.commit()
    return {"status": "saved", "material_code": payload.material_code}


@router.post("/lpg/gate-entry")
async def create_gate_entry(
    payload: GateEntryIn,
    user: Annotated[User, Depends(require_roles("SECURITY_GUARD", "S&D_OFFICER", "PLANT_INCHARGE"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    truck = await session.get(TruckMaster, payload.truck_number)
    if truck:
        truck.driver_name = payload.driver_name or truck.driver_name
        truck.driver_mobile = payload.driver_mobile or truck.driver_mobile
        truck.transporter_name = payload.transporter_name or truck.transporter_name
        truck.rfid_id = payload.rfid_id or truck.rfid_id
    else:
        session.add(
            TruckMaster(
                truck_number=payload.truck_number,
                transporter_name=payload.transporter_name,
                rfid_id=payload.rfid_id,
                driver_name=payload.driver_name,
                driver_mobile=payload.driver_mobile,
            )
        )
    movement = TruckMovement(
        flow_type=payload.flow_type,
        truck_number=payload.truck_number,
        driver_name=payload.driver_name,
        driver_mobile=payload.driver_mobile,
        transporter_name=payload.transporter_name,
        distributor_name=payload.distributor_name,
        distributor_sap_code=payload.distributor_sap_code,
        load_slip_no=payload.load_slip_no,
        route=payload.route,
        destination=payload.destination,
        expected_quantity=payload.expected_quantity,
        physical_quantity=payload.physical_quantity,
        current_stage="GATE0",
        match_status=match_status(payload.expected_quantity, payload.physical_quantity),
        entered_by=user.username,
    )
    session.add(movement)
    await session.flush()
    session.add(GateEvent(movement_id=movement.id, gate_no="GATE0", event_type="ENTRY", security_user=user.username))
    if payload.rfid_id:
        session.add(RFIDEvent(movement_id=movement.id, rfid_id=payload.rfid_id, truck_number=payload.truck_number, reader_id="GATE0"))
    await create_mismatch_if_needed(
        session,
        mismatch_type="TRUCK_QUANTITY",
        truck_number=payload.truck_number,
        expected_quantity=payload.expected_quantity,
        actual_quantity=payload.physical_quantity,
        details=f"Gate entry quantity mismatch for {payload.truck_number}",
    )
    session.add(audit(user, "CREATE", "TruckMovement", str(movement.id), payload.model_dump_json()))
    await session.commit()
    return {"status": movement.match_status, "movement_id": movement.id, "current_stage": movement.current_stage}


@router.post("/lpg/gate-event")
async def advance_gate(
    payload: GateAdvanceIn,
    user: Annotated[User, Depends(require_roles("SECURITY_GUARD", "S&D_OFFICER", "PLANT_INCHARGE"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    movement = await session.get(TruckMovement, payload.movement_id)
    if not movement:
        raise HTTPException(status_code=404, detail="Truck movement not found")
    if payload.physical_quantity is not None:
        movement.physical_quantity = payload.physical_quantity
    movement.current_stage = payload.gate_no
    movement.match_status = match_status(movement.expected_quantity, movement.physical_quantity)
    if payload.gate_no.upper() in {"GATE2", "EXIT"} and movement.match_status == "GREEN":
        movement.exited_at = datetime.utcnow()
    session.add(GateEvent(movement_id=movement.id, gate_no=payload.gate_no, event_type=payload.event_type, security_user=user.username, remarks=payload.remarks))
    await create_mismatch_if_needed(
        session,
        mismatch_type="GATE_EXIT",
        truck_number=movement.truck_number,
        expected_quantity=movement.expected_quantity,
        actual_quantity=movement.physical_quantity,
        details=f"Gate validation status {movement.match_status} for {movement.truck_number}",
    )
    session.add(audit(user, "ADVANCE", "TruckMovement", str(movement.id), payload.model_dump_json()))
    await session.commit()
    return {"status": movement.match_status, "allow_exit": movement.match_status == "GREEN", "current_stage": movement.current_stage}


@router.get("/lpg/movements")
async def list_movements(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    rows = (await session.execute(select(TruckMovement).order_by(TruckMovement.created_at.desc()).limit(100))).scalars().all()
    return rows


@router.post("/lpg/invoices")
async def save_invoice(
    payload: InvoiceIn,
    user: Annotated[User, Depends(require_roles("S&D_OFFICER", "PLANT_INCHARGE", "ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    invoice = Invoice(**payload.model_dump(), extraction_status="CAPTURED", uploaded_by=user.username)
    session.add(invoice)
    if payload.material_code and payload.quantity:
        await post_inventory(session, transaction_type="FILLED_DISPATCH", material_code=payload.material_code, cylinder_type=None, quantity_delta=-payload.quantity, reference_type="INVOICE", reference_id=payload.invoice_number or "manual")
    if payload.movement_id:
        movement = await session.get(TruckMovement, payload.movement_id)
        if movement:
            movement.expected_quantity = payload.quantity or movement.expected_quantity
            movement.match_status = match_status(movement.expected_quantity, movement.physical_quantity)
    session.add(audit(user, "CREATE", "Invoice", payload.invoice_number, payload.model_dump_json()))
    await session.commit()
    return {"status": "captured"}


@router.post("/lpg/erv")
async def save_erv(
    payload: ERVIn,
    user: Annotated[User, Depends(require_roles("SECURITY_GUARD", "S&D_OFFICER", "PLANT_INCHARGE", "ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    erv = ERV(**payload.model_dump(), extraction_status="CAPTURED", uploaded_by=user.username)
    session.add(erv)
    if payload.material_code and payload.empty_cylinder_quantity:
        await post_inventory(session, transaction_type="EMPTY_RETURN", material_code=payload.material_code, cylinder_type=payload.cylinder_type, quantity_delta=payload.empty_cylinder_quantity, reference_type="ERV", reference_id=payload.delivery_challan_number or payload.ac4_number or "manual")
    session.add(audit(user, "CREATE", "ERV", payload.delivery_challan_number or payload.ac4_number, payload.model_dump_json()))
    await session.commit()
    return {"status": "captured"}


@router.post("/lpg/ocr/extract")
async def ocr_extract(
    file: UploadFile,
    user: Annotated[User, Depends(require_roles("SECURITY_GUARD", "S&D_OFFICER", "PLANT_INCHARGE", "ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    extracted = extract_document_fields(file.filename or "upload", await file.read())
    session.add(audit(user, "EXTRACT", "Document", file.filename, str(extracted)))
    await session.commit()
    return extracted


@router.post("/lpg/manual-erv")
async def create_manual_erv(
    payload: ManualERVIn,
    user: Annotated[User, Depends(require_roles("SECURITY_GUARD", "S&D_OFFICER", "PLANT_INCHARGE"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    number = await next_manual_erv_number(session)
    total = sum(line.empty_quantity for line in payload.lines)
    manual = ManualERV(
        manual_erv_number=number,
        truck_number=payload.truck_number,
        driver_name=payload.driver_name,
        driver_mobile=payload.driver_mobile,
        transporter_name=payload.transporter_name,
        distributor_name=payload.distributor_name,
        distributor_sap_code=payload.distributor_sap_code,
        document_type=payload.document_type,
        document_number=payload.document_number,
        remarks=payload.remarks,
        attachment_refs=payload.attachment_refs,
        total_quantity=total,
        created_by=user.username,
    )
    session.add(manual)
    await session.flush()
    for line in payload.lines:
        session.add(ManualERVLine(manual_erv_id=manual.id, **line.model_dump()))
        await post_inventory(session, transaction_type="MANUAL_EMPTY_RETURN", material_code=line.material_code, cylinder_type=line.cylinder_type, quantity_delta=line.empty_quantity, reference_type="MANUAL_ERV", reference_id=number)
    session.add(Notification(channel="APP", recipient_role="S&D_OFFICER", subject="Manual ERV pending", message=f"{number} needs online ERV linking", status="QUEUED"))
    session.add(audit(user, "CREATE", "ManualERV", number, payload.model_dump_json()))
    await session.commit()
    return {"status": "PENDING_ONLINE_ERV", "manual_erv_number": number, "total_quantity": total}


@router.post("/lpg/manual-erv/link")
async def link_manual_erv(
    payload: LinkManualERVIn,
    user: Annotated[User, Depends(require_roles("S&D_OFFICER", "PLANT_INCHARGE"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    manual = await session.scalar(select(ManualERV).where(ManualERV.manual_erv_number == payload.manual_erv_number))
    if not manual:
        raise HTTPException(status_code=404, detail="Manual ERV not found")
    manual.actual_erv_number = payload.actual_erv_number
    manual.variance = payload.actual_quantity - manual.total_quantity
    manual.status = "CLOSED" if manual.variance == 0 else "VARIANCE_APPROVAL_REQUIRED"
    manual.closed_at = datetime.utcnow() if manual.status == "CLOSED" else None
    manual.approved_by = user.username
    await create_mismatch_if_needed(
        session,
        mismatch_type="MANUAL_ERV_CLOSURE",
        truck_number=manual.truck_number,
        expected_quantity=manual.total_quantity,
        actual_quantity=payload.actual_quantity,
        details=f"Manual ERV {manual.manual_erv_number} linked with {payload.actual_erv_number}",
    )
    session.add(audit(user, "LINK", "ManualERV", payload.manual_erv_number, payload.model_dump_json()))
    await session.commit()
    return {"status": manual.status, "variance": manual.variance}


@router.get("/lpg/manual-erv")
async def list_manual_erv(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    rows = (await session.execute(select(ManualERV).order_by(ManualERV.created_at.desc()).limit(100))).scalars().all()
    return rows


@router.post("/lpg/stock-transfer")
async def create_stock_transfer(
    payload: StockTransferIn,
    user: Annotated[User, Depends(require_roles("S&D_OFFICER", "PLANT_INCHARGE", "ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    existing = await session.scalar(select(StockTransfer).where(StockTransfer.transfer_number == payload.transfer_number))
    if existing:
        raise HTTPException(status_code=409, detail="Transfer number already exists")
    transfer = StockTransfer(**payload.model_dump(), created_by=user.username)
    session.add(transfer)
    await post_inventory(session, transaction_type="REPAIR_TRANSFER", material_code=payload.material_code, cylinder_type=payload.cylinder_type, quantity_delta=-payload.quantity, reference_type="STOCK_TRANSFER", reference_id=payload.transfer_number)
    session.add(audit(user, "CREATE", "StockTransfer", payload.transfer_number, payload.model_dump_json()))
    await session.commit()
    return {"status": "OPEN", "transfer_number": payload.transfer_number}


@router.post("/lpg/stock-transfer/return")
async def return_stock_transfer(
    payload: StockTransferReturnIn,
    user: Annotated[User, Depends(require_roles("S&D_OFFICER", "PLANT_INCHARGE", "ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    transfer = await session.scalar(select(StockTransfer).where(StockTransfer.transfer_number == payload.transfer_number))
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    transfer.return_date = payload.return_date
    transfer.returned_quantity = payload.returned_quantity
    transfer.rejected_quantity = payload.rejected_quantity
    transfer.scrap_quantity = payload.scrap_quantity
    transfer.repair_quantity = payload.repair_quantity
    transfer.remarks = payload.remarks
    transfer.status = "CLOSED" if payload.returned_quantity + payload.scrap_quantity >= transfer.quantity else "PARTIAL_RETURN"
    await post_inventory(session, transaction_type="REPAIR_RETURN", material_code=transfer.material_code, cylinder_type=transfer.cylinder_type, quantity_delta=payload.returned_quantity, reference_type="STOCK_TRANSFER", reference_id=payload.transfer_number)
    if payload.scrap_quantity:
        await post_inventory(session, transaction_type="SCRAP", material_code=transfer.material_code, cylinder_type=transfer.cylinder_type, quantity_delta=-payload.scrap_quantity, reference_type="STOCK_TRANSFER", reference_id=payload.transfer_number)
    await create_mismatch_if_needed(
        session,
        mismatch_type="REPAIR_RETURN",
        truck_number=transfer.truck_number,
        material_code=transfer.material_code,
        expected_quantity=transfer.quantity,
        actual_quantity=payload.returned_quantity + payload.scrap_quantity,
        details=f"Stock transfer {payload.transfer_number} return variance",
    )
    session.add(audit(user, "RETURN", "StockTransfer", payload.transfer_number, payload.model_dump_json()))
    await session.commit()
    return {"status": transfer.status}


@router.get("/lpg/stock-transfer")
async def list_stock_transfer(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    rows = (await session.execute(select(StockTransfer).order_by(StockTransfer.created_at.desc()).limit(100))).scalars().all()
    return rows


@router.post("/lpg/ym89/reconcile")
async def reconcile_ym89(
    issue_file: UploadFile = File(),
    receipt_file: UploadFile = File(),
    user: User = Depends(require_roles("S&D_OFFICER", "PLANT_INCHARGE", "ADMIN", "AUDIT_USER")),
    session: AsyncSession = Depends(get_session),
):
    batch = f"YM89-{datetime.utcnow():%Y%m%d%H%M%S}-{uuid4().hex[:6]}"
    imported = 0
    for source_type, upload in (("ISSUE", issue_file), ("RECEIPT", receipt_file)):
        rows = normalize_ym89(read_ym89(upload.filename or source_type, await upload.read()))
        for row in rows:
            session.add(SAPYM89(source_type=source_type, upload_batch=batch, **row))
            imported += 1
            if row["truck_number"] and row["quantity"] == 0:
                session.add(Mismatch(mismatch_type="SAP_YM89_ZERO_QTY", truck_number=row["truck_number"], expected_quantity=1, actual_quantity=0, details=f"{source_type} row has no quantity in batch {batch}"))
    session.add(audit(user, "UPLOAD", "SAPYM89", batch, f"rows={imported}"))
    await session.commit()
    return {"batch": batch, "rows_imported": imported, "report": "Mismatch rows are available in /api/lpg/mismatches"}


@router.get("/lpg/mismatches")
async def list_mismatches(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    rows = (await session.execute(select(Mismatch).order_by(Mismatch.created_at.desc()).limit(100))).scalars().all()
    return rows


@router.post("/lpg/mismatches/resolve")
async def resolve_mismatch(
    payload: ResolveMismatchIn,
    user: Annotated[User, Depends(require_roles("S&D_OFFICER", "PLANT_2ND_INCHARGE", "PLANT_INCHARGE", "ADMIN"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    mismatch = await session.get(Mismatch, payload.mismatch_id)
    if not mismatch:
        raise HTTPException(status_code=404, detail="Mismatch not found")
    mismatch.status = payload.status
    mismatch.resolved_by = user.username
    mismatch.resolved_at = datetime.utcnow()
    session.add(audit(user, "RESOLVE", "Mismatch", str(payload.mismatch_id), payload.model_dump_json()))
    await session.commit()
    return {"status": mismatch.status}


@router.get("/lpg/inventory")
async def inventory_summary(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    rows = (
        await session.execute(
            select(
                InventoryLedger.material_code,
                InventoryLedger.cylinder_type,
                func.coalesce(func.sum(InventoryLedger.quantity_delta), 0).label("current_inventory"),
            ).group_by(InventoryLedger.material_code, InventoryLedger.cylinder_type)
        )
    ).all()
    return [{"material_code": material, "cylinder_type": cyl, "current_inventory": int(qty or 0)} for material, cyl, qty in rows]


@router.get("/lpg/dashboard")
async def lpg_dashboard(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    data = await movement_dashboard(session)
    inventory = await inventory_summary(session, _)
    notifications = (await session.execute(select(Notification).order_by(Notification.created_at.desc()).limit(10))).scalars().all()
    data["inventory"] = inventory
    data["notifications"] = notifications
    return data


@router.get("/dashboard")
async def dashboard(session: Annotated[AsyncSession, Depends(get_session)], _: Annotated[User, Depends(current_user)]):
    today = date.today()
    daily = (
        await session.execute(
            select(
                Distributor.supply_plant,
                func.coalesce(func.sum(DailySPD.target_loads), 0).label("planned"),
                func.coalesce(func.sum(PlantExecution.loads_invoiced), 0).label("invoiced"),
            )
            .join(DailySPD, DailySPD.sap_code == Distributor.sap_code)
            .outerjoin(PlantExecution, and_(PlantExecution.sap_code == DailySPD.sap_code, PlantExecution.execution_date == DailySPD.planning_date))
            .where(DailySPD.planning_date == today)
            .group_by(Distributor.supply_plant)
        )
    ).all()
    exceptions = (
        await session.execute(
            select(
                func.sum(cast(PlantExecution.sap_indent_available.is_(False), Integer)).label("missing_indent"),
                func.sum(cast(PlantExecution.fund_shortage_block.is_(True), Integer)).label("fund_blocks"),
            ).where(PlantExecution.execution_date == today)
        )
    ).first()
    alerts = (await session.execute(select(AlertLog).order_by(AlertLog.created_at.desc()).limit(10))).scalars().all()
    return {
        "daily_by_plant": [{"plant": p, "planned": int(planned or 0), "invoiced": int(invoiced or 0)} for p, planned, invoiced in daily],
        "exceptions": {"missing_indent": int((exceptions or [0, 0])[0] or 0), "fund_blocks": int((exceptions or [0, 0])[1] or 0), "logistics": 0},
        "strategic": {
            "months": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
            "last_year_mt": [77187, 68260, 70400, 72100, 73800, 74250],
            "target_mt": [81046, 71673, 73920, 75705, 77490, 77962],
            "actual_mt": [68260, 51220, 0, 0, 0, 0],
        },
        "heatmap": [
            {"name": "Baghpat LPG SA", "plant": "Loni BP", "performance": 104},
            {"name": "Muzaffarnagar LSA", "plant": "Karnal BP", "performance": 98},
            {"name": "Dehradun LSA", "plant": "Haridwar BP", "performance": 113},
            {"name": "Kashipur LSA", "plant": "Kashipur BP", "performance": 91},
        ],
        "alerts": [AlertOut.model_validate(alert).model_dump(mode="json") for alert in alerts],
    }
