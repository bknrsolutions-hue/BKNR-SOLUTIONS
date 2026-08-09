import logging
from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.database.models.invoices import CommercialInvoice, ExportShipment, PackingList, ContainerStuffing, ShippingBill, BillOfLading, HealthCertificate
from app.services.bill_accounting import (
    cancel_linked_bill_voucher,
    ensure_bill_accounting_schema,
    post_export_sales_invoice,
)
from app.services.cache import invalidate_company_cache

from app.routers.export_documents.common import (
    templates,
    write_audit,
    invalidate_export_cache,
    CommercialInvoiceSchema,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def refresh_compliance(db: Session, company_id: str, shipment_no: str) -> None:
    from app.database.models.invoices import ExportComplianceTracker
    tracker = db.query(ExportComplianceTracker).filter(
        ExportComplianceTracker.company_id == company_id,
        ExportComplianceTracker.shipment_no == shipment_no,
    ).first()
    if not tracker:
        return
    invoice = db.query(CommercialInvoice).filter(
        CommercialInvoice.company_id == company_id,
        CommercialInvoice.shipment_no == shipment_no,
        CommercialInvoice.is_cancelled != True,
    ).first()
    tracker.invoice_pending = invoice is None
    if not invoice:
        tracker.packing_list_pending = True
        tracker.health_cert_pending = True
        tracker.shipping_bill_pending = True
        tracker.bl_pending = True
        return
    common = (lambda model: db.query(model).filter(
        model.company_id == company_id,
        model.invoice_no == invoice.invoice_no,
        model.is_cancelled != True,
    ).first() is None)
    tracker.packing_list_pending = common(PackingList)
    tracker.health_cert_pending = common(HealthCertificate)
    tracker.shipping_bill_pending = common(ShippingBill)
    tracker.bl_pending = common(BillOfLading)


@router.get("/commercial_invoice/entry", response_class=HTMLResponse)
def commercial_invoice_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/", status_code=302)
    history = db.query(CommercialInvoice).filter(
        CommercialInvoice.company_id == comp_code,
        CommercialInvoice.is_cancelled != True
    ).order_by(desc(CommercialInvoice.invoice_date)).all()
    shipments = db.query(ExportShipment).filter(
        ExportShipment.company_id == comp_code,
        ExportShipment.is_cancelled != True
    ).all()
    return templates.TemplateResponse(
        request=request,
        name="export_documents/commercial_invoice.html",
        context={"history": history, "shipments": shipments, "company_id": comp_code}
    )


@router.post("/commercial_invoice/save")
def commercial_invoice_save(request: Request, payload: CommercialInvoiceSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    ensure_bill_accounting_schema(db)
    
    exists = db.query(CommercialInvoice).filter(
        CommercialInvoice.company_id == comp_code,
        CommercialInvoice.invoice_no == payload.invoice_no
    ).first()
    if exists:
        return JSONResponse({"success": False, "message": "Commercial Invoice No already registered"}, status_code=400)
    shipment = db.query(ExportShipment).filter(
        ExportShipment.company_id == comp_code,
        ExportShipment.shipment_no == payload.shipment_no,
        ExportShipment.is_cancelled != True,
    ).first()
    if not shipment:
        return JSONResponse({"success": False, "message": "Select a valid export shipment for this company"}, status_code=400)
    if shipment.invoice_no:
        return JSONResponse({"success": False, "message": "This shipment already has a commercial invoice"}, status_code=400)
    
    try:
        inr_value = payload.total_amount * payload.exchange_rate
        entry = CommercialInvoice(
            company_id=comp_code,
            invoice_value_inr=inr_value,
            created_by=email,
            **payload.model_dump()
        )
        db.add(entry)
        db.flush()

        voucher = post_export_sales_invoice(
            db,
            comp_code,
            payload.invoice_date,
            payload.invoice_no,
            payload.buyer_name,
            inr_value,
            email,
        )
        entry.journal_id = voucher.id
        entry.status = "POSTED"

        shipment.invoice_no = entry.invoice_no
        refresh_compliance(db, comp_code, shipment.shipment_no)

        write_audit(db, "commercial_invoices", entry.id, comp_code, "CREATE", "NONE", f"Invoice Registered: {payload.invoice_no}", email)
        db.commit()
        invalidate_export_cache(comp_code)
        return {
            "success": True,
            "message": "Commercial invoice registered and posted to accounts",
            "record_id": entry.id,
            "print_url": f"/export_documents/commercial_invoice/print/{entry.id}",
            "pdf_url": f"/export_documents/commercial_invoice/pdf/{entry.id}",
        }
    except Exception as exc:
        db.rollback()
        logger.exception("Commercial invoice accounting post failed")
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/commercial_invoice/cancel/{log_id}")
@router.post("/commercial_invoice/delete/{log_id}")
def commercial_invoice_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    ensure_bill_accounting_schema(db)
    entry = db.query(CommercialInvoice).filter(
        CommercialInvoice.id == log_id,
        CommercialInvoice.company_id == comp_code
    ).first()
    if entry:
        for model in (PackingList, ContainerStuffing, ShippingBill, BillOfLading, HealthCertificate):
            if db.query(model).filter(model.company_id == comp_code, model.invoice_no == entry.invoice_no, model.is_cancelled != True).first():
                return JSONResponse({"success": False, "message": "Cancel linked export documents before cancelling this invoice"}, status_code=400)
        cancel_linked_bill_voucher(db, comp_code, entry.journal_id, email)
        cancel_linked_bill_voucher(db, comp_code, entry.cogs_journal_id, email)
        write_audit(db, "commercial_invoices", entry.id, comp_code, "CANCEL", entry.status, "CANCELLED", email)
        entry.is_cancelled = True
        entry.status = "CANCELLED"
        shipment = db.query(ExportShipment).filter(
            ExportShipment.company_id == comp_code,
            ExportShipment.shipment_no == entry.shipment_no
        ).first()
        if shipment and shipment.invoice_no == entry.invoice_no:
            shipment.invoice_no = None
        refresh_compliance(db, comp_code, entry.shipment_no)
        db.commit()
        invalidate_export_cache(comp_code)
        return {"success": True, "message": "Commercial invoice cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)
