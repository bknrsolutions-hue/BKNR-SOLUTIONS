from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/add_user", response_class=HTMLResponse)
async def add_user(request: Request):
    return templates.TemplateResponse("admin/add_user.html", {"request": request})

@router.get("/existing_users", response_class=HTMLResponse)
async def existing_users(request: Request):
    return templates.TemplateResponse("admin/existing_users.html", {"request": request})
