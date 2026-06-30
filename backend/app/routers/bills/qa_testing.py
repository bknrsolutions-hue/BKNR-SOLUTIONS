from app.utils.timezone import ist_now
from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, desc, and_
from datetime import date, datetime
import datetime as dt
import logging
import io
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

from app.database import get_db
from app.database.models.bills import QATestingLog
from app.database.models.processing import AuditLog  
from app.database.models.criteria import production_at
from app.services.posting_engine import PostingEngineService
from app.database.models.enterprise_finance import VoucherHeader
from app.routers.bills.purchase import cancel_linked_voucher

def post_qa_testing_log_to_ledger(db: Session, company_id: str, entry: QATestingLog, lab_name: str, email: str) -> int:
    try:
        # Prepare double entry details: Debit Lab Testing charges, Credit Lab Vendor
        details = [
            {
                "ledger_name": "Lab Testing Charges A/c",
                "group_name": "Indirect Expenses",
                "group_type": "EXPENSE",
                "debit_amount": entry.test_cost,
                "credit_amount": 0.0,
                "remarks": f"QA Lab Testing - Batch: {entry.batch_no}, Report: {entry.report_ref}"
            },
            {
                "ledger_name": f"{lab_name} - Supplier A/c",
                "group_name": "Sundry Creditors",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": entry.test_cost,
                "remarks": f"Payable for Lab report {entry.report_ref}"
            }
        ]

        voucher = PostingEngineService.create_voucher(
            db=db,
            company_id=company_id,
            voucher_type_name="Purchase",
            voucher_date=entry.test_date,
            narration=f"QA lab testing report {entry.report_ref} for batch {entry.batch_no}",
            details=details,
            reference_no=entry.report_ref,
            created_by=email or "SYSTEM",
            status="POSTED"
        )
        
        # Populate ledger IDs
        expense_ledger = PostingEngineService.get_or_create_ledger(
            db, company_id, "Lab Testing Charges A/c", "Indirect Expenses", "EXPENSE"
        )
        vendor_ledger = PostingEngineService.get_or_create_ledger(
            db, company_id, f"{lab_name} - Supplier A/c", "Sundry Creditors", "LIABILITY", "Current Liabilities"
        )
        entry.qa_expense_ledger_id = expense_ledger.id
        entry.lab_ledger_id = vendor_ledger.id

        return voucher.id
    except Exception as e:
        logger.error(f"Failed to post QA testing log to ledger: {str(e)}")
        raise e

