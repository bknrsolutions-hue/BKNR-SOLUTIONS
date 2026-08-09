import json
import logging
from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text

from app.database import get_db
from app.database.models.invoices import (
    ExportShipment,
    CommercialInvoice,
    ExportDocumentFile,
    ExportDocumentApproval,
    ExportRequiredDocument,
    ProformaInvoice,
)
from app.database.models.processing import AuditLog
from app.routers.export_documents.common import (
    templates,
    write_audit,
    is_supporting_document_admin,
    EXPORT_SUPPORT_DOCUMENT_TYPES,
    EXPORT_REQUIREMENT_STAGE_FIELDS,
    EXPORT_REQUIREMENT_COMMON_FIELDS,
    store_export_pdf,
    set_document_path,
    _dt,
    safe_filename,
    SupportingDocumentApprovalSchema,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================
# SUPPORTING DOCUMENTS & CHECKLIST DATA
# ============================================================
@router.get("/supporting_documents/entry", response_class=HTMLResponse)
def export_supporting_documents_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse(
        request=request,
        name="export_documents/supporting_documents.html",
        context={"company_id": comp_code, "document_types": EXPORT_SUPPORT_DOCUMENT_TYPES},
    )


@router.get("/supporting_documents/data")
def export_supporting_documents_data(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    email = request.session.get("email") or ""
    is_admin = is_supporting_document_admin(request)

    # 1. Fetch active shipments and linked POs
    shipments = db.query(ExportShipment).filter(
        ExportShipment.company_id == comp_code,
        ExportShipment.is_cancelled != True
    ).order_by(desc(ExportShipment.id)).all()

    po_options = []
    po_to_shipment = {}
    for s in shipments:
        po_num = (s.po_number or s.shipment_no or "").strip()
        if po_num:
            po_options.append({
                "po_number": po_num,
                "shipment_no": s.shipment_no,
                "shipment_id": s.id,
                "buyer_name": s.buyer_name or "",
            })
            po_to_shipment[po_num] = s

    # 2. Fetch requirements by PO
    req_rows = db.query(ExportRequiredDocument).filter(
        ExportRequiredDocument.company_id == comp_code
    ).all()
    requirements_by_po = {}
    for r in req_rows:
        requirements_by_po.setdefault(r.po_number, []).append({
            "code": r.document_kind,
            "label": r.document_label,
            "stage": getattr(r, "stage", None) or "Custom Documents",
        })

    # 3. Fetch uploaded document files
    files = db.query(ExportDocumentFile).filter(
        ExportDocumentFile.company_id == comp_code,
        ExportDocumentFile.is_current == True
    ).order_by(desc(ExportDocumentFile.id)).all()

    files_by_key = {}
    for f in files:
        key = (f.record_id, f.document_kind)
        if key not in files_by_key:
            files_by_key[key] = f

    # 4. Fetch Audit Logs
    audit_logs = db.query(AuditLog).filter(
        AuditLog.company_id == comp_code,
        AuditLog.table_name == "export_supporting"
    ).order_by(desc(AuditLog.id)).limit(50).all()

    # 5. Build group objects per PO
    po_groups = []
    doc_label_map = {d["code"]: d["label"] for d in EXPORT_SUPPORT_DOCUMENT_TYPES}

    for po_item in po_options:
        po = po_item["po_number"]
        shipment = po_to_shipment.get(po)
        req_list = requirements_by_po.get(po, [])
        req_codes = {r["code"] for r in req_list}

        rows = []
        for r in req_list:
            code = r["code"]
            f = files_by_key.get((shipment.id if shipment else 0, code))
            rows.append({
                "document_kind": code,
                "document_label": r["label"],
                "required": True,
                "status": "APPROVED" if (f and f.approval_status == "APPROVED") else ("UPLOADED" if f else "PENDING"),
                "approval_status": f.approval_status if f else "PENDING",
                "file_id": f.id if f else None,
                "file_name": f.file_name if f else None,
                "document_no": f.document_no if f else None,
                "version_no": f.version_no if f else None,
                "download_url": f.file_path if f else None,
                "approved_by": f.approved_by if f else None,
                "approved_at": _dt(f.approved_at) if f and f.approved_at else None,
                "can_current_user_approve": is_admin,
            })

        po_groups.append({
            "po_number": po,
            "shipment_no": shipment.shipment_no if shipment else po,
            "buyer_name": shipment.buyer_name if shipment else "",
            "required_count": len(req_list),
            "status": "COMPLETED" if all(r["status"] == "APPROVED" for r in rows) and rows else ("IN_PROGRESS" if any(r["status"] != "PENDING" for r in rows) else "PENDING"),
            "rows": rows,
        })

    return {
        "success": True,
        "is_admin": is_admin,
        "po_options": po_options,
        "document_types": EXPORT_SUPPORT_DOCUMENT_TYPES,
        "requirements_by_po": requirements_by_po,
        "po_groups": po_groups,
        "audit_logs": [{
            "id": a.id,
            "record_id": a.record_id,
            "action": a.field_name,
            "old_value": a.old_value,
            "new_value": a.new_value,
            "edited_by": a.edited_by,
            "edited_at": _dt(a.edited_at),
        } for a in audit_logs],
    }


@router.post("/supporting_documents/requirements")
def save_supporting_requirements(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email") or ""
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    try:
        data = request.json() if callable(getattr(request, "json", None)) else {}
    except Exception:
        data = {}

    po_number = str(data.get("po_number") or "").strip()
    documents = data.get("documents") or []
    if not po_number:
        return JSONResponse({"success": False, "message": "PO Number is required"}, status_code=400)

    db.query(ExportRequiredDocument).filter(
        ExportRequiredDocument.company_id == comp_code,
        ExportRequiredDocument.po_number == po_number
    ).delete()

    doc_label_map = {d["code"]: (d["label"], d["stage"]) for d in EXPORT_SUPPORT_DOCUMENT_TYPES}

    for d in documents:
        code = d.get("code") if isinstance(d, dict) else str(d)
        label = (d.get("label") if isinstance(d, dict) else None) or doc_label_map.get(code, (code, "Custom"))[0]
        stage = doc_label_map.get(code, (code, "Custom Documents"))[1]
        db.add(ExportRequiredDocument(
            company_id=comp_code,
            po_number=po_number,
            document_kind=code,
            document_label=label,
            created_by=email,
        ))

    write_audit(db, "export_supporting", 0, comp_code, "UPDATE_REQUIREMENTS", "NONE", f"Configured {len(documents)} required docs for PO {po_number}", email)
    db.commit()
    return {"success": True, "message": f"Saved {len(documents)} required documents for PO {po_number}"}


@router.post("/supporting_documents/upload")
async def upload_supporting_document(
    request: Request,
    shipment_id: int = Form(...),
    document_kind: str = Form(...),
    document_no: str = Form(""),
    remarks: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email") or ""
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    shipment = db.query(ExportShipment).filter(
        ExportShipment.id == shipment_id,
        ExportShipment.company_id == comp_code
    ).first()
    if not shipment:
        return JSONResponse({"success": False, "message": "Shipment not found"}, status_code=404)

    content = await file.read()
    if not content:
        return JSONResponse({"success": False, "message": "Empty file"}, status_code=400)

    file_row = store_export_pdf(
        db=db,
        company_id=comp_code,
        module_name="export_supporting",
        record_id=shipment.id,
        document_no=document_no or shipment.po_number or shipment.shipment_no,
        document_kind=document_kind,
        file_name=file.filename or "supporting_doc.pdf",
        content=content,
        uploaded_by=email,
        remarks=remarks
    )
    file_row.approval_status = "PENDING"
    write_audit(db, "export_supporting", file_row.id, comp_code, "UPLOAD", "NONE", f"Uploaded {document_kind} for {shipment.shipment_no}", email)
    db.commit()
    return {"success": True, "message": "Document uploaded successfully and pending approval", "file_id": file_row.id}


@router.post("/supporting_documents/files/{file_id}/approval")
def approve_supporting_document_file(
    file_id: int,
    payload: SupportingDocumentApprovalSchema,
    request: Request,
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email") or ""
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    if not is_supporting_document_admin(request):
        return JSONResponse({"success": False, "message": "Admin privileges required"}, status_code=403)

    file_row = db.query(ExportDocumentFile).filter(
        ExportDocumentFile.id == file_id,
        ExportDocumentFile.company_id == comp_code
    ).first()
    if not file_row:
        return JSONResponse({"success": False, "message": "Document file not found"}, status_code=404)

    decision = payload.decision.strip().upper()
    if decision not in {"APPROVED", "REJECTED"}:
        return JSONResponse({"success": False, "message": "Invalid decision"}, status_code=400)

    file_row.approval_status = decision
    file_row.approved_by = email
    file_row.approved_at = datetime.utcnow()
    write_audit(db, "export_supporting", file_row.id, comp_code, f"DOCUMENT_{decision}", "PENDING", decision, email)
    db.commit()
    return {"success": True, "message": f"Document status updated to {decision}"}


# ============================================================
# REQUIREMENT PAGES & CATALOG (DOCUMENT CENTER)
# ============================================================
@router.get("/requirement-pages/entry", response_class=HTMLResponse)
@router.get("/requirement/{doc_kind}/entry", response_class=HTMLResponse)
def requirement_pages_entry(request: Request, doc_kind: str | None = None, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse(
        request=request,
        name="export_documents/supporting_documents.html",
        context={"company_id": comp_code, "document_types": EXPORT_SUPPORT_DOCUMENT_TYPES, "doc_kind": doc_kind},
    )


@router.get("/requirement-pages/catalog")
def requirement_pages_catalog(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    stage_groups = []
    for stage_name, fields in EXPORT_REQUIREMENT_STAGE_FIELDS.items():
        stage_groups.append({
            "stage_name": stage_name,
            "stage_fields": fields,
        })

    return {
        "success": True,
        "document_types": EXPORT_SUPPORT_DOCUMENT_TYPES,
        "stage_groups": stage_groups,
        "common_fields": EXPORT_REQUIREMENT_COMMON_FIELDS,
    }


@router.get("/requirement-pages/data")
def requirement_pages_data(request: Request, db: Session = Depends(get_db)):
    return export_supporting_documents_data(request, db)


@router.get("/requirement/{doc_kind}/data")
def export_requirement_doc_data(doc_kind: str, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    doc_type_info = next((d for d in EXPORT_SUPPORT_DOCUMENT_TYPES if d["code"] == doc_kind), None)
    if not doc_type_info:
        doc_type_info = {"code": doc_kind, "label": doc_kind.replace("_", " ").title(), "stage": "Custom Documents"}

    from app.routers.export_documents.common import export_document_mode
    stage_fields = EXPORT_REQUIREMENT_STAGE_FIELDS.get(doc_type_info["stage"], EXPORT_REQUIREMENT_COMMON_FIELDS)

    definition = {
        "kind": doc_kind,
        "label": doc_type_info["label"],
        "stage": doc_type_info["stage"],
        "document_mode": export_document_mode(doc_kind),
        "reference_label": "PO Number / Shipment",
        "pre_po_allowed": True,
        "fields": stage_fields,
    }

    shipments = db.query(ExportShipment).filter(
        ExportShipment.company_id == comp_code,
        ExportShipment.is_cancelled != True
    ).order_by(desc(ExportShipment.id)).all()

    po_options = [{
        "po_number": (s.po_number or s.shipment_no),
        "shipment_no": s.shipment_no,
        "shipment_id": s.id,
        "buyer_name": s.buyer_name or "",
        "country": s.country or "",
        "document_date": _dt(s.created_at),
    } for s in shipments if (s.po_number or s.shipment_no)]

    from app.database.models.users import Company, User
    company = db.query(Company).filter(
        func.upper(func.trim(Company.company_code)) == comp_code.strip().upper()
    ).first()
    users = db.query(User).filter(User.company_id == company.id).all() if company else db.query(User).all()
    email_options = [{
        "name": u.name or u.email,
        "email": u.email,
        "designation": u.designation or u.role or "User",
    } for u in users if u.email]

    from app.database.models.criteria import buyers, countries, species, varieties, grades, brands, glazes, freezers, packing_styles
    lookup_options = {
        "buyers": [b.buyer_name for b in db.query(buyers).filter(buyers.company_id == comp_code).all()],
        "countries": [c.country_name for c in db.query(countries).filter(countries.company_id == comp_code).all()],
        "species": [s.species_name for s in db.query(species).filter(species.company_id == comp_code).all()],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == comp_code).all()],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == comp_code).all()],
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == comp_code).all()],
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == comp_code).all()],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == comp_code).all()],
        "packing_styles": [p.packing_style for p in db.query(packing_styles).filter(packing_styles.company_id == comp_code).all()],
    }

    files = db.query(ExportDocumentFile).filter(
        ExportDocumentFile.company_id == comp_code,
        ExportDocumentFile.document_kind == doc_kind,
        ExportDocumentFile.is_current == True
    ).order_by(desc(ExportDocumentFile.id)).all()

    entries = []
    for f in files:
        details_map = {}
        if f.details_json:
            try:
                details_map = json.loads(f.details_json)
            except Exception:
                pass
        entries.append({
            "id": f.id,
            "shipment_no": f.document_no or "",
            "po_number": f.document_no or "",
            "buyer_name": details_map.get("buyer_name") or "",
            "approval_status": f.approval_status or "PENDING",
            "approval_progress": "1/1" if f.approval_status == "APPROVED" else "0/1",
            "download_url": f.file_path,
            "version_no": f.version_no or 1,
            "file_origin": "UPLOADED",
            "details": details_map,
            "approvals": [{"email": f.approved_by, "decision": f.approval_status}] if f.approved_by else [],
            "pending_approvers": [] if f.approval_status == "APPROVED" else [request.session.get("email")],
            "can_current_user_approve": is_supporting_document_admin(request),
        })

    return {
        "success": True,
        "definition": definition,
        "entries": entries,
        "po_options": po_options,
        "email_options": email_options,
        "lookup_options": lookup_options,
        "current_email": request.session.get("email") or "",
    }

