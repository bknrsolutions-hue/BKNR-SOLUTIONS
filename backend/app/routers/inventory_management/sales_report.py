# app/routers/reports/sales_report.py

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, date

from app.database import get_db
from app.database.models.inventory_management import sales_dispatch

router = APIRouter(prefix="/reports", tags=["REPORTS"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/sales", response_class=HTMLResponse)
def get_sales_report(
    request: Request,
    company: str = Query("all"),
    from_date: str = Query(None),
    to_date: str = Query(None),
    db: Session = Depends(get_db)
):
    # 1. SESSION & SECURITY CHECK
    # User logged in company code ni mathrame priority ga teesukovali
    session_comp_code = request.session.get("company_code")
    email = request.session.get("email")

    if not session_comp_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # 2. BASE QUERY WITH SECURITY FILTER
    # Multi-tenancy logic: Default ga user company data ne chupali
    target_comp = session_comp_code if company == "all" else company
    query = db.query(sales_dispatch).filter(sales_dispatch.company_id == target_comp)

    # 3. DATE RANGE FILTERS
    try:
        if from_date:
            query = query.filter(sales_dispatch.invoice_date >= from_date)
        if to_date:
            query = query.filter(sales_dispatch.invoice_date <= to_date)
    except Exception as e:
        # Date format issues unte error handle chestundi
        print(f"Filter Error: {e}")

    # 4. FETCH DATA
    sales_data = query.order_by(desc(sales_dispatch.invoice_date)).all()

    # 5. CORPORATE STYLE KPI CALCULATIONS
    # Python side calculations (Oka vela data thakuva unte idi fast ga untundi)
    t_revenue = sum(float(s.price or 0) * float(s.no_of_mc or 0) for s in sales_data)
    t_mc = sum(int(s.no_of_mc or 0) for s in sales_data)
    
    # Avoid DivisionByZero
    avg_price = (t_revenue / t_mc) if t_mc > 0 else 0
    
    # Filtering for active invoices based on your logic
    active_invoices = len([s for s in sales_data if getattr(s, 'status', None) != 'Paid'])

    # 6. RESPONSE WITH ENHANCED CONTEXT
    return templates.TemplateResponse(
        request=request,
        name="reports/sales_report.html",
        context={
            "sales_data": sales_data,
            "summary": {
                "total_revenue": f"{t_revenue:,.2f}",
                "total_mc": f"{t_mc:,}",
                "avg_price": f"{avg_price:,.2f}",
                "active_invoices": active_invoices
            },
            "filters": {
                "company": company,
                "from_date": from_date,
                "to_date": to_date
            },
            "email": email,
            "comp_code": session_comp_code
        }
    )