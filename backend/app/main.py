from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.routes.auth import router as auth_router

# ==========================================================
# 🚀 APP INIT
# ==========================================================
app = FastAPI()

# ==========================================================
# 🔐 SESSION MIDDLEWARE
# ==========================================================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr-super-secure-erp-key-2026"
)

# ==========================================================
# 📁 STATIC FILES
# ==========================================================
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# ==========================================================
# 📄 TEMPLATES
# ==========================================================
templates = Jinja2Templates(directory="app/templates")

# ==========================================================
# 🔗 ROUTERS
# ==========================================================
app.include_router(auth_router)

# ==========================================================
# 🏠 ROOT PAGE (LOGIN PAGE)
# ==========================================================
@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# ==========================================================
# 🏠 HOME PAGE (AFTER LOGIN)
# ==========================================================
@app.get("/home", response_class=HTMLResponse)
def home(request: Request):
    if not request.session.get("email"):
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "msg": "Please login first"}
        )

    return templates.TemplateResponse(
        "home.html",
        {
            "request": request,
            "email": request.session.get("email"),
            "name": request.session.get("name"),
            "company_code": request.session.get("company_code"),
            "role": request.session.get("role")
        }
    )

# ==========================================================
# 🧪 HEALTH CHECK (FOR RENDER)
# ==========================================================
@app.get("/health")
def health():
    return {"status": "ok"}

# ==========================================================
# 🚫 404 HANDLER (OPTIONAL CLEAN UI)
# ==========================================================
@app.exception_handler(404)
def not_found(request: Request, exc):
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "msg": "Page not found"}
    )