from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
# Path ని నీ ప్రాజెక్ట్ స్ట్రక్చర్ ప్రకారం సరిచూసుకో (e.g., "backend/app/templates")
templates = Jinja2Templates(directory="app/templates")


# ============================================================
# FIXED RENDER FUNCTION (The Core Fix)
# ============================================================
def render_page(request: Request, page: str, context: dict = None):
    """
    TypeError: unhashable type: 'dict' ఎర్రర్ రాకుండా ఉండటానికి 
    request ని మొదటి ఆర్గ్యుమెంట్ గా పంపిస్తున్నాను.
    """
    if context is None:
        context = {}
    
    # Context లో కచ్చితంగా request ఉండాలి
    context["request"] = request

    # ✅ FIXED SYNTAX: (request, name, context)
    return templates.TemplateResponse(
        request=request, 
        name=page, 
        context=context
    )


# ------------------- Dashboard Screens -------------------
@router.get("/dashboard/processing", response_class=HTMLResponse)
def dashboard_processing(request: Request):
    return render_page(request, "dashboard/processing_dashboard.html")


@router.get("/dashboard/inventory", response_class=HTMLResponse)
def dashboard_inventory(request: Request):
    return render_page(request, "dashboard/inventory_dashboard.html")


@router.get("/dashboard/general_stock", response_class=HTMLResponse)
def dashboard_general_stock(request: Request):
    return render_page(request, "dashboard/general_stock_dashboard.html")


@router.get("/dashboard/purchasing", response_class=HTMLResponse)
def dashboard_purchasing(request: Request):
    return render_page(request, "dashboard/purchasing_dashboard.html")


# ------------------- Inventory Pages -------------------
@router.get("/inventory/stock_entry")
def stock_entry(request: Request):
    return render_page(request, "inventory_management/stock_entry.html")


@router.get("/inventory/pending_orders")
def pending_orders(request: Request):
    return render_page(request, "inventory_management/pending_orders.html")


@router.get("/inventory/inventory_report")
def inventory_report(request: Request):
    return render_page(request, "inventory_management/inventory_report.html")


# ------------------- General Stock -------------------
@router.get("/general_stock/entry")
def gs_entry(request: Request):
    return render_page(request, "general_stock/general_stock_entry.html")


@router.get("/general_stock/items")
def gs_items(request: Request):
    return render_page(request, "general_stock/general_store_items.html")


@router.get("/general_stock/report")
def gs_report(request: Request):
    return render_page(request, "general_stock/general_stock_report.html")


# ------------------- Attendance -------------------
@router.get("/attendance/punch")
def attendance_page(request: Request):
    return render_page(request, "attendance/attendance_punch.html")


@router.get("/attendance/face_attendance")
def face_attendance_page(request: Request):
    return render_page(request, "attendance/face_attendance.html")


# ------------------- Admin -------------------
@router.get("/admin/user_list")
def user_list(request: Request):
    return render_page(request, "admin/add_user.html")


@router.get("/admin/role_permissions")
def role_permissions(request: Request):
    return render_page(request, "admin/role_permissions.html")