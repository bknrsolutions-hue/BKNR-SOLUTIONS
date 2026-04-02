from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.routers import router as main_router

app = FastAPI()

# ================= SESSION =================
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr-super-secure-erp-key-2026"
)

# ================= STATIC =================
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# ================= TEMPLATES =================
templates = Jinja2Templates(directory="app/templates")

# ================= ROUTERS =================
app.include_router(main_router)

# ================= ROOT (MENU PAGE) =================
@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    return templates.TemplateResponse("menu.html", {"request": request})

# ================= HOME =================
@app.get("/home", response_class=HTMLResponse)
def home(request: Request):
    if not request.session.get("email"):
        return templates.TemplateResponse(
            "menu.html",
            {"request": request, "msg": "Please login first"}
        )

    return templates.TemplateResponse(
        "menu.html",
        {
            "request": request,
            "email": request.session.get("email"),
            "name": request.session.get("name"),
            "company_code": request.session.get("company_code"),
            "permissions": request.session.get("permissions")
        }
    )

# ================= HEALTH =================
@app.get("/health")
def health():
    return {"status": "ok"}

# ================= 404 =================
@app.exception_handler(404)
def not_found(request: Request, exc):
    return templates.TemplateResponse(
        "menu.html",
        {"request": request, "msg": "Page not found"}
    )