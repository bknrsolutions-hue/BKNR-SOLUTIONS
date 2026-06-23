from app.utils.timezone import ist_now
from fastapi import APIRouter, Request, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from app.database import get_db

import os
import json
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import pandas as pd
import numpy as np
from datetime import datetime
import re

# =====================================================
# 🟢 1. ALL MODELS IMPORTS
# =====================================================
# Users & Company for OTP validation
from app.database.models.users import User, Company

# Processing
from app.database.models.processing import GateEntry, RawMaterialPurchasing, DeHeading, Grading, Peeling, Soaking, Production, AuditLog as ProcessingAuditLog
from app.database.models.reprocess import Reprocess
# Inventory Management
from app.database.models.inventory_management import stock_entry, pending_orders, sales_dispatch, cold_storage_holding, cold_storage
# Bills
from app.database.models.bills import ElectricityLog, DieselLog, PurchaseInvoice, ContainerLog, QATestingLog, OtherExpense
# General Stock
from app.database.models.general_stock import GeneralStock, GeneralStoreItems
# Payments
from app.database.models.payments import (
    CustomerReceivable,
    VendorPayment,
    BankTransaction,
    ExpenseVoucher,
    JournalEntry,
    JournalEntryLine,
    PaymentReceipt,
    BuyerAgingSummary,
    ERPAlertEngine,
)

from app.database.models.enterprise_finance import LedgerMaster
# Masters
from app.database.models.criteria import brands, purposes, production_at, production_for, glazes, grades, varieties, countries, buyers, buyer_agents, packing_styles, production_types, chemicals, contractors, suppliers, peeling_rates, species, purchasing_locations, vehicle_numbers, coldstore_locations, freezers, grade_to_hoso, HOSO_HLSO_Yields, peeling_at, shipping_vendors, vendors, hsn_codes
# HRMS
from app.database.models.attendance import EmployeeRegistration, DailyAttendance, EmployeeIncrement, EmployeeStatutoryMaster, EmployeeSalaryAdvance

router = APIRouter()

# =====================================================
# 🟢 2. GLOBAL DICTIONARY FOR DYNAMIC IMPORT
# =====================================================
ALL_MODELS = {
    "GateEntry": GateEntry, "RawMaterialPurchasing": RawMaterialPurchasing, "DeHeading": DeHeading,
    "Grading": Grading, "Peeling": Peeling, "Soaking": Soaking, "Production": Production, "Reprocess": Reprocess,
    "StockEntry": stock_entry, "PendingOrders": pending_orders, "SalesDispatch": sales_dispatch,
    "ColdStorageHolding": cold_storage_holding, "ColdStorageMaster": cold_storage,
    "PurchaseInvoice": PurchaseInvoice, "ContainerLog": ContainerLog, "ElectricityLog": ElectricityLog,
    "DieselLog": DieselLog, "QATestingLog": QATestingLog, "OtherExpense": OtherExpense,
    "GeneralStock": GeneralStock, "GeneralStoreItems": GeneralStoreItems,
    "CustomerReceivable": CustomerReceivable, "VendorPayment": VendorPayment, "BankTransaction": BankTransaction,
    "ExpenseVoucher": ExpenseVoucher, "JournalEntry": JournalEntry, "LedgerMaster": LedgerMaster,
    "PaymentReceipt": PaymentReceipt, "ERPAlertEngine": ERPAlertEngine,
    "Brands": brands, "Purposes": purposes, "ProductionAt": production_at, "ProductionFor": production_for,
    "Glazes": glazes, "Grades": grades, "Varieties": varieties, "Countries": countries, "Buyers": buyers,
    "BuyerAgents": buyer_agents, "PackingStyles": packing_styles, "ProductionTypes": production_types,
    "Chemicals": chemicals, "Contractors": contractors, "Suppliers": suppliers, "Species": species,
    "HSNCodes": hsn_codes, "EmployeeRegistration": EmployeeRegistration, "DailyAttendance": DailyAttendance,
    "EmployeeIncrement": EmployeeIncrement, "EmployeeStatutoryMaster": EmployeeStatutoryMaster,
    "EmployeeSalaryAdvance": EmployeeSalaryAdvance
}


