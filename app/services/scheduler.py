from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import and_, func, select

from app.core.database import SessionLocal
from app.models.domain import AlertLog, DailySPD, Distributor, PlantExecution, User
from app.services.mail import send_html_email


def performance_table(rows: list[tuple[str, int, int]]) -> str:
    body = "".join(
        f"<tr><td>{plant}</td><td>{planned}</td><td>{invoiced}</td><td>{planned - invoiced}</td></tr>"
        for plant, planned, invoiced in rows
    )
    return (
        "<table border='1' cellspacing='0' cellpadding='6'>"
        "<thead><tr><th>Plant</th><th>Planned Loads</th><th>Invoiced Loads</th><th>Gap</th></tr></thead>"
        f"<tbody>{body}</tbody></table>"
    )


async def scan_missing_indent_alerts() -> None:
    today = date.today()
    async with SessionLocal() as session:
        result = await session.execute(
            select(DailySPD, Distributor, PlantExecution)
            .join(Distributor, Distributor.sap_code == DailySPD.sap_code)
            .join(
                PlantExecution,
                and_(
                    PlantExecution.sap_code == DailySPD.sap_code,
                    PlantExecution.execution_date == DailySPD.planning_date,
                ),
            )
            .where(
                DailySPD.planning_date == today,
                DailySPD.target_loads > 0,
                PlantExecution.sap_indent_available.is_(False),
            )
        )
        rows = result.all()
        idos = (await session.execute(select(User.email).where(User.role.in_(["IDO_NOIDA", "IDO_DEHRADUN"])))).scalars().all()
        for spd, distributor, execution in rows:
            message = f"{distributor.name} ({distributor.sap_code}) has approved SPD but SAP indent is missing at {distributor.supply_plant}."
            session.add(AlertLog(alert_type="SAP_INDENT_MISSING", sap_code=distributor.sap_code, message=message, sent_to=",".join(idos)))
            await send_html_email("INDANE SPD Exception: Missing SAP indent", list(idos), f"<b>{message}</b>")
        await session.commit()


async def broadcast_four_hour_summary() -> None:
    today = date.today()
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(
                    Distributor.supply_plant,
                    func.coalesce(func.sum(DailySPD.target_loads), 0),
                    func.coalesce(func.sum(PlantExecution.loads_invoiced), 0),
                )
                .join(DailySPD, DailySPD.sap_code == Distributor.sap_code)
                .outerjoin(
                    PlantExecution,
                    and_(
                        PlantExecution.sap_code == DailySPD.sap_code,
                        PlantExecution.execution_date == DailySPD.planning_date,
                    ),
                )
                .where(DailySPD.planning_date == today)
                .group_by(Distributor.supply_plant)
            )
        ).all()
        recipients = (await session.execute(select(User.email))).scalars().all()
        await send_html_email("INDANE 4-Hour Sales Monitoring Summary", list(recipients), performance_table(rows))


async def close_day_and_carryover() -> None:
    today = date.today()
    async with SessionLocal() as session:
        result = await session.execute(
            select(DailySPD, PlantExecution)
            .outerjoin(
                PlantExecution,
                and_(
                    PlantExecution.sap_code == DailySPD.sap_code,
                    PlantExecution.execution_date == DailySPD.planning_date,
                ),
            )
            .where(DailySPD.planning_date == today)
        )
        for spd, execution in result.all():
            invoiced = execution.loads_invoiced if execution else 0
            if spd.target_loads > invoiced:
                spd.backlog_qty = max(spd.backlog_qty, (spd.target_loads - invoiced) * 360)
                spd.priority_level = "High"
        await session.commit()


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(scan_missing_indent_alerts, "interval", hours=2, id="missing-indent-scanner")
    scheduler.add_job(broadcast_four_hour_summary, "interval", hours=4, id="broadcast-summary")
    scheduler.add_job(close_day_and_carryover, "cron", hour=22, minute=0, id="day-end-close")
    return scheduler
