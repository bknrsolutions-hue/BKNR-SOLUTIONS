# ===========================================================
#    EMPLOYEE REGISTRATION + FACE MATCHING + ROLE SUPPORT
# ===========================================================

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime
import base64, numpy as np, face_recognition, io
from PIL import Image

from app.database import get_db

from app.database.models.employee_registration import Employee, EmployeeRole   # ✔ correct models
from app.database.models.criteria import contractors                           # ✔ correct import

router = APIRouter(prefix="/employee", tags=["Employee Registration"])


# ----------------------------------------------------------
# 🔹 AUTO ID FORMAT = COMPANY FIRST 3 LETTERS + 6 DIGITS
# ----------------------------------------------------------
def generate_emp_id(db: Session, company: str):
    prefix = company[:3].upper()

    last = (
        db.query(Employee)
        .filter(Employee.employee_id.like(f"{prefix}%"))
        .order_by(Employee.id.desc())
        .first()
    )

    next_no = 1 if not last else int(last.employee_id[-6:]) + 1
    return f"{prefix}{next_no:06d}"


@router.get("/next_id")
def next_id(request: Request, db: Session = Depends(get_db)):
    company = request.session.get("company_name", "BKNR")  # fallback
    return {"new_id": generate_emp_id(db, company)}



# ----------------------------------------------------------
# 🔹 PAGE LOAD (YOUR HTML FILE)
# ----------------------------------------------------------
@router.get("/register", response_class=HTMLResponse)
def page(request: Request):
    return request.app.state.templates.TemplateResponse(
        "attendance/employee_registration.html",
        {"request": request}
    )



# ----------------------------------------------------------
# 🔹 CONTRACTOR DROPDOWN
# ----------------------------------------------------------
@router.get("/contractors/list")
def get_contractors(db: Session = Depends(get_db)):
    rows = db.query(contractors.contractor_name).order_by(contractors.contractor_name).all()
    return [{"name": r[0]} for r in rows]



# ----------------------------------------------------------
# 🔹 ROLE LIST API
# ----------------------------------------------------------
@router.get("/roles")
def list_roles(db: Session = Depends(get_db)):
    rows = db.query(EmployeeRole.name).order_by(EmployeeRole.name).all()
    return [r[0] for r in rows]



# ----------------------------------------------------------
# 🔹 ADD NEW ROLE API (Duplicate block)
# ----------------------------------------------------------
@router.post("/roles/add")
def add_role(data: dict, db: Session = Depends(get_db)):

    name = data["name"].strip()

    exists = db.query(EmployeeRole).filter(EmployeeRole.name == name).first()
    if exists:
        raise HTTPException(409, "Already Exists")

    r = EmployeeRole(name=name)
    db.add(r)
    db.commit()

    return {"status": True, "msg": "Role Added"}



# ----------------------------------------------------------
# 🔥 FACE COMPARE FIX — WORKS 100% NOW
# ----------------------------------------------------------
@router.post("/face/compare")
async def compare_faces(data: dict):

    def decode(img64):
        raw = base64.b64decode(img64.split(",")[1])
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        return np.array(img)

    img1 = decode(data["img1"])
    img2 = decode(data["img2"])

    enc1 = face_recognition.face_encodings(img1)
    enc2 = face_recognition.face_encodings(img2)

    if not enc1 or not enc2:
        return {"match": False, "error": "Face not detected clearly"}

    is_match = bool(face_recognition.compare_faces([enc1[0]], enc2[0])[0])

    return {"match": is_match}



# ----------------------------------------------------------
# 🟢 FINAL SAVE EMPLOYEE — COMPANY WISE, UNIQUE, FACE STORED
# ----------------------------------------------------------
@router.post("/create")
def create_employee(data: dict, request: Request, db: Session = Depends(get_db)):

    company = request.session.get("company_name", "BKNR")

    # check duplicate
    exists = db.query(Employee).filter(Employee.mobile == data["mobile"]).first()
    if exists:
        raise HTTPException(409, "Employee Already Exists")

    emp = Employee(
        employee_id = data["employee_id"],
        name        = data["name"],
        gender      = data["gender"],
        mobile      = data["mobile"],
        role        = data["role"],

        emp_type    = data["emp_type"],
        contractor  = data["contractor"] if data["emp_type"]=="contract" else None,

        face_img1   = data["face_primary"],
        face_img2   = data["face_verify"],

        company_id  = request.session.get("company_id")
    )

    db.add(emp)
    db.commit()

    return {"status": "success", "message": "Employee Registered Successfully"}
