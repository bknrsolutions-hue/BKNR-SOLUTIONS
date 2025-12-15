# ============================================================
# PEELING REPORT ROUTER
# (SAME STRUCTURE AS DE-HEADING REPORT)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import Peeling

router = APIRouter(
    prefix="/peeling_report",
    tags=["PEELING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ------------------------------------------------------------
# MAIN REPORT PAGE
# uses : peeling_report.html
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
def peeling_report(
    request: Request,
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")

    if not comp_code or not email:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(Peeling)
        .filter(Peeling.company_id == comp_code)
        .order_by(Peeling.date.desc())
        .all()
    )

    batches = sorted({r.batch_number for r in rows if r.batch_number})
    contractors = sorted({r.contractor_name for r in rows if r.contractor_name})
    counts = sorted({r.hlso_count for r in rows if r.hlso_count})

    return templates.TemplateResponse(
        "reports/peeling_report.html",
        {
            "request": request,
            "rows": rows,
            "batches": batches,
            "contractors": contractors,
            "counts": counts
        }
    )

# ------------------------------------------------------------
# PRINT REPORT (TABLE)
# uses : peeling_print.html
# ------------------------------------------------------------
@router.get("/print", response_class=HTMLResponse)
def peeling_print(
    request: Request,
    ids: str = Query(None),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")

    q = db.query(Peeling).filter(Peeling.company_id == comp_code)

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        if id_list:
            q = q.filter(Peeling.id.in_(id_list))

    rows = q.order_by(Peeling.date.asc()).all()

    return templates.TemplateResponse(
        "reports/peeling_print.html",
        {
            "request": request,
            "rows": rows,
            "printed_on": datetime.now()
        }
    )

# ------------------------------------------------------------
# EXPORT PDF (FROM PRINT HTML)
# ------------------------------------------------------------
@router.get("/export_pdf")
def peeling_export_pdf(
    request: Request,
    ids: str = Query(None),
    db: Session = Depends(get_db)
):
    html = peeling_print(request, ids, db).body.decode()
    pdf = HTML(string=html).write_pdf()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
            "attachment; filename=PEELING_REPORT.pdf"
        }
    )

# ------------------------------------------------------------
# EXPORT EXCEL
# ------------------------------------------------------------
@router.get("/export_excel")
def peeling_export_excel(
    request: Request,
    ids: str = Query(None),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")

    q = db.query(Peeling).filter(Peeling.company_id == comp_code)

    if ids and ids.lower() != "all":
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        if id_list:
            q = q.filter(Peeling.id.in_(id_list))

    rows = q.order_by(Peeling.date.asc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "PEELING_REPORT"

    ws.append([
        "Date",
        "Batch",
        "Contractor",
        "HLSO Count",
        "HLSO Qty",
        "Peeled Qty",
        "Yield %",
        "Rate",
        "Amount"
    ])

    for r in rows:
        ws.append([
            r.date,
            r.batch_number,
            r.contractor_name,
            r.hlso_count,
            r.hlso_qty,
            r.peeled_qty,
            r.yield_percent,
            r.rate,
            r.amount
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition":
            "attachment; filename=PEELING_REPORT.xlsx"
        }
    )

# ------------------------------------------------------------
# CONTRACTOR MONTHLY BILL
# uses : peeling_monthly_bill.html
# ------------------------------------------------------------
@router.get("/contractor_monthly_bill", response_class=HTMLResponse)
def peeling_monthly_bill(
    request: Request,
    month: str = Query(...),          # 01–12
    contractor: str = Query(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")

    rows = (
        db.query(Peeling)
        .filter(Peeling.company_id == comp_code)
        .filter(Peeling.contractor_name == contractor)
        .filter(func.to_char(Peeling.date, "MM") == month)
        .order_by(Peeling.date.asc())
        .all()
    )

    total_hlso = sum(r.hlso_qty or 0 for r in rows)
    total_peeled = sum(r.peeled_qty or 0 for r in rows)
    grand_total = sum(r.amount or 0 for r in rows)
    avg_yield = (total_peeled / total_hlso * 100) if total_hlso else 0

    return templates.TemplateResponse(
        "reports/peeling_monthly_bill.html",
        {
            "request": request,
            "rows": rows,

            # totals (HTML expects these)
            "total_hlso": total_hlso,
            "total_peeled": total_peeled,
            "grand_total": grand_total,
            "avg_yield": avg_yield,

            # header info
            "contractor_name": contractor,
            "month_year": month,
            "bill_date": datetime.now()
        }
    )
