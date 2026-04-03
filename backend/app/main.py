from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import logging

# =====================================================
# 🚀 1. APP INIT
# =====================================================
application = FastAPI(title="BKNR ERP", version="1.0.0")

# =====================================================
# 📊 LOGGING
# =====================================================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BKNR_ERP")

# =====================================================
# 🗄️ 2. DATABASE & MODELS IMPORT
# =====================================================
from app.database import engine, Base

# 🔥 FORCE LOAD ALL MODELS TO REGISTER WITH BASE
import app.database.models.users
import app.database.models.criteria
import app.database.models.processing
import app.database.models.inventory_management
import app.database.models.general_stock
import app.database.models.bills
import app.database.models.attendance

# =====================================================
# 🔐 3. SESSION MIDDLEWARE
# =====================================================
application.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2026",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8  # 8 Hours
)

# =====================================================
# 🔐 AUTH MIDDLEWARE
# =====================================================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # బహిరంగంగా అందుబాటులో ఉండాల్సిన పాత్‌లు
        open_paths = (
            "/", "/auth/", "/static/",
            "/health", "/docs", "/openapi.json", "/create-all"
        )

        if not any(path.startswith(p) for p in open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)

        return await call_next(request)

application.add_middleware(AuthMiddleware)

# =====================================================
# 📂 4. STATIC + TEMPLATES SETUP
# =====================================================
application.mount("/static", StaticFiles(directory="app/static"), name="static")

# టెంప్లేట్స్ డిఫైన్ చేయడం
templates = Jinja2Templates(directory="app/templates")

# ✅ VERY IMPORTANT: దీన్ని స్టేట్‌లో స్టోర్ చేయాలి, అప్పుడే రూటర్లు దీన్ని వాడగలవు
application.state.templates = templates

# =====================================================
# 🛤️ 5. ROUTERS IMPORT & INCLUSION
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

# రూటర్లను ఇంక్లూడ్ చేయడం
application.include_router(auth_router)
application.include_router(menu_router)
application.include_router(criteria_router)
application.include_router(inventory_router)
application.include_router(general_stock_router)
application.include_router(admin_router)
application.include_router(processing_router)
application.include_router(reports_router)
application.include_router(dashboard_router)
application.include_router(stock_entry_router)
application.include_router(pending_orders_router)
application.include_router(page_loader_router)
application.include_router(attendance_router)
application.include_router(summary_processing_router)
application.include_router(summary_inventory_costing_router)

# Bills prefix
application.include_router(bills_router, prefix="/api")

# =====================================================
# 📄 6. BASIC ROUTES
# =====================================================
@application.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request}
    )

@application.get("/home", response_class=HTMLResponse)
async def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    return templates.TemplateResponse(
        request=request,
        name="menu.html",
        context={"request": request}
    )

@application.get("/create-all")
def create_all():
    try:
        # Base.metadata.create_all అనేది చాలా తెలివైనది. 
        # ఇది టేబుల్స్, ఇండెక్స్ లు, రిలేషన్స్ అన్నీ చెక్ చేస్తుంది. 
        # ఏవైనా లేకపోతేనే క్రియేట్ చేస్తుంది, ఉన్నవాటిని వదిలేస్తుంది (Safe approach).
        
        Base.metadata.create_all(bind=engine)
        
        logger.info("Database synchronization completed successfully.")
        return {
            "status": "Success", 
            "message": "All missing tables and indexes created successfully."
        }
    except Exception as e:
        logger.error(f"Error during database sync: {str(e)}")
        # ఒకవేళ ఇండెక్స్ ఎర్రర్ వస్తే, దాన్ని క్లియర్ గా చూడటానికి మెసేజ్ రిటర్న్ చేస్తున్నాం
        return {"status": "Error", "message": str(e)}

@application.get("/health")
def health():
    return {"status": "ok", "service": "BKNR ERP"}