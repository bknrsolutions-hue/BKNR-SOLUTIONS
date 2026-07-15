from app.utils.timezone import ist_now
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
import json

from app.database import get_db
from app.database.models.users import User, Company, OTPTable
from app.security.password_handler import hash_password
from app.routers.auth import get_ist_time, professional_email_html, send_email, send_security_email

# ==========================================================
# CONFIG & INITIALIZATION PARAMETERS
# ==========================================================
router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")

SESSION_EXPIRY_MIN = 30  # ⏱️ 30 min session timeout trace limit
SCREEN_POPUP_SETTING_KEY = "screen_popup_broadcast"
SUPER_ADMIN_EMAIL = "bknr.solutions@gmail.com"

SCREEN_POPUP_FORMS = [
    {"group": "Dashboards", "label": "Processing Dashboard", "route": "/dashboard/processing_dashboard"},
    {"group": "Dashboards", "label": "Inventory Dashboard", "route": "/dashboard/inventory_dashboard"},
    {"group": "Dashboards", "label": "HR & Staff Dashboard", "route": "/dashboard/hr_command_center"},
    {"group": "Dashboards", "label": "Export Documents Dashboard", "route": "/export_documents/dashboard"},
    {"group": "Dashboards", "label": "Costing & Finance Dashboard", "route": "/dashboard/costing_dashboard"},
    {"group": "Dashboards", "label": "Finance Dashboard", "route": "/dashboard/finance_dashboard"},
    {"group": "Dashboards", "label": "Tally Dashboard", "route": "/finance_accounts/tally_dashboard"},
    {"group": "Processing", "label": "Gate Entry", "route": "/processing/gate_entry"},
    {"group": "Processing", "label": "RM Purchasing", "route": "/processing/raw_material_purchasing"},
    {"group": "Processing", "label": "De-Heading", "route": "/processing/de_heading"},
    {"group": "Processing", "label": "Grading", "route": "/processing/grading"},
    {"group": "Processing", "label": "Peeling", "route": "/processing/peeling"},
    {"group": "Processing", "label": "Soaking", "route": "/processing/soaking"},
    {"group": "Processing", "label": "Production", "route": "/processing/production"},
    {"group": "Inventory", "label": "Stock Entry", "route": "/inventory/stock_entry"},
    {"group": "Inventory", "label": "Pending Orders", "route": "/inventory/pending_orders"},
    {"group": "Inventory", "label": "Cold Storage Holding", "route": "/inventory/cold_storage_holding"},
    {"group": "Inventory", "label": "General Store Entry", "route": "/general_stock/entry"},
    {"group": "Export Documents", "label": "Proforma Invoices", "route": "/export_documents/proforma_invoice/entry"},
    {"group": "Export Documents", "label": "Export Shipments", "route": "/export_documents/export_shipment/entry"},
    {"group": "Export Documents", "label": "Commercial Invoices", "route": "/export_documents/commercial_invoice/entry"},
    {"group": "Export Documents", "label": "Packing Lists", "route": "/export_documents/packing_list/entry"},
    {"group": "Export Documents", "label": "Container Stuffing", "route": "/export_documents/container_stuffing/entry"},
    {"group": "Export Documents", "label": "Shipping Bills", "route": "/export_documents/shipping_bill/entry"},
    {"group": "Export Documents", "label": "Bills of Lading", "route": "/export_documents/bill_of_lading/entry"},
    {"group": "Export Documents", "label": "Health Certificates", "route": "/export_documents/health_certificate/entry"},
    {"group": "Export Documents", "label": "Document Entry Forms", "route": "/export_documents/requirement-pages/entry"},
    {"group": "Export Documents", "label": "Supporting Documents", "route": "/export_documents/supporting_documents/entry"},
    {"group": "Finance Bills", "label": "Electricity Bills", "route": "/api/electricity/entry"},
    {"group": "Finance Bills", "label": "Diesel Consumption", "route": "/api/diesel/entry"},
    {"group": "Finance Bills", "label": "Purchase & Packaging", "route": "/api/purchase/entry"},
    {"group": "Finance Bills", "label": "Logistics & Freight", "route": "/api/container/entry"},
    {"group": "Finance Bills", "label": "Contractor Bills", "route": "/api/contractor_bills/entry"},
    {"group": "Finance Bills", "label": "Salaries", "route": "/api/salaries/entry"},
    {"group": "Finance Bills", "label": "Vendor Bills", "route": "/api/vendor_bills/entry"},
    {"group": "Finance Bills", "label": "Supplier Bills", "route": "/api/supplier_bills/entry"},
    {"group": "Finance Bills", "label": "Payment Logs", "route": "/api/payment_logs/entry"},
    {"group": "Finance Bills", "label": "QA Testing Charges", "route": "/api/qa/entry"},
    {"group": "Finance Bills", "label": "Other Expenses", "route": "/api/expenses/entry"},
    {"group": "Finance & Accounts", "label": "Ledger Master", "route": "/finance_accounts/ledger_master/entry"},
    {"group": "Finance & Accounts", "label": "Journal Entries", "route": "/finance_accounts/journal_entry/entry"},
    {"group": "Finance & Accounts", "label": "Bank Master", "route": "/finance_accounts/bank_master/entry"},
    {"group": "Finance & Accounts", "label": "Item Accounting Link", "route": "/finance_accounts/item_accounting_link/entry"},
    {"group": "Finance & Accounts", "label": "Fixed Assets", "route": "/finance_accounts/fixed_assets/entry"},
    {"group": "Finance & Accounts", "label": "GST Register", "route": "/finance_accounts/gst_register/entry"},
    {"group": "Finance & Accounts", "label": "Bank Transactions", "route": "/finance_accounts/bank_transaction/entry"},
    {"group": "Finance & Accounts", "label": "Payment Receipts", "route": "/finance_accounts/payment_receipt/entry"},
    {"group": "Finance & Accounts", "label": "Customer Receivables", "route": "/finance_accounts/customer_receivable/entry"},
    {"group": "Finance & Accounts", "label": "Vendor Payments", "route": "/finance_accounts/vendor_payment/entry"},
    {"group": "Finance & Accounts", "label": "Expense Vouchers", "route": "/finance_accounts/expense_voucher/entry"},
    {"group": "Finance & Accounts", "label": "Export Incentives", "route": "/finance_accounts/export_incentive_register/entry"},
    {"group": "Finance & Accounts", "label": "LC Tracking", "route": "/finance_accounts/lc_tracking/entry"},
    {"group": "Finance & Accounts", "label": "Salary Processing", "route": "/finance_accounts/salary_processing/entry"},
    {"group": "Finance & Accounts", "label": "Production Cost Allocation", "route": "/finance_accounts/production_cost_allocation/entry"},
    {"group": "Reports", "label": "Gate Entry Report", "route": "/reports/gate_entry"},
    {"group": "Reports", "label": "RM Purchase Report", "route": "/reports/raw_material_purchasing"},
    {"group": "Reports", "label": "De-Heading Report", "route": "/reports/de_heading"},
    {"group": "Reports", "label": "Grading Report", "route": "/reports/grading_report"},
    {"group": "Reports", "label": "Peeling Report", "route": "/reports/peeling_report"},
    {"group": "Reports", "label": "Soaking Report", "route": "/reports/soaking_report"},
    {"group": "Reports", "label": "Production Report", "route": "/reports/production_report"},
    {"group": "Reports", "label": "Re-Process Report", "route": "/reports/re-process"},
    {"group": "Reports", "label": "Floor Balance Report", "route": "/reports/floor_balance_report"},
    {"group": "Reports", "label": "Stock Status Report", "route": "/inventory/stock_report"},
    {"group": "Reports", "label": "Pending Orders Report", "route": "/reports/pending_orders_report"},
    {"group": "Reports", "label": "Sales Report", "route": "/inventory/sales_report"},
    {"group": "Reports", "label": "General Store Report", "route": "/general_stock/report"},
    {"group": "Reports", "label": "Cold Storage Report", "route": "/inventory/cold_storage_holding_report"},
    {"group": "Reports", "label": "Storage & Cost Report", "route": "/reports/storage_cost_report"},
    {"group": "Reports", "label": "Floor Balance Value", "route": "/summary/floor_balance_value"},
    {"group": "Reports", "label": "Inventory Costing", "route": "/summary/inventory_costing"},
    {"group": "Reports", "label": "Periodic Summary", "route": "/summary/periodic-report"},
    {"group": "Reports", "label": "Batch Summary", "route": "/summary/processing"},
    {"group": "HRMS", "label": "Staff Registration", "route": "/attendance/employee/register"},
    {"group": "HRMS", "label": "Increment Details", "route": "/attendance/employee-increment"},
    {"group": "HRMS", "label": "Daily Attendance", "route": "/attendance/daily"},
    {"group": "HRMS", "label": "Monthly Salary Sheet", "route": "/attendance/salary/monthly-sheet"},
    {"group": "HRMS", "label": "Payroll Master", "route": "/attendance/tax-master"},
    {"group": "HRMS", "label": "Salary Advance", "route": "/attendance/salary-advance"},
    {"group": "Masters", "label": "Buyers", "route": "/criteria/buyers"},
    {"group": "Masters", "label": "Buyer Agents", "route": "/criteria/buyer_agents"},
    {"group": "Masters", "label": "Suppliers", "route": "/criteria/suppliers"},
    {"group": "Masters", "label": "Vendors", "route": "/criteria/vendors"},
    {"group": "Masters", "label": "Countries", "route": "/criteria/countries"},
    {"group": "Masters", "label": "Brands", "route": "/criteria/brands"},
    {"group": "Masters", "label": "Species", "route": "/criteria/species"},
    {"group": "Masters", "label": "Varieties", "route": "/criteria/varieties"},
    {"group": "Masters", "label": "Grades", "route": "/criteria/grades"},
    {"group": "Masters", "label": "Freezers", "route": "/criteria/freezers"},
    {"group": "Masters", "label": "Glazes", "route": "/criteria/glazes"},
    {"group": "Masters", "label": "Packing Styles", "route": "/criteria/packing_styles"},
    {"group": "Masters", "label": "Contractors", "route": "/criteria/contractors"},
    {"group": "Masters", "label": "Peeling At", "route": "/criteria/peeling_at"},
    {"group": "Masters", "label": "Peeling Rates", "route": "/criteria/peeling_rates"},
    {"group": "Masters", "label": "Production At", "route": "/criteria/production_at"},
    {"group": "Masters", "label": "Production For", "route": "/criteria/production_for"},
    {"group": "Masters", "label": "Production Types", "route": "/criteria/production_types"},
    {"group": "Masters", "label": "Chemicals", "route": "/criteria/chemicals"},
    {"group": "Masters", "label": "Purposes", "route": "/criteria/purposes"},
    {"group": "Masters", "label": "Grade to HOSO", "route": "/criteria/grade_to_hoso"},
    {"group": "Masters", "label": "HOSO & HLSO", "route": "/criteria/hoso_hlso"},
    {"group": "Masters", "label": "Cold Storage Master", "route": "/inventory/cold_storage"},
    {"group": "Masters", "label": "Coldstore Locations", "route": "/criteria/coldstore_locations"},
    {"group": "Masters", "label": "Vehicle Numbers", "route": "/criteria/vehicle_numbers"},
    {"group": "Masters", "label": "HSN Codes", "route": "/criteria/hsn_codes"},
    {"group": "Masters", "label": "General Store Items", "route": "/general_stock/items"},
]


