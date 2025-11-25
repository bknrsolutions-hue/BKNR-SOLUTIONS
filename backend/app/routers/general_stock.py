from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

# Router Configuration
router = APIRouter(prefix="/general_stock", tags=["General Stock"])
templates = Jinja2Templates(directory="app/templates")

# Route for General Stock  Page
@router.get("/entry", response_class=HTMLResponse)
async def general_stock_entry(request: Request):
    return templates.TemplateResponse(
        "general_stock/general_stock.html",  # ✅ Correct filename
        {"request": request}
    )
