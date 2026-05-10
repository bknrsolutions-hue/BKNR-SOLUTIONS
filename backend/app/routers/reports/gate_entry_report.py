# ============================================================
# GATE ENTRY REPORT ROUTER – STOCK STYLE (FY LOCK + META SYNC)
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date
import datetime as dt
from io import BytesIO

from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import GateEntry, AuditLog

router = APIRouter(
    prefix="/gate_entry",
    tags=["GATE ENTRY REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# --- Helper: Get Financial Year (April to March) ---
def get_fin_year(date_val):
    if not date_val: return None
    return date_val.year if date_val.month >= 4 else date_val.year - 1

# ============================================================
# 1. MAIN REPORT (GET) - WITH FY LOCK & AUTO META-DATA
# ============================================================
@router.get("", response_class=HTMLResponse)
async def gate_entry_report(
    request: Request,
    fy: str = Query(None), # Financial Year Filter
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    # --- MODIFIED: FY LOCK LOGIC ---
    # User inka FY select cheyakapothe, empty data pampali (404 rakunda)
    if not fy:
        return templates.TemplateResponse(
            request=request,
            name="reports/gate_entry_report.html",
            context={
                "rows": [],
                "suppliers_list": [],
                "factories_list": [],
                "locations_list": [],
                "vehicles_list": [],
                "production_for_list": [],
                "is_admin": role == "admin",
                "selected_fy": None,
                "datetime": datetime
            }
        )

    # 1. Determine Target Financial Year
    selected_fy = int(fy)
    start_date = dt.date(selected_fy, 4, 1)
    end_date = dt.date(selected_fy + 1, 3, 31)

    # 2. Fetch Rows based on FY range
    rows = (
        db.query(GateEntry)
        .filter(
            GateEntry.company_id == company_id,
            GateEntry.date >= start_date,
            GateEntry.date <= end_date
        )
        .order_by(GateEntry.date.desc(), GateEntry.time.desc())
        .all()
    )

    # 3. Meta-data for Searchable Dropdowns (Reference code style)
    def get_unique(field_attr):
        return sorted(list({getattr(r, field_attr) for r in rows if getattr(r, field_attr)}))

    return templates.TemplateResponse(
        request=request,
        name="reports/gate_entry_report.html",
        context={
            "rows": rows,
            "suppliers_list": get_unique("supplier_name"),
            "factories_list": get_unique("receiving_center"),
            "locations_list": get_unique("purchasing_location"),
            "vehicles_list": get_unique("vehicle_number"),
            "production_for_list": get_unique("production_for"),
            "is_admin": role == "admin",
            "selected_fy": str(selected_fy),
            "datetime": datetime
        }
    )

# ============================================================
# 2. UPDATE ACTION (POST) - WITH AUDIT LOG PRESERVATION
# ============================================================
@router.post("/update")
async def update_gate_entry(
    request: Request, 
    payload: dict = Body(...), 
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    user_email = request.session.get("email")

    row = db.query(GateEntry).filter(
        GateEntry.id == payload.get("id"), 
        GateEntry.company_id == company_id
    ).first()
    
    if not row: 
        raise HTTPException(status_code=404, detail="Record not found")

    # Fields to update
    fields = [
        "batch_number", "challan_number", "gate_pass_number", "receiving_center",
        "supplier_name", "purchasing_location", "vehicle_number", "production_for",
        "no_of_material_boxes", "no_of_empty_boxes", "no_of_ice_boxes"
    ]

    for f in fields:
        if f in payload:
            old_val = str(getattr(row, f))
            new_val = payload[f]
            
            # Type conversion for box counts
            if f in ["no_of_material_boxes", "no_of_empty_boxes", "no_of_ice_boxes"]:
                try: new_val = float(new_val or 0)
                except: new_val = 0.0

            if old_val != str(new_val):
                # Add Audit Log entry
                db.add(AuditLog(
                    table_name="gate_entry", 
                    record_id=row.id, 
                    company_id=company_id,
                    field_name=f, 
                    old_value=old_val, 
                    new_value=str(new_val),
                    edited_by=user_email, 
                    edited_at=dt.datetime.now(dt.timezone.utc)
                ))
                setattr(row, f, new_val)

    db.commit()
    return {"status": "success"}

# ============================================================
# 3. AUDIT HISTORY & EXPORTS
# ============================================================
@router.get("/audit")
async def get_gate_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = db.query(AuditLog).filter(
        AuditLog.table_name == "gate_entry",
        AuditLog.company_id == comp_code
    ).order_by(AuditLog.edited_at.desc()).limit(100).all()

    return [{
        "record_id": l.record_id,
        "field": l.field_name,
        "old": l.old_value,
        "new": l.new_value,
        "user": l.edited_by.split('@')[0] if l.edited_by else "System",
        "time": l.edited_at.strftime("%d-%m-%Y %H:%M:%S")
    } for l in logs]

@router.get("/export_pdf")
def gate_export_pdf(request: Request, fy: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not fy: return {"error": "FY missing"}
    selected_fy = int(fy)
    
    rows = db.query(GateEntry).filter(
        GateEntry.company_id == company_id,
        GateEntry.date >= date(selected_fy, 4, 1),
        GateEntry.date <= date(selected_fy + 1, 3, 31)
    ).order_by(GateEntry.date.asc()).all()

    html = templates.get_template("reports/gate_entry_print.html").render({
        "request": request, "rows": rows, "printed_on": datetime.now(),
        "total_mat": sum(r.no_of_material_boxes or 0 for r in rows),
        "total_emp": sum(r.no_of_empty_boxes or 0 for r in rows),
        "total_ice": sum(r.no_of_ice_boxes or 0 for r in rows)
    })
    pdf = HTML(string=html).write_pdf()
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=GATE_ENTRY.pdf"})

@router.get("/export_excel")
def gate_export_excel(request: Request, fy: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not fy: return {"error": "FY missing"}
    selected_fy = int(fy)
    
    rows = db.query(GateEntry).filter(
        GateEntry.company_id == company_id,
        GateEntry.date >= date(selected_fy, 4, 1),
        GateEntry.date <= date(selected_fy + 1, 3, 31)
    ).order_by(GateEntry.date.asc()).all()

    wb = Workbook()
    ws = wb.active
    ws.append(["Date","Time","Batch","Challan","G.Pass","Factory","Supplier","Location","Vehicle","Prod For","Mat","Emp","Ice"])
    for r in rows:
        ws.append([str(r.date), r.time.strftime("%H:%M") if r.time else "", r.batch_number, r.challan_number, r.gate_pass_number, r.receiving_center, r.supplier_name, r.purchasing_location, r.vehicle_number, r.production_for, r.no_of_material_boxes, r.no_of_empty_boxes, r.no_of_ice_boxes])

    stream = BytesIO(); wb.save(stream); stream.seek(0)
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=GATE_ENTRY.xlsx"})

@router.post("/delete")
async def delete_gate_row(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    row = db.query(GateEntry).filter(GateEntry.id == payload.get("id"), GateEntry.company_id == company_id).first()
    if row:
        db.add(AuditLog(
            table_name="gate_entry", record_id=row.id, company_id=company_id, 
            field_name="DELETE", old_value="Gate Entry Record", new_value="DELETED", 
            edited_by=request.session.get("email"), edited_at=dt.datetime.now(dt.timezone.utc)
        ))
        db.delete(row); db.commit()
        return {"status": "success"}
    return {"status": "error"}