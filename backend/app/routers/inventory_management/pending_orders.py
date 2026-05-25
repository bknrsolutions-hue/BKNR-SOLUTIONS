from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict
from datetime import datetime
from typing import Optional, List

from app.database import get_db
from app.database.models.inventory_management import pending_orders
from app.database.models.users import Company 

router = APIRouter(prefix="/inventory", tags=["Inventory Management"])
templates = Jinja2Templates(directory="templates")

@router.get("/pending_orders", response_class=HTMLResponse)
async def pending_orders_page(request: Request, edit: Optional[str] = None, db: Session = Depends(get_db)):
    session_company_code = request.session.get("company_code")
    email = request.session.get("email")
    
    if not session_company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    company_obj = db.query(Company).filter(Company.company_code == session_company_code).first()
    
    current_user_company = company_obj.company_name if company_obj else "BKNR EXPORTS"
    actual_company_code = company_obj.company_code if company_obj else session_company_code
    rows = db.query(pending_orders).filter(pending_orders.company_id == actual_company_code).order_by(pending_orders.sl_no.desc()).all()
    
    po_groups = defaultdict(list)
    for r in rows:
        po_groups[r.po_number].append(r)

    edit_rows = []
    if edit:
        edit_rows = db.query(pending_orders).filter(pending_orders.po_number == edit, pending_orders.company_id == actual_company_code).all()

    max_sl = db.query(func.max(pending_orders.sl_no)).filter(pending_orders.company_id == actual_company_code).scalar()
    next_sl = (max_sl or 0) + 1

    return templates.TemplateResponse(
        "inventory_management/pending_orders.html",
        {
            "request": request,
            "po_groups": dict(po_groups),
            "edit_rows": edit_rows,
            "next_sl": next_sl,
            "current_user_company": current_user_company, # 🌟 HTML లోకి వెళ్లే వాల్యూ
            "message": request.session.pop("message", None)
        }
    )

@router.post("/pending_orders")
async def save_pending_orders(
    request: Request,
    sl_no: int = Form(...),
    po_number: str = Form(...),
    buyer: str = Form(...),
    brand: List[str] = Form(...),
    packing_style: List[str] = Form(...),
    no_of_mc: List[int] = Form(...),
    selling_price: List[float] = Form(...),
    db: Session = Depends(get_db)
):
    session_company_code = request.session.get("company_code")
    company_obj = db.query(Company).filter(Company.company_code == session_company_code).first()
    
    # 🌟 సేవ్ చేసేటప్పుడు సెషన్ నుండే కంపెనీ నేమ్ ఫోర్స్ చేస్తున్నాం
    final_company_name = company_obj.company_name if company_obj else "BKNR EXPORTS"
    actual_company_code = company_obj.company_code if company_obj else session_company_code

    # పాతది డిలీట్ చేసి కొత్తది యాడ్ చేయడం (Edit/Update logic)
    db.query(pending_orders).filter(pending_orders.po_number == po_number, pending_orders.company_id == actual_company_code).delete()

    for i in range(len(brand)):
        db.add(pending_orders(
            sl_no=sl_no,
            company_name=final_company_name,  # 🌟 పక్కాగా సెషన్ కంపెనీ నేమ్
            company_id=actual_company_code,
            po_number=po_number,
            buyer=buyer,
            brand=brand[i],
            packing_style=packing_style[i],
            no_of_mc=no_of_mc[i],
            selling_price=selling_price[i],
            date=datetime.now().date(),
            time=datetime.now().time()
        ))
    db.commit()
    request.session["message"] = "Saved Successfully!"
    return RedirectResponse("/inventory/pending_orders", status_code=303)