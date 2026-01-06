from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.database.models.criteria import production_for as ProductionFor

router = APIRouter(
    prefix="/production_for",
    tags=["PRODUCTION FOR MASTER"]
)

templates = Jinja2Templates(directory="app/templates")

# ==================================================
# PAGE LOAD
# ==================================================
@router.get("")
def production_for_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(ProductionFor)
        .filter(ProductionFor.company_id == company_code)
        .order_by(
            ProductionFor.production_for,
            ProductionFor.apply_from.desc(),
            ProductionFor.freezer_name,
            ProductionFor.glaze_percent
        )
        .all()
    )

    return templates.TemplateResponse(
        "criteria/production_for.html",
        {
            "request": request,
            "today_data": rows
        }
    )

@router.post("")
async def save_production_for(
    request: Request,

    production_for: str = Form(...),
    apply_from: date = Form(...),
    free_days: int = Form(0),

    freezer_name: str = Form(None),
    repacking_cost_per_kg: float = Form(0),
    rate_per_mc_day: float = Form(0),

    ice_rate_per_kg: float = Form(0),
    grading_rate_per_kg: float = Form(0),
    peeling_rate_per_kg: float = Form(0),
    deheading_rate_per_kg: float = Form(0),

    status: str = Form("Active"),

    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # 🔥 IMPORTANT FIX
    form = await request.form()

    now = datetime.now()

    GLAZES = [
        ("NWNC","NWNC"),
        ("20","20%"),
        ("25","25%"),
        ("30","30%"),
        ("35","35%"),
        ("40","40%"),
        ("45","45%"),
        ("50","50%"),
        ("55","55%"),
        ("60","60%"),
    ]

    rows_created = 0

    for key, label in GLAZES:
        prod_cost = form.get(f"prod_cost_{key}")

        if not prod_cost or float(prod_cost) == 0:
            continue

        row = ProductionFor(
            company_id=company_code,
            production_for=production_for,
            apply_from=apply_from,
            free_days=free_days,

            freezer_name=freezer_name,
            glaze_percent=label,

            production_cost_per_kg=float(prod_cost),
            repacking_cost_per_kg=repacking_cost_per_kg,
            rate_per_mc_day=rate_per_mc_day,

            ice_rate_per_kg=ice_rate_per_kg,
            grading_rate_per_kg=grading_rate_per_kg,
            peeling_rate_per_kg=peeling_rate_per_kg,
            deheading_rate_per_kg=deheading_rate_per_kg,

            status=status,
            date=now.strftime("%Y-%m-%d"),
            time=now.strftime("%H:%M:%S"),
            email=email
        )

        db.add(row)
        rows_created += 1

    db.commit()

    return JSONResponse({
        "success": True,
        "rows_created": rows_created
    })


# ==================================================
# DELETE
# ==================================================
@router.post("/delete/{id}")
def delete_production_for(
    id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    db.query(ProductionFor).filter(
        ProductionFor.id == id,
        ProductionFor.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
