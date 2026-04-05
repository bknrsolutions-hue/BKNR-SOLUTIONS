# ============================================================
# RAW MATERIAL PURCHASING REPORT ROUTER (BKNR ERP - UPDATED)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date
import json
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, GateEntry, AuditLog
from app.database.models.criteria import suppliers as SupplierTable
from app.database.models.users import Company

router = APIRouter(
    prefix="/raw_material_purchasing",
    tags=["RAW MATERIAL PURCHASE REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------------
# HELPERS: COMPANY & SUPPLIER INFO
# -----------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    company = db.query(Company).filter(Company.company_code == comp_code).first()
    if not company:
        return {"name": "BKNR ERP", "address": "", "email": ""}
    return {
        "name": company.company_name,
        "address": company.address,
        "email": company.email
    }

def get_supplier_info(db: Session, comp_code: str, supplier_name: str):
    s = db.query(SupplierTable).filter(
        SupplierTable.company_id == comp_code,
        SupplierTable.supplier_name == supplier_name
    ).first()
    if not s:
        return {"id": supplier_name, "name": supplier_name, "email": "", "phone": "", "address": ""}
    return {
        "id": s.id, "name": s.supplier_name, "email": s.supplier_email, "phone": s.phone, "address": s.address
    }

# -----------------------------------------------------------
# MAIN REPORT PAGE
# -----------------------------------------------------------
@router.get("", response_class=HTMLResponse)
def report_page(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    rows = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == comp_code
    ).order_by(RawMaterialPurchasing.date.desc(), RawMaterialPurchasing.time.desc()).all()

    def get_dist(attr):
        return sorted({getattr(r, attr) for r in rows if getattr(r, attr)})

    comp = get_company_info(db, comp_code)

    return templates.TemplateResponse(
        request=request,
        name="reports/raw_material_purchasing_report.html",
        context={
            "rows": rows,
            "batches": get_dist("batch_number"),
            "suppliers": get_dist("supplier_name"),
            "varieties": get_dist("variety_name"),
            "species": get_dist("species"),
            "production_for_list": get_dist("production_for"),
            "peeling_locations": get_dist("peeling_at"),
            "hsn_list": get_dist("hsn_code"),
            "company_name": comp["name"],
            "company_address": comp["address"]
        }
    )

# -----------------------------------------------------------
# UPDATE ENTRY
# -----------------------------------------------------------
@router.post("/update")
def update_rmp_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    edited_by = request.session.get("email")
    
    row = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.id == payload.get("id"),
        RawMaterialPurchasing.company_id == comp_code
    ).first()

    if not row: raise HTTPException(status_code=404, detail="Record not found")

    update_fields = [
        "batch_number", "supplier_name", "variety_name", "species", 
        "count", "g1_qty", "g2_qty", "dc_qty", "rate_per_kg", 
        "material_boxes", "hsn_code", "peeling_at", "production_for", "remarks"
    ]

    for field in update_fields:
        if field in payload:
            old_val = str(getattr(row, field) or "")
            new_val = str(payload[field])

            if old_val != new_val:
                db.add(AuditLog(
                    table_name="rmp", record_id=row.id, company_id=comp_code,
                    field_name=field, old_value=old_val, new_value=new_val,
                    edited_by=edited_by, edited_at=datetime.now()
                ))
                setattr(row, field, payload[field])

    # ✅ FIXED Amount Logic: Total Qty (G1+G2+DC) * Rate
    g1 = float(row.g1_qty or 0)
    g2 = float(row.g2_qty or 0)
    dc = float(row.dc_qty or 0)
    rate = float(row.rate_per_kg or 0)
    
    row.received_qty = round(g1 + g2 + dc, 2)
    # Note: G2 quantity normally halved only if industry specific rule applies, 
    # but standard is (G1+G2+DC) * Rate. Adjust if needed.
    row.amount = round(row.received_qty * rate, 2)
    
    db.commit()
    return {"status": "updated", "received_qty": row.received_qty, "amount": row.amount}

# -----------------------------------------------------------
# DELETE ENTRY
# -----------------------------------------------------------
@router.post("/delete")
def delete_rmp_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    edited_by = request.session.get("email")
    row = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == payload.get("id"), RawMaterialPurchasing.company_id == comp_code).first()
    if row:
        db.add(AuditLog(table_name="rmp", record_id=row.id, company_id=comp_code, field_name="DELETE", old_value="Record", new_value="DELETED", edited_by=edited_by, edited_at=datetime.now()))
        db.delete(row)
        db.commit()
        return {"status": "deleted"}
    return {"status": "error"}

