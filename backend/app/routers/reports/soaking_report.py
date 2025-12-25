# ============================================================
# 🔥 SOAKING REPORT ROUTER – FINAL (BATCH + VARIETY GROUPING)
# URL: /reports/soaking
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from io import BytesIO
from openpyxl import Workbook

from app.database import get_db
from app.database.models.processing import Soaking

# ------------------------------------------------------------
# ROUTER INIT
# ------------------------------------------------------------
router = APIRouter(
    tags=["SOAKING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ------------------------------------------------------------
# MAIN SOAKING REPORT PAGE
# ------------------------------------------------------------
@router.get("/soaking", response_class=HTMLResponse)
def soaking_report(
    request: Request,
    db: Session = Depends(get_db)
):

    # ---------------- SESSION CHECK ----------------
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # ---------------- FETCH DATA ----------------
    rows = (
        db.query(Soaking)
        .filter(Soaking.company_id == company_code)
        .order_by(
            Soaking.batch_number.desc(),
            Soaking.date.desc(),
            Soaking.id.desc()
        )
        .all()
    )

    # ---------------- GROUPING (Batch → Variety) ----------------
    grouped = {}

    final_qty = 0.0
    final_chem = 0.0
    final_salt = 0.0

    for r in rows:
        qty = float(r.in_qty or 0)
        chem_qty = qty * float(r.chemical_percent or 0) / 100
        salt_qty = qty * float(r.salt_percent or 0) / 100

        # runtime calculated values (HTML uses these)
        r.chemical_qty = round(chem_qty, 2)
        r.salt_qty = round(salt_qty, 2)

        batch = (r.batch_number or "UNKNOWN").strip()
        variety = (r.variety_name or "UNKNOWN").strip()

        if batch not in grouped:
            grouped[batch] = {"counts": {}}

        if variety not in grouped[batch]["counts"]:
            grouped[batch]["counts"][variety] = []

        grouped[batch]["counts"][variety].append(r)

        final_qty += qty
        final_chem += chem_qty
        final_salt += salt_qty

    # ---------------- FILTER DROPDOWNS ----------------
    batches = [
        x[0] for x in
        db.query(Soaking.batch_number)
        .filter(Soaking.company_id == company_code)
        .distinct()
        .order_by(Soaking.batch_number.desc())
        .all()
        if x[0]
    ]

    varieties = [
        x[0] for x in
        db.query(Soaking.variety_name)
        .filter(Soaking.company_id == company_code)
        .distinct()
        .order_by(Soaking.variety_name)
        .all()
        if x[0]
    ]

    chemicals = [
        x[0] for x in
        db.query(Soaking.chemical_name)
        .filter(Soaking.company_id == company_code)
        .distinct()
        .order_by(Soaking.chemical_name)
        .all()
        if x[0]
    ]

    # ---------------- RENDER ----------------
    return templates.TemplateResponse(
        "reports/soaking_report.html",
        {
            "request": request,

            # table
            "grouped": grouped,

            # filters
            "batches": batches,
            "varieties": varieties,
            "chemicals": chemicals,

            # totals
            "final_qty": round(final_qty, 2),
            "final_chem": round(final_chem, 2),
            "final_salt": round(final_salt, 2),
        }
    )

# ------------------------------------------------------------
# EXPORT EXCEL
# ------------------------------------------------------------
@router.get("/soaking/export_excel")
def export_soaking_excel(
    request: Request,
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    rows = (
        db.query(Soaking)
        .filter(Soaking.company_id == company_code)
        .order_by(
            Soaking.batch_number.desc(),
            Soaking.date.desc(),
            Soaking.id.desc()
        )
        .all()
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "SOAKING REPORT"

    ws.append([
        "Date",
        "Batch",
        "Variety",
        "Quantity",
        "Chemical",
        "Chemical %",
        "Chemical Qty",
        "Salt %",
        "Salt Qty"
    ])

    for r in rows:
        qty = float(r.in_qty or 0)
        chem_qty = qty * float(r.chemical_percent or 0) / 100
        salt_qty = qty * float(r.salt_percent or 0) / 100

        ws.append([
            r.date,
            r.batch_number,
            r.variety_name,
            qty,
            r.chemical_name,
            r.chemical_percent,
            round(chem_qty, 2),
            r.salt_percent,
            round(salt_qty, 2)
        ])

    out = BytesIO()
    wb.save(out)
    out.seek(0)

    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=SOAKING_REPORT.xlsx"
        }
    )
