from datetime import date, datetime, time
from html import escape
import re

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.attendance import (
    ContractLabour,
    ContractLabourAttendance,
    DailyTemporaryWorker,
    EntryApprovalRequest,
    KgBasisCompanyLabour,
    KgBasisWorker,
    KgBasisWorkerAttendance,
    VisitorEntry,
)
from app.database.models.users import Company, User
from app.database.models.criteria import (
    contractors,
    kg_basis_labour_rates,
    production_at,
    purposes,
    species,
    varieties,
)
from app.database.models.processing import AuditLog
from app.utils.timezone import ist_now
from app.utils.email_service import send_email


router = APIRouter(tags=["Worker Management"])


def _session(request: Request):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    if not email or not company_id:
        return None
    return email, company_id


def _serialize(row):
    result = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name)
        result[column.name] = value.isoformat() if isinstance(value, (date, datetime, time)) else value
    return result


def _parse_date(value, fallback=None):
    if not value:
        return fallback
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return fallback


def _parse_time(value):
    if not value:
        return None
    try:
        return time.fromisoformat(str(value))
    except ValueError:
        return None


def _text(value):
    return str(value or "").strip()


def _number(value, default=0.0):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return default


def _first_letter(value, fallback="X"):
    match = re.search(r"[A-Za-z]", _text(value))
    return match.group(0).upper() if match else fallback


def _company_users(db, request):
    company_pk = request.session.get("company_id")
    if not company_pk:
        company_code = request.session.get("company_code")
        company_pk = db.query(Company.id).filter(Company.company_code == company_code).scalar()
    if not company_pk:
        return []
    return db.query(User).filter(
        User.company_id == company_pk,
        User.is_active.is_(True),
    ).order_by(User.name.asc()).all()


def _approval_user(db, request, selected_email):
    normalized_email = _text(selected_email).lower()
    return next(
        (user for user in _company_users(db, request) if _text(user.email).lower() == normalized_email),
        None,
    )


def _approval_email_html(title, message):
    return f"""
    <div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px">
      <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #dbe3ee;border-radius:12px;overflow:hidden">
        <div style="background:#0f4c81;color:#fff;padding:16px 20px;font-size:18px;font-weight:700">SVBK ERP Approval</div>
        <div style="padding:22px 20px;color:#1e293b">
          <h2 style="font-size:18px;margin:0 0 12px">{escape(title)}</h2>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px">{escape(message)}</p>
          <p style="font-size:13px;color:#64748b;margin:0">Open SVBK ERP on your mobile or computer to approve or reject this request.</p>
        </div>
      </div>
    </div>
    """


def _queue_approval(db, background_tasks, row, entry_type, approver, requested_by, title, message):
    approval = EntryApprovalRequest(
        company_id=row.company_id,
        entry_type=entry_type,
        entry_id=row.id,
        title=title,
        message=message,
        requested_by=requested_by,
        assigned_to_name=approver.name,
        assigned_to_email=approver.email,
        status="PENDING",
    )
    db.add(approval)
    background_tasks.add_task(
        send_email,
        approver.email,
        title,
        _approval_email_html(title, message),
        message,
    )


def _next_contract_labour_number(db, company_id):
    highest = 0
    labour_ids = db.query(ContractLabour.labour_id).filter(
        ContractLabour.company_id == company_id
    ).all()
    for (labour_id,) in labour_ids:
        match = re.fullmatch(r"[A-Z]{2}(\d{5})", _text(labour_id).upper())
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def _resolve_labour_id(db, company_id, entered_id):
    value = _text(entered_id).upper()
    if value.isdigit():
        number = int(value)
        if number <= 0 or number > 99999:
            return None, "Enter a number from 1 to 99999"
        suffix = f"{number:05d}"
        matches = db.query(ContractLabour).filter(
            ContractLabour.company_id == company_id,
            ContractLabour.labour_id.like(f"%{suffix}"),
            ContractLabour.status == "ACTIVE",
        ).all()
        matches = [row for row in matches if re.fullmatch(r"[A-Z]{2}\d{5}", _text(row.labour_id).upper())]
        if len(matches) == 1:
            return matches[0], None
        if len(matches) > 1:
            return None, "Number matches multiple Worker IDs; enter full ID"
        return None, "ID number not found"
    labour = db.query(ContractLabour).filter(
        ContractLabour.company_id == company_id,
        ContractLabour.labour_id == value,
        ContractLabour.status == "ACTIVE",
    ).first()
    return (labour, None) if labour else (None, "ID not found")


