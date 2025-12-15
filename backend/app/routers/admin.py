# app/routers/admin.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.users import User, Company
from app.security.password_handler import hash_password

router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")


# ==========================================================
# PAGE VIEW – ADD USER PAGE
# ==========================================================
@router.get("/add_user", response_class=HTMLResponse)
def add_user_page(request: Request, db: Session = Depends(get_db)):

    logged_email = request.session.get("email")
    company_code = request.session.get("company_code")   # example: BKNR5647

    if not logged_email or not company_code:
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    users = (
        db.query(User)
        .filter(User.company_id == company.id)
        .order_by(User.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "admin/add_user.html",
        {"request": request, "existing_users": users, "company_code": company_code}
    )


# ==========================================================
# SAVE USER (CREATE)
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

    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    # Duplicate checks
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
        password=hash_password(password),
        role=role,
        permissions=permissions_csv,
        is_verified=True,
        created_at=datetime.now()
    )

    db.add(new_user)
    db.commit()

    return RedirectResponse("/admin/add_user?msg=User Saved", status_code=302)


# ==========================================================
# EDIT USER PAGE
# ==========================================================
@router.get("/edit_user/{uid}", response_class=HTMLResponse)
def edit_user_page(uid: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(Company.company_code == company_code).first()

    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    return templates.TemplateResponse(
        "admin/edit_user.html",
        {"request": request, "user": user}
    )


# ==========================================================
# UPDATE USER
# ==========================================================
@router.post("/update_user/{uid}")
def update_user(
    uid: int, request: Request,
    full_name: str = Form(...),
    designation: str = Form(...),
    mobile: str = Form(...),
    role: str = Form(...),
    access: list[str] = Form([]),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")

    company = db.query(Company).filter(Company.company_code == company_code).first()

    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    user.name = full_name
    user.designation = designation
    user.mobile = mobile
    user.role = role
    user.permissions = ",".join(access)

    db.commit()

    return RedirectResponse("/admin/add_user?msg=Updated Successfully", status_code=302)


# ==========================================================
# DELETE USER
# ==========================================================
@router.post("/delete_user/{uid}")
def delete_user(uid: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    company = db.query(Company).filter(Company.company_code == company_code).first()

    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    db.delete(user)
    db.commit()

    return RedirectResponse("/admin/add_user?msg=User Deleted", status_code=302)
