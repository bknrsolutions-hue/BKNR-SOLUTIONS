from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.database.models.inventory_management import sales_dispatch # Mee sales table name

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
    # Base Query
    query = db.query(sales_dispatch)

    # 1. Company Filter Logic (As per your saved info)
    if company != "all":
        # Ikada 'company' code ni batti filter chestunnam
        query = query.filter(sales_dispatch.company_id == company)

    # 2. Date Range Filter
    if from_date:
        query = query.filter(sales_dispatch.invoice_date >= from_date)
    if to_date:
        query = query.filter(sales_dispatch.invoice_date <= to_date)

    sales_data = query.order_by(sales_dispatch.invoice_date.desc()).all()

    # 3. Summary Calculations
    total_revenue = sum(float(s.total_usd or 0) for s in sales_data)
    total_mc = sum(int(s.total_mc or 0) for s in sales_data)
    avg_price = (total_revenue / total_mc) if total_mc > 0 else 0
    active_invoices = len([s for s in sales_data if s.status != 'Paid'])

    return templates.TemplateResponse("reports/sales_report.html", {
        "request": request,
        "sales_data": sales_data,
        "summary": {
            "total_revenue": f"{total_revenue:,.2f}",
            "total_mc": f"{total_mc:,}",
            "avg_price": f"{avg_price:,.2f}",
            "active_invoices": active_invoices
        },
        "filters": {
            "company": company,
            "from_date": from_date,
            "to_date": to_date
        }
    })