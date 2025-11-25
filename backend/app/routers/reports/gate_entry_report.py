# app/routers/reports/gate_entry_report.py

from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.processing import GateEntry

router = APIRouter(tags=["Gate Entry Report"])   # <-- NO PREFIX HERE
templates = Jinja2Templates(directory="app/templates")


@router.get("/gate_entry_report")
def gate_entry_report(
    request: Request,
    batch: str = "",
    challan: str = "",
    gatepass: str = "",
    supplier: str = "",
    date: str = "",
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_id", "BKNR001")

    all_data = db.query(GateEntry).filter(
        GateEntry.company_id == company_id
    ).all()

    batches = sorted({row.batch_number for row in all_data})
    challans = sorted({row.challan_number for row in all_data})
    gates = sorted({row.gate_pass_number for row in all_data})
    suppliers = sorted({row.supplier_name for row in all_data})
    dates = sorted({row.date for row in all_data})

    q = db.query(GateEntry).filter(GateEntry.company_id == company_id)

    if batch:
        q = q.filter(GateEntry.batch_number == batch)
    if challan:
        q = q.filter(GateEntry.challan_number == challan)
    if gatepass:
        q = q.filter(GateEntry.gate_pass_number == gatepass)
    if supplier:
        q = q.filter(GateEntry.supplier_name == supplier)
    if date:
        q = q.filter(GateEntry.date == date)

    filtered_data = q.all()

    return templates.TemplateResponse(
        "reports/gate_entry_report.html",
        {
            "request": request,
            "data": filtered_data,
            "batches": batches,
            "challans": challans,
            "gates": gates,
            "suppliers": suppliers,
            "dates": dates,
            "selected_batch": batch,
            "selected_challan": challan,
            "selected_gatepass": gatepass,
            "selected_supplier": supplier,
            "selected_date": date,
        }
    )


@router.post("/gate_entry/delete/{record_id}")
def delete_gate_entry(record_id: int, db: Session = Depends(get_db)):
    row = db.query(GateEntry).filter(GateEntry.id == record_id).first()
    if not row:
        return {"status": "error", "message": "Record not found"}

    db.delete(row)
    db.commit()
    return {"status": "success", "message": "Deleted"}


@router.get("/gate_entry/print/{record_id}")
def print_record(record_id: int):
    return {"print": record_id}


@router.get("/gate_entry/export_pdf/{record_id}")
def export_pdf(record_id: int):
    return {"pdf": record_id}


@router.get("/gate_entry/export_xlsx/{record_id}")
def export_xlsx(record_id: int):
    return {"xlsx": record_id}
