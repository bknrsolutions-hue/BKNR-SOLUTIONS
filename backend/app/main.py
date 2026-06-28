from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from app.database import SessionLocal
from app.services.cache import cache_get_or_set, invalidate_live_company_caches
import logging
import os
import uuid
from apscheduler.schedulers.background import BackgroundScheduler
from app.services.inventory_snapshot_scheduler import create_inventory_snapshot
from app.services.floor_balance_snapshot_scheduler import create_floor_balance_snapshot
from sqlalchemy import func

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


@application.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    from starlette.exceptions import HTTPException as StarletteHTTPException
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import PlainTextResponse, JSONResponse
    if isinstance(exc, StarletteHTTPException):
        return PlainTextResponse(str(exc.detail), status_code=exc.status_code)
    if isinstance(exc, RequestValidationError):
        return JSONResponse({"detail": exc.errors()}, status_code=422)

    error_id = uuid.uuid4().hex[:10]
    logger.exception(
        "Unhandled server error [%s] path=%s query=%s",
        error_id,
        request.url.path,
        request.url.query,
    )
    return PlainTextResponse(
        f"Internal Server Error\nError ID: {error_id}\nPath: {request.url.path}",
        status_code=500,
    )

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
#Base.metadata.create_all(bind=engine)
# =====================================================
# =====================================================
# 📸 DAILY INVENTORY SNAPSHOT SCHEDULER
# =====================================================
scheduler = None


def start_snapshot_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        return

    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(
        create_inventory_snapshot,
        trigger="cron",
        hour=9,
        minute=0,
        id="daily_inventory_snapshot",
        replace_existing=True,
    )
    scheduler.add_job(
        create_floor_balance_snapshot,
        trigger="cron",
        hour=9,
        minute=0,
        id="daily_floor_balance_snapshot",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Daily Inventory Snapshot Scheduler Started")
    logger.info("Daily Floor Balance Snapshot Scheduler Started")

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
        request.session["setup_completed"] = True

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


@application.on_event("startup")
def on_startup():
    start_snapshot_scheduler()
    try:
        from app.database.migration import run_migration
        run_migration()
    except Exception as e:
        logger.error(f"Database migration failed on startup: {e}")


@application.on_event("shutdown")
def on_shutdown():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Snapshot Scheduler Stopped")


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

    # Universal filters come from indexed masters, not repeated transaction-table scans.
    db = SessionLocal()
    try:
        from app.database.models.criteria import coldstore_locations, peeling_at, production_at, production_for

        def build_menu_filters():
            companies = {
                str(value).strip()
                for (value,) in db.query(production_for.production_for).filter(
                    production_for.company_id == company_code,
                    func.lower(production_for.status) == "active",
                ).distinct().all()
                if value and str(value).strip()
            }
            locations = {
                str(value).strip()
                for model, column in (
                    (production_at, production_at.production_at),
                    (peeling_at, peeling_at.peeling_at),
                    (coldstore_locations, coldstore_locations.coldstore_location),
                )
                for (value,) in db.query(column).filter(model.company_id == company_code).distinct().all()
                if value and str(value).strip()
            }
            return {"companies": sorted(companies), "locations": sorted(locations)}

        menu_filters = cache_get_or_set(
            f"bknr:menu:{company_code}:universal_filters",
            build_menu_filters,
            ttl=300,
        )
        companies_list = menu_filters["companies"]
        locations_list = menu_filters["locations"]
    except Exception as e:
        logger.exception("Error loading universal menu filters: %s", e)
        companies_list = []
        locations_list = []
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
# ASGI entrypoint for Render
app = application
