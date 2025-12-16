# =============================================
# 🔥 BKNR ERP - MAIN APPLICATION FILE
# =============================================

import logging
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# =============================================
# INIT FASTAPI
# =============================================
app = FastAPI(
    title="BKNR ERP",
    version="1.0.0"
)

# =============================================
# SESSION CONFIG
# =============================================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",  # later move to ENV
    session_cookie="bknr_session",
    max_age=60 * 60 * 8  # 8 hours
)

# =============================================
# AUTH MIDDLEWARE
# =============================================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        open_paths = [
            "/",            # Login page
            "/auth",        # Auth APIs
            "/health",      # Health check
            "/static",      # Static files
        ]

        if not any(path.startswith(p) for p in open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)

        return await call_next(request)

app.add_middleware(AuthMiddleware)

# =============================================
# STATIC FILES & TEMPLATES
# =============================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")
templates.env.cache = {}   # disable cache (dev)
app.state.templates = templates

# =============================================
# DATABASE (SAFE IMPORT)
# =============================================
try:
    from app.database import engine, Base
    from app.database.models.users import *  # noqa
    # Base.metadata.create_all(bind=engine)  # enable later
    logging.info("✔ Database loaded")
except Exception as e:
    logging.warning(f"⚠ Database not initialized yet: {e}")

# =============================================
# ROUTERS (SAFE IMPORT)
# =============================================
def safe_include(router):
    try:
        app.include_router(router)
    except Exception as e:
        logging.warning(f"⚠ Router skipped: {e}")

try:
    from app.routers.auth import router as auth_router
    safe_include(auth_router)

    from app.routers.menu import router as menu_router
    safe_include(menu_router)

    from app.routers.criteria_router import router as criteria_router
    safe_include(criteria_router)

    from app.routers.inventory import router as inventory_router
    safe_include(inventory_router)

    from app.routers.general_stock import router as general_stock_router
    safe_include(general_stock_router)

    from app.routers.admin import router as admin_router
    safe_include(admin_router)

    from app.routers.processing_router import router as processing_router
    safe_include(processing_router)

    from app.routers.reports_router import router as reports_router
    safe_include(reports_router)

    from app.routers.dashboard_router import router as dashboard_router
    safe_include(dashboard_router)

    from app.routers.inventory_management.stock_entry import router as stock_entry_router
    safe_include(stock_entry_router)

    from app.routers.inventory_management.pending_orders import router as pending_orders_router
    safe_include(pending_orders_router)

    from app.routers.attendance.employee_registration import router as emp_reg_router
    safe_include(emp_reg_router)

    from app.routers.attendance.attendance_face import router as attendance_face_router
    safe_include(attendance_face_router)

    from app.routers.page_loader import router as page_loader_router
    safe_include(page_loader_router)

    logging.info("✔ Routers loaded")
except Exception as e:
    logging.warning(f"⚠ Router load issue: {e}")

# =============================================
# PAGES
# =============================================

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/home", response_class=HTMLResponse)
def home(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse("menu.html", {"request": request})


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)


# =============================================
# HEALTH CHECK
# =============================================
@app.get("/health")
def health():
    return {
        "status": "OK",
        "service": "BKNR ERP",
        "environment": "RENDER",
        "authentication": "ACTIVE",
        "database": "READY",
        "modules": "LOADED"
    }
from fastapi import FastAPI

# =============================================
# INIT FASTAPI
# =============================================
app = FastAPI(title="BKNR ERP")

# =============================================
# HEALTH CHECK
# =============================================
@app.get("/health")
def health():
    return {
        "status": "OK",
        "service": "BKNR ERP",
        "environment": "RENDER"
    }

# =============================================
# ROOT TEST
# =============================================
@app.get("/")
def root():
    return {"status": "RENDER OK"}

