from fastapi import FastAPI, Request, Depends, Body
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
application = FastAPI(
    title="BKNR ERP",
    version="1.0.0",
    docs_url="/docs" if ENVIRONMENT != "production" else None,   # hide docs in prod
    redoc_url=None,
)

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
import app.database.models.feature_flags
import app.database.models.system_settings

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
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("PATH=%s EMAIL=%s", request.url.path, email)

        path = request.url.path

        exact_paths = ["/", "/health", "/health/live", "/health/ready", "/docs", "/openapi.json", "/robots.txt", "/sitemap.xml"]
        prefix_paths = ["/auth/", "/static/", "/create-all", "/admin/maintenance"]

        # Check deployment token header bypass
        deploy_token = request.headers.get("X-Deploy-Token")
        expected_token = os.getenv("DEPLOYMENT_TOKEN", "bknr_deploy_token_2026")
        is_deploy_call = bool(
            deploy_token and deploy_token == expected_token
            and (path.startswith("/admin/deploy") or path == "/admin/version/record" or path.startswith("/admin/maintenance"))
        )

        if is_deploy_call:
            return await call_next(request)

        # PUBLIC URLS BYPASS
        if path in exact_paths or any(path.startswith(p) for p in prefix_paths):
            # Maintenance check on login page — non-logged-in visitors see maintenance page
            if path == "/" and not request.session.get("email"):
                try:
                    db = SessionLocal()
                    from app.services.maintenance import is_maintenance_active, get_maintenance_message
                    if is_maintenance_active(db):
                        msg = get_maintenance_message(db)
                        db.close()
                        from fastapi.templating import Jinja2Templates as _J2T
                        _t = _J2T(directory="app/templates")
                        return _t.TemplateResponse(
                            request=request,
                            name="maintenance.html",
                            context={"message": msg},
                            status_code=503,
                        )
                    db.close()
                except Exception:
                    pass
            return await call_next(request)

        # LOGIN CHECK
        if not request.session.get("email"):
            return RedirectResponse("/", status_code=303)

        # MAINTENANCE MODE CHECK (for logged-in users on protected routes)
        try:
            db = SessionLocal()
            from app.services.maintenance import is_maintenance_active, can_bypass, get_maintenance_message
            if is_maintenance_active(db):
                role = request.session.get("role", "")
                if not can_bypass(db, role):
                    msg = get_maintenance_message(db)
                    db.close()
                    from fastapi.templating import Jinja2Templates as _J2T
                    _t = _J2T(directory="app/templates")
                    return _t.TemplateResponse(
                        request=request,
                        name="maintenance.html",
                        context={"message": msg},
                        status_code=503,
                    )
            db.close()
        except Exception:
            pass

        # SINGLE ACTIVE SESSION CHECK
        session_id = request.session.get("session_id")
        if session_id:
            from app.database.models.users import User
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.email == email).first()
                if user and getattr(user, "current_session_id", None) != session_id:
                    request.session.clear()
                    return RedirectResponse("/", status_code=303)
            except Exception as e:
                logger.error("Active session validation error: %s", e)
            finally:
                db.close()

        company_code = request.session.get("company_code")
        request.session["setup_completed"] = True

        response = await call_next(request)
        response.headers.setdefault("X-Robots-Tag", "noindex, nofollow")
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and response.status_code < 400:
            invalidate_live_company_caches(company_code)
        return response


class PerformanceHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path

        if path.startswith("/static/"):
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        elif request.method == "GET" and "text/html" in response.headers.get("content-type", ""):
            response.headers.setdefault("Cache-Control", "no-cache")

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response


# ✅ MIDDLEWARE REGISTRATION (LIFO Order - Last added runs FIRST on incoming requests)

# Innermost: Runs LAST on request (Needs session data)
application.add_middleware(AuthMiddleware)

# Middle: Runs SECOND on request (Creates session context)
application.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET_KEY", "bknr_secret_key_2026_dev_only"),
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

application.add_middleware(GZipMiddleware, minimum_size=1000)
application.add_middleware(PerformanceHeadersMiddleware)


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
from app.routers.admin_feature_flags import router as feature_flags_router
from app.routers.admin_maintenance import router as maintenance_router
from app.routers.admin_deploy import router as deploy_router

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
application.include_router(feature_flags_router)
application.include_router(maintenance_router)
application.include_router(deploy_router)


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
        context={"request": request, "show_login": False}
    )


