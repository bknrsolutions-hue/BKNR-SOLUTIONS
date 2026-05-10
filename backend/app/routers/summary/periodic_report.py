from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, Date as SQLAlchemyDate
from app.database import get_db
# Models Imports (Nee reference lo unnave ikkada vadutunnam)
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Peeling, Soaking, Grading, Production
)
from app.database.models.reprocess import Reprocess 
from app.database.models.inventory_management import stock_entry

router = APIRouter(prefix="/summary", tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/periodic-report", response_class=HTMLResponse)
async def get_periodic_summary_report(
    request: Request,
    view_type: str = Query("day"),
    production_for: str = Query(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=303)

    # 1. Company Filter
    companies_query = db.query(distinct(GateEntry.production_for)).filter(
        GateEntry.company_id == company_code
    ).all()
    companies = [c[0] for c in companies_query if c[0]]

    # 2. Date Grouping Logic
    date_fmt = 'YYYY-MM' if view_type == 'month' else 'YYYY-MM-DD'
    
    # Base Periods list from Gate Entry
    base_periods = db.query(func.to_char(GateEntry.date, date_fmt).label("period")).filter(
        GateEntry.company_id == company_code
    )
    if production_for:
        base_periods = base_periods.filter(func.trim(GateEntry.production_for) == func.trim(production_for))
    
    periods = [p[0] for p in base_periods.distinct().order_by(func.to_char(GateEntry.date, date_fmt).desc()).all()]

    periodic_data = []
    for period in periods:
        # Filtering Helper
        def get_f(model):
            # Check for 'date' column or fallback (handling your specific models)
            date_col = getattr(model, 'date', None)
            f = [func.to_char(date_col, date_fmt) == period, model.company_id == company_code]
            if production_for and hasattr(model, 'production_for'):
                f.append(func.trim(model.production_for) == func.trim(production_for))
            return f

        # Aggregated Data for each process step
        rmp_data = db.query(func.sum(RawMaterialPurchasing.received_qty), func.sum(RawMaterialPurchasing.amount)).filter(*get_f(RawMaterialPurchasing)).first()
        deh_qty = db.query(func.sum(DeHeading.hlso_qty)).filter(*get_f(DeHeading)).scalar() or 0
        peel_qty = db.query(func.sum(Peeling.peeled_qty)).filter(*get_f(Peeling)).scalar() or 0
        grad_qty = db.query(func.sum(Grading.quantity)).filter(*get_f(Grading)).scalar() or 0
        soak_qty = db.query(func.sum(Soaking.in_qty)).filter(*get_f(Soaking)).scalar() or 0
        prod_qty = db.query(func.sum(Production.production_qty)).filter(*get_f(Production)).scalar() or 0
        
        # Reprocess Flow (Flow B in your reference)
        rep_qty = db.query(func.sum(Reprocess.in_qty)).filter(*get_f(Reprocess)).scalar() or 0

        # Stock Movements (Cargo type filtering)
        stock_in = db.query(func.sum(stock_entry.quantity)).filter(
            func.to_char(stock_entry.date, date_fmt) == period, 
            stock_entry.company_id == company_code,
            stock_entry.cargo_movement_type == 'IN'
        ).scalar() or 0
        
        stock_out = db.query(func.sum(stock_entry.quantity)).filter(
            func.to_char(stock_entry.date, date_fmt) == period, 
            stock_entry.company_id == company_code,
            stock_entry.cargo_movement_type == 'OUT'
        ).scalar() or 0

        # Calculations
        rmp_qty = float(rmp_data[0] or 0)
        rmp_amt = float(rmp_data[1] or 0)
        
        # Floor Balance calculation (RMP + Reprocess - Production)
        # Nuvvu floor balance service direct ga vadali ante loop lo batch wise vellali. 
        # Periodic summary lo idi approximate balance matrame istundi.
        floor_bal = (rmp_qty + float(rep_qty)) - float(prod_qty)

        periodic_data.append({
            "period": period,
            "rmp_qty": rmp_qty,
            "rmp_amt": rmp_amt,
            "rep_qty": float(rep_qty),
            "deh_qty": float(deh_qty),
            "peel_qty": float(peel_qty),
            "grad_qty": float(grad_qty),
            "soak_qty": float(soak_qty),
            "prod_qty": float(prod_qty),
            "stock_in": float(stock_in),
            "stock_out": float(stock_out),
            "floor_bal": round(floor_bal, 2)
        })

    return templates.TemplateResponse(
        request=request, 
        name="summary/periodic_summary.html", 
        context={
            "companies": companies, 
            "selected_company": production_for, 
            "view_type": view_type, 
            "periodic_data": periodic_data
        }
    )