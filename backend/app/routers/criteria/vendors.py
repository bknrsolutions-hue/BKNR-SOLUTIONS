from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.database.models.criteria import vendors
from app.main import templates

router = APIRouter(
    tags=["VENDORS"]
)

@router.get("/vendors", response_class=HTMLResponse)
def vendors_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # 🔹 Company Wise Filter Applied
    rows = (
        db.query(vendors)
        .filter(vendors.company_id == company_code)
        .order_by(desc(vendors.id))
        .all()
    )

    return templates.TemplateResponse(
        "criteria/vendors.html",
        {
            "request": request,
            "vendors_list": rows,  # UI loop iterates this
            "company_id": company_code
        }
    )

@router.post("/vendors")
def save_vendor(
    request: Request,
    db: Session = Depends(get_db),
    name: str = Form(...),
    email: str = Form(""),
    service_for: str = Form(""),
    gst_number: str = Form(""),
    address: str = Form(""),
    bank_name: str = Form(""),
    account_no: str = Form(""),
    ifsc: str = Form(""),
    id: str = Form("")
):
    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    record_id = int(id) if id and id.isdigit() else None

    # Duplicate check within the same company
    duplicate = db.query(vendors).filter(
        vendors.name == name,
        vendors.company_id == company_code,
        vendors.id != record_id
    ).first()

    if duplicate:
        return JSONResponse({"error": f"Vendor '{name}' already exists"}, status_code=400)

    if record_id:
        row = db.query(vendors).filter(vendors.id == record_id, vendors.company_id == company_code).first()
        if not row: return JSONResponse({"error": "Not found"}, status_code=404)
        
        row.name, row.email, row.service_for = name, email, service_for
        row.gst_number, row.address = gst_number, address
        row.bank_name, row.account_no, row.ifsc = bank_name, account_no, ifsc
    else:
        new_v = vendors(
            name=name, email=email, service_for=service_for,
            gst_number=gst_number, address=address,
            bank_name=bank_name, account_no=account_no, ifsc=ifsc,
            company_id=company_code
        )
        db.add(new_v)

    db.commit()
    return JSONResponse({"success": True})

@router.post("/vendors/delete/{id}")
def delete_vendor(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    db.query(vendors).filter(vendors.id == id, vendors.company_id == company_code).delete()
    db.commit()
    return JSONResponse({"status": "ok"})