@application.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    site_url = os.getenv("PUBLIC_SITE_URL", "https://bknrerp.in").rstrip("/")
    return "\n".join([
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin/",
        "Disallow: /api/",
        "Disallow: /attendance/",
        "Disallow: /criteria/",
        "Disallow: /dashboard/",
        "Disallow: /documentation",
        "Disallow: /export_documents/",
        "Disallow: /finance_accounts/",
        "Disallow: /general_stock/",
        "Disallow: /home",
        "Disallow: /inventory/",
        "Disallow: /menu",
        "Disallow: /processing/",
        "Disallow: /privacy",
        "Disallow: /reports/",
        "Disallow: /summary/",
        "Disallow: /terms",
        "Disallow: /cookies",
        "Disallow: /api-docs",
        "Disallow: /careers",
        "Disallow: /blog",
        "Disallow: /status",
        "",
        f"Sitemap: {site_url}/sitemap.xml",
    ])


@application.get("/sitemap.xml")
async def sitemap_xml():
    site_url = os.getenv("PUBLIC_SITE_URL", "https://bknrerp.in").rstrip("/")
    urls = [
        f"{site_url}/",
    ]
    items = "".join(
        f"<url><loc>{url}</loc><changefreq>weekly</changefreq><priority>{'1.0' if url.endswith('/') else '0.7'}</priority></url>"
        for url in urls
    )
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>',
        media_type="application/xml",
    )


# 🟢 PUBLIC MARKETING / SAAS ENDPOINTS
@application.get("/api/public/stats")
async def public_stats():
    db = SessionLocal()
    try:
        from app.database.models.users import User
        user_count = db.query(User).count()
    except Exception:
        user_count = 0
    finally:
        db.close()
    
    return {
        "production_weight": "14,842 KG",
        "active_users": f"{36 + user_count} Active",
        "pending_approvals": "6 Vouchers",
        "inventory_accuracy": "99.98%",
        "orders_processing": "12 Active POs",
        "completed_batches": "36 Batches",
        "cold_storage_utilization": "72% Capacity",
        "export_shipments": "4 In-Transit"
    }


@application.get("/privacy", response_class=HTMLResponse)
async def privacy_page(request: Request):
    return templates.TemplateResponse(request=request, name="privacy.html", context={"request": request})


@application.get("/terms", response_class=HTMLResponse)
async def terms_page(request: Request):
    return templates.TemplateResponse(request=request, name="terms.html", context={"request": request})


@application.get("/cookies", response_class=HTMLResponse)
async def cookies_page(request: Request):
    return templates.TemplateResponse(request=request, name="cookies.html", context={"request": request})


@application.get("/documentation", response_class=HTMLResponse)
async def documentation_page(request: Request):
    return templates.TemplateResponse(request=request, name="documentation.html", context={"request": request})


@application.get("/api-docs", response_class=HTMLResponse)
async def api_docs_page(request: Request):
    return templates.TemplateResponse(request=request, name="documentation.html", context={"request": request})


@application.get("/careers", response_class=HTMLResponse)
async def careers_page(request: Request):
    return templates.TemplateResponse(request=request, name="careers.html", context={"request": request})


@application.get("/blog", response_class=HTMLResponse)
async def blog_page(request: Request):
    return templates.TemplateResponse(request=request, name="blog.html", context={"request": request})


@application.get("/status", response_class=HTMLResponse)
async def status_page(request: Request):
    return templates.TemplateResponse(request=request, name="status.html", context={"request": request})



