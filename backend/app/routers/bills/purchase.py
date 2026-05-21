# app/routers/bills/purchase_invoice.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import date, datetime
import logging
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import io

from app.database import get_db
from app.database.models.bills import PurchaseInvoice
from app.database.models.inventory_management import pending_orders, sales_dispatch
from app.database.models.criteria import (
    production_at,
    vendors,
    hsn_codes
)
# గమనిక: మీ ప్రాజెక్ట్‌లో కంపెనీ మోడల్ పేరు Company అయితే దాన్ని ఇక్కడ ఇంపోర్ట్ చేసుకోండి.
# from app.database.models.criteria import Company  

router = APIRouter(
    prefix="/purchase",
    tags=["Purchase"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


# ==================================================
# 🧾 1. PURCHASE ENTRY PAGE (టెంప్లేట్ మ్యాపింగ్స్‌తో)
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def purchase_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/", status_code=302)

    # 🔹 1. Production Units / Locations
    locations = db.query(production_at).filter(
        production_at.company_id == company_id
    ).order_by(production_at.production_at).all()

    # 🔹 2. Vendors
    all_vendors = db.query(vendors).filter(
        vendors.company_id == company_id
    ).order_by(vendors.name).all()

    # 🔹 3. HSN Codes
    hsn_list = db.query(hsn_codes).filter(
        hsn_codes.company_id == company_id
    ).order_by(hsn_codes.description).all()

    # 🔹 4. Invoice History
    invoice_history = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id
    ).order_by(desc(PurchaseInvoice.id)).limit(50).all()

    # ==================================================
    # 🎯 HTML టెంప్లేట్ కి కావలసిన మ్యాపింగ్స్ (FIXES JINJA2 ERROR)
    # ==================================================
    # 1. Vendor Maps (ID -> Name & ID -> GSTIN)
    vendor_map = {v.id: v.name for v in all_vendors}
    vendor_gstin_map = {v.id: (v.gstin if hasattr(v, 'gstin') else "N/A") for v in all_vendors}

    # 2. Location Code Map (ID -> Code/Name)
    location_code_map = {l.id: l.production_at for l in locations}

    # 3. Company Map (కంపెనీ వైజ్ ఫిల్టర్ కోసం)
    # ఒకవేళ మీ దగ్గర ప్రత్యేకంగా Company మోడల్ ఉంటే దాన్ని క్వెరీ చేయండి, లేదంటే సెషన్ లోని కరెంట్ కంపెనీని మ్యాప్ చేయండి
    company_map = {company_id: f"Company {company_id}"} 
    try:
        # మీ మోడల్స్ లో Company టేబుల్ ఉంటే దీన్ని అన్‌కమెంట్ చేయండి:
        # comp_rows = db.query(Company).all()
        # company_map = {c.company_code: c.company_name for c in comp_rows}
        pass
    except Exception:
        pass

    # ==================================================
    # 🔥 PO NUMBER DROPDOWN DATA
    # ==================================================
    po_from_pending = db.query(pending_orders.po_number).filter(
        pending_orders.company_id == company_id
    ).distinct().all()

    po_from_sales = db.query(sales_dispatch.po_number).filter(
        sales_dispatch.company_id == company_id
    ).distinct().all()

    # flatten + clean
    po_set = set()
    for p in po_from_pending:
        if p[0]:
            po_set.add(p[0].strip())

    for p in po_from_sales:
        if p[0]:
            po_set.add(p[0].strip())

    po_list = sorted(list(po_set))
    po_list.insert(0, "N/A")  # Default option

    return templates.TemplateResponse(
        request=request,
        name="bills/purchase_entry.html",
        context={
            "locations": locations,
            "vendors": all_vendors,
            "invoice_history": invoice_history,
            "hsn_list": hsn_list,
            "po_list": po_list,
            "vendor_map": vendor_map,
            "vendor_gstin_map": vendor_gstin_map,
            "location_code_map": location_code_map,
            "company_map": company_map,  # 🔥 ఇక్కడే ఎర్రర్ ఫిక్స్ అయింది!
            "email": email,
            "company_id": company_id
        }
    )


# ==================================================
# 💾 2. SAVE PURCHASE INVOICE (రిఫరెన్స్ లాజిక్)
# ==================================================
@router.post("/save")
async def save_purchase_invoice(
    request: Request,
    unit_id: int = Form(...),
    vendor_id: int = Form(...),
    invoice_date: date = Form(...),
    invoice_no: str = Form(...),
    product_name: str = Form(...),
    hsn_code: str = Form(...),
    qty: float = Form(...),
    base_price: float = Form(...),
    gst_percent: float = Form(...),
    po_number: str = Form(None),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return JSONResponse({"status": "error", "message": "Session Expired"}, status_code=401)

    try:
        # డూప్లికేట్ వెరిఫికేషన్
        duplicate = db.query(PurchaseInvoice).filter(
            PurchaseInvoice.invoice_no == invoice_no.strip(),
            PurchaseInvoice.company_id == company_id
        ).first()

        if duplicate:
            return JSONResponse(
                {"status": "error", "message": f"Invoice {invoice_no} already exists"},
                status_code=400
            )

        # 🧮 CALCULATION
        taxable_value = round(qty * base_price, 2)
        tax_amount = round((taxable_value * gst_percent) / 100, 2)
        grand_total = round(taxable_value + tax_amount, 2)

        now = datetime.now()

        # 🔥 CLEAN PO NUMBER
        if po_number:
            po_number = po_number.strip()
            if po_number.upper() in ["N/A", "", "-"]:
                po_number = None

        new_invoice = PurchaseInvoice(
            unit_id=unit_id,
            production_at_id=unit_id,
            vendor_id=vendor_id,
            invoice_date=invoice_date,
            invoice_no=invoice_no.upper().strip(),
            product_name=product_name.upper().strip(),
            hsn_code=hsn_code,
            qty=qty,
            base_price=base_price,
            gst_percent=gst_percent,
            tax_amount=tax_amount,
            grand_total=grand_total,
            po_number=po_number,
            company_id=company_id,
            email=email,
            date=now.strftime("%Y-%m-%d"),
            time=now.strftime("%H:%M:%S")
        )

        db.add(new_invoice)
        db.commit()

        return JSONResponse({
            "status": "success",
            "message": f"Invoice {invoice_no} saved successfully!"
        })

    except Exception as e:
        db.rollback()
        logger.error(f"PURCHASE SAVE ERROR: {str(e)}")
        return JSONResponse({"status": "error", "message": "Internal Server Error"}, status_code=500)


# ==================================================
# 🗑️ 3. DELETE INVOICE
# ==================================================
@router.post("/delete/{inv_id}")
def delete_invoice(inv_id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")

    invoice = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.id == inv_id,
        PurchaseInvoice.company_id == company_id
    ).first()

    if invoice:
        try:
            db.delete(invoice)
            db.commit()
            return {"status": "success"}
        except Exception as e:
            db.rollback()
            logger.error(f"PURCHASE DELETE ERROR: {str(e)}")
            return JSONResponse({"status": "error", "message": "Failed to delete"}, status_code=500)

    return JSONResponse({"error": "Invoice not found"}, status_code=404)


# ==================================================
# 🪵 4. AUDIT HISTORY LOG
# ==================================================
@router.get("/audit/{inv_id}")
def get_audit_history(inv_id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"status": "error", "message": "Session Expired"}, status_code=401)

    invoice = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.id == inv_id,
        PurchaseInvoice.company_id == company_id
    ).first()

    if not invoice:
        return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)

    return JSONResponse({
        "status": "success",
        "audit_trail": {
            "created_by": invoice.email,
            "created_date": str(invoice.date),
            "created_time": str(invoice.time),
            "invoice_no": invoice.invoice_no
        }
    })


