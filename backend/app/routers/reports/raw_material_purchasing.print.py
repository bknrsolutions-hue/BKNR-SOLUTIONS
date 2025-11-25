from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing
from app.database.models.processing import RawMaterialPurchasingPayment

router = APIRouter(prefix="/reports/raw_material_purchasing_report", tags=["RMP PRINT"])
templates = Jinja2Templates(directory="app/templates")

# --------------------------------------------------------------
# 🔥 PRINT VIEW (FULL DETAILED PRINT)
# --------------------------------------------------------------
@router.get("/print")
def print_page(request: Request, ids: str, db: Session = Depends(get_db)):

    id_list = [int(x) for x in ids.split(",") if x != "all"]

    # Load rows
    rows = (
        db.query(RawMaterialPurchasing)
        .filter(RawMaterialPurchasing.id.in_(id_list))
        .order_by(RawMaterialPurchasing.batch_number)
        .all()
    )

    if not rows:
        return "No Data Found"

    # ----------------------------
    # ORGANIZE BY BATCH
    # ----------------------------
    batches = {}
    for r in rows:
        if r.batch_number not in batches:
            batches[r.batch_number] = {
                "batch_number": r.batch_number,
                "vehicle_number": r.vehicle_number,
                "date": r.date,
                "rows": [],
                "total_received": 0,
                "total_amount": 0,
                "payment": [],
                "out_before": 0,
                "pay_total": 0,
                "out_after": 0
            }

        batches[r.batch_number]["rows"].append(r)
        batches[r.batch_number]["total_received"] += (r.received_qty or 0)
        batches[r.batch_number]["total_amount"] += (r.amount or 0)

    # --------------------------------
    # PAYMENTS FOR EACH BATCH
    # --------------------------------
    for batch_no, data in batches.items():
        pays = (
            db.query(RawMaterialPurchasingPayment)
            .filter(RawMaterialPurchasingPayment.batch_number == batch_no)
            .all()
        )

        if pays:
            total_pay = sum(p.amount for p in pays)
            data["payment"] = pays
            data["out_before"] = data["total_amount"]
            data["pay_total"] = total_pay
            data["out_after"] = data["total_amount"] - total_pay
        else:
            data["out_before"] = data["total_amount"]
            data["out_after"] = data["total_amount"]

    # --------------------------------
    # SUPPLIER (take from first row)
    # --------------------------------
    supplier = {
        "name": rows[0].supplier_name,
        "address": rows[0].supplier_address or "",
        "email": rows[0].supplier_email or ""
    }

    # --------------------------------
    # COMPANY INFO (static)
    # --------------------------------
    company = {
        "address": "Bhimavaram, AP",
        "email": "bknr.solutions@gmail.com"
    }

    # --------------------------------
    # RENDER TEMPLATE
    # --------------------------------
    return templates.TemplateResponse(
        "reports/raw_material_purchasing_report_print.html",
        {
            "request": request,
            "supplier": supplier,
            "company": company,
            "batches": batches.values(),
            "printed_on": datetime.now()
        }
    )
