from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from app.services.setup_service import SetupService
from app.database import SessionLocal
from app.services.cache import invalidate_live_company_caches
import logging
import os
from apscheduler.schedulers.background import BackgroundScheduler
from app.services.inventory_snapshot_scheduler import create_inventory_snapshot
from app.services.floor_balance_snapshot_scheduler import create_floor_balance_snapshot
from sqlalchemy import distinct # 🟢 Necessary query helper inclusion

os.environ["TZ"] = "Asia/Kolkata"
# =====================================================
# 🚀 1. APP INIT - HOT RELOAD TRIGGER 12
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
import app.database.models.payments
import app.database.models.invoices
import app.database.models.enterprise_finance
import app.database.models.gst_models
import app.database.models.assets
import app.database.models.advanced_seafood_erp

# Create all tables on startup if they don't exist
Base.metadata.create_all(bind=engine)
# =====================================================
# =====================================================
# 📸 DAILY INVENTORY SNAPSHOT SCHEDULER
# =====================================================

if os.environ.get("RUN_MAIN") == "true" or not os.environ.get("UVICORN_RELOAD"):

    scheduler = BackgroundScheduler(
        timezone="Asia/Kolkata"
    )

    scheduler.add_job(
        create_inventory_snapshot,
        trigger="cron",
        hour=9,
        minute=00,
        id="daily_inventory_snapshot",
        replace_existing=True
    )
    scheduler.add_job(
        create_floor_balance_snapshot,
        trigger="cron",
        hour=9,
        minute=00,
        id="daily_floor_balance_snapshot",
        replace_existing=True
   )
    scheduler.start()
    create_floor_balance_snapshot()

    print("✅ Daily Inventory Snapshot Scheduler Started")
    print("✅ Daily Floor Balance Snapshot Scheduler Started")

# =====================================================
# 🔐 3. SESSION & AUTH MIDDLEWARE (ORDER IS CRITICAL)
# =====================================================

# 1. First, define the Auth Middleware
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        email = request.session.get("email") if hasattr(request, "session") else "NO_SESSION"
        print(f"PATH= {request.url.path} EMAIL= {email}")

        path = request.url.path

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

                    if not path.startswith("/criteria"):
                        return RedirectResponse(next_page, status_code=303)
            finally:
                db.close()

        response = await call_next(request)
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and response.status_code < 400:
            invalidate_live_company_caches(company_code)
        return response


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
from app.routers.inventory_management.sales import router as sales_router
from app.routers.page_loader import router as page_loader_router
from app.routers.summary.processing import router as summary_processing_router
from app.routers.summary.periodic_report import router as periodic_report_router
from app.routers.summary.inventory_costing import router as summary_inventory_costing_router
from app.routers.summary.floor_balance_value import router as summary_floor_balance_value_router
from app.routers import data_management
from app.routers import production_requirements
from app.routers.finance_accounts import router as finance_accounts_router
from app.routers.enterprise_finance_router import router as enterprise_finance_router
from app.routers.advanced_seafood_router import router as advanced_seafood_router
from app.routers.export_documents import router as export_documents_router

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
application.include_router(sales_router)
application.include_router(page_loader_router)
application.include_router(attendance_router)
application.include_router(summary_processing_router)
application.include_router(periodic_report_router)
application.include_router(summary_inventory_costing_router)
application.include_router(summary_floor_balance_value_router)
application.include_router(data_management.router)
application.include_router(production_requirements.router)
application.include_router(bills_router, prefix="/api")
application.include_router(finance_accounts_router, prefix="/finance_accounts")
application.include_router(enterprise_finance_router, prefix="/finance_accounts")
application.include_router(advanced_seafood_router, prefix="/api")
application.include_router(export_documents_router, prefix="/export_documents")


# =====================================================
# 📄 6. BASIC ROUTES
# =====================================================
@application.get("/tally_dashboard", response_class=HTMLResponse)
async def legacy_tally_dashboard_redirect():
    return RedirectResponse("/finance_accounts/tally_dashboard", status_code=303)


@application.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    if request.session.get("email"):
        return RedirectResponse("/home", status_code=303)
        
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request}
    )


@application.get("/home", response_class=HTMLResponse)
async def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    company_code = request.session.get("company_code")

    # Setup Check (Fallback incase session flag is out of sync)
    if not request.session.get("setup_completed", False):
        db = SessionLocal()
        try:
            next_page = SetupService.get_next_master(db, company_code)
            if next_page and next_page != "/home":
                return RedirectResponse(next_page, status_code=303)
        finally:
            db.close()

    # 🟢 🚀 MASTER UNIVERSAL FILTER PIPING DROPDOWN DATA EXTRACTION 🚀 🟢
    db = SessionLocal()
    companies_list = []
    locations_list = []
    
    try:
        from app.database.models.processing import GateEntry, RawMaterialPurchasing, DeHeading, Grading, Peeling, Soaking, Production
        from app.database.models.inventory_management import cold_storage # 🟢 కోల్డ్ స్టోరేజ్ మాస్టర్ మోడల్ ఇంపోర్ట్
        
        # 1. Fetch Universal Companies Unique List (production_for)
        companies_set = set()
        tables_with_prod_for = [GateEntry, RawMaterialPurchasing, DeHeading, Grading, Peeling, Soaking, Production]
        for model in tables_with_prod_for:
            res = db.query(distinct(model.production_for)).filter(model.company_id == company_code).all()
            for row in res:
                if row[0]: companies_set.add(row[0].strip())
        companies_list = sorted(list(companies_set))

        # 2. Fetch Strict Plant Locations Unique List (peeling_at & production_at ONLY)
        locations_set = set()
        
        # peeling_at criteria scanning targets
        peeling_models = [RawMaterialPurchasing, DeHeading, Grading, Peeling]
        for model in peeling_models:
            res = db.query(distinct(model.peeling_at)).filter(model.company_id == company_code).all()
            for row in res:
                if row[0]: locations_set.add(row[0].strip())
                
        # production_at criteria scanning targets
        production_models = [Soaking, Production]
        for model in production_models:
            res = db.query(distinct(model.production_at)).filter(model.company_id == company_code).all()
            for row in res:
                if row[0]: locations_set.add(row[0].strip())
                
        # 🟢 3. COLD STORAGE MASTER నుండి యాక్టివ్ గా ఉన్న స్టోరేజ్ నేమ్స్ స్క్యాన్ చేస్తున్నాం
        try:
            cs_res = db.query(distinct(cold_storage.storage_name)).filter(
                cold_storage.company_id == company_code,
                cold_storage.is_active == "ACTIVE"
            ).all()
            for row in cs_res:
                if row[0]: locations_set.add(row[0].strip())
        except Exception as cs_err:
            print("⚠️ COLD STORAGE MASTER SCAN PASS BYPASSED:", cs_err)

        locations_list = sorted(list(locations_set))
    except Exception as e:
        print("🔴 ERROR LOADING UNIVERSAL FILTER ARRAYS:", e)
    finally:
        db.close()

    return templates.TemplateResponse(
        request=request,
        name="menu.html",
        context={
            "request": request,
            "companies": companies_list,
            "locations": locations_list
        }
    )


@application.get("/health")
def health():
    return {"status": "ok", "service": "BKNR_ERP"} # Reload Trigger 8
