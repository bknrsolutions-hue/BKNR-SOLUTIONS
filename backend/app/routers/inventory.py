from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/inventory", tags=["Inventory"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/stock_entry", response_class=HTMLResponse)
async def stock_entry(request: Request):
    return templates.TemplateResponse("inventory/stock_entry.html", {"request": request})

@router.get("/pending_orders", response_class=HTMLResponse)
async def pending_orders(request: Request):
    return templates.TemplateResponse("inventory/pending_orders.html", {"request": request})
