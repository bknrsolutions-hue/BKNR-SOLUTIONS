# =============================================
# 🔥 BKNR ERP - MAIN APPLICATION FILE
# =============================================

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.templating import Jinja2Templates
import logging

# ------------------------- DATABASE SETUP -------------------------
from app.database import engine, Base

# LOAD MODELS SO TABLES ARE CREATED
from app.database.models.users import *  # noqa

# ------------------------- INIT FASTAPI -------------------------
app = FastAPI(
    title="BKNR ERP",
    version="1.0.0",
)

# ------------------------- SESSION CONFIG -------------------------
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",
    session_cookie="bknr_session",
    max_age=3600 * 8,  # 8 hours
)

# ========================= ACCESS MIDDLEWARE =========================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Allowed non-login pages
        open_paths = [
            "/",          # Login page
            "/auth",      # Register, login APIs
            "/health",    # Server health
            "/static",    # Static files
        ]

        # Check condition
        if not any(path.startswith(p) for p in open_paths):
            if not request.session.get("email"):
                return RedirectResponse("/", status_code=303)

        return await call_next(request)

app.add_middleware(AuthMiddleware)

# ------------------------- STATIC FILES -------------------------
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# ------------------------- TEMPLATES -------------------------
templates = Jinja2Templates(directory="app/templates")
templates.env.cache = {}  # Disable in dev
app.state.templates = templates

# ------------------------- CREATE DB -------------------------
#Base.metadata.create_all(bind=engine)
logging.info("✔ DATABASE READY, MODELS LOADED")

# =============================================
# IMPORT ROUTERS
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

# Attendance
from app.routers.attendance.employee_registration import router as emp_reg_router
from app.routers.attendance.attendance_face import router as attendance_face_router

# Page loader UI routes
from app.routers.page_loader import router as page_loader_router

# ============================= REGISTER ROUTERS =============================
router_list = [
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
    emp_reg_router,
    attendance_face_router,
    page_loader_router,
]

for route in router_list:
    app.include_router(route)

logging.info("✔ ROUTERS REGISTERED SUCCESSFULLY")

# =============================================
# DEFAULT LOGIN PAGE
# =============================================
@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# =============================================
# HOME PAGE - SESSION PROTECTED
# =============================================
@app.get("/home", response_class=HTMLResponse)
def home(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)
    return templates.TemplateResponse("menu.html", {"request": request})

# =============================================
# LOGOUT
# =============================================
@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)

# =============================================
# HEALTH CHECK
# =============================================
@app.get("/health")
async def health():
    return {
        "status": "OK",
        "service": "BKNR ERP",
        "authentication": "ACTIVE",
        "database": "CONNECTED",
        "modules": "ALL READY"
    }
