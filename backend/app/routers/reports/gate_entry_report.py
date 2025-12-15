# ============================================================
# GATE ENTRY REPORT ROUTER (FULL + FIXED + FINAL)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query, Body
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import GateEntry
from app.database.models.users import Company

router = APIRouter(tags=["GATE ENTRY REPORT"])
templates = Jinja2Templates(directory="app/templates")


# ------------------------------------------------------------
# COMPANY INFO
# ------------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    if not c:
        return "", ""
    return c.company_name, c.address


# ------------------------------------------------------------
# REPORT PAGE (ALL DATA LOADING)
# ------------------------------------------------------------
@router.get("/gate_entry", response_class=HTMLResponse)
def gate_entry_report(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = Query(None),
    to_date: str = Query(None)
):

    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # ------------- FIXED → ALWAYS LOAD ALL DATA ----------------
    if not from_date:
        from_date = "2000-01-01"
    if not to_date:
        to_date = "2100-01-01"

    rows = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == comp_code)
        .filter(GateEntry.date >= from_date)
        .filter(GateEntry.date <= to_date)
        .order_by(GateEntry.id.desc())
        .all()
    )

    company_name, company_address = get_company_info(db, comp_code)

    # Dropdown filters
    batches = sorted({r.batch_number for r in rows if r.batch_number})
    challans = sorted({r.challan_number for r in rows if r.challan_number})
    suppliers = sorted({r.supplier_name for r in rows if r.supplier_name})
    gates = sorted({r.gate_pass_number for r in rows if r.gate_pass_number})
    dates = sorted({r.date for r in rows if r.date})

    return templates.TemplateResponse(
        "reports/gate_entry_report.html",
        {
            "request": request,
            "rows": rows,
            "batches": batches,
            "challans": challans,
            "suppliers": suppliers,
            "gates": gates,
            "dates": dates,
            "company_name": company_name,
            "company_address": company_address
        }
    )


# ------------------------------------------------------------
# DELETE MULTIPLE ENTRIES
# ------------------------------------------------------------
@router.post("/gate_entry/delete")
def delete_selected(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):

    comp_code = request.session.get("company_code")
    ids = payload.get("ids", [])

    for _id in ids:
        row = (
            db.query(GateEntry)
            .filter(GateEntry.company_id == comp_code)
            .filter(GateEntry.id == _id)
            .first()
        )
        if row:
            db.delete(row)

    db.commit()
    return {"deleted": len(ids)}


# ------------------------------------------------------------
# PRINT PAGE (AUTO PRINT)
# ------------------------------------------------------------
@router.get("/gate_entry/print", response_class=HTMLResponse)
def print_view(request: Request, ids: str = None, db: Session = Depends(get_db)):

    comp_code = request.session.get("company_code")

    q = db.query(GateEntry).filter(GateEntry.company_id == comp_code)

    if ids and ids.lower() != "all":
        id_list = [int(x) for x in ids.split(",") if x.isdigit()]
        q = q.filter(GateEntry.id.in_(id_list))

    rows = q.order_by(GateEntry.id.asc()).all()

    company_name, company_address = get_company_info(db, comp_code)

    return templates.TemplateResponse(
        "reports/gate_entry_report_print.html",
        {
            "request": request,
            "rows": rows,
            "printed_on": datetime.now(),
            "company_name": company_name,
            "company_address": company_address,
            "auto": 1
        }
    )


# ------------------------------------------------------------
# EXPORT PDF (PRINT TABLE STYLE)
# ------------------------------------------------------------
@router.get("/gate_entry/export_pdf")
def export_pdf(request: Request, ids: str = None, db: Session = Depends(get_db)):

    comp_code = request.session.get("company_code")

    q = db.query(GateEntry).filter(GateEntry.company_id == comp_code)

    if ids and ids.lower() != "all":
        id_list = [int(x) for x in ids.split(",") if x.isdigit()]
        q = q.filter(GateEntry.id.in_(id_list))

    rows = q.order_by(GateEntry.id.asc()).all()

    company_name, company_address = get_company_info(db, comp_code)

    html_src = templates.get_template(
        "reports/gate_entry_report_print.html"
    ).render({
        "rows": rows,
        "company_name": company_name,
        "company_address": company_address,
        "printed_on": datetime.now(),
        "auto": 0
    })

    pdf_bytes = HTML(string=html_src).write_pdf()

    fname = f"GATE_REPORT_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )


# ------------------------------------------------------------
# EXPORT EXCEL
# ------------------------------------------------------------
@router.get("/gate_entry/export_xlsx")
def export_excel(request: Request, ids: str = None, db: Session = Depends(get_db)):

    comp_code = request.session.get("company_code")

    q = db.query(GateEntry).filter(GateEntry.company_id == comp_code)

    if ids and ids.lower() != "all":
        id_list = [int(x) for x in ids.split(",") if x.isdigit()]
        q = q.filter(GateEntry.id.in_(id_list))

    rows = q.order_by(GateEntry.id.asc()).all()

    company_name, company_address = get_company_info(db, comp_code)

    wb = Workbook()
    ws = wb.active
    ws.title = "Gate Entry Report"

    # Header
    ws.append([company_name])
    ws.append([company_address])
    ws.append([""])

    ws.append([
        "ID", "DATE", "TIME", "BATCH", "CHALLAN", "GATE PASS",
        "SUPPLIER", "LOCATION", "VEHICLE",
        "MATERIAL BOXES", "EMPTY BOXES", "ICE BOXES",
        "EMAIL", "COMPANY"
    ])

    for r in rows:
        ws.append([
            r.id,
            str(r.date) if r.date else "",
            r.time.strftime("%H:%M:%S") if getattr(r, "time", None) else "",
            r.batch_number or "",
            r.challan_number or "",
            r.gate_pass_number or "",
            r.supplier_name or "",
            r.purchasing_location or "",
            r.vehicle_number or "",
            r.no_of_material_boxes or 0,
            r.no_of_empty_boxes or 0,
            r.no_of_ice_boxes or 0,
            r.email or "",
            r.company_id or ""
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)

    fname = f"GATE_REPORT_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )
