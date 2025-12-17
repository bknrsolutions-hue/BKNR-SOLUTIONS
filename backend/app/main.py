from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import engine, Base

app = FastAPI(title="BKNR ERP")

# =====================================================
# AUTH MIDDLEWARE  (ADD FIRST)
# =====================================================
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

        # session will exist (because SessionMiddleware wraps this)
        if not request.session.get("email"):
            return RedirectResponse("/", status_code=303)

        return await call_next(request)

app.add_middleware(AuthMiddleware)

# =====================================================
# SESSION MIDDLEWARE  (ADD LAST 🔥🔥🔥)
# =====================================================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",
    session_cookie="bknr_session",
    max_age=60 * 60 * 8
)

# =====================================================
# STATIC + TEMPLATES
# =====================================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# DB TABLES
# =====================================================
@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

# =====================================================
# ROUTERS
# =====================================================
from app.routers.auth import router as auth_router
app.include_router(auth_router)

# =====================================================
# PAGES
# =====================================================
@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/home", response_class=HTMLResponse)
def home_page(request: Request):
    return templates.TemplateResponse("menu.html", {"request": request})

@app.get("/health")
def health():
    return {"status": "OK"}
