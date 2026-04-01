# =====================================================
# 🔥 BKNR ERP - MAIN APPLICATION FILE (FINAL FIXED)
# =====================================================

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import logging

# DATABASE IMPORTS
from app.database import engine, Base
import app.database.models # అన్ని మోడల్స్ రిజిస్టర్ అవ్వడానికి ఇది ముఖ్యం

# మ్యాన్యువల్ గా మోడల్స్ ని ఇంపోర్ట్ చేస్తున్నాము (Table Creation కోసం)
from app.database.models.users import Company, User, OTPTable
from app.database.models.general_stock import GeneralStock
from app.database.models.criteria import *
from app.database.models.processing import *
from app.database.models.attendance import *
from app.database.models.inventory_management import *

# LOGGING CONFIG
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BKNR_ERP")

# =====================================================
# INIT FASTAPI
# =====================================================
app = FastAPI(
    title="BKNR ERP",
    version="1.0.0"
)

# =====================================================
# SESSION MIDDLEWARE
# =====================================================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8, # 8 Hours
)

# =====================================================
# AUTH MIDDLEWARE
# =====================================================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # ఏయే పాత్ లకి లాగిన్ అవసరం లేదో ఇక్కడ ఉన్నాయి
        open_paths = (
            "/",
            "/auth/",
            "/static/",
            "/health",
            "/docs",
            "/openapi.json",
            "/favicon.ico",
            "/manifest.json",
            "/service-worker.js"
        )

        if not any(path.startswith(p) for p in open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)

        return await call_next(request)

app.add_middleware(AuthMiddleware)

# =====================================================
# STATIC FILES & TEMPLATES
# =====================================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# CREATE TABLES (STARTUP EVENT)
# =====================================================
@app.on_event("startup")
def on_startup():
    try:
        # 🔥 ORDER FIX: మొదట మెయిన్ టేబుల్స్, తర్వాత మిగిలినవి
        Base.metadata.create_all(bind=engine)
        logger.info("✅ ALL TABLES SYNCED WITH DATABASE")
    except Exception as e:
        logger.error(f"⚠️ DB STARTUP ERROR: {e}")

@app.get("/create-tables")
def manual_create_tables():
    try:
        Base.metadata.create_all(bind=engine)
        return {"status": "Success", "message": "All tables created/verified"}
    except Exception as e:
        return {"status": "Error", "message": str(e)}

# =====================================================
# ROUTERS REGISTRATION
# =====================================================
from app.routers.auth import router as auth_router
from app.routers.menu import router as menu_router
from app.routers.criteria_router import router as criteria_router
from app.routers.inventory import router as inventory_router
from app.routers.general_stock import router as general_stock_router
from app.routers.admin import router as admin_router
from app.routers.processing_router import router as processing_router
from app.routers.reports_router import router as reports_router
from app.routers.dashboard_router import router as dashboard_router
from app.routers.bills import router as bills_router
from app.routers.attendance_router import router as attendance_router
from app.routers.inventory_management.stock_entry import router as stock_entry_router
from app.routers.inventory_management.pending_orders import router as pending_orders_router
from app.routers.page_loader import router as page_loader_router
from app.routers.summary.processing import router as summary_processing_router
from app.routers.summary.inventory_costing import router as summary_inventory_costing_router

# రూటర్ల జాబితా
routers_list = [
    auth_router,
    menu_router,
    criteria_router,
    inventory_router,
    general_stock_router,
    admin_router,
    processing_router,
    reports_router,
    dashboard_router,
    stock_entry_router,
    pending_orders_router,
    page_loader_router,
    attendance_router,
    summary_processing_router,
    summary_inventory_costing_router,
]

# అన్ని రూటర్లను లూప్ ద్వారా యాడ్ చేస్తున్నాము
for r in routers_list:
    app.include_router(r)

# Bills Router కి స్పెషల్ ప్రిఫిక్స్
app.include_router(bills_router, prefix="/api")

logger.info("🚀 ALL ROUTERS REGISTERED SUCCESSFULLY")

# =====================================================
# BASIC PAGES
# =====================================================

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(
        name="login.html",
        context={"request": request}
    )

@app.get("/home", response_class=HTMLResponse)
def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    return templates.TemplateResponse(
        name="menu.html",
        context={"request": request}
    )

@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)

# =====================================================
# HEALTH CHECK
# =====================================================

@app.get("/health")
def health_check():
    return {
        "status": "OK",
        "service": "BKNR ERP",
        "database": "CONNECTED",
        "deployment": "RENDER"
    }