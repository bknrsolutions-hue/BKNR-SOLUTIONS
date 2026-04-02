from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import logging

# DATABASE & BASE
from app.database import engine, Base

# =====================================================
# 📦 ALL MODELS IMPORT (For Auto-Table Creation)
# =====================================================

# 1. Auth & Users
from app.database.models.users import Company, User, OTPTable

# 2. Criteria / Masters (Using your exact naming)
from app.database.models.criteria import (
    contractors, varieties, production_for, production_at, 
    brands, purposes, glazes, grades, species, suppliers, 
    vendors, hsn_codes, vehicle_numbers, purchasing_locations
)

# 3. Processing
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Grading, Peeling, Soaking, Production, AuditLog
)

# 4. Inventory & Sales
from app.database.models.inventory_management import stock_entry, pending_orders, sales_dispatch

# 5. General Stock
from app.database.models.general_stock import GeneralStock, GeneralStoreItems

# 6. Bills & Utilities
from app.database.models.bills import (
    ElectricityLog, DieselLog, PurchaseInvoice, 
    ContainerLog, QATestingLog, OtherExpense
)

# 7. HR & Attendance
from app.database.models.attendance import (
    EmployeeRegistration, DailyAttendance, EmployeeIncrement, 
    EmployeeStatutoryMaster, EmployeeSalaryAdvance
)

# LOGGING SETUP
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BKNR_ERP")

# =====================================================
# 🚀 1. FASTAPI APP INIT
# =====================================================
app = FastAPI(title="BKNR ERP", version="1.0.0")

# =====================================================
# 🛠️ 2. MIDDLEWARES
# =====================================================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2026",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8, # 8 Hours
)

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # లాగిన్ అవసరం లేని పాత్ లు
        open_paths = ("/", "/auth/", "/static/", "/health", "/docs", "/openapi.json")
        
        if not any(path.startswith(p) for p in open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)
        
        return await call_next(request)

app.add_middleware(AuthMiddleware)

# =====================================================
# 📂 3. STATIC FILES & TEMPLATES
# =====================================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# 🔄 4. DATABASE STARTUP (Table Sync)
# =====================================================
@app.on_event("startup")
def on_startup():
    try:
        # పైన ఉన్న ఇంపోర్ట్స్ వల్ల Base.metadata కి అన్ని టేబుల్స్ రిజిస్టర్ అవుతాయి
        Base.metadata.create_all(bind=engine)
        print("✅ SUCCESS: BKNR ERP Database Tables Synchronized!")
    except Exception as e:
        print("❌ DB ERROR:", e)

# =====================================================
# 🛤️ 5. ROUTERS REGISTRATION
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

# రూటర్లను యాడ్ చేయడం
app.include_router(auth_router)
app.include_router(menu_router)
app.include_router(criteria_router)
app.include_router(inventory_router)
app.include_router(general_stock_router)
app.include_router(admin_router)
app.include_router(processing_router)
app.include_router(reports_router)
app.include_router(dashboard_router)
app.include_router(stock_entry_router)
app.include_router(pending_orders_router)
app.include_router(page_loader_router)
app.include_router(attendance_router)
app.include_router(summary_processing_router)
app.include_router(summary_inventory_costing_router)

# Bills Router కి /api ప్రిఫిక్స్ (As per your requirement)
app.include_router(bills_router, prefix="/api")

logger.info("🚀 ALL ERP MODULES LOADED SUCCESSFULLY")

# =====================================================
# 📄 6. BASIC PAGES
# =====================================================

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(
        request, 
        "login.html", 
        {"request": request}
    )

@app.get("/home", response_class=HTMLResponse)
def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)
    
    return templates.TemplateResponse(
        request, 
        "menu.html", 
        {"request": request}
    )

@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)

# =====================================================
# 🏥 7. HEALTH CHECK & FORCE SYNC
# =====================================================
@app.get("/health")
def health_check():
    return {"status": "OK", "service": "BKNR ERP"}

@app.get("/create-all")
def force_create_all():
    # ఒకవేళ startup లో టేబుల్స్ రాకపోతే ఈ URL ని హిట్ చేయవచ్చు
    Base.metadata.create_all(bind=engine)
    return {"status": "All ERP tables synchronized manually"}