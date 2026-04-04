# ============================================================
# GATE ENTRY – STOCK LEDGER STYLE REPORT ROUTER (FINAL + AUDIT + FETCH)
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import GateEntry, AuditLog
from app.database.models.users import Company

router = APIRouter(
    prefix="/gate_entry",
    tags=["GATE ENTRY REPORT"]
)

# ============================================================
# COMPANY INFO
# ============================================================

def get_company_info(db: Session, comp_code: str):
    company = db.query(Company).filter(
        Company.company_code == comp_code
    ).first()

    if not company:
        return "", ""

    return company.company_name or "", company.address or ""


# ============================================================
# MAIN REPORT PAGE
# ============================================================

@router.get("", response_class=HTMLResponse)
def gate_entry_report(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):

    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    role = request.session.get("role")

    if not comp_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    query = db.query(GateEntry).filter(
        GateEntry.company_id == comp_code
    )

    if from_date:
        query = query.filter(GateEntry.date >= date.fromisoformat(from_date))

    if to_date:
        query = query.filter(GateEntry.date <= date.fromisoformat(to_date))

    rows = query.order_by(
        GateEntry.date.desc(),
        GateEntry.time.desc()
    ).all()

    suppliers_list = sorted({r.supplier_name for r in rows if r.supplier_name})
    factories_list = sorted({r.receiving_center for r in rows if r.receiving_center})
    locations_list = sorted({r.purchasing_location for r in rows if r.purchasing_location})
    vehicles_list = sorted({r.vehicle_number for r in rows if r.vehicle_number})
    production_for_list = sorted({r.production_for for r in rows if r.production_for})

    company_name, company_address = get_company_info(db, comp_code)

    return request.app.state.templates.TemplateResponse(
        "reports/gate_entry_report.html",
        {
            "request": request,
            "rows": rows,
            "from_date": from_date,
            "to_date": to_date,
            "suppliers_list": suppliers_list or [],
            "factories_list": factories_list or [],
            "locations_list": locations_list or [],
            "vehicles_list": vehicles_list or [],
            "production_for_list": production_for_list or [],
            "company_name": company_name,
            "company_address": company_address,
            "is_admin": role == "admin"
        }
    )


# ============================================================
# UPDATE ENTRY (SAFE PARTIAL UPDATE + AUDIT SAVE)
# ============================================================

