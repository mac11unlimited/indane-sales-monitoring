from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.domain import Distributor, MaterialMaster, User


SEED_USERS = [
    ("admin", "ADMIN", "admin@indianoil.in"),
    ("Security Guard01", "SECURITY_GUARD", "security.guard01@indianoil.in"),
    ("Security Guard02", "SECURITY_GUARD", "security.guard02@indianoil.in"),
    ("Security Guard03", "SECURITY_GUARD", "security.guard03@indianoil.in"),
    ("Security Guard04", "SECURITY_GUARD", "security.guard04@indianoil.in"),
    ("S&D Officer01", "S&D_OFFICER", "sd.officer01@indianoil.in"),
    ("S&D Officer02", "S&D_OFFICER", "sd.officer02@indianoil.in"),
    ("Plant 2nd Incharge", "PLANT_2ND_INCHARGE", "plant.2nd.incharge@indianoil.in"),
    ("Plant Incharge", "PLANT_INCHARGE", "plant.incharge@indianoil.in"),
    ("Audit User", "AUDIT_USER", "audit.user@indianoil.in"),
    ("upso2", "UPSO_II", "upso2@indianoil.in"),
    ("ido_noida", "IDO_NOIDA", "ido.noida@indianoil.in"),
    ("ido_dehradun", "IDO_DEHRADUN", "ido.dehradun@indianoil.in"),
    ("plant_loni", "PLANT_LONI", "loni.bp@indianoil.in"),
    ("plant_aligarh", "PLANT_ALIGARH", "aligarh.bp@indianoil.in"),
    ("plant_haridwar", "PLANT_HARIDWAR", "haridwar.bp@indianoil.in"),
    ("plant_kashipur", "PLANT_KASHIPUR", "kashipur.bp@indianoil.in"),
    ("plant_karnal", "PLANT_KARNAL", "karnal.bp@indianoil.in"),
]


async def seed_defaults(session: AsyncSession) -> None:
    for username, role, email in SEED_USERS:
        if not await session.scalar(select(User).where(User.username == username)):
            session.add(
                User(
                    username=username,
                    password_hash=hash_password("Indane@12345"),
                    role=role,
                    email=email,
                    work_profile=f"{role} starter account",
                )
            )
    if not await session.scalar(select(Distributor).where(Distributor.sap_code == "175271")):
        session.add_all(
            [
                Distributor(
                    sap_code="175271",
                    name="AARYAMAN INDANE GAS AGENCY",
                    lsa_name="Baghpat LPG SA",
                    district="BAGHPAT",
                    urban_rural="Urban",
                    supply_plant="Loni BP",
                ),
                Distributor(
                    sap_code="156162",
                    name="AMAR INDANE GAS AGENCY",
                    lsa_name="Baghpat LPG SA",
                    district="BAGHPAT",
                    urban_rural="Urban Rural",
                    supply_plant="Loni BP",
                ),
                Distributor(
                    sap_code="103860",
                    name="Bhawan Indane Gas Service",
                    lsa_name="Baghpat LPG SA",
                    district="SHAMLI",
                    urban_rural="Urban",
                    supply_plant="Karnal BP",
                ),
            ]
        )
    if not await session.scalar(select(MaterialMaster).where(MaterialMaster.material_code == "M00087")):
        session.add_all(
            [
                MaterialMaster(material_code="M00087", cylinder_type="14.2 Kg", capacity_kg=14.2, tare_weight_kg=15.3),
                MaterialMaster(material_code="M00002", cylinder_type="19 Kg", capacity_kg=19, tare_weight_kg=18),
                MaterialMaster(material_code="M00065", cylinder_type="47.5 Kg", capacity_kg=47.5, tare_weight_kg=35),
            ]
        )
    await session.commit()
