# ============================================================================
# RAW MATERIAL PURCHASING REPORT ROUTER (BKNR ERP - FILTER LOCK ENGINE)
# ============================================================================

from fastapi import APIRouter, Request, Depends, Query, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, date
from app.utils.timezone import ist_now
import datetime as dt
import json
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font
from app.services.pdf_renderer import render_pdf_from_html
from app.services.floor_balance_sync import refresh_floor_balance
from app.utils.global_filters import get_global_filters

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, GateEntry, AuditLog
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields, suppliers as SupplierTable
from app.database.models.users import Company
from app.services.cache import cache_get_or_set

router = APIRouter(
    prefix="/raw_material_purchasing",
    tags=["RAW MATERIAL PURCHASE REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------------
# HELPERS: COMPANY, SUPPLIER & FY INFO
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


def row_to_dict(row):
    return {k: v for k, v in row.__dict__.items() if not k.startswith("_")}

# -----------------------------------------------------------
# MAIN REPORT PAGE (WITH JOIN-BASED FY LOCK LOGIC)
# -----------------------------------------------------------
@router.get("", response_class=HTMLResponse)
def report_page(
    request: Request, 
    fy: str = Query(None), 
    db: Session = Depends(get_db)
):
    production_for, location = get_global_filters(request)
    comp_code = request.session.get("company_code")
    role = request.session.get("role")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    def build_report_context():
        # --- DYNAMIC FINANCIAL YEARS GENERATION FROM GATE ENTRY DATES ---
        all_dates = db.query(GateEntry.date).filter(GateEntry.company_id == comp_code, GateEntry.date != None).all()
        fy_set = set()
        for d_tuple in all_dates:
            d = d_tuple[0]
            current_year = d.year
            fy_str = f"{current_year}" if d.month >= 4 else f"{current_year - 1}"
            fy_set.add(fy_str)
        financial_years = sorted(list(fy_set), reverse=True)

        if not fy:
            return {
                "rows": [], "batches": [], "suppliers": [], "varieties": [],
                "species": [], "production_for_list": [], "peeling_locations": [],
                "hsn_list": [], "company_name": "", "company_address": "",
                "financial_years": financial_years,
                "selected_fy": None
            }

        selected_fy = int(fy)
        start_date = dt.date(selected_fy, 4, 1)
        end_date = dt.date(selected_fy + 1, 3, 31)

        # 🟢 UPDATED: Core query selection layered dynamically via global options
        query = (
            db.query(RawMaterialPurchasing)
            .join(GateEntry, RawMaterialPurchasing.batch_number == GateEntry.batch_number)
            .filter(
                RawMaterialPurchasing.company_id == comp_code,
                RawMaterialPurchasing.is_cancelled != True,
                GateEntry.company_id == comp_code,
                GateEntry.is_cancelled != True,
                GateEntry.date >= start_date,
                GateEntry.date <= end_date
            )
        )

        if production_for:
            query = query.filter(RawMaterialPurchasing.production_for == production_for)

        if location:
            query = query.filter(RawMaterialPurchasing.peeling_at == location)

        rows = [row_to_dict(row) for row in query.order_by(RawMaterialPurchasing.date.desc(), RawMaterialPurchasing.time.desc()).all()]

        def get_dist(attr):
            return sorted({r.get(attr) for r in rows if r.get(attr)})

        comp = get_company_info(db, comp_code)
        return {
            "rows": rows,
            "batches": get_dist("batch_number"),
            "suppliers": get_dist("supplier_name"),
            "varieties": get_dist("variety_name"),
            "species": get_dist("species"),
            "production_for_list": get_dist("production_for"),
            "peeling_locations": get_dist("peeling_at"),
            "hsn_list": get_dist("hsn_code"),
            "company_name": comp["name"],
            "company_address": comp["address"],
            "financial_years": financial_years,
            "selected_fy": str(selected_fy)
        }

    cache_key = f"bknr:processing_reports:{comp_code}:rmp_report:{fy or 'NONE'}:{production_for or 'ALL'}:{location or 'ALL'}"
    context = cache_get_or_set(cache_key, build_report_context, ttl=75)
    context = dict(context)
    context["is_admin"] = role == "admin"
    context["datetime"] = datetime

    from app.utils.report_permissions import check_report_permission
    context.update({
        "can_edit": check_report_permission(request, "report_edit"),
        "can_delete": check_report_permission(request, "report_delete"),
        "can_print": check_report_permission(request, "report_print"),
        "can_export": check_report_permission(request, "report_export"),
    })

    return templates.TemplateResponse(
        request=request,
        name="reports/raw_material_purchasing_report.html",
        context=context
    )

# -----------------------------------------------------------
# AUDIT LOGS, UPDATE & DELETE (PRESERVED LOGIC)
# -----------------------------------------------------------
@router.get("/audit")
def fetch_all_audit_logs(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = (
        db.query(AuditLog, RawMaterialPurchasing.batch_number)
        .join(RawMaterialPurchasing, AuditLog.record_id == RawMaterialPurchasing.id)
        .filter(AuditLog.table_name == "rmp", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).all()
    )
    return [{
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0] if l.AuditLog.edited_by else "System",
        "email": l.AuditLog.edited_by if l.AuditLog.edited_by else "System",
        "batch": f"Batch: {l.batch_number}" if l.batch_number else f"ID Ref: {l.AuditLog.record_id}",
        "action": f"Changed {l.AuditLog.field_name.replace('_', ' ').title()}" if l.AuditLog.field_name != "DELETE" else "Deleted Record",
        "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]

@router.post("/update")
def update_rmp_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_edit")
    comp_code = request.session.get("company_code")
    edited_by = request.session.get("email")
    row = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == payload.get("id"), RawMaterialPurchasing.company_id == comp_code).first()

    if not row: raise HTTPException(status_code=404, detail="Record not found")

    update_fields = ["batch_number", "supplier_name", "variety_name", "species", "count", "g1_qty", "g2_qty", "dc_qty", "rate_per_kg", "material_boxes", "hsn_code", "peeling_at", "production_for", "remarks"]

    for field in update_fields:
        if field in payload:
            old_val = str(getattr(row, field) or "")
            new_val = str(payload[field])
            if old_val != new_val:
                db.add(AuditLog(table_name="rmp", record_id=row.id, company_id=comp_code, field_name=field, old_value=old_val, new_value=new_val, edited_by=edited_by, edited_at=ist_now()))
                setattr(row, field, payload[field])

    g1, g2, dc, rate = float(row.g1_qty or 0), float(row.g2_qty or 0), float(row.dc_qty or 0), float(row.rate_per_kg or 0)
    row.received_qty = round(g1 + g2 + dc, 2)
    row.amount = round(row.received_qty * rate, 2)
    db.commit()
    refresh_floor_balance(db, comp_code)
    return {"status": "updated", "received_qty": row.received_qty, "amount": row.amount}

@router.post("/delete")
def delete_rmp_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_delete")
    comp_code = request.session.get("company_code")
    row = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == payload.get("id"), RawMaterialPurchasing.company_id == comp_code).first()
    if row:
        db.add(AuditLog(table_name="rmp", record_id=row.id, company_id=comp_code, field_name="DELETE", old_value="Record", new_value="DELETED", edited_by=request.session.get("email"), edited_at=ist_now()))
        db.delete(row); db.commit()
        refresh_floor_balance(db, comp_code)
        return {"status": "deleted"}
    return {"status": "error"}

# -----------------------------------------------------------
# EXPORT EXCEL (WITH EXTENDED INTERHITED SCREEN FILTERS)
# -----------------------------------------------------------
@router.get("/export_excel")
def export_rmp_excel(
    request: Request, 
    fy: str = Query(None), 
    ids: str = Query(None), 
    supplier: str = Query(None),
    variety: str = Query(None),
    batch: str = Query(None),
    peeling: str = Query(None),
    hsn: str = Query(None),
    production_for: str = Query(None),
    db: Session = Depends(get_db)
):
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_export")
    comp_code = request.session.get("company_code")
    
    # 🟢 FIX: Avoid parameter collision with explicit global_ prefixes
    global_production_for, global_location = get_global_filters(request)
    
    query = db.query(RawMaterialPurchasing).join(
        GateEntry, RawMaterialPurchasing.batch_number == GateEntry.batch_number
    ).filter(
        RawMaterialPurchasing.company_id == comp_code,
        RawMaterialPurchasing.is_cancelled != True,
        GateEntry.company_id == comp_code,
        GateEntry.is_cancelled != True
    )
    
    if global_production_for:
        query = query.filter(RawMaterialPurchasing.production_for == global_production_for)

    if global_location:
        query = query.filter(RawMaterialPurchasing.peeling_at == global_location)
        
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        query = query.filter(RawMaterialPurchasing.id.in_(id_list))
    else:
        if fy:
            s_fy = int(fy)
            query = query.filter(GateEntry.date >= date(s_fy, 4, 1), GateEntry.date <= date(s_fy + 1, 3, 31))
        if batch: query = query.filter(RawMaterialPurchasing.batch_number == batch)
        if supplier: query = query.filter(RawMaterialPurchasing.supplier_name == supplier)
        if variety: query = query.filter(RawMaterialPurchasing.variety_name == variety)
        if peeling: query = query.filter(RawMaterialPurchasing.peeling_at == peeling)
        if hsn: query = query.filter(RawMaterialPurchasing.hsn_code == hsn)
        if production_for: query = query.filter(RawMaterialPurchasing.production_for == production_for)
    
    rows = query.order_by(RawMaterialPurchasing.date.asc()).all()
    wb = Workbook()
    ws = wb.active
    ws.append(["Sl.No", "Date", "Batch", "Supplier", "Variety", "Species", "Count", "G1", "G2", "DC", "Total Rec", "Rate", "Amount", "Boxes", "HSN", "Peeling", "Prod For", "Remarks"])
    for cell in ws[1]: cell.font = Font(bold=True)
    for idx, r in enumerate(rows, 1):
        ws.append([idx, str(r.date), r.batch_number, r.supplier_name, r.variety_name, r.species, r.count, r.g1_qty, r.g2_qty, r.dc_qty, r.received_qty, r.rate_per_kg, r.amount, r.material_boxes, r.hsn_code, r.peeling_at, r.production_for, r.remarks])
    
    out = BytesIO(); wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=RMP_Report.xlsx"})


# -----------------------------------------------------------
# 🟢 FIXED: SCREEN-REPLICATED EXACT FILTER ENGAGED PRINT TABLE
# -----------------------------------------------------------
@router.get("/print_table", response_class=HTMLResponse)
def print_table_view(
    request: Request, 
    ids: str = Query(None),
    fy: str = Query(None),
    batch: str = Query(None),
    supplier: str = Query(None),
    variety: str = Query(None),
    peeling: str = Query(None),
    hsn: str = Query(None),
    production_for: str = Query(None),
    db: Session = Depends(get_db)
):
    from app.utils.report_permissions import enforce_report_permission, check_report_permission
    if not (check_report_permission(request, "report_print") or check_report_permission(request, "report_export")):
        enforce_report_permission(request, "report_print")
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=303)

    # 🟢 FIX: In-memory evaluation tracking via global contextual scopes
    global_production_for, global_location = get_global_filters(request)

    q = db.query(RawMaterialPurchasing).join(
        GateEntry, RawMaterialPurchasing.batch_number == GateEntry.batch_number
    ).filter(
        RawMaterialPurchasing.company_id == comp_code,
        RawMaterialPurchasing.is_cancelled != True,
        GateEntry.company_id == comp_code,
        GateEntry.is_cancelled != True
    )
    
    if global_production_for:
        q = q.filter(RawMaterialPurchasing.production_for == global_production_for)

    if global_location:
        q = q.filter(RawMaterialPurchasing.peeling_at == global_location)
    
    # 1. Direct Hard-Check Visible Explicit IDs
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))
    
    # 2. Extract Matching active Screen filters parameters 
    else:
        if fy:
            try:
                start_year = int(fy)
                q = q.filter(
                    GateEntry.date >= date(start_year, 4, 1),
                    GateEntry.date <= date(start_year + 1, 3, 31)
                )
            except: pass
        
        if batch:
            q = q.filter(RawMaterialPurchasing.batch_number == batch)
        if supplier:
            q = q.filter(RawMaterialPurchasing.supplier_name == supplier)
        if variety:
            q = q.filter(RawMaterialPurchasing.variety_name == variety)
        if peeling:
            q = q.filter(RawMaterialPurchasing.peeling_at == peeling)
        if hsn:
            q = q.filter(RawMaterialPurchasing.hsn_code == hsn)
        if production_for:
            q = q.filter(RawMaterialPurchasing.production_for == production_for)

    rows = q.order_by(RawMaterialPurchasing.date.asc()).all()
    comp = get_company_info(db, comp_code)
    
    return templates.TemplateResponse(
        request=request, 
        name="reports/raw_material_purchasing_print_table.html", 
        context={
            "rows": rows, 
            "company_name": comp["name"], 
            "company_address": comp["address"], 
            "printed_on": ist_now()
        }
    )