# ==========================================================
# 🛡️ ANTI-CACHE HEADERS SECURITY LAYER INTERACTION HELPER
# ==========================================================
def apply_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def get_screen_popup_settings(db: Session):
    from app.database.models.system_settings import SystemSetting

    default_config = {
        "enabled": False,
        "message": "",
        "routes": [],
        "updated_at": "",
        "updated_by": "",
    }
    row = db.query(SystemSetting).filter(SystemSetting.key == SCREEN_POPUP_SETTING_KEY).first()
    if not row or not row.value:
        return default_config
    try:
        data = json.loads(row.value)
    except (TypeError, ValueError):
        return default_config
    return {
        **default_config,
        "enabled": bool(data.get("enabled")),
        "message": str(data.get("message") or ""),
        "routes": [str(route) for route in data.get("routes", []) if str(route).startswith("/")],
        "updated_at": str(data.get("updated_at") or ""),
        "updated_by": str(data.get("updated_by") or row.updated_by or ""),
    }


def save_screen_popup_settings(db: Session, config: dict, actor: str):
    from app.database.models.system_settings import SystemSetting

    row = db.query(SystemSetting).filter(SystemSetting.key == SCREEN_POPUP_SETTING_KEY).first()
    value = json.dumps(config, ensure_ascii=True)
    if row:
        row.value = value
        row.updated_by = actor
    else:
        db.add(SystemSetting(key=SCREEN_POPUP_SETTING_KEY, value=value, updated_by=actor))
    db.commit()