def _next_kg_worker_number(db, company_id):
    highest = 0
    worker_ids = db.query(KgBasisWorker.worker_id).filter(KgBasisWorker.company_id == company_id).all()
    for (worker_id,) in worker_ids:
        match = re.fullmatch(r"[A-Z]K(\d{5})", _text(worker_id).upper())
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def _resolve_kg_worker_id(db, company_id, entered_id):
    value = _text(entered_id).upper()
    query = db.query(KgBasisWorker).filter(
        KgBasisWorker.company_id == company_id,
        KgBasisWorker.status == "ACTIVE",
    )
    if value.isdigit():
        number = int(value)
        if number <= 0 or number > 99999:
            return None, "Enter a number from 1 to 99999"
        worker = query.filter(KgBasisWorker.worker_id.like(f"%{number:05d}")).first()
        return (worker, None) if worker else (None, "Worker number not found")
    worker = query.filter(KgBasisWorker.worker_id == value).first()
    return (worker, None) if worker else (None, "Worker ID not found")


def _lookup_values(db, model, column, company_id):
    return [value for (value,) in db.query(column).filter(model.company_id == company_id).order_by(column).all()]


@router.get("/labour-management")
def labour_management_data(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session

    contract_rows = db.query(ContractLabour).filter(
        ContractLabour.company_id == company_id
    ).order_by(ContractLabour.id.desc()).all()
    daily_rows = db.query(DailyTemporaryWorker).filter(
        DailyTemporaryWorker.company_id == company_id
    ).order_by(DailyTemporaryWorker.work_date.desc(), DailyTemporaryWorker.id.desc()).all()
    today_attendance = db.query(ContractLabourAttendance).filter(
        ContractLabourAttendance.company_id == company_id,
        ContractLabourAttendance.attendance_date == ist_now().date(),
    ).order_by(ContractLabourAttendance.in_time.desc()).all()

    return {
        "status": "success",
        "contract_labour": [_serialize(row) for row in contract_rows],
        "contract_attendance": [_serialize(row) for row in today_attendance],
        "daily_workers": [_serialize(row) for row in daily_rows],
        "lookups": {
            "contractors": _lookup_values(db, contractors, contractors.contractor_name, company_id),
            "purposes": _lookup_values(db, purposes, purposes.purpose_name, company_id),
            "locations": _lookup_values(db, production_at, production_at.production_at, company_id),
        },
    }


@router.post("/labour-management/contract/bulk")
async def save_contract_labour(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    members = payload.get("members") or []
    if not isinstance(members, list) or not members:
        return JSONResponse(status_code=400, content={"error": "Add at least one worker"})

    now = ist_now()
    saved = []
    next_number = _next_contract_labour_number(db, company_id)
    company_initial = _first_letter(request.session.get("company_name") or company_id)
    try:
        for member in members:
            labour_name = _text(member.get("labour_name"))
            contractor_name = _text(member.get("contractor_name"))
            joining_date = _parse_date(member.get("joining_date"), now.date())
            if not labour_name:
                raise ValueError("Worker name is required for every member")
            if not contractor_name:
                raise ValueError("Contractor is required for every member")
            if next_number > 99999:
                raise ValueError("Contract worker ID sequence has reached 99999")
            row = ContractLabour(
                labour_id=f"{company_initial}{_first_letter(contractor_name)}{next_number:05d}",
                labour_name=labour_name,
                contractor_name=contractor_name,
                mobile=_text(member.get("mobile")) or None,
                aadhar_number=_text(member.get("aadhar_number")) or None,
                gender=_text(member.get("gender")) or None,
                joining_date=joining_date,
                department=_text(member.get("department")) or None,
                production_at=_text(member.get("production_at")) or None,
                remarks=_text(member.get("remarks")) or None,
                email=email,
                company_id=company_id,
                date=now.date(),
                time=now.strftime("%H:%M:%S"),
            )
            db.add(row)
            saved.append(row)
            next_number += 1
        db.commit()
    except (ValueError, TypeError) as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": f"Unable to save contract workers: {exc}"})

    return {"status": "success", "records": [_serialize(row) for row in saved]}


@router.post("/labour-management/contract/punch")
async def punch_contract_labour(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    raw_ids = payload.get("labour_ids") or [payload.get("labour_id")]
    labour_ids = list(dict.fromkeys(_text(value).upper() for value in raw_ids if _text(value)))
    action = _text(payload.get("action")).upper()
    selected_location = _text(payload.get("location"))
    if not labour_ids or action not in {"IN", "OUT"}:
        return JSONResponse(status_code=400, content={"error": "Enter Worker IDs and select IN or OUT"})

    now = ist_now().replace(tzinfo=None)
    punched = []
    errors = []
    for entered_id in labour_ids:
        labour, resolve_error = _resolve_labour_id(db, company_id, entered_id)
        if not labour:
            errors.append({"labour_id": entered_id, "error": resolve_error})
            continue
        labour_id = labour.labour_id
        if selected_location and selected_location.upper() != "ALL" and labour.production_at:
            if selected_location.strip().upper() != labour.production_at.strip().upper():
                errors.append({"labour_id": labour_id, "error": "Registered at another location"})
                continue

        active = db.query(ContractLabourAttendance).filter(
            ContractLabourAttendance.company_id == company_id,
            ContractLabourAttendance.labour_id == labour_id,
            ContractLabourAttendance.status == "INSIDE",
            ContractLabourAttendance.out_time.is_(None),
        ).order_by(ContractLabourAttendance.in_time.desc()).first()

        if action == "IN":
            if active:
                errors.append({"labour_id": labour_id, "error": "Already punched IN"})
                continue
            completed_today = db.query(ContractLabourAttendance).filter(
                ContractLabourAttendance.company_id == company_id,
                ContractLabourAttendance.labour_id == labour_id,
                ContractLabourAttendance.attendance_date == now.date(),
            ).first()
            if completed_today:
                errors.append({"labour_id": labour_id, "error": "Today's punches completed"})
                continue
            active = ContractLabourAttendance(
                labour_id=labour.labour_id,
                labour_name=labour.labour_name,
                contractor_name=labour.contractor_name,
                production_at=labour.production_at,
                attendance_date=now.date(),
                in_time=now,
                status="INSIDE",
                email=email,
                company_id=company_id,
                date=now.date(),
                time=now.strftime("%H:%M:%S"),
            )
            db.add(active)
        else:
            if not active:
                errors.append({"labour_id": labour_id, "error": "No active IN punch"})
                continue
            active.out_time = now
            active.status = "CLOSED"
        punched.append(active)

    if not punched:
        return JSONResponse(status_code=400, content={"error": "No punches were saved", "errors": errors})
    db.commit()
    return {
        "status": "success",
        "message": f"{len(punched)} worker punch{'' if len(punched) == 1 else 'es'} saved as {action}",
        "records": [_serialize(row) for row in punched],
        "errors": errors,
    }


@router.post("/labour-management/daily")
async def save_daily_worker(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    worker_name = _text(payload.get("worker_name"))
    purpose = _text(payload.get("purpose"))
    in_time = _parse_time(payload.get("in_time"))
    if not worker_name or not purpose or not in_time:
        return JSONResponse(status_code=400, content={"error": "Name, purpose and in time are required"})

    now = ist_now()
    row = DailyTemporaryWorker(
        worker_name=worker_name,
        worker_type=_text(payload.get("worker_type")) or "DAILY LABOUR",
        purpose=purpose,
        work_date=_parse_date(payload.get("work_date"), now.date()),
        in_time=in_time,
        out_time=_parse_time(payload.get("out_time")),
        amount=0.0,
        day_charge=0.0,
        production_at=_text(payload.get("production_at")) or None,
        remarks=_text(payload.get("remarks")) or None,
        email=email,
        company_id=company_id,
        date=now.date(),
        time=now.strftime("%H:%M:%S"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "record": _serialize(row)}


@router.post("/visitors-day-workers/day-worker/{record_id}/charge")
async def update_day_worker_charge(record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    row = db.query(DailyTemporaryWorker).filter(
        DailyTemporaryWorker.id == record_id,
        DailyTemporaryWorker.company_id == company_id,
        DailyTemporaryWorker.worker_type == "DAY WORKER",
    ).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Day worker entry not found"})
    is_admin = _text(request.session.get("role")).lower() in {"admin", "super_admin"}
    if row.day_charge_locked and not is_admin:
        return JSONResponse(status_code=403, content={"error": "Day charge is locked; only an admin can edit it"})
    old_charge = float(row.day_charge or 0.0)
    new_charge = max(0.0, _number(payload.get("day_charge")))
    row.day_charge = new_charge
    row.day_charge_locked = True
    db.add(AuditLog(
        table_name="daily_temporary_workers",
        record_id=row.id,
        company_id=company_id,
        field_name="day_charge",
        old_value=str(old_charge),
        new_value=str(new_charge),
        edited_by=email,
        edited_at=ist_now().replace(tzinfo=None),
    ))
    db.commit()
    return {"status": "success", "day_charge": row.day_charge, "day_charge_locked": True}


@router.get("/visitors-day-workers/day-worker-charge-audit")
def day_worker_charge_audit(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    rows = db.query(AuditLog, DailyTemporaryWorker.worker_name, DailyTemporaryWorker.work_date).outerjoin(
        DailyTemporaryWorker,
        DailyTemporaryWorker.id == AuditLog.record_id,
    ).filter(
        AuditLog.company_id == company_id,
        AuditLog.table_name == "daily_temporary_workers",
        AuditLog.field_name == "day_charge",
    ).order_by(AuditLog.edited_at.desc()).limit(250).all()
    return {
        "status": "success",
        "audits": [
            {
                "id": audit.id,
                "record_id": audit.record_id,
                "worker_name": worker_name or f"Deleted Day Worker #{audit.record_id}",
                "work_date": work_date.isoformat() if work_date else None,
                "old_value": audit.old_value,
                "new_value": audit.new_value,
                "edited_by": audit.edited_by,
                "edited_at": audit.edited_at.isoformat() if audit.edited_at else None,
            }
            for audit, worker_name, work_date in rows
        ],
    }


@router.post("/labour-management/daily/{record_id}/amount")
async def update_daily_worker_amount(record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    payload = await request.json()
    row = db.query(DailyTemporaryWorker).filter(
        DailyTemporaryWorker.id == record_id,
        DailyTemporaryWorker.company_id == company_id,
    ).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Worker entry not found"})
    row.amount = max(0.0, _number(payload.get("amount")))
    db.commit()
    return {"status": "success", "amount": row.amount}


@router.get("/visitors-day-workers")
def visitors_day_workers_data(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    visitors = db.query(VisitorEntry).filter(
        VisitorEntry.company_id == company_id
    ).order_by(VisitorEntry.visit_date.desc(), VisitorEntry.id.desc()).all()
    day_workers = db.query(DailyTemporaryWorker).filter(
        DailyTemporaryWorker.company_id == company_id,
        DailyTemporaryWorker.worker_type == "DAY WORKER",
    ).order_by(DailyTemporaryWorker.work_date.desc(), DailyTemporaryWorker.id.desc()).all()
    users = _company_users(db, request)
    return {
        "status": "success",
        "visitors": [_serialize(row) for row in visitors],
        "day_workers": [_serialize(row) for row in day_workers],
        "lookups": {
            "purposes": _lookup_values(db, purposes, purposes.purpose_name, company_id),
            "locations": _lookup_values(db, production_at, production_at.production_at, company_id),
            "users": [
                {
                    "name": user.name,
                    "email": user.email,
                    "mobile": user.mobile,
                    "designation": user.designation,
                }
                for user in users
            ],
        },
        "permissions": {
            "can_edit_locked_day_charge": _text(request.session.get("role")).lower() in {"admin", "super_admin"},
        },
    }


@router.post("/visitors-day-workers/visitor")
async def save_visitor(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    visitor_name = _text(payload.get("visitor_name"))
    purpose = _text(payload.get("purpose"))
    in_time = _parse_time(payload.get("in_time"))
    approver = _approval_user(db, request, payload.get("person_to_meet_email"))
    if not visitor_name or not purpose or not in_time or not approver:
        return JSONResponse(status_code=400, content={"error": "Visitor name, purpose, person to meet and in time are required"})
    now = ist_now()
    row = VisitorEntry(
        visitor_name=visitor_name,
        mobile=_text(payload.get("mobile")) or None,
        organization=_text(payload.get("organization")) or None,
        purpose=purpose,
        person_to_meet=approver.name,
        person_to_meet_email=approver.email,
        approval_status="PENDING",
        visit_date=_parse_date(payload.get("visit_date"), now.date()),
        in_time=in_time,
        out_time=None,
        production_at=_text(payload.get("production_at")) or None,
        remarks=_text(payload.get("remarks")) or None,
        status="PENDING",
        email=email,
        company_id=company_id,
        date=now.date(),
        time=now.strftime("%H:%M:%S"),
    )
    db.add(row)
    db.flush()
    title = f"Visitor approval: {visitor_name}"
    message = f"{visitor_name} is waiting to meet you for {purpose}."
    _queue_approval(db, background_tasks, row, "VISITOR", approver, email, title, message)
    db.commit()
    db.refresh(row)
    return {"status": "success", "record": _serialize(row)}


@router.post("/visitors-day-workers/day-worker")
async def save_day_worker(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    worker_name = _text(payload.get("worker_name"))
    purpose = _text(payload.get("purpose"))
    in_time = _parse_time(payload.get("in_time"))
    approver = _approval_user(db, request, payload.get("approved_by_email"))
    if not worker_name or not purpose or not in_time or not approver:
        return JSONResponse(status_code=400, content={"error": "Worker name, purpose, approved by and in time are required"})
    now = ist_now()
    row = DailyTemporaryWorker(
        worker_name=worker_name,
        worker_type="DAY WORKER",
        purpose=purpose,
        work_date=_parse_date(payload.get("work_date"), now.date()),
        in_time=in_time,
        out_time=None,
        amount=0.0,
        day_charge=0.0,
        approved_by_name=approver.name,
        approved_by_email=approver.email,
        approval_status="PENDING",
        production_at=_text(payload.get("production_at")) or None,
        remarks=_text(payload.get("remarks")) or None,
        status="PENDING",
        email=email,
        company_id=company_id,
        date=now.date(),
        time=now.strftime("%H:%M:%S"),
    )
    db.add(row)
    db.flush()
    title = f"Day worker approval: {worker_name}"
    message = f"Approval is required for {worker_name}, assigned for {purpose}."
    _queue_approval(db, background_tasks, row, "DAY_WORKER", approver, email, title, message)
    db.commit()
    db.refresh(row)
    return {"status": "success", "record": _serialize(row)}


@router.get("/approval-alerts")
def approval_alerts(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    approvals = db.query(EntryApprovalRequest).filter(
        EntryApprovalRequest.company_id == company_id,
        func.lower(EntryApprovalRequest.assigned_to_email) == email.lower(),
        EntryApprovalRequest.status == "PENDING",
    ).order_by(EntryApprovalRequest.created_at.asc()).all()
    return {"status": "success", "approvals": [_serialize(row) for row in approvals]}


@router.post("/approval-alerts/{approval_id}/decision")
async def decide_approval(approval_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    decision = _text(payload.get("decision")).upper()
    if decision not in {"APPROVE", "REJECT"}:
        return JSONResponse(status_code=400, content={"error": "Decision must be APPROVE or REJECT"})
    approval = db.query(EntryApprovalRequest).filter(
        EntryApprovalRequest.id == approval_id,
        EntryApprovalRequest.company_id == company_id,
        func.lower(EntryApprovalRequest.assigned_to_email) == email.lower(),
    ).first()
    if not approval:
        return JSONResponse(status_code=404, content={"error": "Approval request not found"})
    if approval.status != "PENDING":
        return JSONResponse(status_code=409, content={"error": "This request is already completed"})

    model = VisitorEntry if approval.entry_type == "VISITOR" else DailyTemporaryWorker
    row = db.query(model).filter(
        model.id == approval.entry_id,
        model.company_id == company_id,
    ).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Linked entry not found"})

    approved = decision == "APPROVE"
    now = ist_now().replace(tzinfo=None)
    note = _text(payload.get("note")) or None
    approval.status = "APPROVED" if approved else "REJECTED"
    approval.decision_note = note
    approval.decided_at = now
    row.approval_status = approval.status
    row.approval_note = note
    row.approved_at = now
    if approval.entry_type == "VISITOR":
        row.approved_by = email
        row.status = "ALLOWED" if approved else "REJECTED"
    else:
        row.status = "APPROVED" if approved else "REJECTED"
    db.commit()
    return {"status": "success", "decision": approval.status, "entry_type": approval.entry_type}


@router.post("/visitors-day-workers/{entry_type}/{record_id}/out")
def mark_visitor_worker_out(entry_type: str, record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    model = VisitorEntry if entry_type == "visitor" else DailyTemporaryWorker if entry_type == "day-worker" else None
    if model is None:
        return JSONResponse(status_code=400, content={"error": "Invalid entry type"})
    row = db.query(model).filter(model.id == record_id, model.company_id == company_id).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Entry not found"})
    if row.out_time:
        return JSONResponse(status_code=400, content={"error": "OUT time is already saved"})
    if row.approval_status != "APPROVED":
        return JSONResponse(status_code=400, content={"error": "Entry must be approved before OUT"})
    row.out_time = ist_now().time().replace(microsecond=0)
    row.status = "OUT" if entry_type == "visitor" else "CLOSED"
    db.commit()
    return {"status": "success", "out_time": row.out_time.isoformat()}


@router.post("/visitors-day-workers/{entry_type}/delete/{record_id}")
def delete_visitor_worker(entry_type: str, record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    model = VisitorEntry if entry_type == "visitor" else DailyTemporaryWorker if entry_type == "day-worker" else None
    if model is None:
        return JSONResponse(status_code=400, content={"error": "Invalid entry type"})
    row = db.query(model).filter(model.id == record_id, model.company_id == company_id).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Entry not found"})
    if row.out_time:
        return JSONResponse(status_code=400, content={"error": "Completed OUT entries cannot be deleted"})
    db.query(EntryApprovalRequest).filter(
        EntryApprovalRequest.company_id == company_id,
        EntryApprovalRequest.entry_type == ("VISITOR" if entry_type == "visitor" else "DAY_WORKER"),
        EntryApprovalRequest.entry_id == record_id,
    ).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"status": "success"}


@router.post("/labour-management/{worker_group}/delete/{record_id}")
def delete_labour_entry(worker_group: str, record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    model = ContractLabour if worker_group == "contract" else DailyTemporaryWorker if worker_group == "daily" else None
    if model is None:
        return JSONResponse(status_code=400, content={"error": "Invalid worker group"})
    row = db.query(model).filter(model.id == record_id, model.company_id == company_id).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Worker entry not found"})
    db.delete(row)
    db.commit()
    return {"status": "success"}


@router.get("/kg-basis-labour")
def kg_basis_labour_data(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    rows = db.query(KgBasisCompanyLabour).filter(
        KgBasisCompanyLabour.company_id == company_id
    ).order_by(KgBasisCompanyLabour.work_date.desc(), KgBasisCompanyLabour.id.desc()).all()
    rates = db.query(kg_basis_labour_rates).filter(
        kg_basis_labour_rates.company_id == company_id,
        kg_basis_labour_rates.status.ilike("active"),
    ).order_by(kg_basis_labour_rates.effective_from.desc()).all()
    workers = db.query(KgBasisWorker).filter(
        KgBasisWorker.company_id == company_id
    ).order_by(KgBasisWorker.id.desc()).all()
    attendance = db.query(KgBasisWorkerAttendance).filter(
        KgBasisWorkerAttendance.company_id == company_id,
        KgBasisWorkerAttendance.attendance_date == ist_now().date(),
    ).order_by(KgBasisWorkerAttendance.in_time.desc()).all()
    return {
        "status": "success",
        "records": [_serialize(row) for row in rows],
        "rates": [_serialize(row) for row in rates],
        "workers": [_serialize(row) for row in workers],
        "attendance": [_serialize(row) for row in attendance],
        "lookups": {
            "species": _lookup_values(db, species, species.species_name, company_id),
            "varieties": _lookup_values(db, varieties, varieties.variety_name, company_id),
            "locations": _lookup_values(db, production_at, production_at.production_at, company_id),
        },
    }


@router.post("/kg-basis-labour/registration/bulk")
async def save_kg_workers(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    members = payload.get("members") or []
    if not isinstance(members, list) or not members:
        return JSONResponse(status_code=400, content={"error": "Add at least one worker"})

    now = ist_now()
    next_number = _next_kg_worker_number(db, company_id)
    company_initial = _first_letter(request.session.get("company_name") or company_id)
    saved = []
    try:
        for member in members:
            worker_name = _text(member.get("worker_name"))
            if not worker_name:
                raise ValueError("Worker name is required for every member")
            if next_number > 99999:
                raise ValueError("KG worker ID sequence has reached 99999")
            row = KgBasisWorker(
                worker_id=f"{company_initial}K{next_number:05d}",
                worker_name=worker_name,
                department=_text(member.get("department")) or None,
                mobile=_text(member.get("mobile")) or None,
                aadhar_number=_text(member.get("aadhar_number")) or None,
                gender=_text(member.get("gender")) or None,
                joining_date=_parse_date(member.get("joining_date"), now.date()),
                production_at=_text(member.get("production_at")) or None,
                remarks=_text(member.get("remarks")) or None,
                email=email,
                company_id=company_id,
                date=now.date(),
                time=now.strftime("%H:%M:%S"),
            )
            db.add(row)
            saved.append(row)
            next_number += 1
        db.commit()
    except (ValueError, TypeError) as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": f"Unable to save KG workers: {exc}"})
    return {"status": "success", "records": [_serialize(row) for row in saved]}


@router.post("/kg-basis-labour/punch")
async def punch_kg_workers(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    raw_ids = payload.get("worker_ids") or [payload.get("worker_id")]
    worker_ids = list(dict.fromkeys(_text(value).upper() for value in raw_ids if _text(value)))
    action = _text(payload.get("action")).upper()
    selected_location = _text(payload.get("location"))
    if not worker_ids or action not in {"IN", "OUT"}:
        return JSONResponse(status_code=400, content={"error": "Enter Worker IDs and select IN or OUT"})

    now = ist_now().replace(tzinfo=None)
    punched = []
    errors = []
    for entered_id in worker_ids:
        worker, resolve_error = _resolve_kg_worker_id(db, company_id, entered_id)
        if not worker:
            errors.append({"worker_id": entered_id, "error": resolve_error})
            continue
        if selected_location and selected_location.upper() != "ALL" and worker.production_at:
            if selected_location.strip().upper() != worker.production_at.strip().upper():
                errors.append({"worker_id": worker.worker_id, "error": "Registered at another location"})
                continue
        active = db.query(KgBasisWorkerAttendance).filter(
            KgBasisWorkerAttendance.company_id == company_id,
            KgBasisWorkerAttendance.worker_id == worker.worker_id,
            KgBasisWorkerAttendance.status == "INSIDE",
            KgBasisWorkerAttendance.out_time.is_(None),
        ).order_by(KgBasisWorkerAttendance.in_time.desc()).first()
        if action == "IN":
            if active:
                errors.append({"worker_id": worker.worker_id, "error": "Already punched IN"})
                continue
            completed_today = db.query(KgBasisWorkerAttendance).filter(
                KgBasisWorkerAttendance.company_id == company_id,
                KgBasisWorkerAttendance.worker_id == worker.worker_id,
                KgBasisWorkerAttendance.attendance_date == now.date(),
            ).first()
            if completed_today:
                errors.append({"worker_id": worker.worker_id, "error": "Today's punches completed"})
                continue
            active = KgBasisWorkerAttendance(
                worker_id=worker.worker_id,
                worker_name=worker.worker_name,
                production_at=worker.production_at,
                attendance_date=now.date(),
                in_time=now,
                status="INSIDE",
                email=email,
                company_id=company_id,
                date=now.date(),
                time=now.strftime("%H:%M:%S"),
            )
            db.add(active)
        else:
            if not active:
                errors.append({"worker_id": worker.worker_id, "error": "No active IN punch"})
                continue
            active.out_time = now
            active.status = "CLOSED"
        punched.append(active)
    if not punched:
        return JSONResponse(status_code=400, content={"error": "No punches were saved", "errors": errors})
    db.commit()
    return {
        "status": "success",
        "message": f"{len(punched)} KG worker punch{'' if len(punched) == 1 else 'es'} saved as {action}",
        "records": [_serialize(row) for row in punched],
        "errors": errors,
    }


@router.post("/kg-basis-labour/worker/delete/{record_id}")
def delete_kg_worker(record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    row = db.query(KgBasisWorker).filter(
        KgBasisWorker.id == record_id,
        KgBasisWorker.company_id == company_id,
    ).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "KG worker not found"})
    db.delete(row)
    db.commit()
    return {"status": "success"}


@router.post("/kg-basis-labour")
async def save_kg_basis_labour(request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    email, company_id = session
    payload = await request.json()
    labour_name = _text(payload.get("labour_name"))
    variety_name = _text(payload.get("variety_name"))
    work_type = _text(payload.get("work_type"))
    quantity = max(0.0, _number(payload.get("quantity_kg")))
    rate = max(0.0, _number(payload.get("rate_per_kg")))
    if not labour_name or not variety_name or not work_type or quantity <= 0:
        return JSONResponse(status_code=400, content={"error": "Worker name, variety, work type and quantity are required"})

    now = ist_now()
    row = KgBasisCompanyLabour(
        labour_name=labour_name,
        work_date=_parse_date(payload.get("work_date"), now.date()),
        production_at=_text(payload.get("production_at")) or None,
        species=_text(payload.get("species")) or None,
        variety_name=variety_name,
        work_type=work_type,
        count_grade=_text(payload.get("count_grade")) or None,
        quantity_kg=quantity,
        rate_per_kg=rate,
        amount=round(quantity * rate, 2),
        in_time=_parse_time(payload.get("in_time")),
        out_time=_parse_time(payload.get("out_time")),
        remarks=_text(payload.get("remarks")) or None,
        email=email,
        company_id=company_id,
        date=now.date(),
        time=now.strftime("%H:%M:%S"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "record": _serialize(row)}


@router.post("/kg-basis-labour/delete/{record_id}")
def delete_kg_basis_labour(record_id: int, request: Request, db: Session = Depends(get_db)):
    session = _session(request)
    if not session:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})
    _, company_id = session
    row = db.query(KgBasisCompanyLabour).filter(
        KgBasisCompanyLabour.id == record_id,
        KgBasisCompanyLabour.company_id == company_id,
    ).first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "KG worker entry not found"})
    db.delete(row)
    db.commit()
    return {"status": "success"}
