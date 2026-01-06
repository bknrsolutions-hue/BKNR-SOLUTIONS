from fastapi import APIRouter, Request, Depends, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
from io import BytesIO
from weasyprint import HTML
from openpyxl import Workbook

from app.database import get_db
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.users import Company
from app.database.models.criteria import (
    production_for,
    production_at,
    freezers,
    packing_styles,
    glazes,
    varieties,
    grades,
    production_types,
    purposes,
    brands,
    species as species_model  # ✅ Added Species Model
)

router = APIRouter(tags=["STOCK REPORT"])


# ------------------------------------------------------------
# COMPANY INFO
# ------------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    if not c:
        return "", ""
    return c.company_name or "", c.address or ""


# ------------------------------------------------------------
# STOCK REPORT PAGE (WITH DATE FILTER + LOOKUPS)
# ------------------------------------------------------------
@router.get("/stock_report", response_class=HTMLResponse)
def stock_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if not email or not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)

    if from_date:
        q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date:
        q = q.filter(stock_entry.date <= date.fromisoformat(to_date))

    rows = q.order_by(
        stock_entry.date.desc(),
        stock_entry.time.desc()
    ).all()

    # ---------------- FILTER VALUES (FROM DATA) ----------------
    f_batches = sorted({r.batch_number for r in rows if r.batch_number})
    f_production_fors = sorted({r.production_for for r in rows if r.production_for})
    f_production_ats = sorted({r.production_at for r in rows if r.production_at})
    f_brands = sorted({r.brand for r in rows if r.brand})
    f_freezers = sorted({r.freezer for r in rows if r.freezer})
    f_species = sorted({r.species for r in rows if r.species}) # ✅ Added Species Filter
    f_varieties = sorted({r.variety for r in rows if r.variety})
    f_grades = sorted({r.grade for r in rows if r.grade})
    f_glazes = sorted({r.glaze for r in rows if r.glaze})

    # ---------------- LOOKUPS (FOR INLINE EDIT) ----------------
    # ✅ Fetching Species from Species Model
    species_list = [
        x.species_name for x in 
        db.query(species_model)
        .filter(species_model.company_id == comp_code)
    ]

    brands_list = [
        x.brand_name for x in
        db.query(brands)
        .filter(brands.company_id == comp_code)
    ]

    production_for_list = sorted({
        x.production_for for x in
        db.query(production_for)
        .filter(production_for.company_id == comp_code)
        if x.production_for
    })

    production_at_list = [
        x.production_at for x in
        db.query(production_at)
        .filter(production_at.company_id == comp_code)
    ]

    freezers_list = [
        x.freezer_name for x in
        db.query(freezers)
        .filter(freezers.company_id == comp_code)
    ]

    packing_styles_list = [
        x.packing_style for x in
        db.query(packing_styles)
        .filter(packing_styles.company_id == comp_code)
    ]

    glazes_list = [
        x.glaze_name for x in
        db.query(glazes)
        .filter(glazes.company_id == comp_code)
    ]

    varieties_list = [
        x.variety_name for x in
        db.query(varieties)
        .filter(varieties.company_id == comp_code)
    ]

    grades_list = [
        x.grade_name for x in
        db.query(grades)
        .filter(grades.company_id == comp_code)
    ]

    production_types_list = [
        x.production_type for x in
        db.query(production_types)
        .filter(production_types.company_id == comp_code)
    ]

    purposes_list = [
        x.purpose_name for x in
        db.query(purposes)
        .filter(purposes.company_id == comp_code)
    ]

    po_numbers_list = [
        r.po_number for r in
        db.query(pending_orders.po_number)
        .filter(pending_orders.company_id == comp_code)
        .distinct()
        .order_by(pending_orders.po_number)
        .all()
    ]

    # ---------------- PACKING MAP ----------------
    pack_rows = db.query(packing_styles).filter(
        packing_styles.company_id == comp_code
    ).all()

    PACKING_MAP = {
        p.packing_style: {
            "mc_weight": float(p.mc_weight or 0),
            "slab_weight": float(p.slab_weight or 0)
        }
        for p in pack_rows
    }

    company_name, company_address = get_company_info(db, comp_code)

    return request.app.state.templates.TemplateResponse(
        "inventory_management/stock_report.html",
        {
            "request": request,
            "rows": rows,

            "from_date": from_date,
            "to_date": to_date,

            "f_batches": f_batches,
            "f_production_fors": f_production_fors,
            "f_production_ats": f_production_ats,
            "f_brands": f_brands,
            "f_freezers": f_freezers,
            "f_species": f_species, # ✅ Added
            "f_varieties": f_varieties,
            "f_grades": f_grades,
            "f_glazes": f_glazes,

            "species_list": species_list, # ✅ Added
            "production_for_list": production_for_list,
            "production_at_list": production_at_list,
            "brands_list": brands_list,
            "freezers_list": freezers_list,
            "packing_styles_list": packing_styles_list,
            "glazes_list": glazes_list,
            "varieties_list": varieties_list,
            "grades_list": grades_list,
            "production_types_list": production_types_list,
            "purposes_list": purposes_list,
            "po_numbers_list": po_numbers_list,

            "PACKING_MAP": PACKING_MAP,

            "company_name": company_name,
            "company_address": company_address,
            "is_admin": role == "admin"
        }
    )


