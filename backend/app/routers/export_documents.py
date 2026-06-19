from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from datetime import date, datetime
import logging

from app.database import get_db
from app.database.models.invoices import (
    ExportShipment,
    ExportComplianceTracker,
    CommercialInvoice,
    PackingList,
    ContainerStuffing,
    ShippingBill,
    BillOfLading,
    HealthCertificate
)
from app.database.models.processing import AuditLog  # Audit trails

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# Pydantic schemas for data validation
class ExportShipmentSchema(BaseModel):
    shipment_no: str
    po_number: str
    invoice_no: str = None
    container_no: str = None
    buyer_name: str
    country: str
    etd: date = None
    eta: date = None

class CommercialInvoiceSchema(BaseModel):
    shipment_no: str
    invoice_no: str
    po_number: str
    container_no: str = None
    buyer_name: str
    invoice_date: date
    buyer_address: str
    consignee_name: str = None
    notify_party: str = None
    country: str
    currency: str = "USD"
    exchange_rate: float = 83.50
    total_amount: float
    payment_terms: str
    shipment_terms: str

class PackingListSchema(BaseModel):
    packing_no: str
    invoice_no: str
    po_number: str = None
    container_no: str = None
    buyer_name: str = None
    product_name: str
    grade: str
    batch_no: str = None
    lot_no: str = None
    glaze: str = None
    freezing_type: str = None
    packing_style: str
    inner_pack: str = None
    outer_pack: str = None
    master_cartons: int = 0
    net_weight: float = 0.0
    gross_weight: float = 0.0

class ContainerStuffingSchema(BaseModel):
    container_no: str
    invoice_no: str = None
    po_number: str = None
    buyer_name: str = None
    seal_no: str
    shipping_line: str = None
    stuffing_date: date
    stuffing_location: str = None
    container_type: str = "Reefer"
    container_size: str = "40FT"
    temperature: float
    vehicle_no: str
    loading_supervisor: str

class ShippingBillSchema(BaseModel):
    shipping_bill_no: str
    shipping_bill_date: date
    invoice_no: str
    container_no: str = None
    po_number: str = None
    buyer_name: str = None
    shipping_bill_value: float = 0.0
    drawback_amount: float = 0.0
    scheme: str = "NONE"
    customs_status: str = "LEO"
    port: str
    cha_name: str
    vessel_name: str
    voyage_no: str
    etd: date
    eta: date

class BillOfLadingSchema(BaseModel):
    bl_no: str
    bl_date: date
    invoice_no: str
    container_no: str
    po_number: str = None
    buyer_name: str = None
    shipping_line: str
    seal_no: str
    freight_terms: str = "PREPAID"
    no_of_original_bl: int = 3
    gross_weight: float = 0.0
    net_weight: float = 0.0

class HealthCertificateSchema(BaseModel):
    certificate_no: str
    issue_date: date
    authority: str = "EIA"
    invoice_no: str
    container_no: str
    po_number: str = None
    buyer_name: str = None
    country: str = None
    species: str = None
    temperature_verified: bool = True
    issued_by: str = None


# Helper function to audit actions
def write_audit(db: Session, table: str, rec_id: int, company_id: str, action: str, old: str, new: str, email: str):
    audit = AuditLog(
        table_name=table,
        record_id=rec_id,
        company_id=company_id,
        field_name=action,
        old_value=old,
        new_value=new,
        edited_by=email,
        edited_at=datetime.utcnow()
    )
    db.add(audit)

# ============================================================
# 1. EXPORT SHIPMENTS
# ============================================================
@router.get("/export_shipment/entry", response_class=HTMLResponse)
def export_shipment_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code).order_by(desc(ExportShipment.created_at)).all()
    return templates.TemplateResponse(request=request, name="export_documents/export_shipment.html", context={"history": history, "company_id": comp_code})

@router.post("/export_shipment/save")
def export_shipment_save(request: Request, payload: ExportShipmentSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.shipment_no == payload.shipment_no).first()
    if exists: return JSONResponse({"success": False, "message": "Shipment Number already registered"}, status_code=400)
    
    entry = ExportShipment(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Create companion Compliance checklist automatically
    compliance = ExportComplianceTracker(
        shipment_no=entry.shipment_no,
        invoice_pending=True,
        packing_list_pending=True,
        health_cert_pending=True,
        shipping_bill_pending=True,
        bl_pending=True,
        payment_pending=True
    )
    db.add(compliance)
    
    write_audit(db, "export_shipments", entry.id, comp_code, "CREATE", "NONE", f"Shipment Registered: {payload.shipment_no}", email)
    db.commit()
    return {"success": True, "message": "Export shipment registered successfully"}

@router.post("/export_shipment/delete/{log_id}")
def export_shipment_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ExportShipment).filter(ExportShipment.id == log_id, ExportShipment.company_id == comp_code).first()
    if entry:
        # Delete compliance checklist also
        comp_tracker = db.query(ExportComplianceTracker).filter(ExportComplianceTracker.shipment_no == entry.shipment_no).first()
        if comp_tracker:
            db.delete(comp_tracker)
        write_audit(db, "export_shipments", entry.id, comp_code, "DELETE", f"Shipment: {entry.shipment_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Export shipment deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 2. COMMERCIAL INVOICE
# ============================================================
@router.get("/commercial_invoice/entry", response_class=HTMLResponse)
def commercial_invoice_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).order_by(desc(CommercialInvoice.invoice_date)).all()
    shipments = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="export_documents/commercial_invoice.html", context={"history": history, "shipments": shipments, "company_id": comp_code})