# =====================================================
# 🟢 3. HISTORY LOGGING HELPER
# =====================================================
HISTORY_LOG_FILE = os.path.join(os.getcwd(), "data_management_history.json")

def log_data_action(comp_code, action_type, module_name, status, message):
    log_entry = {
        "company_code": comp_code,
        "type": action_type,
        "module": module_name,
        "date": ist_now().strftime('%Y-%m-%d %H:%M:%S'),
        "status": status,
        "details": message
    }
    logs = []
    if os.path.exists(HISTORY_LOG_FILE):
        try:
            with open(HISTORY_LOG_FILE, "r") as f:
                logs = json.load(f)
        except: pass
    logs.append(log_entry)
    with open(HISTORY_LOG_FILE, "w") as f:
        json.dump(logs, f, indent=4)


# =====================================================
# 🟢 4. COMMON HELPER FUNCTIONS
# =====================================================
def get_comp_code(request: Request):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Session expired or unauthorized")
    return str(comp_code)

def export_sheet(writer, data, sheet_name):
    if data:
        df = pd.DataFrame([{k: v for k, v in vars(row).items() if k != "_sa_instance_state"} for row in data])
        df.insert(0, "Sl No", range(1, len(df) + 1))
    else:
        df = pd.DataFrame()
    df.to_excel(writer, sheet_name=sheet_name[:31], index=False)

