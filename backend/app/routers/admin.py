from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.database import get_db
from app.database.models.users import User, Company
from app.security.password_handler import hash_password

# ==========================================================
# CONFIG & INITIALIZATION PARAMETERS
# ==========================================================
router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")

SESSION_EXPIRY_MIN = 30  # ⏱️ 30 min session timeout trace limit


# ==========================================================
# 🛡️ ANTI-CACHE HEADERS SECURITY LAYER INTERACTION HELPER
# ==========================================================
def apply_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


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

    if not logged_email or not company_code:
        return RedirectResponse("/", status_code=302)

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
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
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
        is_verified=True,
        created_at=ist_now()
    )

    db.add(new_user)
    db.commit()

    response = RedirectResponse("/admin/add_user?msg=User Saved", status_code=302)
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
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
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

    # If the operator specified a new pass string, inject security layer overhead
    if password and password.strip() != "":
        user.password = hash_password(password.strip())

    db.commit()
    response = RedirectResponse("/admin/add_user?msg=Updated Successfully", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# DELETE USER TERMINATION
# ==========================================================
@router.post("/delete_user/{uid}")
def delete_user(uid: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Strict enterprise database mapping check filter alignment
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    db.delete(user)
    db.commit()

    response = RedirectResponse("/admin/add_user?msg=User Deleted", status_code=302)
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