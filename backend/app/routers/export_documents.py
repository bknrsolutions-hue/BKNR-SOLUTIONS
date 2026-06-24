from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
import re
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
    HealthCertificate,
    ExportDocumentFile
)
from app.database.models.processing import AuditLog  # Audit trails
from app.services.cache import cache_get_or_set, invalidate_company_cache

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

EXPORT_PDF_DIR = Path("app/static/uploads/export_documents")


def invalidate_export_cache(company_id: str | None):
    if company_id:
        invalidate_company_cache(company_id, "export_documents")


def _dt(value):
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "document")).strip("_")[:120]


def export_doc_config():
    return {
        "export_shipment": {
            "model": ExportShipment, "no": "shipment_no", "date": "created_at",
            "title": "Export Shipment File", "template": "export_documents/print_document.html",
            "fields": [
                ("Shipment No", "shipment_no"), ("PO Number", "po_number"), ("Invoice No", "invoice_no"),
                ("Container No", "container_no"), ("Buyer", "buyer_name"), ("Country", "country"),
                ("ETD", "etd"), ("ETA", "eta"), ("Status", "status"),
            ],
        },
        "commercial_invoice": {
            "model": CommercialInvoice, "no": "invoice_no", "date": "invoice_date",
            "title": "Commercial Invoice", "template": "export_documents/print_document.html",
            "fields": [
                ("Invoice No", "invoice_no"), ("Invoice Date", "invoice_date"), ("Shipment No", "shipment_no"),
                ("PO Number", "po_number"), ("Buyer", "buyer_name"), ("Buyer Address", "buyer_address"),
                ("Consignee", "consignee_name"), ("Notify Party", "notify_party"), ("Country", "country"),
                ("Currency", "currency"), ("Total Amount", "total_amount"), ("Exchange Rate", "exchange_rate"),
                ("Invoice Value INR", "invoice_value_inr"), ("Payment Terms", "payment_terms"),
                ("Shipment Terms", "shipment_terms"), ("Port of Loading", "port_of_loading"),
                ("Port of Discharge", "port_of_discharge"), ("Final Destination", "final_destination"),
            ],
        },
        "packing_list": {
            "model": PackingList, "no": "packing_no", "date": "created_at",
            "title": "Packing List", "template": "export_documents/print_document.html",
            "fields": [
                ("Packing No", "packing_no"), ("Invoice No", "invoice_no"), ("PO Number", "po_number"),
                ("Container No", "container_no"), ("Buyer", "buyer_name"), ("Product", "product_name"),
                ("Grade", "grade"), ("Batch No", "batch_no"), ("Lot No", "lot_no"), ("Glaze", "glaze"),
                ("Freezing Type", "freezing_type"), ("HS Code", "hs_code"), ("Packing Style", "packing_style"),
                ("Inner Pack", "inner_pack"), ("Outer Pack", "outer_pack"), ("Master Cartons", "master_cartons"),
                ("Net Weight", "net_weight"), ("Gross Weight", "gross_weight"),
            ],
        },
        "container_stuffing": {
            "model": ContainerStuffing, "no": "container_no", "date": "stuffing_date",
            "title": "Container Stuffing Report", "template": "export_documents/print_document.html",
            "fields": [
                ("Container No", "container_no"), ("Invoice No", "invoice_no"), ("PO Number", "po_number"),
                ("Buyer", "buyer_name"), ("Seal No", "seal_no"), ("Shipping Line", "shipping_line"),
                ("Stuffing Date", "stuffing_date"), ("Stuffing Location", "stuffing_location"),
                ("Container Type", "container_type"), ("Container Size", "container_size"),
                ("Set Temperature", "temperature"), ("Vehicle No", "vehicle_no"),
                ("Loading Supervisor", "loading_supervisor"), ("Remarks", "remarks"),
            ],
        },
        "shipping_bill": {
            "model": ShippingBill, "no": "shipping_bill_no", "date": "shipping_bill_date",
            "title": "Shipping Bill Summary", "template": "export_documents/print_document.html",
            "fields": [
                ("Shipping Bill No", "shipping_bill_no"), ("Shipping Bill Date", "shipping_bill_date"),
                ("Invoice No", "invoice_no"), ("Container No", "container_no"), ("PO Number", "po_number"),
                ("Buyer", "buyer_name"), ("FOB Value INR", "shipping_bill_value"),
                ("Drawback Amount", "drawback_amount"), ("Scheme", "scheme"), ("Customs Status", "customs_status"),
                ("Port", "port"), ("CHA Name", "cha_name"), ("Vessel", "vessel_name"),
                ("Voyage No", "voyage_no"), ("ETD", "etd"), ("ETA", "eta"),
            ],
        },
        "bill_of_lading": {
            "model": BillOfLading, "no": "bl_no", "date": "bl_date",
            "title": "Bill of Lading", "template": "export_documents/print_document.html",
            "fields": [
                ("B/L No", "bl_no"), ("B/L Date", "bl_date"), ("On Board Date", "onboard_date"),
                ("Invoice No", "invoice_no"), ("Container No", "container_no"), ("PO Number", "po_number"),
                ("Buyer", "buyer_name"), ("Shipping Line", "shipping_line"), ("Seal No", "seal_no"),
                ("Freight Terms", "freight_terms"), ("Original B/L Count", "no_of_original_bl"),
                ("Marks & Numbers", "marks_and_numbers"), ("Packages Description", "packages_description"),
                ("Place of Receipt", "place_of_receipt"), ("Place of Delivery", "place_of_delivery"),
                ("Gross Weight", "gross_weight"), ("Net Weight", "net_weight"),
            ],
        },
        "health_certificate": {
            "model": HealthCertificate, "no": "certificate_no", "date": "issue_date",
            "title": "Health Certificate", "template": "export_documents/print_document.html",
            "fields": [
                ("Certificate No", "certificate_no"), ("Issue Date", "issue_date"), ("Authority", "authority"),
                ("Factory Approval No", "factory_approval_no"), ("Invoice No", "invoice_no"),
                ("Container No", "container_no"), ("PO Number", "po_number"), ("Buyer", "buyer_name"),
                ("Country", "country"), ("Species", "species"), ("Temperature Verified", "temperature_verified"),
                ("Issued By", "issued_by"), ("Status", "status"), ("Remarks", "remarks"),
            ],
        },
    }


