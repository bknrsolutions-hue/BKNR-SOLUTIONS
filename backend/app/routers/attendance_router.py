from fastapi import APIRouter

from app.routers.attendance.employee_registration import router as employee_router
from app.routers.attendance.daily_attendance import router as daily_router
from app.routers.attendance.analytics import router as analytics_router
from app.routers.attendance.salary_reports import router as salary_router
from app.routers.attendance.tax_master import router as tax_master_router
from app.routers.attendance.salary_advance import router as salary_advance_router
from app.routers.attendance.employee_increment import router as increment_router  # ✅ ADD

router = APIRouter()

# ==================================================
# 1️⃣ ATTENDANCE API ROUTES (WITH /attendance PREFIX)
# ==================================================
attendance_api = APIRouter(prefix="/attendance")

attendance_api.include_router(employee_router)        # /attendance/employee/*
attendance_api.include_router(daily_router)           # /attendance/daily/*
attendance_api.include_router(tax_master_router)      # /attendance/tax-master
attendance_api.include_router(salary_advance_router) 
 # /attendance/salary-advance ✅
attendance_api.include_router(increment_router)       # /attendance/employee-increment ✅

# ==================================================
# 2️⃣ INCLUDE INTO MAIN ROUTER
# ==================================================
router.include_router(attendance_api)

# Dashboards & reports (NO attendance prefix)
router.include_router(analytics_router)   # /dashboard/*
router.include_router(salary_router)      # /salary-sheet , /payroll/*