@router.post("/update")
def update_gate_entry(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")
    role = request.session.get("role")
    edited_by = request.session.get("email")

    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    row = db.query(GateEntry).filter(
        GateEntry.id == payload.get("id"),
        GateEntry.company_id == comp_code
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_fields = [
        "batch_number",
        "challan_number",
        "gate_pass_number",
        "receiving_center",
        "supplier_name",
        "purchasing_location",
        "vehicle_number",
        "production_for",
        "no_of_material_boxes",
        "no_of_empty_boxes",
        "no_of_ice_boxes"
    ]

    for field in update_fields:
        if field in payload and payload[field] is not None:

            old_value = getattr(row, field)
            new_value = payload[field]

            if field in [
                "no_of_material_boxes",
                "no_of_empty_boxes",
                "no_of_ice_boxes"
            ]:
                new_value = float(new_value or 0)

            if str(old_value) != str(new_value):

                db.add(
                    AuditLog(
                        table_name="gate_entry",
                        record_id=row.id,
                        company_id=comp_code,
                        field_name=field,
                        old_value=str(old_value),
                        new_value=str(new_value),
                        edited_by=edited_by,
                        edited_at=datetime.utcnow()
                    )
                )

                setattr(row, field, new_value)

    db.commit()

    return {"status": "updated"}


# ============================================================
# DELETE ENTRY (WITH AUDIT)
# ============================================================

@router.post("/delete")
def delete_gate_entry(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")
    role = request.session.get("role")
    edited_by = request.session.get("email")

    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    row = db.query(GateEntry).filter(
        GateEntry.id == payload.get("id"),
        GateEntry.company_id == comp_code
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")

    db.add(
        AuditLog(
            table_name="gate_entry",
            record_id=row.id,
            company_id=comp_code,
            field_name="DELETE",
            old_value="Record Deleted",
            new_value="Deleted",
            edited_by=edited_by,
            edited_at=datetime.utcnow()
        )
    )

    db.delete(row)
    db.commit()

    return {"deleted": True}


# ============================================================
# FETCH ALL AUDIT LOGS
# ============================================================

@router.get("/audit")
def fetch_all_audit_logs(
    request: Request,
    db: Session = Depends(get_db)
):

    comp_code = request.session.get("company_code")

    logs = db.query(AuditLog).filter(
        AuditLog.table_name == "gate_entry",
        AuditLog.company_id == comp_code
    ).order_by(AuditLog.edited_at.desc()).all()

    return [
        {
            "record_id": log.record_id,
            "field": log.field_name,
            "old": log.old_value,
            "new": log.new_value,
            "user": log.edited_by,
            "time": log.edited_at.strftime("%d-%m-%Y %H:%M:%S")
        }
        for log in logs
    ]


# ============================================================
# EXPORT PDF
# ============================================================

@router.get("/export_pdf")
def export_pdf(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):

    comp_code = request.session.get("company_code")

    if not comp_code:
        raise HTTPException(status_code=401)

    query = db.query(GateEntry).filter(
        GateEntry.company_id == comp_code
    )

    if from_date:
        query = query.filter(GateEntry.date >= date.fromisoformat(from_date))

    if to_date:
        query = query.filter(GateEntry.date <= date.fromisoformat(to_date))

    rows = query.order_by(GateEntry.date.asc()).all()

    total_mat = sum(r.no_of_material_boxes or 0 for r in rows)
    total_emp = sum(r.no_of_empty_boxes or 0 for r in rows)
    total_ice = sum(r.no_of_ice_boxes or 0 for r in rows)

    html = request.app.state.templates.get_template(
        "reports/gate_entry_print.html"
    ).render({
        "rows": rows,
        "printed_on": datetime.now(),
        "total_mat": total_mat,
        "total_emp": total_emp,
        "total_ice": total_ice
    })

    pdf = HTML(string=html).write_pdf()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=GATE_ENTRY_REPORT.pdf"
        }
    )


# ============================================================
# EXPORT EXCEL
# ============================================================

@router.get("/export_excel")
def export_excel(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):

    comp_code = request.session.get("company_code")

    if not comp_code:
        raise HTTPException(status_code=401)

    query = db.query(GateEntry).filter(
        GateEntry.company_id == comp_code
    )

    if from_date:
        query = query.filter(GateEntry.date >= date.fromisoformat(from_date))

    if to_date:
        query = query.filter(GateEntry.date <= date.fromisoformat(to_date))

    rows = query.order_by(GateEntry.date.asc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Gate Entry Ledger"

    headers = [
        "ID","Date","Time","Batch","Challan","Gate Pass",
        "Factory","Supplier","Location","Vehicle",
        "Production For",
        "Material Boxes","Empty Boxes","Ice Boxes","User"
    ]
    ws.append(headers)

    total_mat = total_emp = total_ice = 0

    for r in rows:
        total_mat += r.no_of_material_boxes or 0
        total_emp += r.no_of_empty_boxes or 0
        total_ice += r.no_of_ice_boxes or 0

        ws.append([
            r.id,
            r.date,
            r.time.strftime("%H:%M:%S") if r.time else "",
            r.batch_number,
            r.challan_number,
            r.gate_pass_number,
            r.receiving_center,
            r.supplier_name,
            r.purchasing_location,
            r.vehicle_number,
            r.production_for,
            r.no_of_material_boxes,
            r.no_of_empty_boxes,
            r.no_of_ice_boxes,
            r.email
        ])

    ws.append([
        "","","","","","","","","","","TOTAL",
        total_mat,total_emp,total_ice,""
    ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=GATE_ENTRY_REPORT.xlsx"
        }
    )