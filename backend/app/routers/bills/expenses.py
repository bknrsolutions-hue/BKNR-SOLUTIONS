from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.database.models.bills import OtherExpense
from app.database.models.criteria import production_at
from app.main import templates

# ==================================================
# 🧾 OTHER EXPENSES ROUTER
# Base URL: /api/expenses
# ==================================================
router = APIRouter(
    prefix="/expenses",
    tags=["Other Expenses"]
)

# ==================================================
# 🧾 EXPENSE ENTRY PAGE
# URL: /api/expenses/entry
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def expenses_entry_page(
    request: Request,
    db: Session = Depends(get_db)
):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    company_code = request.session.get("company_code")

    # Units / Production At
    locations = (
        db.query(production_at)
        .filter(production_at.company_id == company_code)
        .order_by(production_at.production_at)
        .all()
    )

    # Recent expenses
    expense_history = (
        db.query(OtherExpense)
        .order_by(OtherExpense.id.desc())
        .limit(50)
        .all()
    )

    return templates.TemplateResponse(
        "bills/expenses_entry.html",
        {
            "request": request,
            "locations": locations,
            "expense_history": expense_history
        }
    )

# ==================================================
# 💾 SAVE EXPENSE
# URL: /api/expenses/save
# ==================================================
@router.post("/save")
def save_expense(
    request: Request,
    db: Session = Depends(get_db),

    production_at_id: int = Form(...),
    expense_date: date = Form(...),
    category: str = Form(...),
    paid_to: str = Form(...),
    remarks: str = Form(""),
    voucher_no: str = Form(""),
    amount: float = Form(...),
    gst_per: float = Form(0),
    grand_total: float = Form(...)
):
    if not request.session.get("email"):
        return JSONResponse(
            {"status": "error", "message": "Session expired"},
            status_code=401
        )

    # 📝 Combine extra info into remarks (safe snapshot)
    full_remarks = (
        f"Paid To: {paid_to} | "
        f"Voucher: {voucher_no} | "
        f"GST: {gst_per}% | "
        f"Notes: {remarks}"
    )

    entry = OtherExpense(
        unit_id=production_at_id,
        category=category,
        amount=grand_total,   # storing inclusive amount
        remarks=full_remarks
    )

    db.add(entry)
    db.commit()

    return RedirectResponse(
        url="/api/expenses/entry",
        status_code=303
    )
