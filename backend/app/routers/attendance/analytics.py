from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from app.database import get_db
from app.database.models.attendance import EmployeeRegistration, DailyAttendance

router = APIRouter() # Prefix ikkada ivvadu

@router.get("/dashboard/hr_dashboard")
def get_hr_dashboard(request: Request):
    return request.app.state.templates.TemplateResponse(
        "attendance/ceo_dashboard.html", {"request": request}
    )