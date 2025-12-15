from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
import numpy as np, base64, io
from PIL import Image
import face_recognition

from app.database import get_db
from app.database.models.employee_registration import Employee
from app.database.models.attendance import Attendance


router = APIRouter(prefix="/attendance", tags=["Face Attendance"])


# ---------------------------------------------------------
# Convert Base64 → Numpy Image
# ---------------------------------------------------------
def b64_to_np(img_64):
    img_64 = img_64.split(",")[1]
    img = base64.b64decode(img_64)
    return np.array(Image.open(io.BytesIO(img)).convert("RGB"))


# ---------------------------------------------------------
# MATCH FACE IN DATABASE
# ---------------------------------------------------------
def detect_employee_face(db: Session, input_enc, tolerance=0.47):
    employees = db.query(Employee).all()
    known, info = [], []

    for e in employees:
        if not e.face_img1: continue

        img = b64_to_np(e.face_img1)
        enc = face_recognition.face_encodings(img)
        if not enc: continue

        known.append(enc[0])
        info.append(e)

    if not known: return None

    dist = face_recognition.face_distance(known, input_enc)
    idx = int(np.argmin(dist))

    return info[idx] if dist[idx] <= tolerance else None


# ---------------------------------------------------------
# UI PAGE
# ---------------------------------------------------------
@router.get("/face", response_class=HTMLResponse)
def page(request: Request):
    return request.app.state.templates.TemplateResponse(
        "attendance/face_attendance.html",
        {"request": request}
    )


# ---------------------------------------------------------
# MARK ATTENDANCE
# ---------------------------------------------------------
@router.post("/face/mark")
def mark_attendance(data: dict, db: Session = Depends(get_db)):

    if "image" not in data: raise HTTPException(400, "No Image")

    img = b64_to_np(data["image"])
    enc = face_recognition.face_encodings(img)

    if not enc:
        return {"status":"no_face", "message":"Face Not Detected"}

    emp = detect_employee_face(db, enc[0])
    if not emp:
        return {"status":"unknown", "message":"Unregistered Face"}

    # Detect IN / OUT
    today = date.today()
    last = (
        db.query(Attendance)
        .filter(Attendance.employee_id == emp.id, Attendance.punch_date == today)
        .order_by(Attendance.punch_time.desc())
        .first()
    )

    punch = "OUT" if last and last.punch_type=="IN" else "IN"

    rec = Attendance(
        employee_id = emp.id,
        punch_date  = today,
        punch_time  = datetime.now(),
        punch_type  = punch,
        method      = "FACE"
    )

    db.add(rec)
    db.commit()

    return {
        "status":"success",
        "punch":punch,
        "employee":{
            "id":emp.employee_id,
            "name":emp.name,
            "type":emp.emp_type,
            "contractor":emp.contractor
        }
    }
