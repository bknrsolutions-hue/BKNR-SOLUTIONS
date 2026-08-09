import re
import json
import logging
from decimal import Decimal
from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text, or_

from app.database import get_db
from app.database.models.invoices import ProformaInvoice, ExportDocumentFile, ExportDocumentApproval
from app.database.models.users import Company
from app.database.models.criteria import (
    buyers, buyer_agents, countries, species, varieties, grades, brands,
    glazes, freezers, packing_styles, production_for, production_at
)
from app.database.models.enterprise_finance import BankMaster
from app.database.models.processing import AuditLog
from app.services.bill_accounting import ensure_bill_accounting_schema
from app.services.cache import invalidate_company_cache

from app.routers.export_documents.common import (
    templates,
    get_export_company_profile,
    is_supporting_document_admin,
    write_audit,
    invalidate_export_cache,
    _dt,
    proforma_payload_values,
    update_company_bank_master,
    ProformaInvoiceSchema,
    SupportingDocumentApprovalSchema,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def serialize_proforma(row: ProformaInvoice, db: Session = None) -> dict:
    pending_info = None
    if db:
        try:
            from app.database.models.inventory_management import pending_orders
            p_nums = [p for p in [row.po_number, row.pi_no] if p and str(p).strip()]
            if p_nums:
                po_exist = db.query(pending_orders).filter(
                    pending_orders.company_id == row.company_id,
                    pending_orders.po_number.in_(p_nums)
                ).first()
                if po_exist:
                    pending_info = {
                        "company_name": po_exist.company_name,
                        "production_at": po_exist.production_at,
                        "buyer_name": po_exist.buyer,
                        "agent_name": po_exist.agent_name,
                        "po_number": po_exist.po_number,
                    }
        except Exception:
            pass

    return {
        "id": row.id,
        "pi_no": row.pi_no,
        "pi_date": _dt(row.pi_date),
        "validity_date": _dt(row.validity_date),
        "po_number": row.po_number,
        "buyer_name": row.buyer_name,
        "buyer_address": row.buyer_address,
        "country": row.country,
        "currency": row.currency,
        "incoterm": row.incoterm,
        "payment_terms": row.payment_terms,
        "port_of_loading": row.port_of_loading,
        "port_of_discharge": row.port_of_discharge,
        "product_description": row.product_description,
        "quantity": str(row.quantity or 0),
        "unit": row.unit,
        "unit_price": str(row.unit_price or 0),
        "total_amount": str(row.total_amount or 0),
        "status": row.status,
        "approval_status": row.approval_status or "PENDING",
        "approved_by": row.approved_by,
        "approved_at": _dt(row.approved_at),
        "approval_remarks": row.approval_remarks,
        "remarks": row.remarks,
        "brand": getattr(row, "brand", "") or "",
        "packing_style": getattr(row, "packing_style", "") or "",
        "freezer": getattr(row, "freezer", "") or "",
        "count_glaze": getattr(row, "count_glaze", "") or "",
        "weight_glaze": getattr(row, "weight_glaze", "") or "",
        "species": getattr(row, "species", "") or "",
        "variety": getattr(row, "variety", "") or "",
        "grade": getattr(row, "grade", "") or "",
        "no_of_pieces": getattr(row, "no_of_pieces", "") or "",
        "no_of_mc": getattr(row, "no_of_mc", 0) or 0,
        "items_json": getattr(row, "items_json", "") or "",
        "pending_order_info": pending_info,
        "created_by": row.created_by,
        "created_at": _dt(row.created_at),
    }


@router.get("/proforma_invoice/entry", response_class=HTMLResponse)
def proforma_invoice_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/", status_code=302)
    ensure_bill_accounting_schema(db)
    history = db.query(ProformaInvoice).filter(
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.is_cancelled != True,
    ).order_by(desc(ProformaInvoice.pi_date), desc(ProformaInvoice.id)).all()
    return templates.TemplateResponse(
        request=request,
        name="export_documents/proforma_invoice.html",
        context={"history": history, "company_id": comp_code},
    )


@router.get("/proforma_invoice/data")
def proforma_invoice_data(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ensure_bill_accounting_schema(db)
    rows = db.query(ProformaInvoice).filter(
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.is_cancelled != True,
    ).order_by(desc(ProformaInvoice.pi_date), desc(ProformaInvoice.id)).all()
    audit_rows = db.query(AuditLog).filter(
        AuditLog.company_id == comp_code,
        AuditLog.table_name == "proforma_invoices",
    ).order_by(desc(AuditLog.edited_at), desc(AuditLog.id)).limit(100).all()
    buyer_rows = db.query(buyers).filter(
        buyers.company_id == comp_code,
    ).order_by(buyers.buyer_name).all()
    country_rows = db.query(countries).filter(
        countries.company_id == comp_code,
    ).order_by(countries.country_name).all()
    current_year = date.today().year
    existing_numbers = [
        row.pi_no for row in db.query(ProformaInvoice.pi_no).filter(
            ProformaInvoice.company_id == comp_code,
            ProformaInvoice.pi_no.ilike(f"PI-{current_year}-%"),
        ).all()
    ]
    sequence_values = []
    for number in existing_numbers:
        match = re.search(r"(\d+)$", str(number or ""))
        if match:
            sequence_values.append(int(match.group(1)))
    next_pi_no = f"PI-{current_year}-{max(sequence_values, default=0) + 1:04d}"
    comp_info = get_export_company_profile(db, comp_code)
    return {
        "success": True,
        "can_approve": is_supporting_document_admin(request),
        "company": comp_info,
        "next_pi_no": next_pi_no,
        "buyers": [{
            "name": row.buyer_name,
            "address": row.address or "",
            "country": row.country or "",
            "currency": row.currency_code or "USD",
            "payment_terms": f"{int(row.payment_terms_days or 0)} Days" if row.payment_terms_days else "",
            "contact_person": row.contact_person or "",
            "email": row.buyer_email or "",
            "iec_code": row.iec_code or "",
        } for row in buyer_rows],
        "countries": [row.country_name for row in country_rows],
        "agents": [a.agent_name for a in db.query(buyer_agents).filter(buyer_agents.company_id == comp_code).order_by(buyer_agents.agent_name).all()],
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == comp_code).order_by(brands.brand_name).all()],
        "packing_styles": [p.packing_style for p in db.query(packing_styles).filter(packing_styles.company_id == comp_code).order_by(packing_styles.packing_style).all()],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == comp_code).order_by(freezers.freezer_name).all()],
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == comp_code).order_by(glazes.glaze_name).all()],
        "species": [s.species_name for s in db.query(species).filter(species.company_id == comp_code).order_by(species.species_name).all()],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == comp_code).order_by(varieties.variety_name).all()],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == comp_code).order_by(grades.grade_name).all()],
        "production_for_options": sorted(list(set(
            [p[0].strip() for p in db.query(production_for.production_for).filter(production_for.company_id == comp_code, production_for.production_for != None).distinct().all() if p[0] and p[0].strip()] or ([comp_info.get("name")] if comp_info and comp_info.get("name") else [])
        ))),
        "production_at_options": sorted(list(set(
            [p[0].strip() for p in db.query(production_at.production_at).filter(production_at.company_id == comp_code, production_at.production_at != None).distinct().all() if p[0] and p[0].strip()] or [r.port_of_loading for r in rows if r.port_of_loading and r.port_of_loading.strip()]
        ))),
        "rows": [serialize_proforma(row, db) for row in rows],
        "audit_logs": [{
            "id": audit.id,
            "record_id": audit.record_id,
            "action": audit.field_name,
            "old_value": audit.old_value,
            "new_value": audit.new_value,
            "edited_by": audit.edited_by,
            "edited_at": _dt(audit.edited_at),
        } for audit in audit_rows],
    }