def generate_export_response(comp_code, module_name, export_logic, db):
    export_dir = "exports"
    os.makedirs(export_dir, exist_ok=True)
    filename = f"BKNR_{module_name}_{comp_code}_{ist_now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join(export_dir, filename)

    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        pd.DataFrame({
            "BKNR ERP Export": [f"{module_name} Module Generated Successfully"],
            "Company ID": [comp_code],
            "Timestamp": [ist_now().strftime('%Y-%m-%d %H:%M:%S')]
        }).to_excel(writer, sheet_name="INFO", index=False)
        
        export_logic(writer, db, comp_code)

    return FileResponse(filepath, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# =====================================================
# 🟢 5. OTP SECURITY LOGIC
# =====================================================
OTP_STORE = {}

class OTPRequest(BaseModel):
    action: str
    module: str

class OTPVerify(BaseModel):
    action: str
    otp: str

@router.post("/data-management/generate-otp")
async def generate_otp(payload: OTPRequest, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return {"success": False, "error": "Session Expired"}

    try:
        company = db.query(Company).filter(Company.company_code == comp_code).first()
        if not company: return {"success": False, "error": "Company not found."}

        all_users = db.query(User).filter(User.company_id == company.id).all()
        authorized_emails = []

        for u in all_users:
            perms = u.permissions or ""
            has_attr_access = getattr(u, 'data_management_access', False)
            if u.role == 'admin' or "data_management" in perms or has_attr_access:
                if u.email:
                    authorized_emails.append(u.email)
    except Exception as e:
        print(f"Error fetching users: {e}")
        authorized_emails = []

    if not authorized_emails:
        return {"success": False, "error": f"No authorized data managers found for {comp_code}."}

    otp = str(random.randint(100000, 999999))
    session_id = request.session.get("session_id", comp_code) 
    OTP_STORE[f"{session_id}_{payload.action}"] = otp

    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    SENDER_EMAIL = "bknr.solutions@gmail.com"  
    SENDER_PASSWORD = "aaim dsqz jpbg sosx"          
    sent_count = 0

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        for email_id in authorized_emails:
            try:
                msg = MIMEMultipart()
                msg['From'] = SENDER_EMAIL
                msg['To'] = email_id
                msg['Subject'] = f"🔒 SECURITY GATEWAY: OTP for {payload.action.upper()}"
                body = f"OTP: {otp}\nModule: {payload.module.upper()}\nCompany: {comp_code}"
                msg.attach(MIMEText(body, 'plain'))
                server.send_message(msg)
                sent_count += 1
            except: pass
        server.quit()
    except:
        return {"success": False, "error": "System SMTP failed."}

    return {"success": True, "message": f"OTP sent to {sent_count} admins."}

@router.post("/data-management/verify-otp")
async def verify_otp(payload: OTPVerify, request: Request):
    comp_code = request.session.get("company_code")
    session_id = request.session.get("session_id", comp_code)
    key = f"{session_id}_{payload.action}"
    
    if OTP_STORE.get(key) == payload.otp:
        del OTP_STORE[key]
        return {"success": True, "message": "OTP Verified!"}
    return {"success": False, "error": "Invalid OTP."}


# =====================================================
# 🟢 6. PAGE RENDER & TEMPLATE DOWNLOAD
# =====================================================
@router.get("/data-management", response_class=HTMLResponse)
async def data_management(request: Request, db: Session = Depends(get_db)):
    templates = request.app.state.templates
    return templates.TemplateResponse(
        request=request, 
        name="admin/data_management.html", 
        context={"request": request}
    )
    
@router.get("/data-management/template/master")
async def download_master_template():
    template_dir = "templates_excel"
    os.makedirs(template_dir, exist_ok=True)
    file_path = os.path.join(template_dir, "BKNR_Master_Template.xlsx")
    
    sheets = {
        "GateEntry": ["date","time","email","company_id","production_for","batch_number","challan_number","gate_pass_number","receiving_center","supplier_name","purchasing_location","vehicle_number","no_of_material_boxes","no_of_empty_boxes","no_of_ice_boxes","species"]
    }
    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        for sheet_name, columns in sheets.items():
            pd.DataFrame(columns=columns).to_excel(writer, sheet_name=sheet_name, index=False)
    return FileResponse(file_path, filename="BKNR_Master_Template.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# =====================================================
# 🟢 7. SEGREGATED EXPORT ROUTES (7 MODULES)
# =====================================================
@router.post("/export/processing")
async def export_processing(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        export_sheet(writer, db.query(GateEntry).filter(GateEntry.company_id == cc).all(), "GateEntry")
        export_sheet(writer, db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == cc).all(), "RawMaterial")
        export_sheet(writer, db.query(DeHeading).filter(DeHeading.company_id == cc).all(), "DeHeading")
        export_sheet(writer, db.query(Grading).filter(Grading.company_id == cc).all(), "Grading")
        export_sheet(writer, db.query(Peeling).filter(Peeling.company_id == cc).all(), "Peeling")
        export_sheet(writer, db.query(Soaking).filter(Soaking.company_id == cc).all(), "Soaking")
        export_sheet(writer, db.query(Production).filter(Production.company_id == cc).all(), "Production")
        export_sheet(writer, db.query(Reprocess).filter(Reprocess.company_id == cc).all(), "Reprocess")
        log_data_action(cc, "EXPORT", "Processing Module", "Success", "Exported Processing records")
    return generate_export_response(get_comp_code(request), "Processing", logic, db)

@router.post("/export/inventory")
async def export_inventory(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        export_sheet(writer, db.query(stock_entry).filter(stock_entry.company_id == cc).all(), "StockEntry")
        export_sheet(writer, db.query(pending_orders).filter(pending_orders.company_id == cc).all(), "PendingOrders")
        export_sheet(writer, db.query(sales_dispatch).filter(sales_dispatch.company_id == cc).all(), "SalesDispatch")
        export_sheet(writer, db.query(cold_storage_holding).filter(cold_storage_holding.company_id == cc).all(), "ColdStorageHolding")
        export_sheet(writer, db.query(cold_storage).filter(cold_storage.company_id == cc).all(), "ColdStorageMaster")
        log_data_action(cc, "EXPORT", "Inventory Module", "Success", "Exported Inventory records")
    return generate_export_response(get_comp_code(request), "Inventory", logic, db)

@router.post("/export/bills")
async def export_bills(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        export_sheet(writer, db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == cc).all(), "PurchaseInvoice")
        export_sheet(writer, db.query(ContainerLog).filter(ContainerLog.company_id == cc).all(), "ContainerLog")
        export_sheet(writer, db.query(ElectricityLog).all(), "ElectricityLog") 
        export_sheet(writer, db.query(DieselLog).all(), "DieselLog") 
        export_sheet(writer, db.query(QATestingLog).all(), "QATestingLog") 
        export_sheet(writer, db.query(OtherExpense).all(), "OtherExpense")
        log_data_action(cc, "EXPORT", "Bills Module", "Success", "Exported Commercial Bills")
    return generate_export_response(get_comp_code(request), "Bills", logic, db)

@router.post("/export/general-stock")
async def export_general_stock(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        # 🌟 FIX: Removed extract_company_id, using 'cc' directly
        export_sheet(writer, db.query(GeneralStock).filter(GeneralStock.company_id == cc).all(), "GeneralStock")
        export_sheet(writer, db.query(GeneralStoreItems).filter(GeneralStoreItems.company_id == cc).all(), "GeneralStoreItems")
        log_data_action(cc, "EXPORT", "General Stock Module", "Success", "Exported General Stock records")
    return generate_export_response(get_comp_code(request), "GeneralStock", logic, db)

@router.post("/export/payments")
async def export_payments(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        export_sheet(writer, db.query(CustomerReceivable).filter(CustomerReceivable.company_id == cc).all(), "CustomerReceivable")
        export_sheet(writer, db.query(VendorPayment).filter(VendorPayment.company_id == cc).all(), "VendorPayment")
        export_sheet(writer, db.query(BankTransaction).filter(BankTransaction.company_id == cc).all(), "BankTransaction")
        export_sheet(writer, db.query(ExpenseVoucher).filter(ExpenseVoucher.company_id == cc).all(), "ExpenseVoucher")
        export_sheet(writer, db.query(JournalEntry).filter(JournalEntry.company_id == cc).all(), "JournalEntry")
        export_sheet(writer, db.query(LedgerMaster).filter(LedgerMaster.company_id == cc).all(), "LedgerMaster")
        export_sheet(writer, db.query(PaymentReceipt).filter(PaymentReceipt.company_id == cc).all(), "PaymentReceipt")
        export_sheet(writer, db.query(ERPAlertEngine).filter(ERPAlertEngine.company_id == cc).all(), "ERPAlertEngine")
        log_data_action(cc, "EXPORT", "Finance/Payments Module", "Success", "Exported Financial records")
    return generate_export_response(get_comp_code(request), "Payments", logic, db)

@router.post("/export/masters")
async def export_masters(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        export_sheet(writer, db.query(brands).filter(brands.company_id == cc).all(), "Brands")
        export_sheet(writer, db.query(purposes).filter(purposes.company_id == cc).all(), "Purposes")
        export_sheet(writer, db.query(glazes).filter(glazes.company_id == cc).all(), "Glazes")
        export_sheet(writer, db.query(grades).filter(grades.company_id == cc).all(), "Grades")
        export_sheet(writer, db.query(varieties).filter(varieties.company_id == cc).all(), "Varieties")
        export_sheet(writer, db.query(countries).filter(countries.company_id == cc).all(), "Countries")
        export_sheet(writer, db.query(buyers).filter(buyers.company_id == cc).all(), "Buyers")
        export_sheet(writer, db.query(contractors).filter(contractors.company_id == cc).all(), "Contractors")
        export_sheet(writer, db.query(suppliers).filter(suppliers.company_id == cc).all(), "Suppliers")
        export_sheet(writer, db.query(species).filter(species.company_id == cc).all(), "Species")
        export_sheet(writer, db.query(hsn_codes).filter(hsn_codes.company_id == cc).all(), "HSNCodes")
        log_data_action(cc, "EXPORT", "Masters Module", "Success", "Exported System Masters")
    return generate_export_response(get_comp_code(request), "Masters", logic, db)

@router.post("/export/hrms")
async def export_hrms(request: Request, db: Session = Depends(get_db)):
    def logic(writer, db, cc):
        export_sheet(writer, db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == cc).all(), "EmployeeReg")
        export_sheet(writer, db.query(DailyAttendance).all(), "DailyAttendance")
        export_sheet(writer, db.query(EmployeeIncrement).all(), "EmployeeIncrement")
        export_sheet(writer, db.query(EmployeeStatutoryMaster).filter(EmployeeStatutoryMaster.company_id == cc).all(), "StatutoryMaster")
        export_sheet(writer, db.query(EmployeeSalaryAdvance).filter(EmployeeSalaryAdvance.company_id == cc).all(), "SalaryAdvance")
        log_data_action(cc, "EXPORT", "HRMS Module", "Success", "Exported HRMS records")
    return generate_export_response(get_comp_code(request), "HRMS", logic, db)


# =====================================================
# 🟢 8. DYNAMIC MAPPING IMPORT LOGIC
# =====================================================
class ImportMappingPayload(BaseModel):
    filename: str
    table_name: str
    sheet_name: str
    mapping: dict

class ClearTablePayload(BaseModel):
    table_name: str

@router.get("/data-management/db-schema")
async def get_db_schema():
    schema = {}
    for table_name, model in ALL_MODELS.items():
        columns = [c.name for c in model.__table__.columns if c.name != 'id']
        schema[table_name] = columns
    return {"success": True, "tables": schema}

@router.post("/data-management/inspect-file")
async def inspect_excel_file(excel_file: UploadFile = File(...)):
    try:
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"import_temp_{ist_now().strftime('%Y%m%d%H%M%S')}_{excel_file.filename}"
        filepath = os.path.join(upload_dir, filename)

        with open(filepath, "wb") as buffer:
            buffer.write(await excel_file.read())

        xl = pd.ExcelFile(filepath)
        sheet_data = {}
        for sheet in xl.sheet_names:
            df = xl.parse(sheet, nrows=0) 
            sheet_data[sheet] = df.columns.tolist()

        return {"success": True, "filename": filename, "sheets": sheet_data}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/data-management/execute-import")
async def execute_dynamic_import(payload: ImportMappingPayload, request: Request, db: Session = Depends(get_db)):
    comp_code = get_comp_code(request)
    filepath = os.path.join("uploads", payload.filename)

    if not os.path.exists(filepath):
        return {"success": False, "error": "File expired or not found. Please re-upload."}

    try:
        ModelClass = ALL_MODELS.get(payload.table_name)
        if not ModelClass:
            return {"success": False, "error": "Invalid database table selected."}

        df = pd.read_excel(filepath, sheet_name=payload.sheet_name)
        df = df.where(pd.notnull(df), None)

        records_to_insert = []
        for index, row in df.iterrows():
            record_data = {}
            for db_col, excel_col in payload.mapping.items():
                if excel_col and excel_col in df.columns:
                    val = row[excel_col]
                    record_data[db_col] = val

            if hasattr(ModelClass, "company_id") and "company_id" not in record_data:
                # 🌟 FIX: Directly assign VNBK2162 to company_id
                record_data["company_id"] = comp_code

            records_to_insert.append(ModelClass(**record_data))

        db.add_all(records_to_insert)
        db.commit()

        if os.path.exists(filepath):
            os.remove(filepath)

        msg = f"Successfully dynamically mapped and imported {len(records_to_insert)} records."
        log_data_action(comp_code, "IMPORT", payload.table_name, "Success", msg)

        return {"success": True, "rows_imported": len(records_to_insert), "table": payload.table_name}
    except Exception as e:
        db.rollback()
        log_data_action(comp_code, "IMPORT", payload.table_name, "Failed", str(e))
        return {"success": False, "error": str(e)}


# =====================================================
# 🟢 9. UNDO & CLEAR TABLE (EMERGENCY CLEANUP)
# =====================================================
@router.post("/data-management/undo-import")
async def undo_last_import(payload: ClearTablePayload, request: Request, db: Session = Depends(get_db)):
    comp_code = get_comp_code(request)
    ModelClass = ALL_MODELS.get(payload.table_name)
    if not ModelClass:
        return {"success": False, "error": "Invalid database table selected."}

    logs = []
    if os.path.exists(HISTORY_LOG_FILE):
        try:
            with open(HISTORY_LOG_FILE, "r") as f:
                logs = json.load(f)
        except Exception:
            pass

    import_logs = [
        l for l in logs 
        if l.get("company_code") == comp_code 
        and l.get("type") == "IMPORT" 
        and l.get("module") == payload.table_name 
        and l.get("status") == "Success"
    ]

    if not import_logs:
        return {"success": False, "error": "No recent successful import found in history to undo."}

    last_import = import_logs[-1] 
    details = last_import.get("details", "")

    # Regex to find number in "imported X records"
    match = re.search(r'imported (\d+) records', details.lower())
    if not match:
        return {"success": False, "error": "Could not determine how many rows to delete from history log."}
    
    rows_to_delete = int(match.group(1))
    if rows_to_delete <= 0:
        return {"success": False, "error": "Zero rows were imported in the last session."}

    try:
        query = db.query(ModelClass.id)
        db_columns = [c.name for c in ModelClass.__table__.columns]
        
        # 🌟 FIX: Directly use VNBK2162 (comp_code) string for safe match
        if "company_id" in db_columns:
            query = query.filter(ModelClass.company_id == comp_code)
        
        top_ids = query.order_by(ModelClass.id.desc()).limit(rows_to_delete).all()
        ids_to_delete = [row[0] for row in top_ids]
        
        if not ids_to_delete:
            return {"success": False, "error": "No database records found to delete."}

        deleted_count = db.query(ModelClass).filter(ModelClass.id.in_(ids_to_delete)).delete(synchronize_session=False)
        db.commit()

        msg = f"Reverted last import. Deleted {deleted_count} records."
        log_data_action(comp_code, "UNDO IMPORT", payload.table_name, "Success", msg)

        return {"success": True, "rows_deleted": deleted_count, "table": payload.table_name}

    except Exception as e:
        db.rollback()
        log_data_action(comp_code, "UNDO IMPORT", payload.table_name, "Failed", str(e))
        return {"success": False, "error": str(e)}

@router.post("/data-management/clear-table")
async def clear_table_data(payload: ClearTablePayload, request: Request, db: Session = Depends(get_db)):
    comp_code = get_comp_code(request)
    ModelClass = ALL_MODELS.get(payload.table_name)

    if not ModelClass:
        return {"success": False, "error": "Invalid database table selected."}

    try:
        db_columns = [c.name for c in ModelClass.__table__.columns]
        query = db.query(ModelClass)

        # 🌟 FIX: Directly use VNBK2162 (comp_code) string for safe match
        if "company_id" in db_columns:
            query = query.filter(ModelClass.company_id == comp_code)
        else:
            return {"success": False, "error": "Action denied. Cannot bulk delete global shared tables."}

        deleted_count = query.delete(synchronize_session=False)
        db.commit()

        msg = f"Permanently deleted all {deleted_count} records from table."
        log_data_action(comp_code, "CLEAR", payload.table_name, "Success", msg)

        return {"success": True, "rows_deleted": deleted_count, "table": payload.table_name}

    except Exception as e:
        db.rollback()
        log_data_action(comp_code, "CLEAR", payload.table_name, "Failed", str(e))
        return {"success": False, "error": str(e)}


@router.get("/data-management/history")
async def import_history(request: Request):
    comp_code = request.session.get("company_code")
    logs = []
    if os.path.exists(HISTORY_LOG_FILE):
        try:
            with open(HISTORY_LOG_FILE, "r") as f:
                all_logs = json.load(f)
                logs = [l for l in all_logs if l.get("company_code") == comp_code]
        except Exception as e:
            pass
            
    logs.reverse() 
    return {"success": True, "history": logs}