# ==========================================================
# 🔒 STRICT SYSTEM ACCESS PERMISSION VERIFICATION LAYER
# ==========================================================
def check_dashboard_access(request: Request):
    """
    Strict security dependency layer structure verifying active session bounds, 
    multi-company isolation matrices alignment constraints, and dashboard permissions validation rules map.
    """
    session_data = request.session
    if not session_data or "last_activity" not in session_data:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session layout template profile mapping error or expired token context.")

    # Validation rules mapping check loop execution timestamps definitions
    last_activity_str = session_data.get("last_activity")
    try:
        from zoneinfo import ZoneInfo
        try:
            # Support float timestamps stored by login routes
            val = float(last_activity_str)
            last_activity = datetime.fromtimestamp(val, ZoneInfo("Asia/Kolkata"))
        except (ValueError, TypeError):
            last_activity = datetime.fromisoformat(last_activity_str)
    except Exception:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session verification metadata encryption mismatch sequence detected.")

    # 30 min session timeout verification structure bounds check allocation
    if ist_now() > last_activity + timedelta(minutes=SESSION_EXPIRY_MIN):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Inactivity runtime window verification threshold trace execution timeout breach.")

    # Update session activity sliding rules threshold window trace setup parameters
    request.session["last_activity"] = ist_now().isoformat()

    # Core permission data array layout matrix verification matching block
    user_role = session_data.get("role")
    permissions_str = session_data.get("permissions", "")

    # Clean character string splitting layout trace array variables mapping logic check values
    allowed_routes = [p.strip() for p in permissions_str.split(",") if p.strip()]

    # Global master administrator bypass rule settings check blocks execution
    if user_role == "admin" or "ALL" in allowed_routes:
        return session_data

    # Match active dashboard operational context identifier validation rules engine arrays
    if "dashboard" not in allowed_routes and "Dashboard" not in allowed_routes:
        raise HTTPException(status_code=403, detail="Access Authorization Exception: Account credentials do not possess target dashboard access privileges mapping specifications.")

    return session_data


