# =============================================
# 🔥 BKNR ERP - MAIN APPLICATION FILE
# =============================================

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
    secret_key="bknr_secret_key_2025",  # ⚠️ later ENV lo pettali
    session_cookie="bknr_session",
    max_age=60 * 60 * 8  # 8 hours
)

# =============================================
# AUTH MIDDLEWARE (LOGIN PROTECTION)
# =============================================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # ---------- OPEN ROUTES ----------
        if (
            path == "/"
            or path.startswith("/auth")
            or path.startswith("/static")
            or path.startswith("/docs")
            or path.startswith("/openapi.json")
            or path.startswith("/health")
        ):
            return await call_next(request)

        # ---------- PROTECTED ROUTES ----------
        if not request.session.get("email"):
            return RedirectResponse("/", status_code=303)

        return await call_next(request)

# Register middleware
app.add_middleware(AuthMiddleware)

# =============================================
# STATIC FILES & TEMPLATES
# =============================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")
templates.env.cache = {}

# =============================================
# DATABASE
# =============================================
from app.database import engine, Base
from app.database.models.users import *  # noqa

# =============================================
# AUTO CREATE TABLES (RENDER SAFE)
# =============================================
@app.on_event("startup")
def startup_event():
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ ALL TABLES CREATED / VERIFIED")
    except Exception as e:
        print("❌ TABLE CREATION FAILED:", e)

# =============================================
# ROUTERS
# =============================================
from app.routers.auth import router as auth_router
app.include_router(auth_router)

# (later migilina routers ikkada include cheyyachu)

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
    return templates.TemplateResponse(
        "menu.html",
        {"request": request}
    )

@app.get("/logout")
def logout_page(request: Request):
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
        "environment": "RENDER"
    }
