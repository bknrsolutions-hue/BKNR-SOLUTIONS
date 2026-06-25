# =============================================
# 💡 BKNR ERP – BILLS & ACCOUNTS CENTRAL ROUTER
# =============================================

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

# =============================================
# SUB-MODULE ROUTERS (CORRECT RELATIVE IMPORTS)
# =============================================
from .bills.electricity import router as electricity_router
from .bills.diesel import router as diesel_router
from .bills.purchase import router as purchase_router
from .bills.container import router as container_router
from .bills.qa_testing import router as qa_router
from .bills.expenses import router as expenses_router

# =============================================
# CENTRAL ROUTER
# =============================================
router = APIRouter(
    tags=["Bills & Accounts"]
)

templates = Jinja2Templates(directory="app/templates")

# =============================================
# 📄 PAGE ROUTER (UI – Menu Buttons)
# =============================================
page_router = APIRouter()

@page_router.get("/electricity/entry", response_class=HTMLResponse)
def electricity_page(request: Request):
    return templates.TemplateResponse(
        "bills/electricity_entry.html",
        {"request": request}
    )

@page_router.get("/diesel/entry", response_class=HTMLResponse)
def diesel_page(request: Request):
    return templates.TemplateResponse(
        "bills/diesel_entry.html",
        {"request": request}
    )

@page_router.get("/purchase/entry", response_class=HTMLResponse)
def purchase_page(request: Request):
    return templates.TemplateResponse(
        "bills/purchase_entry.html",
        {"request": request}
    )

@page_router.get("/container/entry", response_class=HTMLResponse)
def container_page(request: Request):
    return templates.TemplateResponse(
        "bills/container_entry.html",
        {"request": request}
    )

@page_router.get("/qa/entry", response_class=HTMLResponse)
def qa_page(request: Request):
    return templates.TemplateResponse(
        "bills/qa_entry.html",
        {"request": request}
    )

@page_router.get("/expenses/entry", response_class=HTMLResponse)
def expenses_page(request: Request):
    return templates.TemplateResponse(
        "bills/expenses_entry.html",
        {"request": request}
    )

# =============================================
# 🔗 API & PAGE ROUTER INCLUSION
# =============================================

# API routes for data operations (prefixed with /api/bills/{module})
router.include_router(electricity_router, prefix="/electricity")
router.include_router(diesel_router, prefix="/diesel")
router.include_router(purchase_router, prefix="/purchase")
router.include_router(container_router, prefix="/container")
router.include_router(qa_router, prefix="/qa")
router.include_router(expenses_router, prefix="/expenses")

# Page routes for UI (prefixed with /api/bills/pages)
router.include_router(page_router, prefix="/pages")

@router.get("/__test")
def bills_test():
    return {"status": "bills router alive"}
