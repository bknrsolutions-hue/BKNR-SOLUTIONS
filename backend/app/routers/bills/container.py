from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.bills import ContainerLog
from app.database.models.criteria import vendors
from app.main import templates

router = APIRouter(
    prefix="/container",
    tags=["Container Logistics"]
)

# 🚢 GET: ENTRY PAGE
@router.get("/entry", response_class=HTMLResponse)
def container_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")
    if not email: return RedirectResponse("/", status_code=303)

    vendor_list = db.query(vendors).filter(vendors.company_id == comp_code).all()
    
    try:
        # v_name display kosam join
        history = db.query(ContainerLog, vendors.name.label("v_name")).join(
            vendors, ContainerLog.vendor_id == vendors.id
        ).filter(ContainerLog.company_id == comp_code).order_by(ContainerLog.id.desc()).limit(50).all()
    except:
        history = []

    return templates.TemplateResponse("bills/container_entry.html", {
        "request": request, "shipping_vendors": vendor_list, "container_history": history, "comp_code": comp_code
    })

# 💾 POST: SAVE RECORD (FIXED EMAIL ISSUE)
@router.post("/save")
def save_container_log(
    request: Request,
    db: Session = Depends(get_db),
    po_number: str = Form(...),
    container_no: str = Form(...),
    container_size: str = Form(...),
    shipping_line_id: int = Form(...),
    ocean_freight: float = Form(0),
    local_transport: float = Form(0),
    handling_charges: float = Form(0),
    detention_charges: float = Form(0),
    grand_total: float = Form(...)
):
    comp_code = request.session.get("company_code")

    try:
        # model attributes only (Removing email since it's missing in your Point 4 model)
        new_entry = ContainerLog(
            company_id=comp_code,
            unit_id=request.session.get("unit_id", 0),
            po_number=po_number.upper(),
            container_no=container_no.upper(),
            size=container_size,
            vendor_id=shipping_line_id,
            ocean_cost=ocean_freight,
            local_cost=local_transport,
            handling=handling_charges,
            detention=detention_charges,
            lended_total=grand_total, # matches your lended_total column
            vessel_name=""
        )
        db.add(new_entry)
        db.commit()
        return RedirectResponse(url="/api/container/entry", status_code=303)
    except Exception as e:
        db.rollback()
        print(f"SAVE ERROR: {e}")
        return JSONResponse({"error": str(e)})