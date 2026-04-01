from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import logging

# DATABASE & MODELS
from app.database import engine, Base
import app.database.models 

# మోడల్స్ ని ఇక్కడ ఇంపోర్ట్ చేయడం వల్ల టేబుల్స్ ఆటోమేటిక్ గా క్రియేట్ అవుతాయి
from app.database.models.users import Company, User, OTPTable
from app.database.models.criteria import contractors, varieties, production_for, production_at
from app.database.models.general_stock import GeneralStock
from app.database.models.processing import Peeling, Soaking, DeHeading, AuditLog
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.attendance import Attendance

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
# 🔄 4. DATABASE STARTUP
# =====================================================
@app.on_event("startup")
def on_startup():
    try:
        # టేబుల్స్ ని క్రియేట్ చేస్తుంది, ఒకవేళ ఇప్పటికే ఉంటే స్కిప్ చేస్తుంది
        # కానీ ఇండెక్స్ ల విషయంలో psycopg2 కొన్నిసార్లు స్ట్రిక్ట్ గా ఉంటుంది
        Base.metadata.create_all(bind=engine)
        logger.info("✅ DATABASE TABLES CHECKED/SYNCED")
    except Exception as e:
        # ఇండెక్స్ ఆల్రెడీ ఉందనే ఎర్రర్ వస్తే దాన్ని ఇగ్నోర్ చేయవచ్చు
        if "already exists" in str(e):
            logger.info("ℹ️ Database objects already exist, skipping creation.")
        else:
            logger.error(f"⚠️ DATABASE STARTUP ERROR: {e}")

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

# Bills Router కి /api ప్రిఫిక్స్
app.include_router(bills_router, prefix="/api")

logger.info("🚀 ALL ROUTERS REGISTERED")

# =====================================================
# 📄 6. BASIC PAGES (STARLETTE 0.28+ COMPATIBLE)
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
# 🏥 7. HEALTH CHECK
# =====================================================
@app.get("/health")
def health_check():
    return {
        "status": "OK",
        "service": "BKNR ERP",
        "database": "CONNECTED",
        "deployment": "RENDER"
    }