# ============================================================
# DE-HEADING REPORT ROUTER – FINAL (LOCKED)
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
from app.database.models.processing import DeHeading
from app.database.models.criteria import HOSO_HLSO_Yields

router = APIRouter(
    prefix="/de_heading",
    tags=["DE-HEADING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================
# MAIN REPORT
# ============================================================
@router.get("", response_class=HTMLResponse)
def de_heading_report(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/", status_code=302)

    # ---------------- TARGET YIELD LOOKUP ----------------
    target_yield_map = {
        str(r.hoso_count): round(float(r.hlso_yield_pct), 2)
        for r in db.query(HOSO_HLSO_Yields)
        .filter(HOSO_HLSO_Yields.company_id == company_id)
        .all()
    }

    # ---------------- DE-HEADING DATA ----------------
    rows = (
        db.query(DeHeading)
        .filter(DeHeading.company_id == company_id)
        .order_by(DeHeading.date.desc(), DeHeading.time.desc())
        .all()
    )

    # ---------------- INJECT TARGET YIELD ----------------
    for r in rows:
        r.target_yield = target_yield_map.get(str(r.hoso_count), 0)

    batches = sorted({r.batch_number for r in rows if r.batch_number})
    contractors = sorted({r.contractor for r in rows if r.contractor})
    counts = sorted({r.hoso_count for r in rows if r.hoso_count})

    return templates.TemplateResponse(
        "reports/de_heading_report.html",
        {
            "request": request,
            "rows": rows,
            "batches": batches,
            "contractors": contractors,
            "counts": counts
        }
    )

# ============================================================
# PRINT REPORT
# ============================================================
@router.get("/print", response_class=HTMLResponse)
def de_heading_print(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")

    rows = (
        db.query(DeHeading)
        .filter(DeHeading.company_id == company_id)
        .order_by(DeHeading.date.asc(), DeHeading.time.asc())
        .all()
    )

    return templates.TemplateResponse(
        "reports/de_heading_print.html",
        {
            "request": request,
            "rows": rows,
            "printed_on": datetime.now()
        }
    )

# ============================================================
# EXPORT PDF
# ============================================================
@router.get("/export_pdf")
def de_heading_export_pdf(
    request: Request,
    db: Session = Depends(get_db)
):
    html = de_heading_print(request, db).body.decode()
    pdf = HTML(string=html).write_pdf()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
            "attachment; filename=DE_HEADING_REPORT.pdf"
        }
    )

# ============================================================
# EXPORT EXCEL
# ============================================================
@router.get("/export_excel")
def de_heading_export_excel(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")

    rows = (
        db.query(DeHeading)
        .filter(DeHeading.company_id == company_id)
        .order_by(DeHeading.date.asc(), DeHeading.time.asc())
        .all()
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "DE_HEADING_REPORT"

    ws.append([
        "Date",
        "Batch",
        "Contractor",
        "HOSO Count",
        "HOSO Qty",
        "HLSO Qty",
        "Yield %",
        "Target Yield %",
        "Rate (₹)",
        "Amount (₹)"
    ])

    for r in rows:
        ws.append([
            r.date,
            r.batch_number,
            r.contractor,
            r.hoso_count,
            r.hoso_qty,
            r.hlso_qty,
            r.yield_percent,
            getattr(r, "target_yield", 0),
            r.rate_per_kg,
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
            "attachment; filename=DE_HEADING_REPORT.xlsx"
        }
    )

# ============================================================
# CONTRACTOR MONTHLY BILL
# ============================================================
@router.get("/contractor_monthly_bill", response_class=HTMLResponse)
def de_heading_monthly_bill(
    request: Request,
    month: str = Query(...),        # MM
    contractor: str = Query(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")

    rows = (
        db.query(DeHeading)
        .filter(DeHeading.company_id == company_id)
        .filter(DeHeading.contractor == contractor)
        .filter(func.to_char(DeHeading.date, "MM") == month)
        .order_by(DeHeading.date.asc(), DeHeading.time.asc())
        .all()
    )

    total_hoso = sum(r.hoso_qty or 0 for r in rows)
    total_hlso = sum(r.hlso_qty or 0 for r in rows)
    total_amount = sum(r.amount or 0 for r in rows)

    avg_yield = round(
        (total_hlso / total_hoso * 100) if total_hoso else 0,
        2
    )

    return templates.TemplateResponse(
        "reports/de_heading_monthly_bill.html",
        {
            "request": request,
            "rows": rows,
            "total_hoso": round(total_hoso, 2),
            "total_hlso": round(total_hlso, 2),
            "grand_total": round(total_amount, 2),
            "avg_yield": avg_yield,
            "contractor_name": contractor,
            "month_year": month,
            "bill_date": datetime.now()
        }
    )