@router.get("/print_summary", response_class=HTMLResponse)
def print_summary_view(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    from app.utils.report_permissions import enforce_report_permission, check_report_permission
    if not (check_report_permission(request, "report_print") or check_report_permission(request, "report_export")):
        enforce_report_permission(request, "report_print")
    comp_code = request.session.get("company_code")
    
    # 🟢 FIX: In-memory evaluation tracking via global contextual scopes
    global_production_for, global_location = get_global_filters(request)
    
    q = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == comp_code,
        RawMaterialPurchasing.is_cancelled != True
    )
    
    if global_production_for:
        q = q.filter(RawMaterialPurchasing.production_for == global_production_for)

    if global_location:
        q = q.filter(RawMaterialPurchasing.peeling_at == global_location)
        
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))
        
    rows = q.all(); grouped = {}
    for r in rows: grouped.setdefault((r.supplier_name, r.batch_number), []).append(r)
    final_batches = []
    for (s_name, b_no), b_rows in grouped.items():
        g = db.query(GateEntry).filter(GateEntry.company_id == comp_code, GateEntry.batch_number == b_no).first()
        supplier = get_supplier_info(db, comp_code, s_name)
        final_batches.append({"batch_number": b_no, "vehicle_number": g.vehicle_number if g else "N/A", "challan_number": g.challan_number if g else "N/A", "location": g.purchasing_location if g else "N/A", "date": g.date if g else b_rows[0].date, "rows": b_rows, "supplier": supplier, "total_quantity": round(sum(x.received_qty or 0 for x in b_rows), 2), "total_amount": round(sum(x.amount or 0 for x in b_rows), 2)})
    comp = get_company_info(db, comp_code)
    return templates.TemplateResponse(request=request, name="reports/raw_material_purchasing_print_summary.html", context={"batches": final_batches, "company_name": comp["name"], "company_address": comp["address"], "printed_on": ist_now()})

@router.get("/export_pdf")
async def export_rmp_pdf(
    request: Request, 
    ids: str = Query(None), 
    fy: str = Query(None),
    batch: str = Query(None),
    supplier: str = Query(None),
    variety: str = Query(None),
    peeling: str = Query(None),
    hsn: str = Query(None),
    production_for: str = Query(None),
    type: str = Query("table"), 
    db: Session = Depends(get_db)
):
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_export")
    if type == "summary":
        resp = print_summary_view(request, ids, db)
    else:
        resp = print_table_view(request, ids, fy, batch, supplier, variety, peeling, hsn, production_for, db)
        
    pdf = render_pdf_from_html(resp.body.decode())
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=RMP_{type}.pdf"})
