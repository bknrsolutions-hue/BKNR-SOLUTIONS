# ============================================================
# 🔥 SOAKING REPORT ROUTER (FINAL – TYPE SAFE)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import Soaking
from app.database.models.users import User

router = APIRouter(
    prefix="/soaking",
    tags=["SOAKING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------------
# MAIN REPORT PAGE
# URL: /reports/soaking
# -----------------------------------------------------------
@router.get("", response_class=HTMLResponse)
def soaking_report_page(
    request: Request,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    batch: str | None = Query(None),
    count: str | None = Query(None),
    chemical: str | None = Query(None),
    db: Session = Depends(get_db)
):

    # 🔥 FIX: CAST TO STRING
    company_id = str(request.session.get("company_id"))
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/", status_code=303)

    q = db.query(Soaking).filter(Soaking.company_id == company_id)

    if from_date:
        q = q.filter(Soaking.date >= from_date)
    if to_date:
        q = q.filter(Soaking.date <= to_date)
    if batch:
        q = q.filter(Soaking.batch_number == batch)
    if count:
        q = q.filter(Soaking.in_count == count)
    if chemical:
        q = q.filter(Soaking.chemical_name == chemical)

    rows = q.order_by(Soaking.id.desc()).all()

    batches = [
        x[0] for x in
        db.query(Soaking.batch_number)
        .filter(Soaking.company_id == company_id)
        .distinct().order_by(Soaking.batch_number)
        if x[0]
    ]

    counts = [
        x[0] for x in
        db.query(Soaking.in_count)
        .filter(Soaking.company_id == company_id)
        .distinct().order_by(Soaking.in_count)
        if x[0]
    ]

    chemicals = [
        x[0] for x in
        db.query(Soaking.chemical_name)
        .filter(Soaking.company_id == company_id)
        .distinct().order_by(Soaking.chemical_name)
        if x[0]
    ]

    return templates.TemplateResponse(
        "reports/soaking_report.html",
        {
            "request": request,
            "rows": rows,
            "batches": batches,
            "counts": counts,
            "chemicals": chemicals,
            "from_date": from_date,
            "to_date": to_date,
        }
    )

# -----------------------------------------------------------
# PRINT TABLE
# -----------------------------------------------------------
@router.get("/print_table", response_class=HTMLResponse)
def print_table(
    request: Request,
    ids: str = Query(None),
    db: Session = Depends(get_db)
):

    company_id = request.session.get("company_id")
    email = request.session.get("email")

    q = db.query(Soaking).filter(Soaking.company_id == company_id)

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        q = q.filter(Soaking.id.in_(id_list))

    rows = q.order_by(Soaking.id.asc()).all()

    totals = {
        "qty": sum(r.in_qty or 0 for r in rows),
        "chem": sum((r.in_qty or 0) * (r.chemical_percent or 0) / 100 for r in rows),
        "salt": sum((r.in_qty or 0) * (r.salt_percent or 0) / 100 for r in rows),
    }

    comp = get_company_info(db, email)

    return templates.TemplateResponse(
        "reports/soaking_print_table.html",
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
# EXPORT PDF
# -----------------------------------------------------------
@router.get("/export_pdf")
def export_pdf(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    html = print_table(request, ids, db).body.decode()
    pdf = HTML(string=html).write_pdf()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=SOAKING_REPORT.pdf"}
    )

# -----------------------------------------------------------
# EXPORT EXCEL
# -----------------------------------------------------------
@router.get("/export_excel")
def export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    q = db.query(Soaking).filter(Soaking.company_id == company_id)

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        q = q.filter(Soaking.id.in_(id_list))

    rows = q.all()

    wb = Workbook()
    ws = wb.active
    ws.title = "SOAKING_REPORT"

    ws.append([
        "Date", "Batch", "Count", "Qty",
        "Chemical", "Chemical %",
        "Salt %", "Chemical Qty", "Salt Qty"
    ])

    for r in rows:
        ws.append([
            r.date,
            r.batch_number,
            r.in_count,
            r.in_qty,
            r.chemical_name,
            r.chemical_percent,
            r.salt_percent,
            (r.in_qty or 0) * (r.chemical_percent or 0) / 100,
            (r.in_qty or 0) * (r.salt_percent or 0) / 100
        ])

    out = BytesIO()
    wb.save(out)
    out.seek(0)

    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=SOAKING_REPORT.xlsx"}
    )
