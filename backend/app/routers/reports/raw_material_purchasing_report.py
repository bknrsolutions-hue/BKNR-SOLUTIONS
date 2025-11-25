from fastapi import APIRouter, Request, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from io import BytesIO
from datetime import datetime

from openpyxl import Workbook
from weasyprint import HTML   # <-- PDF generator (Working)

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing

router = APIRouter(tags=["RMP Report"])
templates = Jinja2Templates(directory="app/templates")


# -------------------------
# Helper
# -------------------------
def query_for_company(db: Session, company_id: str):
    return db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == company_id
    )


# -------------------------
# GET report page
# -------------------------
@router.get("/raw_material_purchasing_report", response_class=HTMLResponse)
def rmp_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    q = query_for_company(db, company_id).order_by(RawMaterialPurchasing.id.desc())
    report_data = q.all()

    # Filter lists
    batch_list = sorted({r.batch_number for r in report_data if r.batch_number})
    supplier_list = sorted({r.supplier_name for r in report_data if r.supplier_name})
    count_list = sorted({r.count for r in report_data if r.count})
    variety_list = sorted({r.variety_name for r in report_data if r.variety_name})

    return templates.TemplateResponse(
        "reports/raw_material_purchasing_report.html",
        {
            "request": request,
            "report_data": report_data,
            "batch_list": batch_list,
            "supplier_list": supplier_list,
            "count_list": count_list,
            "variety_list": variety_list,
        }
    )


# -------------------------
# DELETE
# -------------------------
@router.post("/raw_material_purchasing_report/delete")
def delete_selected(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_id")
    ids = payload.get("ids") or []

    if not isinstance(ids, list):
        return JSONResponse({"error": "ids should be a list"}, status_code=400)

    deleted = 0
    for _id in ids:
        row = db.query(RawMaterialPurchasing).filter_by(
            id=_id, company_id=company_id
        ).first()
        if row:
            db.delete(row)
            deleted += 1

    db.commit()
    return {"deleted": deleted}


# -------------------------
# EXPORT XLSX
# -------------------------
@router.get("/raw_material_purchasing_report/export_xlsx")
def export_xlsx(request: Request, ids: str = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")
    q = query_for_company(db, company_id)

    if ids and ids.lower() != "all":
        id_list = [int(x) for x in ids.split(",") if x.isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))

    rows = q.order_by(RawMaterialPurchasing.id.desc()).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "RMP Report"

    headers = [
        "ID", "Batch", "Supplier", "Variety", "Species", "Count",
        "G1", "G2", "DC", "Received", "Rate", "Amount", "Boxes", "Date"
    ]
    ws.append(headers)

    for r in rows:
        ws.append([
            r.id, r.batch_number, r.supplier_name, r.variety_name, r.species,
            r.count, r.g1_qty, r.g2_qty, r.dc_qty, r.received_qty,
            r.rate_per_kg, r.amount, r.material_boxes, r.date
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)

    fname = f"RMP_Report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )


# -------------------------
# PRINT VIEW
# -------------------------
@router.get("/raw_material_purchasing_report/print", response_class=HTMLResponse)
def print_view(request: Request, ids: str = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")

    q = query_for_company(db, company_id)
    if ids and ids.lower() != "all":
        id_list = [int(x) for x in ids.split(",") if x.isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))

    rows = q.order_by(RawMaterialPurchasing.id.desc()).all()

    return templates.TemplateResponse(
        "reports/raw_material_purchasing_report_print.html",
        {"request": request, "rows": rows, "printed_on": datetime.now()}
    )


# -------------------------
# EXPORT PDF (WeasyPrint)
# -------------------------
@router.get("/raw_material_purchasing_report/export_pdf")
def export_pdf(request: Request, ids: str = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")

    q = query_for_company(db, company_id)
    if ids and ids.lower() != "all":
        id_list = [int(x) for x in ids.split(",") if x.isdigit()]
        q = q.filter(RawMaterialPurchasing.id.in_(id_list))

    rows = q.order_by(RawMaterialPurchasing.id.desc()).all()

    html_content = templates.get_template(
        "reports/raw_material_purchasing_report_print.html"
    ).render({"request": request, "rows": rows, "printed_on": datetime.now()})

    pdf_bytes = HTML(string=html_content).write_pdf()

    fname = f"RMP_Report_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )
