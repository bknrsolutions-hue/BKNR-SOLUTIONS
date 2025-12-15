# ============================================================
# GRADING SUMMARY REPORT – FULL (WITH ACTIONS)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import Grading, RawMaterialPurchasing

router = APIRouter(
    prefix="/grading_report",
    tags=["GRADING SUMMARY REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ------------------------------------------------------------
# MAIN PAGE
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
def grading_report(
    request: Request,
    batch: str | None = Query(None),
    species: str | None = Query(None),
    hoso_count: str | None = Query(None),
    variety: str | None = Query(None),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/", status_code=303)

    # ---------------- RMP SUBQUERY (HOSO ONLY) ----------------
    rmp_sub = (
        db.query(
            RawMaterialPurchasing.batch_number.label("batch"),
            RawMaterialPurchasing.species.label("species"),
            RawMaterialPurchasing.count.label("hoso_count"),
            func.sum(RawMaterialPurchasing.received_qty).label("total_hoso_qty")
        )
        .filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.variety_name == "HOSO"
        )
        .group_by(
            RawMaterialPurchasing.batch_number,
            RawMaterialPurchasing.species,
            RawMaterialPurchasing.count
        )
        .subquery()
    )

    # ---------------- GRADING SUBQUERY ----------------
    grading_sub = (
        db.query(
            Grading.batch_number.label("batch"),
            Grading.species.label("species"),
            Grading.hoso_count.label("hoso_count"),
            Grading.variety_name.label("variety"),
            func.sum(Grading.quantity).label("total_graded_qty")
        )
        .filter(Grading.company_id == company_id)
        .group_by(
            Grading.batch_number,
            Grading.species,
            Grading.hoso_count,
            Grading.variety_name
        )
        .subquery()
    )

    # ---------------- FINAL QUERY ----------------
    q = (
        db.query(
            grading_sub.c.batch,
            grading_sub.c.species,
            grading_sub.c.hoso_count,
            grading_sub.c.variety,
            func.coalesce(rmp_sub.c.total_hoso_qty, 0).label("total_hoso_qty"),
            grading_sub.c.total_graded_qty
        )
        .outerjoin(
            rmp_sub,
            (grading_sub.c.batch == rmp_sub.c.batch) &
            (grading_sub.c.species == rmp_sub.c.species) &
            (grading_sub.c.hoso_count == rmp_sub.c.hoso_count)
        )
    )

    if batch:
        q = q.filter(grading_sub.c.batch == batch)
    if species:
        q = q.filter(grading_sub.c.species == species)
    if hoso_count:
        q = q.filter(grading_sub.c.hoso_count == hoso_count)
    if variety:
        q = q.filter(grading_sub.c.variety == variety)

    rows_raw = q.order_by(grading_sub.c.batch).all()

    rows = []
    for i, r in enumerate(rows_raw, start=1):
        hoso = r.total_hoso_qty or 0
        graded = r.total_graded_qty or 0
        yield_pct = round((graded / hoso) * 100, 2) if hoso > 0 else 0

        rows.append({
            "id": i,
            "batch": r.batch,
            "species": r.species,
            "hoso_count": r.hoso_count,
            "variety": r.variety,
            "hoso_qty": hoso,
            "graded_qty": graded,
            "yield_pct": yield_pct
        })

    return templates.TemplateResponse(
        "reports/grading_report.html",
        {
            "request": request,
            "rows": rows
        }
    )

# ------------------------------------------------------------
# EXPORT EXCEL
# ------------------------------------------------------------
@router.get("/export_excel")
def export_excel(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")

    rows = grading_report(request, None, None, None, None, db).context["rows"]

    wb = Workbook()
    ws = wb.active
    ws.title = "GRADING_SUMMARY"

    ws.append([
        "Batch", "Species", "HOSO Count", "Variety",
        "Total HOSO Qty", "Total Graded Qty", "Yield %"
    ])

    for r in rows:
        ws.append([
            r["batch"], r["species"], r["hoso_count"], r["variety"],
            r["hoso_qty"], r["graded_qty"], r["yield_pct"]
        ])

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=GRADING_SUMMARY.xlsx"}
    )

# ------------------------------------------------------------
# EXPORT PDF
# ------------------------------------------------------------
@router.get("/export_pdf")
def export_pdf(request: Request, db: Session = Depends(get_db)):
    html = grading_report(request, None, None, None, None, db).body.decode()
    pdf = HTML(string=html).write_pdf()
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=GRADING_SUMMARY.pdf"}
    )
