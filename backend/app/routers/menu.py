# app/routers/menu.py

from fastapi import APIRouter, Request, Depends, Query, Form, HTTPException, File, UploadFile
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
import shutil
from pathlib import Path
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.database import get_db
# Models
from app.database.models.processing import GateEntry, Production, RawMaterialPurchasing
from app.database.models.inventory_management import sales_dispatch, stock_entry, cold_storage_holding, pending_orders
from app.database.models.attendance import DailyAttendance
from app.database.models.helpdesk import SupportTicket, EventNotification, CompanyAnnouncement
from app.database.models.criteria import buyers, suppliers
from datetime import date

router = APIRouter(prefix="/menu", tags=["Menu"])
templates = Jinja2Templates(directory="app/templates")
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
SUPPORT_UPLOAD_DIR = STATIC_DIR / "uploads" / "support"


def save_support_upload(file: UploadFile) -> str:
    SUPPORT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{int(datetime.utcnow().timestamp())}_{Path(file.filename).name}"
    dest_path = SUPPORT_UPLOAD_DIR / filename
    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return f"/static/uploads/support/{filename}"


def existing_static_media_path(media_path: str | None) -> str | None:
    if not media_path or not media_path.startswith("/static/"):
        return None
    relative_path = media_path.removeprefix("/static/").lstrip("/")
    return media_path if (STATIC_DIR / relative_path).is_file() else None


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


@router.get("/notifications")
async def get_notifications(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse(content=[])
        
    notifications = []
    today = date.today()
    

    # 0.5. Company Announcements (Local Company Admin Broadcasts + Super Admin Broadcasts)
    try:
        company_announces = db.query(CompanyAnnouncement).filter(
            or_(
                CompanyAnnouncement.company_id == comp_code,
                CompanyAnnouncement.created_by == "bknr.solutions@gmail.com"
            )
        ).order_by(CompanyAnnouncement.created_at.desc()).limit(10).all()
        for ca in company_announces:
            is_super_admin = ca.created_by == "bknr.solutions@gmail.com"
            title = "System Broadcast" if is_super_admin else ca.created_by
            bg = "#8b5cf6" if is_super_admin else "#3b82f6"
            icon = "fa-bullhorn" if is_super_admin else "fa-megaphone"
            
            notifications.append({
                "title": title,
                "desc": ca.message,
                "time": ca.created_at.strftime("%I:%M %p") if ca.created_at else "Today",
                "icon": icon,
                "bg": bg,
                "media_path": existing_static_media_path(ca.media_path)
            })
    except Exception as e:
        pass
    
    # 1. Gate entries count today
    try:
        gates_count = db.query(GateEntry).filter(GateEntry.company_id == comp_code, GateEntry.date == today).count()
        if gates_count > 0:
            notifications.append({
                "title": "Material Gate Entry Completed",
                "desc": f"{gates_count} material transport vehicle(s) arrived at dock today.",
                "time": "Today",
                "icon": "fa-truck-ramp-box",
                "bg": "#3b82f6"
            })
    except Exception as e:
        pass
        
    # 2. Staff Attendance count today
    try:
        att_count = db.query(DailyAttendance).filter(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today).count()
        if att_count > 0:
            notifications.append({
                "title": "Shift Attendance Logged",
                "desc": f"{att_count} employee check-in(s) recorded today.",
                "time": "Today",
                "icon": "fa-fingerprint",
                "bg": "#10b981"
            })
    except Exception as e:
        pass
        
    # 3. Open support tickets
    try:
        tickets_count = db.query(SupportTicket).filter(SupportTicket.status == "OPEN").count()
        if tickets_count > 0:
            notifications.append({
                "title": "Open Support Tickets",
                "desc": f"{tickets_count} unresolved customer tickets pending helpdesk.",
                "time": "Active",
                "icon": "fa-ticket",
                "bg": "#ef4444"
            })
    except Exception as e:
        pass
        
    # 4. Pending orders count
    try:
        po_count = db.query(pending_orders).filter(pending_orders.company_id == comp_code).count()
        if po_count > 0:
            notifications.append({
                "title": "Pending Export Orders",
                "desc": f"{po_count} active export purchase orders pending shipment.",
                "time": "Active",
                "icon": "fa-ship",
                "bg": "#f59e0b"
            })
    except Exception as e:
        pass
        
    # 5. Cold Storage batch holdings count
    try:
        cs_count = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code, cold_storage_holding.status == "HOLDING").count()
        if cs_count > 0:
            notifications.append({
                "title": "Cold Storage Stock",
                "desc": f"{cs_count} batches currently held in cold room storage.",
                "time": "Live",
                "icon": "fa-snowflake",
                "bg": "#0ea5e9"
            })
    except Exception as e:
        pass

    # If no notifications, return a default nice greeting/system-ready message
    if not notifications:
        notifications.append({
            "title": "System Secure & Sync'd",
            "desc": "All systems operating normally. Database is synchronized.",
            "time": "Just now",
            "icon": "fa-circle-check",
            "bg": "#10b981"
        })
        
    return JSONResponse(content=notifications)


