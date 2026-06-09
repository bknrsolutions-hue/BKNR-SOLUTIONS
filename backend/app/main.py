from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from app.services.setup_service import SetupService
from app.database import SessionLocal
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
import app.database.models.helpdesk
import app.database.models.processing
import app.database.models.inventory_management
import app.database.models.general_stock
import app.database.models.bills
import app.database.models.attendance
import app.database.models.requirements

# =====================================================
# 🔐 3. SESSION & AUTH MIDDLEWARE (ORDER IS CRITICAL)
# =====================================================

# 1. First, define the Auth Middleware
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 🐛 DEBUG PRINT: To verify if middleware is hit and session exists
        email = request.session.get("email") if hasattr(request, "session") else "NO_SESSION"
        print(f"PATH= {request.url.path} EMAIL= {email}")

        path = request.url.path

        # ✅ FIX: Separate exact matches from prefix matches to avoid "/" bypassing everything
        exact_paths = ["/", "/health", "/docs", "/openapi.json"]
        prefix_paths = ["/auth/", "/static/", "/create-all"]

        # PUBLIC URLS BYPASS
        if path in exact_paths or any(path.startswith(p) for p in prefix_paths):
            return await call_next(request)

        # LOGIN CHECK
        if not request.session.get("email"):
            return RedirectResponse("/", status_code=303)

        company_code = request.session.get("company_code")

        # SETUP CHECK
        if company_code:
            db = SessionLocal()
            try:
                completed = SetupService.is_completed(db, company_code)
                request.session["setup_completed"] = completed

                if not completed:
                    next_page = SetupService.get_next_master(db, company_code)
                    print("SETUP REDIRECT:", next_page)

                    # Allow criteria pages to load so the user can complete setup
                    if not path.startswith("/criteria"):
                        return RedirectResponse(next_page, status_code=303)
            finally:
                db.close()

        return await call_next(request)


# ✅ MIDDLEWARE REGISTRATION (LIFO Order - Last added runs FIRST on incoming requests)

# Innermost: Runs LAST on request (Needs session data)
application.add_middleware(AuthMiddleware)

# Middle: Runs SECOND on request (Creates session context)
application.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2026",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8  # 8 Hours
)

# Outermost: Runs FIRST on request (Handles Preflight CORS)
application.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://10.215.174.77:8081"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================
# 📂 4. STATIC + TEMPLATES SETUP
# =====================================================
application.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# ✅ VERY IMPORTANT: దీన్ని స్టేట్‌లో స్టోర్ చేయాలి, అప్పుడే రూటర్లు దీన్ని వాడగలవు
application.state.templates = templates


# =====================================================
# 🛤️ 5. ROUTERS IMPORT & INCLUSION
# =====================================================
from app.routers.auth import router as auth_router
from app.routers.menu import router as menu_router
from app.routers.criteria_router import router as criteria_router
from app.routers.helpdesk_router import router as helpdesk_router
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
from app.routers.summary.periodic_report import router as periodic_report_router
from app.routers.summary.inventory_costing import router as summary_inventory_costing_router
from app.routers.summary.floor_balance_value import router as summary_floor_balance_value_router
from app.routers import data_management
from app.routers import production_requirements

# రూటర్లను ఇంక్లూడ్ చేయడం
application.include_router(auth_router)
application.include_router(menu_router)
application.include_router(criteria_router)
application.include_router(helpdesk_router)
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
application.include_router(periodic_report_router)
application.include_router(summary_inventory_costing_router)
application.include_router(summary_floor_balance_value_router)
application.include_router(data_management.router)
application.include_router(production_requirements.router)
application.include_router(bills_router, prefix="/api")


# =====================================================
# 📄 6. BASIC ROUTES
# =====================================================
@application.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    # If already logged in, skip login page
    if request.session.get("email"):
        return RedirectResponse("/home", status_code=303)
        
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request}
    )


@application.get("/home", response_class=HTMLResponse)
async def home_page(request: Request):
    # Auth checks are handled by middleware, but fallback verification:
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    # Setup Check (Fallback incase session flag is out of sync)
    if not request.session.get("setup_completed", False):
        db = SessionLocal()
        try:
            next_page = SetupService.get_next_master(
                db,
                request.session.get("company_code")
            )
            # Prevent infinite loop if somehow next_page is /home
            if next_page and next_page != "/home":
                return RedirectResponse(next_page, status_code=303)
        finally:
            db.close()

    return templates.TemplateResponse(
        request=request,
        name="menu.html",
        context={"request": request}
    )


@application.get("/health")
def health():
    return {"status": "ok", "service": "BKNR ERP"}