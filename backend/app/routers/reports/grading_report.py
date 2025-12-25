# ============================================================
# GRADING SUMMARY REPORT – FINAL CORRECT ROUTER (LOCKED)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query, HTTPException
from fastapi.responses import (
    HTMLResponse,
    RedirectResponse,
    JSONResponse,
    StreamingResponse
)
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from collections import defaultdict
from io import BytesIO

from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import Grading, DeHeading
from app.database.models.criteria import HOSO_HLSO_Yields

router = APIRouter(
    prefix="/grading_report",
    tags=["GRADING SUMMARY REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================
# PERMISSION
# ============================================================
def allow_grading(request: Request):
    role = request.session.get("role", "admin")
    if role not in ("admin", "viewer"):
        raise HTTPException(status_code=403)

# ============================================================
# MAIN REPORT
# ============================================================
@router.get("", response_class=HTMLResponse)
def grading_report(
    request: Request,
    db: Session = Depends(get_db),
    _ = Depends(allow_grading)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # ---------------------------------------------------------
    # YIELD LOOKUP (HOSO → HLSO)
    # ---------------------------------------------------------
    yield_map = {
        (r.species, str(r.hoso_count)): float(r.hlso_yield_pct) / 100
        for r in db.query(HOSO_HLSO_Yields)
        .filter(HOSO_HLSO_Yields.company_id == company_id)
        .all()
    }

    # ---------------------------------------------------------
    # DE-HEADING HOSO QTY (ONLY FOR HLSO)
    # ---------------------------------------------------------
    deheading_hoso_map = defaultdict(float)

    for r in db.query(
        DeHeading.batch_number,
        DeHeading.species,
        DeHeading.hoso_count,
        DeHeading.hoso_qty
    ).filter(DeHeading.company_id == company_id).all():

        deheading_hoso_map[
            (r.batch_number, r.species, str(r.hoso_count))
        ] += float(r.hoso_qty or 0)

    # ---------------------------------------------------------
    # GRADING RAW DATA
    # ---------------------------------------------------------
    grading_rows = (
        db.query(
            Grading.batch_number,
            Grading.species,
            Grading.hoso_count,
            Grading.variety_name,
            Grading.graded_count,
            Grading.quantity
        )
        .filter(Grading.company_id == company_id)
        .all()
    )

    # ---------------------------------------------------------
    # GROUP : batch + species + hoso_count + variety
    # ---------------------------------------------------------
    grouped = defaultdict(list)

    for r in grading_rows:
        grouped[
            (r.batch_number, r.species, str(r.hoso_count), r.variety_name)
        ].append({
            "count": float(r.graded_count or 0),
            "qty": float(r.quantity or 0)
        })

    rows = []
    idx = 1
    summary_group = defaultdict(list)

    # ---------------------------------------------------------
    # CALCULATIONS (LOCKED LOGIC)
    # ---------------------------------------------------------
    for (batch, species, hoso_count, variety), items in grouped.items():

        graded_qty_sum = sum(i["qty"] for i in items)
        base = sum(i["count"] * i["qty"] for i in items)

        yield_factor = yield_map.get((species, hoso_count), 0)

        # ---------------- ACTUAL HOSO QTY ----------------
        if variety == "HOSO":
            actual_hoso_qty = graded_qty_sum
        elif variety == "HLSO":
            actual_hoso_qty = deheading_hoso_map.get(
                (batch, species, hoso_count), 0
            )
        else:
            actual_hoso_qty = 0

        # ---------------- WORKOUT COUNT ----------------
        if graded_qty_sum == 0:
            workout = 0
        elif variety == "HOSO":
            workout = base / graded_qty_sum
        elif variety == "HLSO":
            workout = (base / graded_qty_sum) * 2.2 * yield_factor
        else:
            workout = 0

        # ---------------- YIELD % ----------------
        if actual_hoso_qty > 0:
            yield_pct = (graded_qty_sum / actual_hoso_qty) * 100
        else:
            yield_pct = 0

        # ---------------- GRADING HOSO QTY ----------------
        if variety == "HOSO":
            grading_hoso_qty = graded_qty_sum
        elif variety == "HLSO" and yield_factor > 0:
            grading_hoso_qty = graded_qty_sum / yield_factor
        else:
            grading_hoso_qty = 0

        # ---------------- WEIGHT DIFFERENCE ----------------
        if variety == "HLSO" and actual_hoso_qty > 0:
            diff_kg = grading_hoso_qty - actual_hoso_qty
            diff_pct = (diff_kg / actual_hoso_qty) * 100
        else:
            diff_kg = 0
            diff_pct = 0

        summary_group[(batch, species)].append({
            "batch": batch,
            "species": species,
            "hoso_count": hoso_count,
            "variety": variety,
            "hoso_qty": round(actual_hoso_qty, 2),
            "graded_qty": round(graded_qty_sum, 2),
            "workout_count": round(workout, 2),
            "yield_pct": round(yield_pct, 2),
            "grading_hoso_qty": round(grading_hoso_qty, 2),
            "weight_diff_kg": round(diff_kg, 2),
            "weight_diff_pct": round(diff_pct, 2)
        })

    # ---------------------------------------------------------
    # FINAL ROWS + SUB TOTAL (Batch + Species)
    # ---------------------------------------------------------
    for (batch, species), items in summary_group.items():

        sh = sg = sw = sy = sgh = sdiff = 0

        for r in items:
            r["id"] = idx
            rows.append(r)
            idx += 1

            sh += r["hoso_qty"]
            sg += r["graded_qty"]
            sw += r["workout_count"]
            sy += r["yield_pct"]
            sgh += r["grading_hoso_qty"]
            sdiff += r["weight_diff_kg"]

        rows.append({
            "id": "",
            "batch": batch,
            "species": species,
            "hoso_count": "",
            "variety": "SUB TOTAL",
            "hoso_qty": round(sh, 2),
            "graded_qty": round(sg, 2),
            "workout_count": round(sw, 2),
            "yield_pct": round((sg / sh) * 100, 2) if sh > 0 else 0,
            "grading_hoso_qty": round(sgh, 2),
            "weight_diff_kg": round(sdiff, 2),
            "weight_diff_pct": 0,
            "is_subtotal": True
        })

    return templates.TemplateResponse(
        "reports/grading_report.html",
        {
            "request": request,
            "rows": rows
        }
    )

# ============================================================
# DETAILS API – EXPAND (UNCHANGED)
# ============================================================
@router.get("/details")
def grading_details(
    request: Request,
    source: str = Query(...),
    batch: str = Query(...),
    species: str = Query(...),
    hoso_count: str = Query(...),
    variety: str = Query(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id or variety == "SUB TOTAL":
        return []

    if source == "hoso" and variety == "HLSO":
        rows = db.query(DeHeading).filter(
            DeHeading.company_id == company_id,
            DeHeading.batch_number == batch,
            DeHeading.species == species,
            DeHeading.hoso_count == hoso_count
        ).order_by(DeHeading.date, DeHeading.time).all()

        return [{
            "Form": "DE-HEADING",
            "Date": str(r.date),
            "Time": str(r.time),
            "Batch Number": r.batch_number,
            "Species": r.species,
            "HOSO Count": r.hoso_count,
            "HOSO Qty": r.hoso_qty,
            "HLSO Qty": r.hlso_qty,
            "Rate Per Kg": r.rate_per_kg,
            "Amount": r.amount,
            "Email": r.email
        } for r in rows]

    rows = db.query(Grading).filter(
        Grading.company_id == company_id,
        Grading.batch_number == batch,
        Grading.species == species,
        Grading.hoso_count == hoso_count,
        Grading.variety_name == variety
    ).order_by(Grading.date, Grading.time).all()

    return [{
        "Form": "GRADING",
        "Date": str(r.date),
        "Time": str(r.time),
        "Batch Number": r.batch_number,
        "Species": r.species,
        "HOSO Count": r.hoso_count,
        "Variety Name": r.variety_name,
        "Graded Count": r.graded_count,
        "Quantity": r.quantity,
        "Email": r.email
    } for r in rows]