router = APIRouter(
    prefix="/qa",
    tags=["QA Testing"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


# ============================================================
# 📋 PYDANTIC SCHEMAS FOR JSON PAYLOADS (AJAX COMPATIBLE)
# ============================================================
class QaTestingSchema(BaseModel):
    test_date: date
    product_id: int
    batch_no: str
    lab_id: int
    report_ref: str
    base_cost: float
    gst_percent: float
    grand_total: float


# ============================================================
# 🧪 1. MAIN ENTRY PAGE (GET) - FIXED NATIVE DATE FILTERS
# ============================================================
@router.get("/entry", response_class=HTMLResponse)
def qa_entry_page(
    request: Request,
    fy: str = Query(None), # Financial Year Query Param
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 1. Products / Locations Fetch (Safely)
    products_list = []
    try:
        products_list = db.query(production_at).filter(production_at.company_id == comp_code).all()
    except Exception as e:
        logger.error(f"Products Table Error: {e}")

    # 2. Labs Fetch (Safely using Text query)
    labs_list = []
    try:
        labs_result = db.execute(
            text("SELECT id, name FROM labs WHERE company_id = :c"), 
            {"c": comp_code}
        ).fetchall()
        labs_list = [{"id": row[0], "name": row[1]} for row in labs_result]
    except Exception as e:
        logger.error(f"Labs Table Error: {e}")

    # 3. History Data (Filtered by Financial Year April to March)
    qa_history = []
    if fy:
        selected_year = int(fy)
        start_date = dt.date(selected_year, 4, 1)
        end_date = dt.date(selected_year + 1, 3, 31)

        try:
            # టేబుల్‌ లో ఇప్పుడు 'test_date' కాలమ్ ఉంది కాబట్టి నేరుగా ఫిల్టర్ రన్ చేస్తున్నాం
            raw_history = (
                db.query(QATestingLog, production_at.production_at.label("product"))
                .join(production_at, QATestingLog.unit_id == production_at.id)
                .filter(
                    production_at.company_id == comp_code,
                    QATestingLog.test_date >= start_date,
                    QATestingLog.test_date <= end_date
                )
                .order_by(desc(QATestingLog.id))
                .all()
            )

            qa_history = [{
                "id": row.QATestingLog.id,
                "batch_no": row.QATestingLog.batch_no,
                "lab_name": row.QATestingLog.lab_name,
                "total": row.QATestingLog.test_cost,
                "report_ref": row.QATestingLog.report_ref,
                "product": row.product,
                "date": row.QATestingLog.test_date.strftime("%Y-%m-%d") if row.QATestingLog.test_date else dt.date.today().strftime("%Y-%m-%d"),
                "base_cost": row.QATestingLog.test_cost, 
                "gst_amt": 0.0
            } for row in raw_history]

            # ఒకవేళ ఫాల్‌బ్యాక్ కింద పాత డేటా లోడ్ అవ్వడానికి:
            if not qa_history:
                fallback_history = db.query(QATestingLog).join(
                    production_at, QATestingLog.unit_id == production_at.id
                ).filter(production_at.company_id == comp_code).order_by(desc(QATestingLog.id)).limit(100).all()
                
                qa_history = [{
                    "id": log.id, "batch_no": log.batch_no, "lab_name": log.lab_name,
                    "total": log.test_cost, "report_ref": log.report_ref, "product": getattr(log, "product", "Unknown"),
                    "date": log.test_date.strftime("%Y-%m-%d") if getattr(log, "test_date", None) else dt.date.today().strftime("%Y-%m-%d"), 
                    "base_cost": log.test_cost, "gst_amt": 0.0
                } for log in fallback_history]

        except Exception as e:
            logger.error(f"History Fetch Error: {e}")
            qa_history = []

    return templates.TemplateResponse(
        request=request,
        name="bills/qa_testing_entry.html",
        context={
            "products": products_list,
            "labs": labs_list,
            "qa_history": qa_history,
            "comp_code": comp_code,
            "email": email,
            "selected_fy": fy
        }
    )


# ============================================================
# 💾 2. SAVE QA TESTING RECORD (POST JSON - AUTOMATIC DATE)
# ============================================================
@router.post("/save")
async def save_qa_testing(
    request: Request,
    payload: QaTestingSchema,
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code or not email:
        return JSONResponse({"success": False, "message": "Session Expired"}, status_code=401)

    try:
        # lookup lab name from labs table using lab_id safely
        lab_name = "External Lab"
        try:
            lab_row = db.execute(
                text("SELECT name FROM labs WHERE id = :l_id"), 
                {"l_id": payload.lab_id}
            ).fetchone()
            if lab_row:
                lab_name = lab_row[0]
        except Exception as e:
            logger.error(f"Lab lookup implicit warning: {e}")

        # ఇక్కడ payload నుండి వచ్చిన 'test_date' ఆటోమేటిక్‌గా సేవ్ అవుతుంది 📅
        new_entry = QATestingLog(
            unit_id=payload.product_id,
            batch_no=payload.batch_no.upper().strip(),
            lab_name=lab_name,
            test_cost=payload.grand_total,
            report_ref=payload.report_ref.upper().strip(),
            test_date=payload.test_date if payload.test_date else dt.date.today()
        )
        
        db.add(new_entry)
        db.flush()

        # 📜 Add Initial Master Operational Audit Entry Trace
        db.add(AuditLog(
            table_name="qa_testing_logs", record_id=new_entry.id, company_id=comp_code,
            field_name="CREATE", old_value="NONE", new_value=f"Batch: {new_entry.batch_no} (Cost: ₹{payload.grand_total})",
            edited_by=email, edited_at=dt.datetime.now(dt.timezone.utc)
        ))

        # Auto-post to accounting ledger
        journal_id = post_qa_testing_log_to_ledger(
            db=db,
            company_id=comp_code,
            entry=new_entry,
            lab_name=lab_name,
            email=email
        )
        new_entry.journal_id = journal_id
        new_entry.status = 'POSTED'

        db.commit()
        return JSONResponse({"success": True, "message": f"QA Lab entry {payload.batch_no} saved successfully!"})

    except Exception as e:
        db.rollback()
        logger.error(f"QA Save Error: {e}")
        return JSONResponse({"success": False, "message": f"Database Error: {str(e)}"}, status_code=500)


# ============================================================
# 📋 3. MASTER AUDIT HISTORY LOG ENGINE (GET)
# ============================================================
@router.get("/audit_all")
async def get_all_qa_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    logs = (
        db.query(AuditLog, QATestingLog.batch_no)
        .join(QATestingLog, AuditLog.record_id == QATestingLog.id)
        .join(production_at, QATestingLog.unit_id == production_at.id)
        .filter(AuditLog.table_name == "qa_testing_logs", production_at.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).limit(100).all()
    )

    return [{
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0] if l.AuditLog.edited_by else "System",
        "email": l.AuditLog.edited_by if l.AuditLog.edited_by else "System",
        "batch": f"Batch: {l.batch_no}" if l.batch_no else f"ID Ref: {l.AuditLog.record_id}",
        "action": l.AuditLog.field_name,
        "details": l.AuditLog.new_value if l.AuditLog.old_value == "NONE" else f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]


# ============================================================
# 🗑️ 4. SECURE DELETE ACTION WITH TRACE AUDIT (POST)
# ============================================================
@router.post("/delete/{expense_id}")
def delete_qa_log(expense_id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    entry = db.query(QATestingLog).join(
        production_at, QATestingLog.unit_id == production_at.id
    ).filter(
        QATestingLog.id == expense_id,
        production_at.company_id == company_code
    ).first()

    if entry:
        try:
            if entry.journal_id:
                cancel_linked_voucher(db, company_code, entry.journal_id, email)
                db.flush()

            db.add(AuditLog(
                table_name="qa_testing_logs", record_id=entry.id, company_id=company_code,
                field_name="DELETE", old_value=f"Batch: {entry.batch_no}", new_value="DELETED",
                edited_by=email, edited_at=dt.datetime.now(dt.timezone.utc)
            ))
            db.delete(entry)
            db.commit()
            return {"success": True, "message": "QA testing charges dropped successfully!"}
        except Exception as e:
            db.rollback()
            return JSONResponse({"success": False, "message": str(e)}, status_code=500)
    
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 📊 5. GLOBAL MASTER EXCEL EXPORT LEDGER (GET)
# ============================================================
@router.get("/export/excel")
def export_qa_excel(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=302)

    history = (
        db.query(QATestingLog, production_at.production_at.label("product"))
        .join(production_at, QATestingLog.unit_id == production_at.id)
        .filter(production_at.company_id == company_code)
        .order_by(QATestingLog.id.desc())
        .all()
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "QA Testing Ledger"
    ws.views.sheetView[0].showGridLines = True

    header_fill = PatternFill(start_color="143465", end_color="143465", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    total_font = Font(name="Arial", size=11, bold=True)
    
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'), right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'), bottom=Side(style='thin', color='CBD5E1')
    )

    headers = ["Sl No", "Batch Number", "Product Description", "Lab Name Facility", "Report Ref", "Grand Total Cost"]
    ws.append(headers)

    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for idx, log in enumerate(history, 1):
        row_data = [
            idx, log.QATestingLog.batch_no, log.product, log.QATestingLog.lab_name,
            log.QATestingLog.report_ref, log.QATestingLog.test_cost
        ]
        ws.append(row_data)
        
        curr_row = ws.max_row
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=curr_row, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
            if col_idx == 6:
                cell.number_format = '#,##0.00'
                cell.alignment = Alignment(horizontal="right")
            elif col_idx in [1, 2, 5]:
                cell.alignment = Alignment(horizontal="center")

    last_row = ws.max_row
    total_row_idx = last_row + 1
    ws.cell(row=total_row_idx, column=1, value="Total Summary").font = total_font
    ws.merge_cells(start_row=total_row_idx, start_column=1, end_row=total_row_idx, end_column=5)
    ws.cell(row=total_row_idx, column=1).alignment = Alignment(horizontal="right")

    ws.cell(row=total_row_idx, column=6, value=f"=SUM(F2:F{last_row})").number_format = '#,##0.00'
    ws.cell(row=total_row_idx, column=6).font = total_font
    ws.cell(row=total_row_idx, column=6).alignment = Alignment(horizontal="right")

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"QA_Testing_Ledger_{ist_now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )