from app.utils.timezone import ist_now
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
import random
import json
import re

from app.database import get_db
from app.database.models.users import User, Company, OTPTable
from app.security.password_handler import hash_password
from app.routers.auth import get_ist_time, professional_email_html, send_email, send_security_email
from app.utils.access_control import has_permission, normalize_permission

# ==========================================================
# CONFIG & INITIALIZATION PARAMETERS
# ==========================================================
router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")

SESSION_EXPIRY_MIN = 30  # ⏱️ 30 min session timeout trace limit
SCREEN_POPUP_SETTING_KEY = "screen_popup_broadcast"
SUPER_ADMIN_EMAIL = "bknr.solutions@gmail.com"
USER_OTP_EXPIRY_MIN = 10
DEFAULT_USER_PASSWORD = "12345678"

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
    {"group": "HRMS", "label": "Contract Workers", "route": "/attendance/labour-management"},
    {"group": "HRMS", "label": "KG Basis Company Workers", "route": "/attendance/kg-basis-labour"},
    {"group": "HRMS", "label": "Visitors & Day Workers", "route": "/attendance/visitors-day-workers"},
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
    {"group": "Masters", "label": "KG Basis Worker Rates", "route": "/criteria/api/kg_basis_labour_rates"},
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


@lru_cache(maxsize=1)
def get_user_permission_catalog():
    """Read the canonical permission matrix from the template used by all clients."""
    template_path = Path(__file__).resolve().parents[1] / "templates" / "admin" / "add_user.html"
    catalog = []
    current_group = "General"
    seen = set()
    for line in template_path.read_text(encoding="utf-8").splitlines():
        pillar = re.search(r'data-pillar="([^"]+)"', line)
        if pillar:
            current_group = pillar.group(1).strip()
        match = re.search(
            r'<input[^>]+name="access"[^>]+value="([^"]+)"[^>]*>(.*)</label>',
            line,
        )
        if not match:
            continue
        value = match.group(1).strip()
        if not value or value in seen:
            continue
        label = re.sub(r"<[^>]+>", " ", match.group(2))
        label = re.sub(r"\s+", " ", label).strip()
        seen.add(value)
        catalog.append({"value": value, "label": label or value.replace("_", " ").title(), "group": current_group})
    return catalog


def _wants_json(request: Request):
    return (
        request.query_params.get("format") == "json"
        or request.headers.get("x-mobile-app") == "true"
        or "application/json" in request.headers.get("accept", "")
    )


def _user_config_context(request: Request, db: Session):
    company_code = request.session.get("company_code")
    if not request.session.get("email") or not company_code:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    if request.session.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="System administrator access is required.")
    if not has_permission(request.session, "add_user"):
        raise HTTPException(status_code=403, detail="User Configuration permission is required.")
    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")
    return company


def _clean_user_config(
    *,
    full_name,
    designation,
    email,
    mobile,
    password,
    role,
    access,
    creating,
):
    full_name = (full_name or "").strip()
    designation = (designation or "").strip()
    email = (email or "").strip().lower()
    mobile = re.sub(r"\s+", "", (mobile or "").strip())
    password = (password or "").strip()
    if not full_name or not designation or not email or not mobile:
        raise HTTPException(status_code=422, detail="Full name, designation, email and mobile are required.")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if not re.fullmatch(r"[0-9+()\-]{7,20}", mobile):
        raise HTTPException(status_code=422, detail="Enter a valid mobile number.")
    if role not in {"user", "admin"}:
        raise HTTPException(status_code=422, detail="Invalid system role.")
    if creating and not password:
        password = DEFAULT_USER_PASSWORD
    if password and not 8 <= len(password) <= 64:
        raise HTTPException(status_code=422, detail="Password must contain 8 to 64 characters.")
    allowed = {item["value"] for item in get_user_permission_catalog()}
    unknown = sorted(set(access or []) - allowed)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Invalid permissions: {', '.join(unknown)}")
    permissions = list(dict.fromkeys(normalize_permission(value) for value in (access or []) if normalize_permission(value) in allowed))
    return {
        "full_name": full_name,
        "designation": designation,
        "email": email,
        "mobile": mobile,
        "password": password,
        "role": role,
        "permissions": permissions,
    }


def _serialize_user(user: User):
    return {
        "id": user.id,
        "name": user.name,
        "designation": user.designation,
        "email": user.email,
        "mobile": user.mobile,
        "role": user.role,
        "permissions": [value.strip() for value in (user.permissions or "").split(",") if value.strip()],
        "data_management_access": bool(user.data_management_access),
        "is_verified": bool(user.is_verified),
        "is_active": bool(user.is_active),
    }


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

    if logged_role not in {"admin", "super_admin"}:
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


