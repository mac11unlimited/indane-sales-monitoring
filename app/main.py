from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import get_settings
from app.core.database import SessionLocal, create_all
from app.services.scheduler import build_scheduler
from app.services.seed import seed_defaults


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_all()
    async with SessionLocal() as session:
        await seed_defaults(session)
    scheduler = build_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.include_router(router)

root = Path(__file__).resolve().parent.parent
static_dir = root / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def index():
    portal = root / "INDANE_SALES_MONITORING_PORTAL.html"
    if portal.exists():
        return FileResponse(portal)
    return FileResponse(static_dir / "index.html")