@router.get("/search_entities")
async def search_entities(request: Request, query: str = Query(""), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code or len(query.strip()) < 2:
        return JSONResponse(content=[])
        
    q = f"%{query.strip()}%"
    results = []
    
    # 1. Search Buyers (Customers)
    try:
        buyer_list = db.query(buyers).filter(buyers.company_id == comp_code, buyers.buyer_name.ilike(q)).limit(3).all()
        for b in buyer_list:
            results.append({
                "title": b.buyer_name,
                "desc": "Customer Master",
                "icon": "fa-users",
                "route": "/criteria/buyers"
            })
    except Exception as e:
        pass
        
    # 2. Search Suppliers
    try:
        supplier_list = db.query(suppliers).filter(suppliers.company_id == comp_code, suppliers.supplier_name.ilike(q)).limit(3).all()
        for s in supplier_list:
            results.append({
                "title": s.supplier_name,
                "desc": "Supplier Master",
                "icon": "fa-truck-field",
                "route": "/criteria/suppliers"
            })
    except Exception as e:
        pass
        
    # 3. Search Invoices (sales_dispatch invoice_no or po_number)
    try:
        invoice_list = db.query(sales_dispatch).filter(
            sales_dispatch.company_id == comp_code,
            or_(
                sales_dispatch.invoice_no.ilike(q),
                sales_dispatch.po_number.ilike(q)
            )
        ).limit(3).all()
        for inv in invoice_list:
            results.append({
                "title": f"Inv #{inv.invoice_no}",
                "desc": f"PO: {inv.po_number or '--'} | Buyer: {inv.buyer_name}",
                "icon": "fa-file-invoice",
                "route": "/inventory/sales_report"
            })
    except Exception as e:
        pass
        
    # 4. Search Batches (Gate Entry batch_number)
    try:
        batch_list = db.query(GateEntry).filter(
            GateEntry.company_id == comp_code,
            GateEntry.batch_number.ilike(q)
        ).limit(3).all()
        for b in batch_list:
            results.append({
                "title": f"Batch #{b.batch_number}",
                "desc": f"Vehicle: {b.vehicle_number or '--'} | Supplier: {b.supplier_name}",
                "icon": "fa-truck-ramp-box",
                "route": "/summary/processing"
            })
    except Exception as e:
        pass
        
    return JSONResponse(content=results)

@router.post("/create_company_announcement")
async def create_company_announcement(
    request: Request,
    message: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    role = request.session.get("role")
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    
    if not email or not comp_code or (role not in ["Admin", "admin", "Super Admin", "super_admin"] and email != "bknr.solutions@gmail.com"):
        raise HTTPException(status_code=403, detail="Unauthorized")

    if not message and not (file and file.filename):
        raise HTTPException(status_code=400, detail="Either message or file must be provided")

    media_path = None
    if file and file.filename:
        media_path = save_support_upload(file)

    new_announce = CompanyAnnouncement(
        message=message or "",
        created_by=email,
        company_id=comp_code,
        media_path=media_path
    )
    db.add(new_announce)
    db.commit()
    return JSONResponse(content={"success": True, "message": "Company broadcast sent successfully"})
