from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import logging

# 1. APP INIT (దీన్ని అందరికంటే పైన ఉంచాలి)
app = FastAPI(title="BKNR ERP", version="1.0.0")

# LOGGING SETUP
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BKNR_ERP")

# 2. DATABASE & MODELS IMPORT
from app.database import engine, Base

# ఇక్కడ అన్ని మోడల్స్ ని ఇంపోర్ట్ చేస్తున్నాం - టేబుల్స్ క్రియేట్ అవ్వడానికి
from app.database.models.users import Company, User, OTPTable
from app.database.models.criteria import (
    contractors, varieties, production_for, production_at, 
    brands, purposes, glazes, grades, species, suppliers, 
    vendors, hsn_codes, vehicle_numbers, purchasing_locations
)
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Grading, Peeling, Soaking, Production, AuditLog
)
from app.database.models.inventory_management import stock_entry, pending_orders, sales_dispatch
from app.database.models.general_stock import GeneralStock, GeneralStoreItems
from app.database.models.bills import (
    ElectricityLog, DieselLog, PurchaseInvoice, 
    ContainerLog, QATestingLog, OtherExpense
)
from app.database.models.attendance import (
    EmployeeRegistration, DailyAttendance, EmployeeIncrement, 
    EmployeeStatutoryMaster, EmployeeSalaryAdvance
)

# =====================================================
# 🛠️ 3. MIDDLEWARES
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
        open_paths = ("/", "/auth/", "/static/", "/health", "/docs", "/openapi.json")
        if not any(path.startswith(p) for p in open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)
        return await call_next(request)

app.add_middleware(AuthMiddleware)

# =====================================================
# 📂 4. STATIC & TEMPLATES
# =====================================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# 🔄 5. DATABASE STARTUP
# =====================================================
@app.on_event("startup")
def on_startup():
    try:
        # టేబుల్స్ క్రియేట్ చేయడం
        Base.metadata.create_all(bind=engine)
        logger.info("✅ ALL ERP TABLES CREATED SUCCESSFULLY")
    except Exception as e:
        logger.error(f"❌ DB ERROR: {e}")

# =====================================================
# 🛤️ 6. ROUTERS REGISTRATION
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

# Bills Router with Prefix
app.include_router(bills_router, prefix="/api")

# =====================================================
# 📄 7. BASIC ROUTES
# =====================================================
@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html", {"request": request})

@app.get("/home", response_class=HTMLResponse)
def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse(request, "menu.html", {"request": request})

@app.get("/health")
def health():
    return {"status": "ok", "service": "BKNR ERP"}

@app.get("/create-all")
def create_all():
    Base.metadata.create_all(bind=engine)
    return {"status": "Tables Sync Success"}