# ==========================================================
# PAGE VIEW – USER MANAGEMENT ENGINE (ADD/EDIT IN ONE PAGE)
# ==========================================================
@router.get("/add_user", response_class=HTMLResponse)
def add_user_page(request: Request, db: Session = Depends(get_db)):
    logged_email = request.session.get("email")
    company_code = request.session.get("company_code")   # example: BKNR5647
    logged_role = request.session.get("role")

    if not logged_email or not company_code:
        return RedirectResponse("/", status_code=302)

    if logged_role != "admin":
        return RedirectResponse("/home?msg=Access Denied", status_code=302)

    # Company Wise Data Filter configuration boundary schema mapping
    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    if not company:
        return RedirectResponse("/", status_code=302)

    # Strictly fetch rows filtered inside multi-company structural domain scope
    users = (
        db.query(User)
        .filter(User.company_id == company.id)
        .order_by(User.id.desc())
        .all()
    )

    response = templates.TemplateResponse(
        request=request, 
        name="admin/add_user.html", 
        context={"existing_users": users, "company_code": company_code}
    )
    return apply_no_cache_headers(response)


# ==========================================================
# SAVE USER (CREATE ACTION)
# ==========================================================
@router.post("/add_user")
def save_user(
    request: Request,
    full_name: str = Form(...),
    designation: str = Form(...),
    email: str = Form(...),
    mobile: str = Form(...),
    password: str = Form("123456"),
    role: str = Form("user"),
    access: list[str] = Form([]),
    data_management_access: str = Form(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    logged_role = request.session.get("role")
    if not company_code or logged_role != "admin":
        return RedirectResponse("/", status_code=302)

    # Company wise multi-tenant schema isolation validation checks mapping logic block execution sequences
    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Unique parameters verification strictly mapped bounded to target tenant ecosystem identity boundary
    if db.query(User).filter(User.email == email, User.company_id == company.id).first():
        return RedirectResponse("/admin/add_user?msg=Email Exists", status_code=302)

    if db.query(User).filter(User.mobile == mobile, User.company_id == company.id).first():
        return RedirectResponse("/admin/add_user?msg=Mobile Exists", status_code=302)

    permissions_csv = ",".join(access)

    new_user = User(
        company_id=company.id,
        name=full_name,
        designation=designation,
        email=email,
        mobile=mobile,
        password=hash_password(password if password else "123456"),
        role=role,
        permissions=permissions_csv,
        data_management_access=(data_management_access == "true"),
        is_verified=False,
        is_active=True,
        created_at=ist_now()
    )

    db.add(new_user)
    db.commit()

    # Generate OTP for email verification
    otp = str(random.randint(1000, 9999))
    db.query(OTPTable).filter(OTPTable.email == email).delete()
    db.add(OTPTable(
        email=email,
        otp=otp,
        extra=json.dumps({"company_code": company.company_code}),
        is_used=False,
        created_at=get_ist_time()
    ))
    db.commit()
    
    # Send email with credentials and OTP
    subject = "SVBK – Account Verification Required"
    body_html = professional_email_html(
        title=f"Welcome to SVBK, {full_name}",
        intro=f"An administrator has created your profile under {company.company_name}. Please use the details below to sign in and verify your email.",
        content_html=f"""
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;margin-bottom:18px;">
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;width:36%;">Company ID</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;font-weight:700;">{company.company_code}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Email</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{email}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Temporary Password</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{password if password else '123456'}</td></tr>
          </table>
          <div style="padding:18px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Verification Code</div>
            <div style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:6px;margin-top:6px;">{otp}</div>
          </div>
        """,
        note="Please change your password after your first successful login."
    )
    send_security_email(email, subject, body_html, otp, "new user verification OTP")

    response = RedirectResponse("/admin/add_user?msg=User Saved. Verification email sent.", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# COMMIT MODIFY USER (EDIT ACTION MATCHED WITH FRONTEND)
# ==========================================================
@router.post("/edit_user/{uid}")
def edit_user(
    uid: int, 
    request: Request,
    full_name: str = Form(...),
    designation: str = Form(...),
    email: str = Form(...),
    mobile: str = Form(...),
    password: str = Form(None), # Optional field in frontend UI
    role: str = Form(...),
    access: list[str] = Form([]),
    data_management_access: str = Form(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    logged_role = request.session.get("role")
    if not company_code or logged_role != "admin":
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Find target profile and isolate boundary inside target client tenant scope
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    # Cross-validation validation to avoid email overlapping duplicates
    email_check = db.query(User).filter(
        User.email == email, 
        User.company_id == company.id,
        User.id != uid
    ).first()
    if email_check:
        return RedirectResponse("/admin/add_user?msg=Email Already Assigned", status_code=302)

    # Cross-validation validation to avoid mobile overlapping duplicates
    mobile_check = db.query(User).filter(
        User.mobile == mobile, 
        User.company_id == company.id,
        User.id != uid
    ).first()
    if mobile_check:
        return RedirectResponse("/admin/add_user?msg=Mobile Already Assigned", status_code=302)

    # Bind request stream objects to data structures
    user.name = full_name
    user.designation = designation
    user.email = email
    user.mobile = mobile
    user.role = role
    user.permissions = ",".join(access)
    user.data_management_access = (data_management_access == "true")

    # If the operator specified a new pass string, inject security layer overhead
    if password and password.strip() != "":
        user.password = hash_password(password.strip())

    db.commit()
    response = RedirectResponse("/admin/add_user?msg=Updated Successfully", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# DISABLE DELETE AND TOGGLE USER ACTIVE STATE
# ==========================================================
@router.post("/delete_user/{uid}")
def delete_user(uid: int, request: Request):
    return RedirectResponse("/admin/add_user?msg=Deletion is disabled. Use active/inactive toggle.", status_code=302)

@router.post("/toggle_user/{uid}")
def toggle_user(uid: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    logged_role = request.session.get("role")
    if not company_code or logged_role != "admin":
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Find user profile inside target company scope
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    user.is_active = not getattr(user, "is_active", True)
    db.commit()

    status_str = "Activated" if user.is_active else "Deactivated"
    if user.is_active:
        activated_at = ist_now().strftime("%d-%m-%Y %I:%M %p IST")
        try:
            send_email(
                user.email,
                "SVBK - User Access Activated",
                professional_email_html(
                    title="Your SVBK access is active",
                    intro=f"Your user profile under {company.company_name} has been activated by your administrator.",
                    content_html=f"""
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;margin-top:14px;">
                        <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;width:36%;">Company ID</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;font-weight:700;">{company.company_code}</td></tr>
                        <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Email</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{user.email}</td></tr>
                      </table>
                      <p style="margin:14px 0 0;color:#475569;font-size:14px;line-height:1.6;"><strong>Activated At:</strong> {activated_at}</p>
                      <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;">You can now log in and continue your assigned ERP work.</p>
                    """,
                    note="If you did not expect this activation, please contact your company administrator."
                )
            )
        except Exception as e:
            print(f"USER ACTIVATION EMAIL ERROR: {e}")

    response = RedirectResponse(f"/admin/add_user?msg=User {status_str} Successfully", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# 📊 🛡️ SECURE PROTECTED DASHBOARD SUITE ENFORCEMENT ROUTE EXAMPLES
# ==========================================================
@router.get("/dashboard-analytics", response_class=HTMLResponse)
def dashboard_analytics_view(request: Request, current_session: dict = Depends(check_dashboard_access), db: Session = Depends(get_db)):
    """
    Example metric endpoint layout binding protecting secure data fields metrics calculations maps layer logic engine.
    """
    company_id = current_session.get("company_id")
    
    # Prathi dashboard backend core queries matrix code component lo query level constraint dynamic rules explicitly inject cheyyali
    # users_count = db.query(User).filter(User.company_id == company_id).count()
    
    response = templates.TemplateResponse(
        request=request,
        name="admin/dashboard_analytics.html",
        context={"company_code": current_session.get("company_code")}
    )
    return apply_no_cache_headers(response)


@router.get("/system_settings", response_class=HTMLResponse)
def system_settings_view(
    request: Request, 
    current_session: dict = Depends(check_dashboard_access), 
    db: Session = Depends(get_db)
):
    logged_email = request.session.get("email")
    if logged_email != "bknr.solutions@gmail.com":
        return RedirectResponse("/home?msg=Access Denied", status_code=302)

    from app.services.maintenance import get_maintenance_level, get_maintenance_message
    from app.services.deployment import get_lock_status, get_audit_log
    from app.database.models.feature_flags import FeatureFlag, TenantFeatureAccess

    m_level = get_maintenance_level(db)
    m_msg = get_maintenance_message(db)
    lock_state = get_lock_status(db)
    audit_logs = get_audit_log(db, limit=20)
    
    # Feature Flags
    flags = db.query(FeatureFlag).all()
    tenant_overrides = db.query(TenantFeatureAccess).all()
    screen_popup_settings = get_screen_popup_settings(db)

    response = templates.TemplateResponse(
        request=request,
        name="admin/system_settings.html",
        context={
            "request": request,
            "company_code": current_session.get("company_code"),
            "maintenance_level": m_level,
            "maintenance_message": m_msg,
            "lock_status": lock_state,
            "audit_logs": audit_logs,
            "feature_flags": flags,
            "tenant_overrides": tenant_overrides,
            "screen_popup_forms": SCREEN_POPUP_FORMS,
            "screen_popup_settings": screen_popup_settings,
        }
    )
    return apply_no_cache_headers(response)


@router.post("/screen-popup-settings")
async def update_screen_popup_settings(
    request: Request,
    current_session: dict = Depends(check_dashboard_access),
    db: Session = Depends(get_db),
):
    logged_email = request.session.get("email")
    if logged_email != SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Super Admin access required")

    payload = await request.json()
    message = str(payload.get("message") or "").strip()
    requested_routes = payload.get("routes") or []
    enabled = bool(payload.get("enabled", True))

    allowed_routes = {item["route"] for item in SCREEN_POPUP_FORMS}
    routes = []
    for route in requested_routes:
        route = str(route).strip()
        if route in allowed_routes and route not in routes:
            routes.append(route)

    if enabled and (not message or not routes):
        raise HTTPException(status_code=400, detail="Please select at least one form and enter a popup message.")

    config = {
        "enabled": enabled and bool(message) and bool(routes),
        "message": message,
        "routes": routes,
        "updated_at": ist_now().isoformat(),
        "updated_by": logged_email,
    }
    save_screen_popup_settings(db, config, logged_email)
    return JSONResponse({"success": True, "config": config})