def get_export_record_or_404(db: Session, request: Request, doc_type: str, record_id: int):
    cfg = export_doc_config().get(doc_type)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unsupported document type")
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Unauthorized")
    row = db.query(cfg["model"]).filter(cfg["model"].id == record_id, cfg["model"].company_id == comp_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return cfg, row, comp_code


def store_export_pdf(
    db: Session,
    company_id: str,
    module_name: str,
    record_id: int,
    document_no: str,
    document_kind: str,
    file_name: str,
    content: bytes,
    uploaded_by: str | None,
    remarks: str | None = None,
) -> ExportDocumentFile:
    EXPORT_PDF_DIR.mkdir(parents=True, exist_ok=True)
    for old in db.query(ExportDocumentFile).filter(
        ExportDocumentFile.company_id == company_id,
        ExportDocumentFile.module_name == module_name,
        ExportDocumentFile.record_id == record_id,
        ExportDocumentFile.document_kind == document_kind,
        ExportDocumentFile.is_current == True,
    ).all():
        old.is_current = False
    version_no = (
        db.query(func.coalesce(func.max(ExportDocumentFile.version_no), 0))
        .filter(
            ExportDocumentFile.company_id == company_id,
            ExportDocumentFile.module_name == module_name,
            ExportDocumentFile.record_id == record_id,
            ExportDocumentFile.document_kind == document_kind,
        )
        .scalar()
        + 1
    )
    final_name = f"{safe_filename(module_name)}_{safe_filename(document_no)}_v{version_no}_{safe_filename(file_name)}"
    disk_path = EXPORT_PDF_DIR / final_name
    disk_path.write_bytes(content)
    file_row = ExportDocumentFile(
        company_id=company_id,
        module_name=module_name,
        record_id=record_id,
        document_no=document_no,
        document_kind=document_kind,
        file_name=final_name,
        file_path=f"/static/uploads/export_documents/{final_name}",
        content_type="application/pdf",
        file_bytes=content,
        file_size=len(content),
        version_no=version_no,
        uploaded_by=uploaded_by,
        remarks=remarks,
    )
    db.add(file_row)
    return file_row


def set_document_path(row, path: str):
    if hasattr(row, "document_path"):
        row.document_path = path


def build_document_payload(cfg, row):
    return {
        "title": cfg["title"],
        "document_no": getattr(row, cfg["no"], ""),
        "document_date": getattr(row, cfg["date"], None),
        "fields": [(label, getattr(row, attr, None)) for label, attr in cfg["fields"]],
    }


def pdf_escape(value) -> str:
    return str(value if value is not None else "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_simple_pdf(title: str, document_no: str, lines: list[str]) -> bytes:
    content_lines = [
        "BT",
        "/F1 16 Tf",
        "50 800 Td",
        f"({pdf_escape(title)}) Tj",
        "/F1 10 Tf",
        "0 -18 Td",
        f"(Document No: {pdf_escape(document_no)}) Tj",
        "0 -18 Td",
        "(BKNR SOLUTIONS - International Export Document) Tj",
    ]
    y_lines = 0
    for line in lines:
        text = pdf_escape(line)[:105]
        if y_lines and y_lines % 38 == 0:
            content_lines.extend(["ET", "BT", "/F1 10 Tf", "50 800 Td"])
        content_lines.append("0 -16 Td")
        content_lines.append(f"({text}) Tj")
        y_lines += 1
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{idx} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for off in offsets[1:]:
        pdf.extend(f"{off:010d} 00000 n \n".encode())
    pdf.extend(f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return bytes(pdf)


@router.get("/dashboard", response_class=HTMLResponse)
def export_documents_dashboard(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login")

    def build_dashboard_context():
        stats = {
            "shipments": db.query(ExportShipment).filter(ExportShipment.company_id == comp_code).count(),
            "invoices": db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code).count(),
            "packing_lists": db.query(PackingList).filter(PackingList.company_id == comp_code).count(),
            "stuffing": db.query(ContainerStuffing).filter(ContainerStuffing.company_id == comp_code).count(),
            "shipping_bills": db.query(ShippingBill).filter(ShippingBill.company_id == comp_code).count(),
            "bill_of_lading": db.query(BillOfLading).filter(BillOfLading.company_id == comp_code).count(),
            "health_certificates": db.query(HealthCertificate).filter(HealthCertificate.company_id == comp_code).count(),
            "compliance": (
                db.query(ExportComplianceTracker)
                .join(ExportShipment, ExportComplianceTracker.shipment_no == ExportShipment.shipment_no)
                .filter(ExportShipment.company_id == comp_code)
                .count()
            ),
        }
        recent_shipments = [
            {
                "shipment_no": row.shipment_no,
                "invoice_no": row.invoice_no,
                "buyer_name": row.buyer_name,
                "etd": _dt(row.etd),
                "eta": _dt(row.eta),
            }
            for row in db.query(ExportShipment)
            .filter(ExportShipment.company_id == comp_code)
            .order_by(desc(ExportShipment.id))
            .limit(8)
            .all()
        ]
        recent_invoices = [
            {
                "invoice_no": row.invoice_no,
                "shipment_no": row.shipment_no,
                "buyer_name": row.buyer_name,
                "currency": row.currency,
                "total_amount": float(row.total_amount or 0),
            }
            for row in db.query(CommercialInvoice)
            .filter(CommercialInvoice.company_id == comp_code)
            .order_by(desc(CommercialInvoice.id))
            .limit(8)
            .all()
        ]
        return {
            "stats": stats,
            "recent_shipments": recent_shipments,
            "recent_invoices": recent_invoices,
            "company_id": comp_code,
        }

    context = cache_get_or_set(f"bknr:export_documents:{comp_code}:dashboard", build_dashboard_context, ttl=45)
    return templates.TemplateResponse(
        request=request,
        name="export_documents/dashboard.html",
        context=context,
    )


@router.get("/supporting_documents/entry", response_class=HTMLResponse)
def export_supporting_documents_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login")
    def build_supporting_context():
        shipments = [
            {"id": row.id, "shipment_no": row.shipment_no, "buyer_name": row.buyer_name}
            for row in db.query(ExportShipment)
            .filter(ExportShipment.company_id == comp_code)
            .order_by(desc(ExportShipment.id))
            .all()
        ]
        history = [
            {
                "document_kind": row.document_kind,
                "document_no": row.document_no,
                "file_path": row.file_path,
                "file_name": row.file_name,
                "version_no": row.version_no,
                "is_current": row.is_current,
                "uploaded_at": _dt(row.uploaded_at),
                "remarks": row.remarks,
            }
            for row in db.query(ExportDocumentFile)
            .filter(ExportDocumentFile.company_id == comp_code, ExportDocumentFile.module_name == "export_supporting")
            .order_by(desc(ExportDocumentFile.uploaded_at))
            .all()
        ]
        return {"shipments": shipments, "history": history, "company_id": comp_code}

    context = cache_get_or_set(f"bknr:export_documents:{comp_code}:supporting_documents", build_supporting_context, ttl=45)
    return templates.TemplateResponse(
        request=request,
        name="export_documents/supporting_documents.html",
        context=context,
    )


@router.post("/supporting_documents/upload")
async def export_supporting_documents_upload(
    request: Request,
    shipment_id: int = Form(...),
    document_kind: str = Form(...),
    document_no: str = Form(None),
    remarks: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    shipment = db.query(ExportShipment).filter(ExportShipment.id == shipment_id, ExportShipment.company_id == comp_code).first()
    if not shipment:
        return JSONResponse({"success": False, "message": "Shipment not found"}, status_code=404)
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"success": False, "message": "Only PDF files are allowed"}, status_code=400)
    content = await file.read()
    if not content:
        return JSONResponse({"success": False, "message": "Empty PDF file"}, status_code=400)
    file_row = store_export_pdf(
        db=db,
        company_id=comp_code,
        module_name="export_supporting",
        record_id=shipment.id,
        document_no=document_no or shipment.shipment_no,
        document_kind=document_kind,
        file_name=file.filename or f"{shipment.shipment_no}.pdf",
        content=content,
        uploaded_by=email,
        remarks=remarks,
    )
    write_audit(db, "export_supporting", shipment.id, comp_code, "PDF_UPLOAD", "NONE", file_row.file_path, email)
    db.commit()
    invalidate_export_cache(comp_code)
    return {
        "success": True,
        "message": "Supporting export PDF saved in DB",
        "file_id": file_row.id,
        "file_path": file_row.file_path,
        "row": {
            "document_kind": file_row.document_kind,
            "document_no": file_row.document_no,
            "file_name": file_row.file_name,
            "file_path": file_row.file_path,
            "version_no": file_row.version_no,
            "is_current": file_row.is_current,
            "uploaded_at": _dt(file_row.uploaded_at),
            "remarks": file_row.remarks,
        },
    }

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
    invalidate_export_cache(company_id)

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


# ============================================================
# PRINT / PDF / UPLOADED COPY STORAGE
# ============================================================
@router.get("/{doc_type}/print/{record_id}", response_class=HTMLResponse)
def export_document_print(doc_type: str, record_id: int, request: Request, db: Session = Depends(get_db)):
    cfg, row, comp_code = get_export_record_or_404(db, request, doc_type, record_id)
    payload = build_document_payload(cfg, row)
    return templates.TemplateResponse(
        request=request,
        name=cfg["template"],
        context={
            **payload,
            "company_id": comp_code,
            "record": row,
            "doc_type": doc_type,
            "generated_at": datetime.utcnow(),
        },
    )


@router.get("/{doc_type}/pdf/{record_id}")
def export_document_pdf(doc_type: str, record_id: int, request: Request, db: Session = Depends(get_db)):
    cfg, row, comp_code = get_export_record_or_404(db, request, doc_type, record_id)
    payload = build_document_payload(cfg, row)
    lines = [f"{label}: {value}" for label, value in payload["fields"] if value is not None and value != ""]
    lines.extend([
        "",
        "Declaration: Particulars shown in this document are generated from BKNR ERP records.",
        "Prepared By: Export Documentation",
        "Checked By: Compliance / Logistics",
        "Authorised Signatory: Company Seal",
    ])
    pdf_bytes = make_simple_pdf(payload["title"], payload["document_no"], lines)
    document_no = str(getattr(row, cfg["no"], record_id))
    file_row = store_export_pdf(
        db=db,
        company_id=comp_code,
        module_name=doc_type,
        record_id=row.id,
        document_no=document_no,
        document_kind="GENERATED_PDF",
        file_name=f"{safe_filename(document_no)}.pdf",
        content=pdf_bytes,
        uploaded_by=request.session.get("email"),
        remarks="System generated international format PDF",
    )
    set_document_path(row, file_row.file_path)
    write_audit(db, doc_type, row.id, comp_code, "PDF_GENERATE", "NONE", file_row.file_path, request.session.get("email"))
    db.commit()
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={safe_filename(document_no)}.pdf"},
    )


@router.post("/{doc_type}/upload_pdf/{record_id}")
async def export_document_upload_pdf(
    doc_type: str,
    record_id: int,
    request: Request,
    file: UploadFile = File(...),
    document_kind: str = Form("SIGNED_COPY"),
    remarks: str = Form(None),
    db: Session = Depends(get_db),
):
    cfg, row, comp_code = get_export_record_or_404(db, request, doc_type, record_id)
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"success": False, "message": "Only PDF files are allowed"}, status_code=400)
    content = await file.read()
    if not content:
        return JSONResponse({"success": False, "message": "Empty PDF file"}, status_code=400)
    document_no = str(getattr(row, cfg["no"], record_id))
    file_row = store_export_pdf(
        db=db,
        company_id=comp_code,
        module_name=doc_type,
        record_id=row.id,
        document_no=document_no,
        document_kind=document_kind,
        file_name=file.filename or f"{document_no}.pdf",
        content=content,
        uploaded_by=request.session.get("email"),
        remarks=remarks,
    )
    set_document_path(row, file_row.file_path)
    write_audit(db, doc_type, row.id, comp_code, "PDF_UPLOAD", "NONE", file_row.file_path, request.session.get("email"))
    db.commit()
    return {"success": True, "message": "PDF saved in DB", "file_id": file_row.id, "file_path": file_row.file_path}


@router.get("/files/{file_id}/download")
def export_document_file_download(file_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Unauthorized")
    file_row = db.query(ExportDocumentFile).filter(ExportDocumentFile.id == file_id, ExportDocumentFile.company_id == comp_code).first()
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")
    return StreamingResponse(
        BytesIO(file_row.file_bytes),
        media_type=file_row.content_type or "application/pdf",
        headers={"Content-Disposition": f"inline; filename={safe_filename(file_row.file_name)}"},
    )
