# app/routers/menu.py

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/menu", tags=["Menu"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def menu_page(request: Request):
    """
    Loads the main dashboard menu.
    Validates session → redirects to login if expired.
    """

    # ---- Read session values ----
    company_name = request.session.get("company_name")
    user_name = request.session.get("user_name")

    # ---- Session expired or invalid ----
    if not company_name or not user_name:
        # Clear session completely
        request.session.clear()

        # Redirect to login
        return RedirectResponse(url="/auth/login", status_code=302)

    # ---- Render menu page ----
    return templates.TemplateResponse(
        "menu.html",
        {
            "request": request,
            "company_name": company_name,
            "user_name": user_name
        }
    )