@router.post("/commercial_invoice/save")
def commercial_invoice_save(request: Request, payload: CommercialInvoiceSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
    if exists: return JSONResponse({"success": False, "message": "Commercial Invoice No already registered"}, status_code=400)
    
    inr_value = payload.total_amount * payload.exchange_rate
    entry = CommercialInvoice(
        company_id=comp_code,
        invoice_value_inr=inr_value,
        created_by=email,
        **payload.dict()
    )
    db.add(entry)
    db.flush()
    
    # Update ExportShipment and ExportComplianceTracker status
    shipment = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.shipment_no == payload.shipment_no).first()
    if shipment:
        shipment.invoice_no = entry.invoice_no
        tracker = db.query(ExportComplianceTracker).filter(ExportComplianceTracker.shipment_no == shipment.shipment_no).first()
        if tracker:
            tracker.invoice_pending = False
            
    write_audit(db, "commercial_invoices", entry.id, comp_code, "CREATE", "NONE", f"Invoice Registered: {payload.invoice_no}", email)
    db.commit()
    return {"success": True, "message": "Commercial invoice registered successfully"}

@router.post("/commercial_invoice/delete/{log_id}")
def commercial_invoice_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(CommercialInvoice).filter(CommercialInvoice.id == log_id, CommercialInvoice.company_id == comp_code).first()
    if entry:
        write_audit(db, "commercial_invoices", entry.id, comp_code, "DELETE", f"Invoice: {entry.invoice_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Commercial invoice deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 3. PACKING LIST
# ============================================================
@router.get("/packing_list/entry", response_class=HTMLResponse)
def packing_list_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(PackingList).filter(PackingList.company_id == comp_code).order_by(desc(PackingList.created_at)).all()
    invoices = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="export_documents/packing_list.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/packing_list/save")
def packing_list_save(request: Request, payload: PackingListSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    entry = PackingList(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker packing list pending status
    invoice = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
    if invoice:
        tracker = db.query(ExportComplianceTracker).filter(ExportComplianceTracker.shipment_no == invoice.shipment_no).first()
        if tracker:
            tracker.packing_list_pending = False
            
    write_audit(db, "packing_lists", entry.id, comp_code, "CREATE", "NONE", f"Packing Item: {payload.packing_no}", email)
    db.commit()
    return {"success": True, "message": "Packing list line item recorded successfully"}

@router.post("/packing_list/delete/{log_id}")
def packing_list_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(PackingList).filter(PackingList.id == log_id, PackingList.company_id == comp_code).first()
    if entry:
        write_audit(db, "packing_lists", entry.id, comp_code, "DELETE", f"Packing No: {entry.packing_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Packing list entry deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 4. CONTAINER STUFFING
# ============================================================
@router.get("/container_stuffing/entry", response_class=HTMLResponse)
def container_stuffing_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ContainerStuffing).filter(ContainerStuffing.company_id == comp_code).order_by(desc(ContainerStuffing.stuffing_date)).all()
    invoices = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="export_documents/container_stuffing.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/container_stuffing/save")
def container_stuffing_save(request: Request, payload: ContainerStuffingSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ContainerStuffing).filter(ContainerStuffing.company_id == comp_code, ContainerStuffing.container_no == payload.container_no).first()
    if exists: return JSONResponse({"success": False, "message": "Container stuffing already logged"}, status_code=400)
    
    entry = ContainerStuffing(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportShipment container No
    if payload.invoice_no:
        invoice = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
        if invoice:
            shipment = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.shipment_no == invoice.shipment_no).first()
            if shipment:
                shipment.container_no = entry.container_no
                
    write_audit(db, "container_stuffing", entry.id, comp_code, "CREATE", "NONE", f"Container Stuffing: {payload.container_no}", email)
    db.commit()
    return {"success": True, "message": "Container stuffing log recorded successfully"}

@router.post("/container_stuffing/delete/{log_id}")
def container_stuffing_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ContainerStuffing).filter(ContainerStuffing.id == log_id, ContainerStuffing.company_id == comp_code).first()
    if entry:
        write_audit(db, "container_stuffing", entry.id, comp_code, "DELETE", f"Container: {entry.container_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Container stuffing record deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 5. SHIPPING BILL
# ============================================================
@router.get("/shipping_bill/entry", response_class=HTMLResponse)
def shipping_bill_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ShippingBill).filter(ShippingBill.company_id == comp_code).order_by(desc(ShippingBill.shipping_bill_date)).all()
    invoices = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="export_documents/shipping_bill.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/shipping_bill/save")
