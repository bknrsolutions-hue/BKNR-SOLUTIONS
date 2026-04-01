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

# LOGGING SETUP
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BKNR_ERP")

# =====================================================
# 🚀 1. FASTAPI APP INIT (దీని పేరే 'app' అని ఉండాలి)
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
        open_paths = ("/", "/auth/", "/static/", "/health", "/docs")
        
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
# 🔄 4. DATABASE STARTUP (Table Creation)
# =====================================================
@app.on_event("startup")
def on_startup():
    try:
        # అన్ని మోడల్స్ ని ఒకేసారి క్రియేట్ చేస్తుంది
        Base.metadata.create_all(bind=engine)
        logger.info("✅ ALL DATABASE TABLES SYNCED")
    except Exception as e:
        logger.error(f"⚠️ DATABASE ERROR: {e}")

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

# ఒక్కొక్కటిగా ఇంక్లూడ్ చేయడం
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

# Bills Router కి స్పెషల్ ప్రిఫిక్స్
app.include_router(bills_router, prefix="/api")

# =====================================================
# 📄 6. BASIC PAGES (FIXED FOR STARLETTE 0.28+)
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

@app.get("/health")
def health_check():
    return {"status": "OK", "app": "BKNR ERP"}