# -----------------------------------------------------------
# EXPORT EXCEL
# -----------------------------------------------------------
@router.get("/export_excel")
def export_rmp_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    query = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == comp_code)
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        query = query.filter(RawMaterialPurchasing.id.in_(id_list))
    
    rows = query.order_by(RawMaterialPurchasing.date.asc()).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "RMP Report"
    
    headers = ["Sl.No", "Date", "Batch", "Supplier", "Variety", "Species", "Count", "G1", "G2", "DC", "Total Rec", "Rate", "Amount", "Boxes", "HSN", "Peeling", "Prod For", "Remarks"]
    ws.append(headers)
    for cell in ws[1]: cell.font = Font(bold=True)

    for idx, r in enumerate(rows, 1):
        ws.append([idx, str(r.date), r.batch_number, r.supplier_name, r.variety_name, r.species, r.count, r.g1_qty, r.g2_qty, r.dc_qty, r.received_qty, r.rate_per_kg, r.amount, r.material_boxes, r.hsn_code, r.peeling_at, r.production_for, r.remarks])
    
    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=RMP_Report_{date.today()}.xlsx"})

# -----------------------------------------------------------
# PRINT VIEWS
# -----------------------------------------------------------
@router.get("/print_table", response_class=HTMLResponse)
def print_table_view(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == comp_code)
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))
    
    rows = q.order_by(RawMaterialPurchasing.date.asc()).all()
    comp = get_company_info(db, comp_code)
    
    return templates.TemplateResponse(
        request=request,
        name="reports/raw_material_purchasing_print_table.html",
        context={"rows": rows, "company_name": comp["name"], "company_address": comp["address"], "printed_on": datetime.now()}
    )

@router.get("/print_summary", response_class=HTMLResponse)
def print_summary_view(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == comp_code)
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))
    
    rows = q.all()
    grouped = {}
    for r in rows:
        grouped.setdefault((r.supplier_name, r.batch_number), []).append(r)
    
    final_batches = []
    for (s_name, b_no), b_rows in grouped.items():
        g = db.query(GateEntry).filter(GateEntry.company_id == comp_code, GateEntry.batch_number == b_no).first()
        supplier = get_supplier_info(db, comp_code, s_name)
        final_batches.append({
            "batch_number": b_no, 
            "vehicle_number": g.vehicle_number if g else "N/A",
            "challan_number": g.challan_number if g else "N/A", 
            "location": g.purchasing_location if g else "N/A",
            "date": g.date if g else b_rows[0].date, 
            "rows": b_rows, 
            "supplier": supplier,
            "total_quantity": round(sum(x.received_qty or 0 for x in b_rows), 2),
            "total_amount": round(sum(x.amount or 0 for x in b_rows), 2)
        })
    
    comp = get_company_info(db, comp_code)
    return templates.TemplateResponse(
        request=request,
        name="reports/raw_material_purchasing_print_summary.html",
        context={"batches": final_batches, "company_name": comp["name"], "company_address": comp["address"], "printed_on": datetime.now()}
    )

# -----------------------------------------------------------
# EXPORT PDF
# -----------------------------------------------------------
@router.get("/export_pdf")
async def export_rmp_pdf(request: Request, ids: str = Query(None), type: str = Query("table"), db: Session = Depends(get_db)):
    if type == "summary":
        resp = print_summary_view(request, ids, db)
    else:
        resp = print_table_view(request, ids, db)
    
    pdf = HTML(string=resp.body.decode()).write_pdf()
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=RMP_{type}.pdf"})