def shipping_bill_save(request: Request, payload: ShippingBillSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ShippingBill).filter(ShippingBill.company_id == comp_code, ShippingBill.shipping_bill_no == payload.shipping_bill_no).first()
    if exists: return JSONResponse({"success": False, "message": "Shipping Bill Number already registered"}, status_code=400)
    
    entry = ShippingBill(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker shipping bill pending status
    invoice = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
    if invoice:
        tracker = db.query(ExportComplianceTracker).filter(ExportComplianceTracker.shipment_no == invoice.shipment_no).first()
        if tracker:
            tracker.shipping_bill_pending = False
            
    write_audit(db, "shipping_bills", entry.id, comp_code, "CREATE", "NONE", f"Shipping Bill: {payload.shipping_bill_no}", email)
    db.commit()
    return {"success": True, "message": "Shipping Bill successfully registered"}

@router.post("/shipping_bill/delete/{log_id}")
def shipping_bill_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ShippingBill).filter(ShippingBill.id == log_id, ShippingBill.company_id == comp_code).first()
    if entry:
        write_audit(db, "shipping_bills", entry.id, comp_code, "DELETE", f"SB No: {entry.shipping_bill_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Shipping bill record removed successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 6. BILL OF LADING
# ============================================================
@router.get("/bill_of_lading/entry", response_class=HTMLResponse)
def bill_of_lading_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(BillOfLading).filter(BillOfLading.company_id == comp_code).order_by(desc(BillOfLading.bl_date)).all()
    invoices = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="export_documents/bill_of_lading.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/bill_of_lading/save")
def bill_of_lading_save(request: Request, payload: BillOfLadingSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(BillOfLading).filter(BillOfLading.company_id == comp_code, BillOfLading.bl_no == payload.bl_no).first()
    if exists: return JSONResponse({"success": False, "message": "BL Number already registered"}, status_code=400)
    
    entry = BillOfLading(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker BL pending status
    invoice = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
    if invoice:
        tracker = db.query(ExportComplianceTracker).filter(ExportComplianceTracker.shipment_no == invoice.shipment_no).first()
        if tracker:
            tracker.bl_pending = False
            
    write_audit(db, "bill_of_ladings", entry.id, comp_code, "CREATE", "NONE", f"BL Entry: {payload.bl_no}", email)
    db.commit()
    return {"success": True, "message": "Bill of Lading recorded successfully"}

@router.post("/bill_of_lading/delete/{log_id}")
def bill_of_lading_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(BillOfLading).filter(BillOfLading.id == log_id, BillOfLading.company_id == comp_code).first()
    if entry:
        write_audit(db, "bill_of_ladings", entry.id, comp_code, "DELETE", f"BL: {entry.bl_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Bill of lading entry removed"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 7. HEALTH CERTIFICATE
# ============================================================
@router.get("/health_certificate/entry", response_class=HTMLResponse)
def health_certificate_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(HealthCertificate).filter(HealthCertificate.company_id == comp_code).order_by(desc(HealthCertificate.issue_date)).all()
    invoices = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="export_documents/health_certificate.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/health_certificate/save")
def health_certificate_save(request: Request, payload: HealthCertificateSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(HealthCertificate).filter(HealthCertificate.company_id == comp_code, HealthCertificate.certificate_no == payload.certificate_no).first()
    if exists: return JSONResponse({"success": False, "message": "Certificate Number already exists"}, status_code=400)
    
    entry = HealthCertificate(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker Health Certificate pending status
    invoice = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
    if invoice:
        tracker = db.query(ExportComplianceTracker).filter(ExportComplianceTracker.shipment_no == invoice.shipment_no).first()
        if tracker:
            tracker.health_cert_pending = False
            
    write_audit(db, "health_certificates", entry.id, comp_code, "CREATE", "NONE", f"Health Cert: {payload.certificate_no}", email)
    db.commit()
    return {"success": True, "message": "Health Certificate recorded successfully"}

@router.post("/health_certificate/delete/{log_id}")
def health_certificate_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(HealthCertificate).filter(HealthCertificate.id == log_id, HealthCertificate.company_id == comp_code).first()
    if entry:
        write_audit(db, "health_certificates", entry.id, comp_code, "DELETE", f"Cert: {entry.certificate_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Health certificate deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)