@application.get("/home", response_class=HTMLResponse)
async def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    company_code = request.session.get("company_code")

    # Universal filters come from indexed masters, not repeated transaction-table scans.
    db = SessionLocal()
    try:
        from app.database.models.criteria import peeling_at, production_at, production_for
        from app.database.models.inventory_management import cold_storage

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
                )
                for (value,) in db.query(column).filter(model.company_id == company_code).distinct().all()
                if value and str(value).strip()
            }
            locations.update(
                str(value).strip()
                for (value,) in db.query(cold_storage.storage_name).filter(
                    cold_storage.company_id == company_code,
                    func.lower(cold_storage.is_active) == "active",
                ).distinct().all()
                if value and str(value).strip()
            )
            return {"companies": sorted(companies), "locations": sorted(locations)}

        menu_filters = cache_get_or_set(
            f"bknr:menu:{company_code}:universal_filters:v2",
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
@application.get("/health/live")
def health_live():
    """Liveness check - is server running?"""
    return {"status": "alive", "service": "BKNR_ERP"}


@application.get("/health/ready")
def health_ready():
    """
    Readiness check - checks backend dependencies like Database, Redis and Storage.
    """
    status = {
        "status": "ready",
        "database": "down",
        "redis": "skipped",
        "storage": "ok",
        "service": "BKNR_ERP",
    }
    healthy = True

    # 1. Database Check
    db = None
    try:
        db = SessionLocal()
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        status["database"] = "ok"
    except Exception as e:
        logger.error("Readiness check: database check failed: %s", e)
        status["database"] = "down"
        healthy = False
    finally:
        if db:
            db.close()

    # 2. Redis Check
    try:
        from app.services.cache import _client
        client = _client()
        if client:
            client.ping()
            status["redis"] = "ok"
    except Exception as e:
        logger.error("Readiness check: redis check failed: %s", e)
        status["redis"] = "down"
        healthy = False

    # 3. Storage Check
    try:
        uploads_dir = "uploads"
        if not os.path.exists(uploads_dir):
            os.makedirs(uploads_dir, exist_ok=True)
        # Test writeability
        test_file = os.path.join(uploads_dir, ".health_test")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        status["storage"] = "ok"
    except Exception as e:
        logger.error("Readiness check: storage check failed: %s", e)
        status["storage"] = "down"
        healthy = False

    if not healthy:
        status["status"] = "not_ready"
        return JSONResponse(status, status_code=503)

    return status


@application.get("/api/version")
def api_version():
    """
    Returns current deployed version.
    Used by release.sh health check after deploy.
    Public endpoint — no auth required.
    """
    db = SessionLocal()
    try:
        from app.database.models.system_settings import SystemVersion
        current = db.query(SystemVersion).filter(SystemVersion.is_current == True).first()
        history = db.query(SystemVersion).order_by(SystemVersion.id.desc()).limit(5).all()
        return {
            "version": current.version if current else "unknown",
            "release_date": current.release_date.isoformat() if current and current.release_date else None,
            "description": current.description if current else None,
            "history": [
                {"version": v.version, "release_date": v.release_date.isoformat() if v.release_date else None,
                 "description": v.description, "is_current": v.is_current}
                for v in history
            ],
            "environment": ENVIRONMENT,
            "service": "BKNR_ERP",
        }
    except Exception as e:
        logger.error("api/version error: %s", e)
        return {"version": "unknown", "environment": ENVIRONMENT, "service": "BKNR_ERP"}
    finally:
        db.close()


@application.post("/admin/version/record")
def record_version(request: Request, payload: dict = Body(default={})):
    """
    Record a new release version in system_versions table.
    Called by release.sh after successful deploy.
    Requires admin role.
    """
    deploy_token = request.headers.get("X-Deploy-Token")
    expected_token = os.getenv("DEPLOYMENT_TOKEN", "bknr_deploy_token_2026")
    is_deploy_call = bool(deploy_token and deploy_token == expected_token)

    if not is_deploy_call and request.session.get("role") not in ("admin", "super_admin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required")

    version = payload.get("version", "").strip()
    description = payload.get("description", "")
    if not version:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="version required")

    db = SessionLocal()
    actor = request.headers.get("X-Deploy-Actor", "release_script") if is_deploy_call else request.session.get("email", "admin")
    try:
        from app.database.models.system_settings import SystemVersion
        from app.services.deployment import audit
        # Mark all existing versions as not current
        db.query(SystemVersion).update({"is_current": False})
        # Insert new version
        existing = db.query(SystemVersion).filter(SystemVersion.version == version).first()
        if existing:
            existing.is_current = True
            existing.description = description
            existing.released_by = actor
        else:
            db.add(SystemVersion(
                version=version,
                description=description,
                released_by=actor,
                is_current=True,
            ))
        # Log version record action to deployment audit log
        audit(db, action="release", actor=actor, version=version, result="success", detail=description)
        db.commit()
        return {"status": "ok", "version": version}
    except Exception as e:
        db.rollback()
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()


# ASGI entrypoint for Render
app = application
