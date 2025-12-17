from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import engine, Base
from app.routers.auth import router as auth_router

# -------------------------------------------------
app = FastAPI(title="BKNR ERP")
# -------------------------------------------------

# ✅ SESSION MIDDLEWARE (MUST BE FIRST)
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8
)

# -------------------------------------------------
# AUTH MIDDLEWARE
# -------------------------------------------------
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if (
            path == "/"
            or path.startswith("/auth/")
            or path.startswith("/static/")
            or path.startswith("/docs")
            or path.startswith("/openapi.json")
            or path.startswith("/health")
        ):
            return await call_next(request)

        if not request.session.get("email"):
            return RedirectResponse("/", status_code=303)

        return await call_next(request)

app.add_middleware(AuthMiddleware)

# -------------------------------------------------
# STATIC + TEMPLATES
# -------------------------------------------------
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# -------------------------------------------------
# DATABASE INIT
# -------------------------------------------------
@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("✅ DB Ready")

# -------------------------------------------------
# ROUTERS
# -------------------------------------------------
app.include_router(auth_router)

# -------------------------------------------------
# PAGES
# -------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/home", response_class=HTMLResponse)
def home(request: Request):
    return HTMLResponse("<h2>Welcome to BKNR ERP</h2>")

@app.get("/health")
def health():
    return {"status": "OK"}