@router.get("/user-configuration")
def user_configuration_api(request: Request, db: Session = Depends(get_db)):
    company = _user_config_context(request, db)
    users = (
        db.query(User)
        .filter(User.company_id == company.id)
        .order_by(User.id.desc())
        .all()
    )
    return JSONResponse({
        "company": {"id": company.id, "code": company.company_code, "name": company.company_name},
        "roles": [
            {"value": "user", "label": "Operational User"},
            {"value": "admin", "label": "System Administrator"},
        ],
        "password_policy": {"minimum": 8, "maximum": 64, "default_applied_when_empty": True},
        "otp_expiry_minutes": USER_OTP_EXPIRY_MIN,
        "permissions": get_user_permission_catalog(),
        "users": [_serialize_user(user) for user in users],
    })


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
    company = _user_config_context(request, db)
    values = _clean_user_config(
        full_name=full_name, designation=designation, email=email, mobile=mobile,
        password=password, role=role, access=access, creating=True,
    )

    # Unique parameters verification strictly mapped bounded to target tenant ecosystem identity boundary
    if db.query(User).filter(
        func.lower(func.trim(User.email)) == values["email"],
        User.company_id == company.id,
    ).first():
        return JSONResponse({"status": "error", "msg": "Email already exists for this company."}, status_code=409)

    if db.query(User).filter(User.mobile == values["mobile"]).first():
        return JSONResponse({"status": "error", "msg": "Mobile number is already assigned to another account."}, status_code=409)

    otp = str(random.randint(100000, 999999))
    pending = {
        "purpose": "add_user",
        "company_id": company.id,
        "company_code": company.company_code,
        "name": values["full_name"],
        "designation": values["designation"],
        "email": values["email"],
        "mobile": values["mobile"],
        "password": hash_password(values["password"]),
        "role": values["role"],
        "permissions": ",".join(values["permissions"]),
        "data_management_access": data_management_access == "true",
    }
    otp_record = db.query(OTPTable).filter(OTPTable.email == values["email"]).first()
    if otp_record:
        otp_record.otp = otp
        otp_record.extra = json.dumps(pending)
        otp_record.is_used = False
        otp_record.created_at = datetime.utcnow().replace(tzinfo=None)
    else:
        db.add(OTPTable(
            email=values["email"], otp=otp, extra=json.dumps(pending),
            is_used=False, created_at=datetime.utcnow().replace(tzinfo=None),
        ))
    db.commit()
    
    # Send email with credentials and OTP
    subject = "SVBK – Account Verification Required"
    body_html = professional_email_html(
        title=f"Welcome to SVBK, {values['full_name']}",
        intro=f"An administrator has created your profile under {company.company_name}. Please use the details below to sign in and verify your email.",
        content_html=f"""
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;margin-bottom:18px;">
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;width:36%;">Company ID</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;font-weight:700;">{company.company_code}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Email</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{values['email']}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Temporary Password</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{values['password']}</td></tr>
          </table>
          <div style="padding:18px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Verification Code</div>
            <div style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:6px;margin-top:6px;">{otp}</div>
          </div>
        """,
        note="Please change your password after your first successful login."
    )
    try:
        send_security_email(values["email"], subject, body_html, otp, "new user verification OTP")
    except Exception:
        return JSONResponse({"status": "error", "msg": "Unable to send verification email. Please try again."}, status_code=503)
    return JSONResponse({
        "status": "otp_required",
        "email": values["email"],
        "msg": f"OTP sent to {values['email']}.",
        "expires_in_minutes": USER_OTP_EXPIRY_MIN,
    })


@router.post("/verify_add_user_otp")
def verify_add_user_otp(
    request: Request,
    email: str = Form(...),
    otp: str = Form(...),
    db: Session = Depends(get_db),
):
    company = _user_config_context(request, db)
    normalized_email = email.strip().lower()
    otp_record = db.query(OTPTable).filter(OTPTable.email == normalized_email).first()
    if not otp_record or otp_record.is_used:
        return JSONResponse({"status": "error", "msg": "OTP is invalid or already used."}, status_code=400)
    created = otp_record.created_at
    if not created or (datetime.utcnow().replace(tzinfo=None) - created).total_seconds() > USER_OTP_EXPIRY_MIN * 60:
        return JSONResponse({"status": "error", "msg": "OTP has expired. Please resend it."}, status_code=400)
    if otp_record.otp != otp.strip():
        return JSONResponse({"status": "error", "msg": "Incorrect OTP. Please try again."}, status_code=400)
    try:
        pending = json.loads(otp_record.extra or "{}")
    except (TypeError, ValueError):
        pending = {}
    if pending.get("purpose") != "add_user" or pending.get("company_id") != company.id or pending.get("email") != normalized_email:
        return JSONResponse({"status": "error", "msg": "Pending user data is invalid. Submit the form again."}, status_code=400)
    if db.query(User).filter(
        func.lower(func.trim(User.email)) == normalized_email,
        User.company_id == company.id,
    ).first():
        otp_record.is_used = True
        db.commit()
        return JSONResponse({"status": "error", "msg": "User with this email already exists."}, status_code=409)
    if db.query(User).filter(User.mobile == pending.get("mobile")).first():
        return JSONResponse({"status": "error", "msg": "Mobile number is already assigned to another account."}, status_code=409)
    user = User(
        company_id=company.id, name=pending["name"], designation=pending["designation"],
        email=pending["email"], mobile=pending["mobile"], password=pending["password"],
        role=pending["role"], permissions=pending["permissions"],
        data_management_access=bool(pending.get("data_management_access")),
        is_verified=True, is_active=True, created_at=ist_now(),
    )
    db.add(user)
    otp_record.is_used = True
    db.commit()
    return JSONResponse({"status": "success", "msg": f"User '{user.name}' created successfully.", "user": _serialize_user(user)})


