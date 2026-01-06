from fastapi import APIRouter, Request, Depends, Query, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime
from io import BytesIO
from weasyprint import HTML

from app.database import get_db
from app.database.models.inventory_management import stock_entry
from app.database.models.users import Company
from app.database.models.criteria import (
    production_for, production_at, freezers,
    packing_styles, glazes, varieties, grades
)

router = APIRouter(tags=["STOCK REPORT"])
templates = Jinja2Templates(directory="app/templates")


# ------------------------------------------------------------
# COMPANY INFO
# ------------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    if not c:
        return "", ""
    return c.company_name or "", c.address or ""


# ------------------------------------------------------------
# STOCK REPORT PAGE
# ------------------------------------------------------------
@router.get("/stock_report", response_class=HTMLResponse)
def stock_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")
    role = request.session.get("role")  # admin / user

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    if not from_date:
        from_date = date(2000, 1, 1)
    if not to_date:
        to_date = date(2100, 1, 1)

    rows = (
        db.query(stock_entry)
        .filter(stock_entry.company_id == comp_code)
        .filter(stock_entry.date >= from_date)
        .filter(stock_entry.date <= to_date)
        .order_by(stock_entry.id.desc())
        .all()
    )

    # 🔵 FILTER LOOKUPS (FROM REPORT DATA ONLY)
    f_production_fors = sorted({r.production_for for r in rows if r.production_for})
    f_production_ats  = sorted({r.production_at for r in rows if r.production_at})
    f_freezers        = sorted({r.freezer for r in rows if r.freezer})
    f_batches         = sorted({r.batch_number for r in rows if r.batch_number})
    f_varieties       = sorted({r.variety for r in rows if r.variety})
    f_grades          = sorted({r.grade for r in rows if r.grade})
    f_glazes          = sorted({r.glaze for r in rows if r.glaze})

    # 🟢 INLINE EDIT LOOKUPS (FROM MASTER TABLES)
    lk_production_fors = [
        x.production_for for x in
        db.query(production_for).filter(production_for.company_id == comp_code)
    ]
    lk_production_ats = [
        x.production_at for x in
        db.query(production_at).filter(production_at.company_id == comp_code)
    ]
    lk_freezers = [
        x.freezer_name for x in
        db.query(freezers).filter(freezers.company_id == comp_code)
    ]
    lk_packings = [
        x.packing_style for x in
        db.query(packing_styles).filter(packing_styles.company_id == comp_code)
    ]
    lk_glazes = [
        x.glaze_name for x in
        db.query(glazes).filter(glazes.company_id == comp_code)
    ]
    lk_varieties = [
        x.variety_name for x in
        db.query(varieties).filter(varieties.company_id == comp_code)
    ]
    lk_grades = [
        x.grade_name for x in
        db.query(grades).filter(grades.company_id == comp_code)
    ]

    company_name, company_address = get_company_info(db, comp_code)

    return templates.TemplateResponse(
        "inventory_management/stock_report.html",
        {
            "request": request,
            "rows": rows,
            "is_admin": role == "admin",

            # filters
            "f_production_fors": f_production_fors,
            "f_production_ats": f_production_ats,
            "f_freezers": f_freezers,
            "f_batches": f_batches,
            "f_varieties": f_varieties,
            "f_grades": f_grades,
            "f_glazes": f_glazes,

            # inline edit lookups
            "lk_production_fors": lk_production_fors,
            "lk_production_ats": lk_production_ats,
            "lk_freezers": lk_freezers,
            "lk_packings": lk_packings,
            "lk_glazes": lk_glazes,
            "lk_varieties": lk_varieties,
            "lk_grades": lk_grades,

            "company_name": company_name,
            "company_address": company_address,
        }
    )


# ------------------------------------------------------------
# INLINE UPDATE
# ------------------------------------------------------------
@router.post("/stock_report/update")
def update_stock_row(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if role != "admin":
        raise HTTPException(status_code=403)

    row = (
        db.query(stock_entry)
        .filter(
            stock_entry.id == payload["id"],
            stock_entry.company_id == comp_code
        ).first()
    )
    if not row:
        raise HTTPException(status_code=404)

    for k in [
        "production_for","production_at","freezer","packing_style",
        "glaze","variety","grade","purpose","po_number"
    ]:
        if k in payload:
            setattr(row, k, payload[k])

    db.commit()
    return {"status": "updated"}


# ------------------------------------------------------------
# DELETE
# ------------------------------------------------------------
@router.post("/stock_report/delete")
def delete_stock_row(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if role != "admin":
        raise HTTPException(status_code=403)

    row = (
        db.query(stock_entry)
        .filter(
            stock_entry.id == payload["id"],
            stock_entry.company_id == comp_code
        ).first()
    )
    if row:
        db.delete(row)
        db.commit()

    return {"deleted": True}