# ------------------------------------------------------------
# INLINE UPDATE
# ------------------------------------------------------------
@router.post("/stock_report/update")
def update_stock(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if role != "admin":
        raise HTTPException(status_code=403)

    row = db.query(stock_entry).filter(
        stock_entry.id == payload["id"],
        stock_entry.company_id == comp_code
    ).first()

    if not row:
        raise HTTPException(status_code=404)

    row.batch_number = payload.get("batch_number")
    row.location = payload.get("location")
    row.production_for = payload.get("production_for")
    row.production_at = payload.get("production_at")
    row.type_of_production = payload.get("type_of_production")
    row.purpose = payload.get("purpose")
    row.po_number = payload.get("po_number")
    row.brand = payload.get("brand")
    row.freezer = payload.get("freezer")
    row.glaze = payload.get("glaze")
    row.species = payload.get("species") # ✅ Added Species Update
    row.packing_style = payload.get("packing_style")
    row.variety = payload.get("variety")
    row.grade = payload.get("grade")

    row.no_of_mc = int(payload.get("no_of_mc", 0))
    row.loose = int(payload.get("loose", 0))

    pack = db.query(packing_styles).filter(
        packing_styles.company_id == comp_code,
        packing_styles.packing_style == row.packing_style
    ).first()

    if pack:
        row.quantity = (
            (row.no_of_mc * pack.mc_weight) +
            (row.loose * pack.slab_weight)
        )
    else:
        row.quantity = 0

    db.commit()
    return {"status": "updated"}


# ------------------------------------------------------------
# DELETE
# ------------------------------------------------------------
@router.post("/stock_report/delete")
def delete_stock(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if role != "admin":
        raise HTTPException(status_code=403)

    db.query(stock_entry).filter(
        stock_entry.id == payload["id"],
        stock_entry.company_id == comp_code
    ).delete()

    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------
# EXPORT PDF
# ------------------------------------------------------------
@router.get("/stock_report/export_pdf")
def export_pdf(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401)

    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)

    if from_date:
        q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date:
        q = q.filter(stock_entry.date <= date.fromisoformat(to_date))

    rows = q.order_by(stock_entry.date, stock_entry.time).all()

    total_mc = total_loose = 0
    total_qty = 0.0

    for r in rows:
        sign = -1 if r.cargo_movement_type == "OUT" else 1
        total_mc += sign * float(r.no_of_mc or 0)
        total_loose += sign * float(r.loose or 0)
        total_qty += sign * float(r.quantity or 0)

    company_name, company_address = get_company_info(db, comp_code)

    html = request.app.state.templates.get_template(
        "inventory_management/stock_report_print.html"
    ).render({
        "rows": rows,
        "company_name": company_name,
        "company_address": company_address,
        "printed_on": datetime.now(),
        "total_mc": total_mc,
        "total_loose": total_loose,
        "total_qty": round(total_qty, 2)
    })

    pdf = HTML(string=html).write_pdf()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=STOCK_REPORT.pdf"}
    )


# ------------------------------------------------------------
# EXPORT EXCEL
# ------------------------------------------------------------
@router.get("/stock_report/export_xlsx")
def export_xlsx(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401)

    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)

    if from_date:
        q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date:
        q = q.filter(stock_entry.date <= date.fromisoformat(to_date))

    rows = q.order_by(stock_entry.date, stock_entry.time).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Stock Report"

    # ✅ Excel Headers Updated with Species
    headers = [
        "ID","Date","Time","Type","Batch","Location",
        "Prod For","Prod At","Prod Type","Purpose","PO No","Brand",
        "Freezer","Glaze","Species","Packing","Variety","Grade", # ✅ Added Species
        "MC","Loose","Qty","Email"
    ]
    ws.append(headers)

    total_mc = total_loose = 0
    total_qty = 0.0

    for r in rows:
        sign = -1 if r.cargo_movement_type == "OUT" else 1
        mc = sign * float(r.no_of_mc or 0)
        loose = sign * float(r.loose or 0)
        qty = sign * float(r.quantity or 0)

        total_mc += mc
        total_loose += loose
        total_qty += qty

        ws.append([
            r.id,
            r.date,
            r.time.strftime("%H:%M:%S") if r.time else "",
            r.cargo_movement_type,
            r.batch_number,
            r.location,
            r.production_for,
            r.production_at,
            r.type_of_production,
            r.purpose,
            r.po_number,
            r.brand,
            r.freezer,
            r.glaze,
            r.species, # ✅ Added
            r.packing_style,
            r.variety,
            r.grade,
            mc,
            loose,
            round(qty, 2),
            r.email
        ])

    ws.append(["","","","","","","","","","","","","","","","","","TOTAL", # ✅ Adjusted for extra column
               total_mc, total_loose, round(total_qty,2), ""])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=STOCK_REPORT.xlsx"}
    )