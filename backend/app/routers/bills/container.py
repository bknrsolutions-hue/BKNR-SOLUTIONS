# app/routers/bills/container_logistics.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.bills import ContainerLog
from app.database.models.criteria import vendors
from app.database.models.inventory_management import pending_orders, sales_dispatch

router = APIRouter(
    prefix="/container",
    tags=["Container Logistics"]
)

templates = Jinja2Templates(directory="app/templates")


# ==================================================
# 🚢 1. GET: ENTRY PAGE (LIST + FORM)
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def container_entry_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # -----------------------------------
    # 🔹 Vendors
    # -----------------------------------
    vendor_list = db.query(vendors).filter(
        vendors.company_id == comp_code
    ).all()

    # -----------------------------------
    # 🔥 PO LIST (PENDING + SALES)
    # -----------------------------------
    pending_po = db.query(pending_orders.po_number).filter(
        pending_orders.company_id == comp_code
    ).distinct().all()

    sales_po = db.query(sales_dispatch.po_number).filter(
        sales_dispatch.company_id == comp_code
    ).distinct().all()

    po_set = set()

    for p in pending_po:
        if p[0] and str(p[0]).strip().upper() not in ["N/A", "-", "NONE"]:
            po_set.add(str(p[0]).strip())

    for s in sales_po:
        if s[0] and str(s[0]).strip().upper() not in ["N/A", "-", "NONE"]:
            po_set.add(str(s[0]).strip())

    po_list = sorted(po_set)

    # -----------------------------------
    # 🔹 HISTORY
    # -----------------------------------
    try:
        history = db.query(
            ContainerLog,
            vendors.name.label("v_name")
        ).join(
            vendors,
            ContainerLog.vendor_id == vendors.id
        ).filter(
            ContainerLog.company_id == comp_code
        ).order_by(ContainerLog.id.desc()).limit(50).all()
    except Exception as e:
        print(f"FETCH ERROR: {e}")
        history = []

    # -----------------------------------
    # RETURN
    # -----------------------------------
    return templates.TemplateResponse(
        request=request,
        name="bills/container_entry.html",
        context={
            "shipping_vendors": vendor_list,
            "container_history": history,
            "po_list": po_list,   # 🔥 PO dropdown
            "comp_code": comp_code,
            "email": email
        }
    )


# ==================================================
# 💾 2. POST: SAVE RECORD
# ==================================================
@router.post("/save")
async def save_container_log(
    request: Request,
    po_number: str = Form(...),
    container_no: str = Form(...),
    container_size: str = Form(...),
    shipping_line_id: int = Form(...),
    ocean_freight: float = Form(0),
    local_transport: float = Form(0),
    handling_charges: float = Form(0),
    detention_charges: float = Form(0),
    grand_total: float = Form(...),
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")

    if not comp_code:
        return JSONResponse({"error": "Session Expired"}, status_code=401)

    try:
        new_entry = ContainerLog(
            company_id=comp_code,
            unit_id=request.session.get("unit_id", 0),
            po_number=(po_number or "N/A").upper().strip(),
            container_no=container_no.upper().strip(),
            size=container_size,
            vendor_id=shipping_line_id,
            ocean_cost=ocean_freight,
            local_cost=local_transport,
            handling=handling_charges,
            detention=detention_charges,
            lended_total=grand_total,
            vessel_name=""
        )

        db.add(new_entry)
        db.commit()

        return RedirectResponse(url="/api/container/entry", status_code=303)

    except Exception as e:
        db.rollback()
        print(f"SAVE ERROR: {e}")
        return JSONResponse(
            {"error": f"Database Error: {str(e)}"},
            status_code=500
        )


# ==================================================
# 🗑️ 3. DELETE RECORD
# ==================================================
@router.post("/delete/{log_id}")
def delete_container_log(
    log_id: int,
    request: Request,
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")

    log_entry = db.query(ContainerLog).filter(
        ContainerLog.id == log_id,
        ContainerLog.company_id == comp_code
    ).first()

    if log_entry:
        db.delete(log_entry)
        db.commit()
        return {"status": "success"}

    return JSONResponse(
        {"error": "Record not found"},
        status_code=404
    )