# ==================================================
# 📊 5. EXPORT TO EXCEL
# ==================================================
@router.get("/export/excel")
def export_purchase_excel(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    invoices = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id
    ).order_by(desc(PurchaseInvoice.id)).all()

    all_vendors = db.query(vendors).filter(vendors.company_id == company_id).all()
    vendor_map = {v.id: v.name for v in all_vendors}

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Purchase Invoices"
    ws.views.sheetView[0].showGridLines = True

    header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
    header_fill = PatternFill(start_color='0F172A', end_color='0F172A', fill_type='solid')
    data_font = Font(name='Segoe UI', size=10)
    total_font = Font(name='Segoe UI', size=11, bold=True)
    align_center = Alignment(horizontal='center', vertical='center')
    align_left = Alignment(horizontal='left', vertical='center')
    align_right = Alignment(horizontal='right', vertical='center')
    
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'), right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'), bottom=Side(style='thin', color='E2E8F0')
    )

    headers = ["Sl.No", "Invoice Date", "Invoice No", "PO Number", "Vendor Name", "Product Name", "Qty", "Rate", "Tax Amount", "Grand Total"]
    ws.append(headers)

    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = align_center
        cell.border = thin_border

    total_sum = 0.0
    for index, inv in enumerate(invoices, 1):
        v_name = vendor_map.get(inv.vendor_id, "N/A")
        po_num = inv.po_number or "N/A"
        row_data = [index, str(inv.invoice_date), inv.invoice_no, po_num, v_name, inv.product_name, inv.qty, inv.base_price, inv.tax_amount, inv.grand_total]
        ws.append(row_data)
        total_sum += float(inv.grand_total)

        curr_row = ws.max_row
        for col_idx in range(1, 11):
            c = ws.cell(row=curr_row, column=col_idx)
            c.font = data_font
            c.border = thin_border
            if col_idx in [1, 2, 3, 4]:
                c.alignment = align_center
            elif col_idx in [5, 6]:
                c.alignment = align_left
            else:
                c.alignment = align_right

    ws.append(["TOTAL SUM", "", "", "", "", "", "", "", "", total_sum])
    total_row_num = ws.max_row
    ws.merge_cells(start_row=total_row_num, start_column=1, end_row=total_row_num, end_column=9)
    
    summary_label_cell = ws.cell(row=total_row_num, column=1)
    summary_label_cell.font = total_font
    summary_label_cell.alignment = Alignment(horizontal='right', vertical='center')
    
    val_cell = ws.cell(row=total_row_num, column=10)
    val_cell.font = total_font
    val_cell.alignment = align_right

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"Purchase_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================================================
# 🖨️ 6. PRINT VIEW TEMPLATE REPORT
# ==================================================
@router.get("/print/report", response_class=HTMLResponse)
def print_purchase_report_view(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    invoices = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id
    ).order_by(desc(PurchaseInvoice.id)).all()

    all_vendors = db.query(vendors).filter(vendors.company_id == company_id).all()
    vendor_map = {v.id: v.name for v in all_vendors}

    return templates.TemplateResponse(
        request=request,
        name="bills/purchase_print_template.html",
        context={
            "invoices": invoices,
            "vendor_map": vendor_map,
            "print_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    )