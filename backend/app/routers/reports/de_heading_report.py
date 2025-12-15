from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, extract
from datetime import datetime
from io import BytesIO
from weasyprint import HTML
from openpyxl import Workbook

from app.database import get_db
from app.database.models.processing import DeHeading
from app.database.models.criteria import contractors   # ✅ EXACT

router = APIRouter(tags=["DE-HEADING REPORT"])
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# MAIN REPORT PAGE (LIKE RMP) + MONTH FILTER
# =====================================================
@router.get("/de_heading", response_class=HTMLResponse)
def de_heading_report(
    request: Request,
    month: int | None = Query(None, ge=1, le=12),   # 🔥 MONTH FILTER (1–12)
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=303)

    q = db.query(DeHeading).filter(DeHeading.company_id == company_code)

    if month:
        q = q.filter(extract("month", DeHeading.date) == month)

    rows = q.order_by(DeHeading.date.desc(), DeHeading.id.desc()).all()

    batches = [
        r[0] for r in
        db.query(distinct(DeHeading.batch_number))
        .filter(DeHeading.company_id == company_code)
        .order_by(DeHeading.batch_number)
        .all() if r[0]
    ]

    contractor_list = [
        r[0] for r in
        db.query(distinct(DeHeading.contractor))
        .filter(DeHeading.company_id == company_code)
        .order_by(DeHeading.contractor)
        .all() if r[0]
    ]

    counts = [
        r[0] for r in
        db.query(distinct(DeHeading.hoso_count))
        .filter(DeHeading.company_id == company_code)
        .order_by(DeHeading.hoso_count)
        .all() if r[0]
    ]

    return templates.TemplateResponse(
        "reports/de_heading_report.html",
        {
            "request": request,
            "rows": rows,
            "batches": batches,
            "contractors": contractor_list,
            "counts": counts,
            "selected_month": month
        }
    )


# =====================================================
# PRINT – DE HEADING REPORT
# =====================================================
@router.get("/de_heading/print", response_class=HTMLResponse)
def de_heading_print(
    request: Request,
    ids: str = Query(""),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=303)

    id_list = [int(i) for i in ids.split(",") if i.isdigit()]

    q = db.query(DeHeading).filter(DeHeading.company_id == company_code)
    if id_list:
        q = q.filter(DeHeading.id.in_(id_list))

    rows = q.order_by(
        DeHeading.contractor,
        DeHeading.batch_number
    ).all()

    contractor_totals = (
        db.query(
            DeHeading.contractor.label("contractor"),
            func.coalesce(func.sum(DeHeading.hoso_qty), 0).label("hoso"),
            func.coalesce(func.sum(DeHeading.hlso_qty), 0).label("hlso"),
            func.coalesce(func.sum(DeHeading.amount), 0).label("amount"),
        )
        .filter(DeHeading.company_id == company_code)
        .filter(DeHeading.id.in_(id_list) if id_list else True)
        .group_by(DeHeading.contractor)
        .all()
    )

    batch_totals = (
        db.query(
            DeHeading.batch_number.label("batch_number"),
            func.coalesce(func.sum(DeHeading.hoso_qty), 0).label("hoso"),
            func.coalesce(func.sum(DeHeading.hlso_qty), 0).label("hlso"),
            func.coalesce(func.sum(DeHeading.amount), 0).label("amount"),
        )
        .filter(DeHeading.company_id == company_code)
        .filter(DeHeading.id.in_(id_list) if id_list else True)
        .group_by(DeHeading.batch_number)
        .all()
    )

    return templates.TemplateResponse(
        "reports/de_heading_print.html",
        {
            "request": request,
            "rows": rows,
            "contractor_totals": contractor_totals,
            "batch_totals": batch_totals,
            "printed_on": datetime.now()
        }
    )


@router.get("/de_heading/contractor_monthly_bill", response_class=HTMLResponse)
def contractor_monthly_bill(
    request: Request,
    month: str | None = Query(None),
    contractor: str | None = Query(None),
    ids: str | None = Query(None),
    db: Session = Depends(get_db)
):
    if not month or not contractor:
        return HTMLResponse("<h3>Please select Month and Contractor</h3>")

    company_code = request.session.get("company_code")
    company_name = request.session.get("company_name") or "BKNR SOLUTIONS"
    prepared_by = request.session.get("email") or ""

    if not company_code:
        return RedirectResponse("/", status_code=303)

    # ---------------- DE HEADING DATA ----------------
    q = (
        db.query(DeHeading)
        .filter(
            DeHeading.company_id == company_code,
            DeHeading.contractor == contractor,
            func.to_char(DeHeading.date, "MM") == month
        )
    )

    if ids:
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        if id_list:
            q = q.filter(DeHeading.id.in_(id_list))

    rows = q.order_by(DeHeading.date).all()

    if not rows:
        return HTMLResponse("<h3>No data found</h3>")

    # ---------------- CONTRACTOR MASTER LOOKUP ----------------
    c = (
        db.query(contractors)
        .filter(
            contractors.contractor_name == contractor,
            contractors.company_id == company_code
        )
        .first()
    )

    contractor_address = c.address if c else ""
    contractor_phone = c.phone if c else ""
    contractor_gst = c.gst_number if c else ""
    contractor_gst_percent = c.gst_percent if c else 0
    contractor_bank = c.bank_name if c else ""
    contractor_account_no = c.account_no if c else ""
    contractor_ifsc = c.ifsc if c else ""

    # ---------------- TOTALS ----------------
    total_hoso, total_hlso, total_amount = (
        db.query(
            func.coalesce(func.sum(DeHeading.hoso_qty), 0),
            func.coalesce(func.sum(DeHeading.hlso_qty), 0),
            func.coalesce(func.sum(DeHeading.amount), 0),
        )
        .filter(
            DeHeading.company_id == company_code,
            DeHeading.contractor == contractor,
            func.to_char(DeHeading.date, "MM") == month
        )
        .one()
    )

    avg_yield = (total_hlso / total_hoso * 100) if total_hoso else 0

    # ---------------- BILL DETAILS ----------------
    year = datetime.now().year
    bill_no = f"{company_name[:4].upper()}/DH/{year}/{month}"

    # 🔥 FIXED MONTH + YEAR
    month_year = datetime(year, int(month), 1).strftime("%B %Y")

    return templates.TemplateResponse(
        "reports/contractor_monthly_bill.html",
        {
            "request": request,

            # TABLE
            "rows": rows,

            # COMPANY
            "company_name": company_name,

            # CONTRACTOR
            "contractor_name": contractor,
            "contractor_address": contractor_address,
            "contractor_phone": contractor_phone,
            "contractor_gst": contractor_gst,
            "contractor_gst_percent": contractor_gst_percent,
            "contractor_bank": contractor_bank,
            "contractor_account_no": contractor_account_no,
            "contractor_ifsc": contractor_ifsc,

            # BILL
            "bill_no": bill_no,
            "bill_date": datetime.now().date(),
            "month_year": month_year,

            # TOTALS
            "total_hoso": total_hoso,
            "total_hlso": total_hlso,
            "avg_yield": avg_yield,
            "grand_total": total_amount,

            # META
            "prepared_by": prepared_by,
        }
    )

# =====================================================
# EXPORT PDF
# =====================================================
@router.get("/de_heading/export_pdf")
def export_pdf(
    request: Request,
    ids: str = Query(""),
    db: Session = Depends(get_db)
):

    response = de_heading_print(request, ids, db)
    html = response.body.decode("utf-8")
    pdf = HTML(string=html).write_pdf()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=DE_HEADING_REPORT.pdf"}
    )


# =====================================================
# EXPORT EXCEL
# =====================================================
@router.get("/de_heading/export_excel")
def export_excel(
    request: Request,
    ids: str = Query(""),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=303)

    id_list = [int(i) for i in ids.split(",") if i.isdigit()]

    q = db.query(DeHeading).filter(DeHeading.company_id == company_code)
    if id_list:
        q = q.filter(DeHeading.id.in_(id_list))

    rows = q.order_by(DeHeading.date).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "DE_HEADING"

    ws.append([
        "Date", "Batch", "Contractor",
        "HOSO Count", "HOSO Qty",
        "HLSO Qty", "Yield %",
        "Rate", "Amount"
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
            r.rate_per_kg,
            r.amount
        ])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=DE_HEADING.xlsx"}
    )

