# =============================================
# 🔥 BKNR ERP - MAIN APPLICATION FILE (FINAL)
# =============================================

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

import logging

# =============================================
# DATABASE
# =============================================
from app.database import engine, Base
from app.database.models.users import *  # noqa

logging.basicConfig(level=logging.INFO)

# =============================================
# INIT FASTAPI
# =============================================
app = FastAPI(
    title="BKNR ERP",
    version="1.0.0"
)

# =============================================
# SESSION MIDDLEWARE  (⚠️ MUST BE FIRST)
# =============================================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8,  # 8 hours
)

# =============================================
# AUTH MIDDLEWARE
# =============================================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # ✅ OPEN ROUTES (NO LOGIN REQUIRED)
        open_paths = (
            "/",
            "/auth/",
            "/static/",
            "/health",
            "/docs",
            "/openapi.json",
        )

        if not path.startswith(open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)

        return await call_next(request)

app.add_middleware(AuthMiddleware)

# =============================================
# STATIC FILES
# =============================================
app.mount(
    "/static",
    StaticFiles(directory="app/static"),
    name="static"
)

# =============================================
# TEMPLATES
# =============================================
templates = Jinja2Templates(directory="app/templates")
templates.env.cache = {}
app.state.templates = templates

# =============================================
# CREATE TABLES (SAFE)
# =============================================
@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
        logging.info("✅ DATABASE TABLES READY")
    except Exception as e:
        logging.error(f"❌ DB ERROR: {e}")

# =============================================
# ROUTERS
# =============================================
from app.routers.auth import router as auth_router
from app.routers.menu import router as menu_router
from app.routers.criteria_router import router as criteria_router
from app.routers.inventory import router as inventory_router
from app.routers.general_stock import router as general_stock_router
from app.routers.admin import router as admin_router
from app.routers.processing_router import router as processing_router
from app.routers.reports_router import router as reports_router
from app.routers.dashboard_router import router as dashboard_router

from app.routers.inventory_management.stock_entry import router as stock_entry_router
from app.routers.inventory_management.pending_orders import router as pending_orders_router
from app.routers.page_loader import router as page_loader_router

routers = [
    auth_router,
    menu_router,
    criteria_router,
    inventory_router,
    general_stock_router,
    admin_router,
    processing_router,
    reports_router,
    dashboard_router,
    stock_entry_router,
    pending_orders_router,
    page_loader_router,
]

for r in routers:
    app.include_router(r)

logging.info("✅ ALL ROUTERS REGISTERED")

# =============================================
# PAGES
# =============================================
@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(
        "login.html",
        {"request": request}
    )

@app.get("/home", response_class=HTMLResponse)
def home_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    return templates.TemplateResponse(
        "menu.html",
        {"request": request}
    )

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
        "session": "ACTIVE",
        "database": "CONNECTED",
        "deployment": "RENDER"
    }
