# app/routers/inventory_management/pending_orders.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.inventory_management import pending_orders
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries, packing_styles,
    glazes, varieties, grades
)

router = APIRouter(prefix="/inventory", tags=["PENDING ORDERS"])


# =================================================================
#  PAGE LOAD
# =================================================================
@router.get("/pending_orders", response_class=HTMLResponse)
def pending_orders_page(request: Request, db: Session = Depends(get_db)):

    ctx = {
        "request": request,

        "buyers":       [x.buyer_name for x in db.query(buyers).all()],
        "agents":       [x.agent_name for x in db.query(buyer_agents).all()],
        "brands":       [x.brand_name for x in db.query(brands).all()],
        "countries":    [x.country_name for x in db.query(countries).all()],
        "packing":      db.query(packing_styles).all(),
        "glazes":       [x.glaze_name for x in db.query(glazes).all()],
        "varieties":    [x.variety_name for x in db.query(varieties).all()],
        "grades":       [x.grade_name for x in db.query(grades).all()],
        "table_data":   db.query(pending_orders).order_by(pending_orders.id.desc()).all()
    }

    return request.app.state.templates.TemplateResponse(
        "inventory_management/pending_orders.html", ctx)


# =================================================================
#   SAVE
# =================================================================
@router.post("/pending_orders")
def save_pending(
    db: Session = Depends(get_db),

    po_number: str = Form(...),
    buyer: str = Form(...),
    agent: str = Form(...),
    brand: str = Form(...),
    country: str = Form(...),
    packing_style: str = Form(...),
    count_glaze: str = Form(...),
    weight_glaze: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    no_of_mc: int = Form(...),
    shipment_date: str = Form(...),

    email: str = Form(""),
    company_id: str = Form("")
):

    now = datetime.now()

    row = pending_orders(
        po_number=po_number,
        buyer=buyer,
        agent_name=agent,
        brand=brand,
        country=country,
        packing_style=packing_style,
        count_glaze=count_glaze,
        weight_glaze=weight_glaze,
        variety=variety,
        grade=grade,
        no_of_mc=no_of_mc,
        shipment_date=shipment_date,
        date=str(now.date()),
        time=now.strftime("%H:%M:%S"),
        email=email,
        company_id=company_id
    )

    db.add(row); db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)
