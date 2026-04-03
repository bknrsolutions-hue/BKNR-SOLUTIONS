# app/routers/bills/other_expenses.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date
import logging

from app.database import get_db
from app.database.models.bills import OtherExpense
from app.database.models.criteria import production_at

router = APIRouter(
    prefix="/expenses",
    tags=["Other Expenses"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ==================================================
# 🧾 1. EXPENSE ENTRY PAGE
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def expenses_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # Units / Production Locations filter by company
    locations = (
        db.query(production_at)
        .filter(production_at.company_id == company_code)
        .order_by(production_at.production_at)
        .all()
    )

    # Recent expenses history with Join to ensure company data safety
    expense_history = (
        db.query(OtherExpense)
        .join(production_at, OtherExpense.unit_id == production_at.id)
        .filter(production_at.company_id == company_code)
        .order_by(OtherExpense.id.desc())
        .limit(50)
        .all()
    )

    # ✅ FIX: TemplateResponse arguments updated
    return templates.TemplateResponse(
        request=request,
        name="bills/expenses_entry.html",
        context={
            "locations": locations,
            "expense_history": expense_history,
            "email": email,
            "company_id": company_code
        }
    )

# ==================================================
# 💾 2. SAVE EXPENSE
# ==================================================
@router.post("/save")
def save_expense(
    request: Request,
    production_at_id: int = Form(...),
    expense_date: date = Form(...),
    category: str = Form(...),
    paid_to: str = Form(...),
    remarks: str = Form(""),
    voucher_no: str = Form(""),
    amount: float = Form(...),
    gst_per: float = Form(0),
    grand_total: float = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    if not email:
        return JSONResponse({"status": "error", "message": "Session expired"}, status_code=401)

    # 📝 Combine extra info into remarks for better tracking
    full_remarks = (
        f"Date: {expense_date} | "
        f"Paid To: {paid_to} | "
        f"Voucher: {voucher_no} | "
        f"GST: {gst_per}% | "
        f"Notes: {remarks}"
    )

    new_entry = OtherExpense(
        unit_id=production_at_id,
        category=category.upper().strip(),
        amount=grand_total,   # Storing inclusive amount as per your requirement
        remarks=full_remarks
    )

    try:
        db.add(new_entry)
        db.commit()
        # Redirecting to entry page after success
        return RedirectResponse(url="/expenses/entry", status_code=303)
    except Exception as e:
        db.rollback()
        logger.error(f"EXPENSE SAVE ERROR: {str(e)}")
        return JSONResponse({"status": "error", "message": "Database Error"}, status_code=500)

# ==================================================
# 🗑️ 3. DELETE EXPENSE (Optional API)
# ==================================================
@router.post("/delete/{expense_id}")
def delete_expense(expense_id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    
    # Secure delete: only if the expense belongs to the user's company
    entry = db.query(OtherExpense).join(
        production_at, OtherExpense.unit_id == production_at.id
    ).filter(
        OtherExpense.id == expense_id,
        production_at.company_id == company_code
    ).first()

    if entry:
        db.delete(entry)
        db.commit()
        return {"status": "success"}
    
    return JSONResponse({"error": "Unauthorized or Not Found"}, status_code=404)