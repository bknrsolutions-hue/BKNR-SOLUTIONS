from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
import logging

# -------------------------
# DATABASE
# -------------------------
from app.database import engine, Base
from app.database import models   # auto-load all DB models

# -------------------------
# ROUTERS
# -------------------------
from app.routers.auth import router as auth
from app.routers.menu import router as menu
from app.routers.criteria_router import router as criteria_router
from app.routers.inventory import router as inventory
from app.routers.general_stock import router as general_stock
from app.routers.admin import router as admin
from app.routers.processing_router import router as processing_router
from app.routers.reports_router import router as reports_router


# -------------------------
# FASTAPI APP
# -------------------------
app = FastAPI(
    title="BKNR ERP",
    version="1.0",
)


# -------------------------
# SESSION MIDDLEWARE
# -------------------------
app.add_middleware(
    SessionMiddleware,
    secret_key="bknr_secret_key_2025",
    session_cookie="bknr_session",
    max_age=3600 * 8,
)


# -------------------------
# STATIC FILES  (FIXED FOR RENDER)
# -------------------------
app.mount("/static", StaticFiles(directory="backend/app/static"), name="static")


# -------------------------
# TEMPLATE ENGINE  (FIXED FOR RENDER)
# -------------------------
templates = Jinja2Templates(directory="backend/app/templates")
templates.env.cache = {}    # Always reload templates


# -------------------------
# DATABASE INIT
# -------------------------
Base.metadata.create_all(bind=engine)
logging.info("Database Initialized")


# -------------------------
# INCLUDE ROUTERS
# -------------------------
routers = [
    auth,
    menu,
    criteria_router,
    inventory,
    general_stock,
    admin,
    processing_router,
    reports_router,
]

for router in routers:
    app.include_router(router)

logging.info("All Routers Loaded Successfully")


# -------------------------
# DEFAULT ROUTES
# -------------------------
@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok"}
