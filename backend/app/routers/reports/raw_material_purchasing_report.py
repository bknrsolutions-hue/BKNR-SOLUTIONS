# ============================================================
# RAW MATERIAL PURCHASING REPORT ROUTER (FINAL – FULL WORKING)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, GateEntry
from app.database.models.criteria import suppliers as SupplierTable
from app.database.models.users import User

router = APIRouter(
    prefix="/raw_material_purchasing",
    tags=["RAW MATERIAL PURCHASE REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------------
# COMPANY + USER INFO
# -----------------------------------------------------------
def get_company_info(db: Session, user_email: str):

    user = (
        db.query(User)
        .filter(User.email == user_email)
        .filter(User.is_verified == True)
        .first()
    )

    if not user or not user.company or not user.company.is_active:
        return {
            "name": "",
            "address": "",
            "email": "",
            "prepared_by": ""
        }

    return {
        "name": user.company.company_name,
        "address": user.company.address,
        "email": user.company.email,
        "prepared_by": user.name
    }

# -----------------------------------------------------------
# SUPPLIER LOOKUP
# -----------------------------------------------------------
def get_supplier_info(db: Session, comp_code: str, supplier_name: str):

    s = (
        db.query(SupplierTable)
        .filter(SupplierTable.company_id == comp_code)
        .filter(SupplierTable.supplier_name == supplier_name)
        .first()
    )

    if not s:
        return {
            "id": supplier_name,
            "name": supplier_name,
            "email": "",
            "phone": "",
            "address": ""
        }

    return {
        "id": s.id,
        "name": s.supplier_name,
        "email": s.supplier_email,
        "phone": s.phone,
        "address": s.address
    }

# -----------------------------------------------------------
# MAIN REPORT PAGE (WITH FILTERS – SAME PAGE)
# -----------------------------------------------------------
@router.get("", response_class=HTMLResponse)
def report_page(
    request: Request,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    batch: str | None = Query(None),
    supplier: str | None = Query(None),
    variety: str | None = Query(None),
    species: str | None = Query(None),
    count: str | None = Query(None),
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")

    if not comp_code or not user_email:
        return RedirectResponse("/", status_code=302)

    # ---------------- BASE QUERY (COMPANY SAFE) ----------------
    q = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == comp_code
    )

    # ---------------- SERVER SIDE FILTERS ----------------
    if from_date:
        q = q.filter(RawMaterialPurchasing.date >= from_date)

    if to_date:
        q = q.filter(RawMaterialPurchasing.date <= to_date)

    if batch:
        q = q.filter(RawMaterialPurchasing.batch_number == batch)

    if supplier:
        q = q.filter(RawMaterialPurchasing.supplier_name == supplier)

    if variety:
        q = q.filter(RawMaterialPurchasing.variety_name == variety)

    if species:
        q = q.filter(RawMaterialPurchasing.species == species)

    if count:
        q = q.filter(RawMaterialPurchasing.count == count)

    rows = q.order_by(RawMaterialPurchasing.id.desc()).all()

    # ---------------- FILTER DROPDOWN VALUES ----------------
    batches = [
        x[0] for x in
        db.query(RawMaterialPurchasing.batch_number)
        .filter(RawMaterialPurchasing.company_id == comp_code)
        .distinct()
        .order_by(RawMaterialPurchasing.batch_number)
        if x[0]
    ]

    suppliers = [
        x[0] for x in
        db.query(RawMaterialPurchasing.supplier_name)
        .filter(RawMaterialPurchasing.company_id == comp_code)
        .distinct()
        .order_by(RawMaterialPurchasing.supplier_name)
        if x[0]
    ]

    varieties = [
        x[0] for x in
        db.query(RawMaterialPurchasing.variety_name)
        .filter(RawMaterialPurchasing.company_id == comp_code)
        .distinct()
        .order_by(RawMaterialPurchasing.variety_name)
        if x[0]
    ]

    species_list = [
        x[0] for x in
        db.query(RawMaterialPurchasing.species)
        .filter(RawMaterialPurchasing.company_id == comp_code)
        .distinct()
        .order_by(RawMaterialPurchasing.species)
        if x[0]
    ]

    counts = [
        x[0] for x in
        db.query(RawMaterialPurchasing.count)
        .filter(RawMaterialPurchasing.company_id == comp_code)
        .distinct()
        .order_by(RawMaterialPurchasing.count)
        if x[0]
    ]

    comp = get_company_info(db, user_email)

    return templates.TemplateResponse(
        "reports/raw_material_purchasing_report.html",
        {
            "request": request,
            "rows": rows,

            # filters state
            "from_date": from_date,
            "to_date": to_date,
            "batches": batches,
            "suppliers": suppliers,
            "varieties": varieties,
            "species": species_list,
            "counts": counts,

            # company
            "company_name": comp["name"],
            "company_address": comp["address"]
        }
    )

# -----------------------------------------------------------
# PRINT SUMMARY (HTML)
# -----------------------------------------------------------
@router.get("/print_summary", response_class=HTMLResponse)
def print_summary(
    request: Request,
    ids: str = Query(None),
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")

    if not comp_code or not user_email:
        return RedirectResponse("/", status_code=302)

    q = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == comp_code
    )

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        if id_list:
            q = q.filter(RawMaterialPurchasing.id.in_(id_list))

    rows = (
        q.order_by(
            RawMaterialPurchasing.supplier_name.asc(),
            RawMaterialPurchasing.batch_number.asc()
        )
        .all()
    )

    grouped = {}
    for r in rows:
        grouped.setdefault((r.supplier_name, r.batch_number), []).append(r)

    final_batches = []

    for (supplier_name, batch_no), batch_rows in grouped.items():

        g = (
            db.query(GateEntry)
            .filter(GateEntry.company_id == comp_code)
            .filter(GateEntry.batch_number == batch_no)
            .first()
        )

        supplier = get_supplier_info(db, comp_code, supplier_name)

        total_boxes = (
            (g.no_of_material_boxes or 0) +
            (g.no_of_empty_boxes or 0) +
            (g.no_of_ice_boxes or 0)
        ) if g else 0

        final_batches.append({
            "batch_number": batch_no,
            "vehicle_number": g.vehicle_number if g else "",
            "challan_number": g.challan_number if g else "",
            "location": g.purchasing_location if g else "",
            "date": g.date if g else "",
            "total_boxes": total_boxes,
            "rows": batch_rows,
            "supplier": supplier,
            "total_quantity": sum(x.received_qty or 0 for x in batch_rows),
            "total_amount": sum(x.amount or 0 for x in batch_rows)
        })

    comp = get_company_info(db, user_email)

    return templates.TemplateResponse(
        "reports/raw_material_purchasing_print_summary.html",
        {
            "request": request,
            "batches": final_batches,
            "company_name": comp["name"],
            "company_address": comp["address"],
            "company_email": comp["email"],
            "prepared_by": comp["prepared_by"],
            "printed_on": datetime.now()
        }
    )

# -----------------------------------------------------------
# EXPORT PDF SUMMARY
# -----------------------------------------------------------
@router.get("/export_pdf_summary")
def export_pdf_summary(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    html = print_summary(request, ids, db).body.decode()
    pdf = HTML(string=html).write_pdf()
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=RAW_PURCHASE_SUMMARY.pdf"}
    )

# -----------------------------------------------------------
# PRINT TABLE
# -----------------------------------------------------------
@router.get("/print_table", response_class=HTMLResponse)
def print_table(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):

    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")

    q = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == comp_code
    )

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        if id_list:
            q = q.filter(RawMaterialPurchasing.id.in_(id_list))

    rows = q.order_by(RawMaterialPurchasing.id.asc()).all()

    totals = {
        "g1": sum(r.g1_qty or 0 for r in rows),
        "g2": sum(r.g2_qty or 0 for r in rows),
        "dc": sum(r.dc_qty or 0 for r in rows),
        "received": sum(r.received_qty or 0 for r in rows),
        "amount": sum(r.amount or 0 for r in rows),
    }

    comp = get_company_info(db, user_email)

    return templates.TemplateResponse(
        "reports/raw_material_purchasing_print_table.html",
        {
            "request": request,
            "rows": rows,
            "totals": totals,
            "company_name": comp["name"],
            "company_address": comp["address"],
            "printed_on": datetime.now()
        }
    )

# -----------------------------------------------------------
# EXPORT PDF TABLE
# -----------------------------------------------------------
@router.get("/export_pdf")
def export_pdf(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    html = print_table(request, ids, db).body.decode()
    pdf = HTML(string=html).write_pdf()
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=RAW_PURCHASE_TABLE.pdf"}
    )

# -----------------------------------------------------------
# EXPORT EXCEL
# -----------------------------------------------------------
@router.get("/export_excel")
def export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):

    comp_code = request.session.get("company_code")

    q = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == comp_code
    )

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        if id_list:
            q = q.filter(RawMaterialPurchasing.id.in_(id_list))

    rows = q.all()

    wb = Workbook()
    ws = wb.active
    ws.title = "RAW_MATERIAL_PURCHASE"

    ws.append([
        "Batch", "Date", "Supplier", "Species", "Variety", "Count",
        "G1 Qty", "G2 Qty", "DC Qty", "Received Qty", "Rate", "Amount"
    ])

    for r in rows:
        ws.append([
            r.batch_number, r.date, r.supplier_name,
            r.species, r.variety_name, r.count,
            r.g1_qty, r.g2_qty, r.dc_qty,
            r.received_qty, r.rate_per_kg, r.amount
        ])

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=RAW_PURCHASE.xlsx"}
    )
