# app/routers/criteria/vendors.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional

from app.database import get_db
from app.database.models.criteria import vendors

router = APIRouter(tags=["VENDORS"])
templates = Jinja2Templates(directory="app/templates")

# ---------------------------------------------------------
# PAGE LOAD (COMPANY WISE)
# ---------------------------------------------------------
@router.get("/vendors", response_class=HTMLResponse)
def vendors_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # 🔹 Company Wise Filter
    rows = (
        db.query(vendors)
        .filter(vendors.company_id == company_code)
        .order_by(desc(vendors.id))
        .all()
    )

    return templates.TemplateResponse(
        request=request,
        name="criteria/vendors.html",
        context={
            "vendors_list": rows,
            "company_id": company_code,
            "email": email
        }
    )

# ---------------------------------------------------------
# SAVE / UPDATE VENDOR (FIXED: PAYMENT CYCLE ADDED)
# ---------------------------------------------------------
@router.post("/vendors")
def save_vendor(
    request: Request,
    name: str = Form(...),
    email: str = Form(""),          # ఇది వెండర్ యొక్క ఈమెయిల్ ఐడి
    service_for: str = Form(""),
    payment_cycle: str = Form(""),  # 👈 ఇక్కడ FastAPI Form parameter యాడ్ చేసాను
    gst_number: str = Form(""),
    address: str = Form(""),
    bank_name: str = Form(""),
    account_no: str = Form(""),
    ifsc: str = Form(""),
    id: str = Form(""),
    date: str = Form(...),          
    time: str = Form(...),          
    db: Session = Depends(get_db)
):
    session_email = request.session.get("email") # 👈 సెషన్ నుండి లాగిన్ యూజర్ ఈమెయిల్ తీసుకుంటున్నాం
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # Safe ID conversion
    record_id = int(id) if id and id.isdigit() else None

    # Duplicate check within the same company
    duplicate = db.query(vendors).filter(
        vendors.name == name,
        vendors.company_id == company_code,
        vendors.id != (record_id if record_id else 0)
    ).first()

    if duplicate:
        return JSONResponse({"error": f"Vendor '{name}' already exists"}, status_code=400)

    # UPDATE MODE
    if record_id:
        row = db.query(vendors).filter(
            vendors.id == record_id, 
            vendors.company_id == company_code
        ).first()
        
        if not row: 
            return JSONResponse({"error": "Vendor not found"}, status_code=404)
        
        row.name = name
        row.email = email
        row.service_for = service_for
        row.payment_cycle = payment_cycle # 👈 అప్‌డేట్ రన్ అవుతున్నప్పుడు డేటా మ్యాప్ అవుతుంది
        row.gst_number = gst_number
        row.address = address
        row.bank_name = bank_name
        row.account_no = account_no
        row.ifsc = ifsc
        row.date = date
        row.time = time
        
        # ఒకవేళ ఎడిట్ చేసినా లేదా రికార్డ్ అప్‌డేట్ చేసినా క్రియేటెడ్ యూజర్ ఈమెయిల్ మిస్ కాకుండా ట్రాక్ చేస్తుంది
        row.created_by_email = session_email 
        
    # INSERT MODE
    else:
        new_vendor = vendors(
            name=name, 
            email=email, 
            service_for=service_for,
            payment_cycle=payment_cycle, # 👈 కొత్త ఎంట్రీ క్రియేట్ ఐనప్పుడు ఇక్కడ సేవ్ అవుతుంది
            gst_number=gst_number, 
            address=address,
            bank_name=bank_name, 
            account_no=account_no, 
            ifsc=ifsc,
            date=date,                        
            time=time,                        
            created_by_email=session_email,   
            company_id=company_code
        )
        db.add(new_vendor)

    db.commit()
    return JSONResponse({"success": True})

# ---------------------------------------------------------
# DELETE VENDOR
# ---------------------------------------------------------
@router.post("/vendors/delete/{id}")
def delete_vendor(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(vendors).filter(
        vendors.id == id, 
        vendors.company_id == company_code
    ).delete()
    
    db.commit()
    return JSONResponse({"status": "ok"})