@router.post("/resend_add_user_otp")
def resend_add_user_otp(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    company = _user_config_context(request, db)
    normalized_email = email.strip().lower()
    otp_record = db.query(OTPTable).filter(OTPTable.email == normalized_email).first()
    if not otp_record or otp_record.is_used:
        return JSONResponse({"status": "error", "msg": "No pending verification was found."}, status_code=400)
    try:
        pending = json.loads(otp_record.extra or "{}")
    except (TypeError, ValueError):
        pending = {}
    if pending.get("purpose") != "add_user" or pending.get("company_id") != company.id:
        return JSONResponse({"status": "error", "msg": "Pending user data is invalid."}, status_code=400)
    otp_record.otp = str(random.randint(100000, 999999))
    otp_record.created_at = datetime.utcnow().replace(tzinfo=None)
    otp_record.is_used = False
    db.commit()
    body_html = professional_email_html(
        title="User Account Verification",
        intro=f"Enter this verification code to complete the profile for {pending['name']}.",
        content_html=f'<div style="font-size:32px;font-weight:800;text-align:center;letter-spacing:6px;">{otp_record.otp}</div>',
        note=f"This code expires in {USER_OTP_EXPIRY_MIN} minutes.",
    )
    try:
        send_security_email(normalized_email, "SVBK – Account Verification Required", body_html, otp_record.otp, "new user verification OTP")
    except Exception:
        return JSONResponse({"status": "error", "msg": "Unable to resend verification email."}, status_code=503)
    return JSONResponse({"status": "success", "msg": f"OTP resent to {normalized_email}."})


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
    company = _user_config_context(request, db)
    values = _clean_user_config(
        full_name=full_name, designation=designation, email=email, mobile=mobile,
        password=password, role=role, access=access, creating=False,
    )

    # Find target profile and isolate boundary inside target client tenant scope
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    is_current_user = (
        str(request.session.get("email") or "").strip().lower()
        == str(user.email or "").strip().lower()
    )

    # Cross-validation validation to avoid email overlapping duplicates
    email_check = db.query(User).filter(
        func.lower(func.trim(User.email)) == values["email"],
        User.company_id == company.id,
        User.id != uid
    ).first()
    if email_check:
        raise HTTPException(status_code=409, detail="Email is already assigned.")

    # Cross-validation validation to avoid mobile overlapping duplicates
    mobile_check = db.query(User).filter(
        User.mobile == values["mobile"],
        User.id != uid
    ).first()
    if mobile_check:
        raise HTTPException(status_code=409, detail="Mobile number is already assigned.")

    # Bind request stream objects to data structures
    user.name = values["full_name"]
    user.designation = values["designation"]
    user.email = values["email"]
    user.mobile = values["mobile"]
    user.role = values["role"]
    user.permissions = ",".join(values["permissions"])
    user.data_management_access = (data_management_access == "true")

    # If the operator specified a new pass string, inject security layer overhead
    if values["password"]:
        user.password = hash_password(values["password"])

    if is_current_user:
        request.session["email"] = user.email
        request.session["name"] = user.name
        request.session["role"] = user.role
        request.session["permissions"] = user.permissions
    else:
        # Force an already-open React, Native, or template session to reload the
        # new access matrix through the normal login flow.
        user.current_session_id = None
    db.commit()
    if _wants_json(request):
        return JSONResponse({"status": "success", "msg": "User updated successfully.", "user": _serialize_user(user)})
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
    company = _user_config_context(request, db)

    # Find user profile inside target company scope
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.is_active = not getattr(user, "is_active", True)
    if not user.is_active:
        user.current_session_id = None
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

    if _wants_json(request):
        return JSONResponse({"status": "success", "msg": f"User {status_str.lower()} successfully.", "user": _serialize_user(user)})
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