@router.post("/proforma_invoice/save")
def proforma_invoice_save(request: Request, payload: ProformaInvoiceSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    exists = db.query(ProformaInvoice).filter(
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.pi_no == payload.pi_no.strip(),
    ).first()
    if exists:
        return JSONResponse({"success": False, "message": "PI number already exists"}, status_code=400)
    entry = ProformaInvoice(company_id=comp_code, created_by=email, **proforma_payload_values(payload))
    db.add(entry)
    db.flush()
    update_company_bank_master(db, comp_code, payload)
    write_audit(db, "proforma_invoices", entry.id, comp_code, "CREATE", "NONE", f"PI {entry.pi_no}", email)
    db.commit()
    invalidate_export_cache(comp_code)
    return {
        "success": True,
        "message": "Proforma invoice created successfully",
        "record_id": entry.id,
        "print_url": f"/export_documents/proforma_invoice/print/{entry.id}",
        "pdf_url": f"/export_documents/proforma_invoice/pdf/{entry.id}",
    }


@router.put("/proforma_invoice/{record_id}")
def proforma_invoice_update(record_id: int, request: Request, payload: ProformaInvoiceSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    entry = db.query(ProformaInvoice).filter(
        ProformaInvoice.id == record_id,
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.is_cancelled != True,
    ).first()
    if not entry:
        return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)
    duplicate = db.query(ProformaInvoice).filter(
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.pi_no == payload.pi_no.strip(),
        ProformaInvoice.id != record_id,
    ).first()
    if duplicate:
        return JSONResponse({"success": False, "message": "PI number already exists"}, status_code=400)
    old_status = entry.status
    old_approval = entry.approval_status or "PENDING"
    for field, value in proforma_payload_values(payload).items():
        setattr(entry, field, value)
    entry.updated_by = email
    entry.approval_status = "PENDING"
    entry.approved_by = None
    entry.approved_at = None
    entry.approval_remarks = None
    update_company_bank_master(db, comp_code, payload)
    write_audit(db, "proforma_invoices", entry.id, comp_code, "UPDATE", old_status, entry.status, email)
    if old_approval != "PENDING":
        write_audit(db, "proforma_invoices", entry.id, comp_code, "APPROVAL_RESET", old_approval, "PENDING", email)
    db.commit()
    invalidate_export_cache(comp_code)
    return {"success": True, "message": "Proforma invoice updated successfully"}


@router.post("/proforma_invoice/cancel/{record_id}")
def proforma_invoice_cancel(record_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    entry = db.query(ProformaInvoice).filter(
        ProformaInvoice.id == record_id,
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.is_cancelled != True,
    ).first()
    if not entry:
        return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)
    old_status = entry.status
    entry.is_cancelled = True
    entry.status = "CANCELLED"
    entry.updated_by = email
    write_audit(db, "proforma_invoices", entry.id, comp_code, "CANCEL", old_status, "CANCELLED", email)
    db.commit()
    invalidate_export_cache(comp_code)
    return {"success": True, "message": "Proforma invoice cancelled successfully"}


@router.post("/proforma_invoice/{record_id}/approval")
def proforma_invoice_approval(
    record_id: int,
    payload: SupportingDocumentApprovalSchema,
    request: Request,
    db: Session = Depends(get_db),
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    if not is_supporting_document_admin(request):
        return JSONResponse({"success": False, "message": "Admin approval is required"}, status_code=403)
    decision = payload.decision.strip().upper()
    remarks = (payload.remarks or "").strip()[:500]
    if decision not in {"APPROVED", "REJECTED"}:
        return JSONResponse({"success": False, "message": "Decision must be APPROVED or REJECTED"}, status_code=400)
    if decision == "REJECTED" and not remarks:
        return JSONResponse({"success": False, "message": "Rejection remarks are required"}, status_code=400)
    entry = db.query(ProformaInvoice).filter(
        ProformaInvoice.id == record_id,
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.is_cancelled != True,
    ).first()
    if not entry:
        return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)
    old_status = entry.approval_status or "PENDING"
    entry.approval_status = decision
    entry.approved_by = email
    entry.approved_at = datetime.utcnow()
    entry.approval_remarks = remarks or None
    write_audit(
        db, "proforma_invoices", entry.id, comp_code, f"DOCUMENT_{decision}",
        old_status, f"{decision}{f' | {remarks}' if remarks else ''}", email,
    )
    db.commit()
    invalidate_export_cache(comp_code)
    return {"success": True, "message": f"Proforma invoice {decision.lower()} successfully"}


class AddToPendingPayload(BaseModel):
    company_name: Optional[str] = None
    production_at: Optional[str] = None
    buyer_name: Optional[str] = None
    agent_name: Optional[str] = None
    po_number: Optional[str] = None


@router.post("/proforma_invoice/{record_id}/add-to-pending-orders")
def proforma_invoice_add_to_pending_orders(
    record_id: int,
    request: Request,
    payload: Optional[AddToPendingPayload] = None,
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email") or "SYSTEM"
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    entry = db.query(ProformaInvoice).filter(
        ProformaInvoice.id == record_id,
        ProformaInvoice.company_id == comp_code,
        ProformaInvoice.is_cancelled != True,
    ).first()
    if not entry:
        return JSONResponse({"success": False, "message": "Proforma Invoice record not found"}, status_code=404)

    from app.database.models.inventory_management import pending_orders
    from app.services.production_requirements_service import ProductionRequirementService

    final_company_name = (payload and payload.company_name and payload.company_name.strip()) or comp_code
    final_production_at = (payload and payload.production_at and payload.production_at.strip()) or entry.port_of_loading or "APSEZ Plant"
    final_buyer_name = (payload and payload.buyer_name and payload.buyer_name.strip()) or entry.buyer_name or "Export Buyer"
    final_agent_name = (payload and payload.agent_name and payload.agent_name.strip()) or "Direct"
    final_po_number = (payload and payload.po_number and payload.po_number.strip().upper()) or entry.pi_no

    max_sl = db.query(func.max(pending_orders.sl_no)).filter(
        pending_orders.company_id == comp_code
    ).scalar()
    next_sl = (max_sl or 0) + 1

    possible_po_numbers = list(set([
        str(entry.pi_no or "").strip().upper(),
        str(entry.po_number or "").strip().upper(),
        str(final_po_number or "").strip().upper(),
    ]))
    possible_po_numbers = [p for p in possible_po_numbers if p]

    existing_rows = db.query(pending_orders).filter(
        pending_orders.company_id == comp_code,
        pending_orders.po_number.in_(possible_po_numbers)
    ).all()

    target_sl = next_sl
    is_update = False
    if existing_rows:
        is_update = True
        target_sl = existing_rows[0].sl_no or next_sl
        for old_r in existing_rows:
            db.delete(old_r)
        db.flush()

    entry.po_number = final_po_number
    entry.status = "ACCEPTED"

    items_list = []
    if entry.items_json:
        try:
            parsed = json.loads(entry.items_json)
            if isinstance(parsed, list) and len(parsed) > 0:
                items_list = parsed
        except Exception:
            pass

    if not items_list:
        items_list = [{
            "brand": entry.brand or "N/A",
            "packing_style": entry.packing_style or "10x1kg",
            "freezer": entry.freezer or "IQF",
            "count_glaze": entry.count_glaze or "0",
            "weight_glaze": entry.weight_glaze or "0",
            "species": entry.species or "Shrimp",
            "variety": entry.variety or "PD",
            "grade": entry.grade or "21/25",
            "no_of_mc": int(entry.no_of_mc or entry.quantity or 100),
            "unit_price": float(entry.unit_price or 5.0),
        }]

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    shipment_dt_str = str(entry.validity_date or entry.pi_date or today_str)

    def _calc_pcs(grade_str, manual_pcs=None):
        try:
            if manual_pcs is not None and str(manual_pcs).strip():
                val = int(float(str(manual_pcs).strip()))
                if val > 0:
                    return val
            nums = re.findall(r'\d+', str(grade_str or ""))
            if nums:
                last_num = int(nums[-1])
                return int(round(last_num * 2.2))
        except Exception:
            pass
        return 0

    added_count = 0
    for it in items_list:
        grade_str = str(it.get("grade") or entry.grade or "21/25")
        raw_pcs = it.get("no_of_pieces") or it.get("pieces") or entry.no_of_pieces
        pieces_val = _calc_pcs(grade_str, raw_pcs)

        p_row = pending_orders(
            sl_no=target_sl,
            company_name=final_company_name,
            po_number=final_po_number,
            buyer=final_buyer_name,
            agent_name=final_agent_name,
            country=entry.country or "India",
            shipment_date=shipment_dt_str,
            production_at=final_production_at,
            exchange_rate=83.5,
            brand=str(it.get("brand") or entry.brand or "N/A"),
            packing_style=str(it.get("packing_style") or entry.packing_style or "10x1kg"),
            freezer=str(it.get("freezer") or entry.freezer or "IQF"),
            count_glaze=str(it.get("count_glaze") or entry.count_glaze or "0"),
            weight_glaze=str(it.get("weight_glaze") or entry.weight_glaze or "0"),
            species=str(it.get("species") or entry.species or "Shrimp"),
            variety=str(it.get("variety") or entry.variety or "PD"),
            grade=grade_str,
            no_of_pieces=pieces_val,
            no_of_mc=int(it.get("no_of_mc") or it.get("quantity") or entry.no_of_mc or 100),
            selling_price=float(it.get("unit_price") or it.get("price") or entry.unit_price or 0.0),
            company_id=comp_code,
            email=email,
            date=today_str,
            progress_steps="pending"
        )
        db.add(p_row)
        added_count += 1

    entry.status = "ACCEPTED"
    db.commit()

    try:
        ProductionRequirementService.refresh_requirements(db=db, company_id=comp_code)
    except Exception as e:
        logger.warning(f"Production requirements refresh exception: {e}")

    write_audit(db, "proforma_invoices", entry.id, comp_code, "ADD_TO_PENDING_ORDERS", entry.status, "UPDATED_IN_PENDING_ORDERS" if is_update else "ADDED_TO_PENDING_ORDERS", email)
    msg = f"🔄 Pending Order for PI #{entry.pi_no} updated successfully!" if is_update else f"✅ PI #{entry.pi_no} added to Pending Orders list! ({added_count} line item(s) created)"

    return JSONResponse({
        "success": True,
        "message": msg
    })
