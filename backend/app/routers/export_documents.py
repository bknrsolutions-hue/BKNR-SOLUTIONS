from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, model_validator
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, text
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import re
import logging
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

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
from app.services.bill_accounting import (
    cancel_linked_bill_voucher,
    ensure_bill_accounting_schema,
    post_export_sales_invoice,
)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

EXPORT_PDF_DIR = Path("uploads/export_documents_private")
_EXPORT_SCHEMA_READY = False


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
                ("ETD", "etd"), ("ETA", "eta"), ("Completion Date", "completion_date"),
                ("Status", "status"), ("Approval Status", "approval_status"),
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
                ("Shipment Type", "shipment_type"), ("Total Master Cartons", "total_mc"),
                ("Total Net Weight", "total_net_weight"), ("Total Gross Weight", "total_gross_weight"),
                ("Payment Status", "payment_status"), ("Approval Status", "approval_status"),
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
                ("Net Weight", "net_weight"), ("Gross Weight", "gross_weight"), ("Pallet Count", "pallet_count"),
                ("Manufacturing Date", "manufacturing_date"), ("Expiry Date", "expiry_date"),
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
                ("Container Condition", "container_condition"), ("Temperature Before Loading", "temperature_before_loading"),
                ("Temperature After Loading", "temperature_after_loading"), ("Driver", "driver_name"),
                ("Loading Supervisor", "loading_supervisor"), ("Approval Status", "approval_status"), ("Remarks", "remarks"),
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
                ("Port", "port"), ("CHA Name", "cha_name"), ("CHA Bill No", "cha_bill_no"), ("Vessel", "vessel_name"),
                ("Voyage No", "voyage_no"), ("ETD", "etd"), ("ETA", "eta"),
                ("Approval Status", "approval_status"), ("Remarks", "remarks"),
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
                ("Approval Status", "approval_status"),
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
        file_path=None,
        content_type="application/pdf",
        file_bytes=content,
        file_size=len(content),
        version_no=version_no,
        uploaded_by=uploaded_by,
        remarks=remarks,
    )
    db.add(file_row)
    db.flush()
    file_row.file_path = f"/export_documents/files/{file_row.id}/download"
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


def render_document_pdf(cfg, row, company_id: str, doc_type: str) -> bytes:
    payload = build_document_payload(cfg, row)
    html = templates.env.get_template("export_documents/print_document_pdf.html").render(
        **payload,
        company_id=company_id,
        record=row,
        doc_type=doc_type,
        generated_at=datetime.utcnow(),
    )
    try:
        from xhtml2pdf import pisa

        output = BytesIO()
        result = pisa.CreatePDF(BytesIO(html.encode("utf-8")), dest=output, encoding="utf-8")
        if not result.err:
            return output.getvalue()
    except Exception as exc:
        logger.warning("HTML PDF rendering failed for %s: %s", doc_type, exc)

    lines = [f"{label}: {value}" for label, value in payload["fields"] if value not in (None, "")]
    return make_simple_pdf(payload["title"], payload["document_no"], lines)


def style_register_sheet(sheet, title: str, company_id: str, fields: list[tuple[str, str]], rows: list) -> None:
    sheet.freeze_panes = "A5"
    sheet.sheet_view.showGridLines = False
    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(1, len(fields)))
    sheet.cell(1, 1, title).font = Font(size=16, bold=True, color="FFFFFF")
    sheet.cell(1, 1).fill = PatternFill("solid", fgColor="123B5D")
    sheet.cell(1, 1).alignment = Alignment(horizontal="center")
    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(1, len(fields)))
    sheet.cell(2, 1, f"Company: {company_id} | Generated: {datetime.utcnow():%d-%b-%Y %H:%M UTC}")
    sheet.cell(2, 1).alignment = Alignment(horizontal="center")
    for column, (label, _) in enumerate(fields, start=1):
        cell = sheet.cell(4, column, label)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="176B87")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    for row_number, row in enumerate(rows, start=5):
        for column, (_, attr) in enumerate(fields, start=1):
            value = getattr(row, attr, None)
            sheet.cell(row_number, column, _dt(value) if hasattr(value, "isoformat") else value)
    for column, (label, attr) in enumerate(fields, start=1):
        max_len = max([len(str(label))] + [len(str(getattr(row, attr, "") or "")) for row in rows[:500]])
        sheet.column_dimensions[get_column_letter(column)].width = min(max(max_len + 2, 12), 42)
    sheet.auto_filter.ref = f"A4:{get_column_letter(max(1, len(fields)))}{max(4, len(rows) + 4)}"


def document_register_workbook(db: Session, company_id: str, doc_type: str | None = None) -> bytes:
    configs = export_doc_config()
    selected = {doc_type: configs[doc_type]} if doc_type in configs else configs
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    for key, cfg in selected.items():
        rows = db.query(cfg["model"]).filter(
            cfg["model"].company_id == company_id
        ).order_by(desc(cfg["model"].id)).all()
        sheet = workbook.create_sheet(title=cfg["title"][:31])
        style_register_sheet(sheet, cfg["title"], company_id, cfg["fields"], rows)
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output.getvalue()


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


def ensure_export_document_schema(db: Session = Depends(get_db)) -> None:
    """Keep export routes compatible while pending migrations are deployed."""
    global _EXPORT_SCHEMA_READY
    if _EXPORT_SCHEMA_READY:
        return
    for table_name in (
        "commercial_invoices", "packing_lists", "container_stuffing",
        "shipping_bills", "bill_of_ladings", "health_certificates",
    ):
        db.execute(text(
            f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS "
            "is_cancelled BOOLEAN NOT NULL DEFAULT FALSE"
        ))
    db.execute(text(
        "ALTER TABLE export_compliance_tracker "
        "ADD COLUMN IF NOT EXISTS company_id VARCHAR"
    ))
    db.execute(text("""
        UPDATE export_compliance_tracker ect
           SET company_id = es.company_id
          FROM export_shipments es
         WHERE es.shipment_no = ect.shipment_no
           AND ect.company_id IS NULL
    """))
    db.commit()
    _EXPORT_SCHEMA_READY = True


# Applied to every route registered below, including direct API calls.
router.dependencies.append(Depends(ensure_export_document_schema))


@router.get("/dashboard", response_class=HTMLResponse)
def export_documents_dashboard(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login")

    def build_dashboard_context():
        stats = {
            "shipments": db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.is_cancelled != True).count(),
            "invoices": db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).count(),
            "packing_lists": db.query(PackingList).filter(PackingList.company_id == comp_code, PackingList.is_cancelled != True).count(),
            "stuffing": db.query(ContainerStuffing).filter(ContainerStuffing.company_id == comp_code, ContainerStuffing.is_cancelled != True).count(),
            "shipping_bills": db.query(ShippingBill).filter(ShippingBill.company_id == comp_code, ShippingBill.is_cancelled != True).count(),
            "bill_of_lading": db.query(BillOfLading).filter(BillOfLading.company_id == comp_code, BillOfLading.is_cancelled != True).count(),
            "health_certificates": db.query(HealthCertificate).filter(HealthCertificate.company_id == comp_code, HealthCertificate.is_cancelled != True).count(),
            "compliance": (
                db.query(ExportComplianceTracker)
                .join(ExportShipment, and_(
                    ExportComplianceTracker.company_id == ExportShipment.company_id,
                    ExportComplianceTracker.shipment_no == ExportShipment.shipment_no,
                ))
                .filter(ExportComplianceTracker.company_id == comp_code, ExportShipment.company_id == comp_code)
                .count()
            ),
        }
        recent_shipments = [
            {
                "id": row.id,
                "shipment_no": row.shipment_no,
                "invoice_no": row.invoice_no,
                "buyer_name": row.buyer_name,
                "etd": _dt(row.etd),
                "eta": _dt(row.eta),
            }
            for row in db.query(ExportShipment)
            .filter(ExportShipment.company_id == comp_code, ExportShipment.is_cancelled != True)
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
            .filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True)
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
            .filter(ExportShipment.company_id == comp_code, ExportShipment.is_cancelled != True)
            .order_by(desc(ExportShipment.id))
            .all()
        ]
        history = [
            {
                "id": row.id,
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
    if len(content) > 25 * 1024 * 1024:
        return JSONResponse({"success": False, "message": "PDF size cannot exceed 25 MB"}, status_code=400)
    if not content.startswith(b"%PDF-"):
        return JSONResponse({"success": False, "message": "Invalid PDF file"}, status_code=400)
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
            "id": file_row.id,
            "document_kind": file_row.document_kind,
            "document_no": file_row.document_no,
            "file_name": file_row.file_name,
            "file_path": file_row.file_path,
            "download_url": f"/export_documents/files/{file_row.id}/download",
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

    @model_validator(mode="after")
    def validate_dates(self):
        if self.etd and self.eta and self.eta < self.etd:
            raise ValueError("ETA cannot be before ETD")
        return self

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
    exchange_rate: Decimal = Decimal("83.50")
    total_amount: Decimal
    payment_terms: str
    shipment_terms: str

    @model_validator(mode="after")
    def validate_amounts(self):
        if self.exchange_rate <= 0 or self.total_amount <= 0:
            raise ValueError("Exchange rate and invoice amount must be greater than zero")
        return self

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

    @model_validator(mode="after")
    def validate_quantities(self):
        if self.master_cartons < 0 or self.net_weight < 0 or self.gross_weight < 0:
            raise ValueError("Cartons and weights cannot be negative")
        if self.gross_weight < self.net_weight:
            raise ValueError("Gross weight cannot be less than net weight")
        return self

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

    @model_validator(mode="after")
    def validate_shipping_bill(self):
        if self.shipping_bill_value < 0 or self.drawback_amount < 0:
            raise ValueError("Shipping bill and drawback values cannot be negative")
        if self.eta < self.etd:
            raise ValueError("ETA cannot be before ETD")
        return self

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

    @model_validator(mode="after")
    def validate_bl(self):
        if self.no_of_original_bl <= 0:
            raise ValueError("Original B/L count must be greater than zero")
        if self.net_weight < 0 or self.gross_weight < 0 or self.gross_weight < self.net_weight:
            raise ValueError("B/L weights are invalid")
        return self

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


def require_company_invoice(db: Session, company_id: str, invoice_no: str) -> CommercialInvoice:
    invoice = db.query(CommercialInvoice).filter(
        CommercialInvoice.company_id == company_id,
        CommercialInvoice.invoice_no == invoice_no,
        CommercialInvoice.is_cancelled != True,
    ).first()
    if not invoice:
        raise ValueError("Select a valid commercial invoice for this company")
    return invoice


def refresh_compliance(db: Session, company_id: str, shipment_no: str) -> None:
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


def apply_invoice_container_defaults(db: Session, company_id: str, invoices: list[CommercialInvoice]) -> list[CommercialInvoice]:
    """Populate missing invoice container numbers from stuffing/shipment links for form defaults."""
    for invoice in invoices:
        if invoice.container_no:
            continue
        stuffing = db.query(ContainerStuffing).filter(
            ContainerStuffing.company_id == company_id,
            ContainerStuffing.invoice_no == invoice.invoice_no,
            ContainerStuffing.is_cancelled != True,
        ).order_by(desc(ContainerStuffing.id)).first()
        if stuffing:
            invoice.container_no = stuffing.container_no
            continue
        shipment = db.query(ExportShipment).filter(
            ExportShipment.company_id == company_id,
            ExportShipment.shipment_no == invoice.shipment_no,
            ExportShipment.is_cancelled != True,
        ).first()
        if shipment and shipment.container_no:
            invoice.container_no = shipment.container_no
    return invoices

# ============================================================
# 1. EXPORT SHIPMENTS
# ============================================================
@router.get("/export_shipment/entry", response_class=HTMLResponse)
def export_shipment_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.is_cancelled != True).order_by(desc(ExportShipment.created_at)).all()
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
        company_id=comp_code,
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
        if entry.invoice_no:
            return JSONResponse({"success": False, "message": "Cancel linked export documents before cancelling this shipment"}, status_code=400)
        write_audit(db, "export_shipments", entry.id, comp_code, "CANCEL", entry.status, "CANCELLED", email)
        entry.is_cancelled = True
        entry.status = "CANCELLED"
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
    history = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).order_by(desc(CommercialInvoice.invoice_date)).all()
    shipments = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.is_cancelled != True).all()
    return templates.TemplateResponse(request=request, name="export_documents/commercial_invoice.html", context={"history": history, "shipments": shipments, "company_id": comp_code})

@router.post("/commercial_invoice/save")
def commercial_invoice_save(request: Request, payload: CommercialInvoiceSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    ensure_bill_accounting_schema(db)
    
    exists = db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.invoice_no == payload.invoice_no).first()
    if exists: return JSONResponse({"success": False, "message": "Commercial Invoice No already registered"}, status_code=400)
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
            **payload.dict()
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

        # Update ExportShipment and ExportComplianceTracker status
        shipment.invoice_no = entry.invoice_no
        refresh_compliance(db, comp_code, shipment.shipment_no)

        write_audit(db, "commercial_invoices", entry.id, comp_code, "CREATE", "NONE", f"Invoice Registered: {payload.invoice_no}", email)
        db.commit()
        invalidate_export_cache(comp_code)
        return {"success": True, "message": "Commercial invoice registered and posted to accounts"}
    except Exception as exc:
        db.rollback()
        logger.exception("Commercial invoice accounting post failed")
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)

@router.post("/commercial_invoice/delete/{log_id}")
def commercial_invoice_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    ensure_bill_accounting_schema(db)
    entry = db.query(CommercialInvoice).filter(CommercialInvoice.id == log_id, CommercialInvoice.company_id == comp_code).first()
    if entry:
        for model in (PackingList, ContainerStuffing, ShippingBill, BillOfLading, HealthCertificate):
            if db.query(model).filter(model.company_id == comp_code, model.invoice_no == entry.invoice_no, model.is_cancelled != True).first():
                return JSONResponse({"success": False, "message": "Cancel linked export documents before cancelling this invoice"}, status_code=400)
        cancel_linked_bill_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "commercial_invoices", entry.id, comp_code, "CANCEL", entry.status, "CANCELLED", email)
        entry.is_cancelled = True
        entry.status = "CANCELLED"
        shipment = db.query(ExportShipment).filter(ExportShipment.company_id == comp_code, ExportShipment.shipment_no == entry.shipment_no).first()
        if shipment and shipment.invoice_no == entry.invoice_no:
            shipment.invoice_no = None
        refresh_compliance(db, comp_code, entry.shipment_no)
        db.commit()
        invalidate_export_cache(comp_code)
        return {"success": True, "message": "Commercial invoice deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 3. PACKING LIST
# ============================================================
@router.get("/packing_list/entry", response_class=HTMLResponse)
def packing_list_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(PackingList).filter(PackingList.company_id == comp_code, PackingList.is_cancelled != True).order_by(desc(PackingList.created_at)).all()
    invoices = apply_invoice_container_defaults(db, comp_code, db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).all())
    return templates.TemplateResponse(request=request, name="export_documents/packing_list.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/packing_list/save")
def packing_list_save(request: Request, payload: PackingListSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        invoice = require_company_invoice(db, comp_code, payload.invoice_no)
    except ValueError as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
    entry = PackingList(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker packing list pending status
    refresh_compliance(db, comp_code, invoice.shipment_no)
            
    write_audit(db, "packing_lists", entry.id, comp_code, "CREATE", "NONE", f"Packing Item: {payload.packing_no}", email)
    db.commit()
    return {"success": True, "message": "Packing list line item recorded successfully"}

@router.post("/packing_list/delete/{log_id}")
def packing_list_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(PackingList).filter(PackingList.id == log_id, PackingList.company_id == comp_code).first()
    if entry:
        invoice = require_company_invoice(db, comp_code, entry.invoice_no)
        write_audit(db, "packing_lists", entry.id, comp_code, "CANCEL", "ACTIVE", "CANCELLED", email)
        entry.is_cancelled = True
        refresh_compliance(db, comp_code, invoice.shipment_no)
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
    history = db.query(ContainerStuffing).filter(ContainerStuffing.company_id == comp_code, ContainerStuffing.is_cancelled != True).order_by(desc(ContainerStuffing.stuffing_date)).all()
    invoices = apply_invoice_container_defaults(db, comp_code, db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).all())
    return templates.TemplateResponse(request=request, name="export_documents/container_stuffing.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/container_stuffing/save")
def container_stuffing_save(request: Request, payload: ContainerStuffingSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    invoice = None
    if payload.invoice_no:
        try:
            invoice = require_company_invoice(db, comp_code, payload.invoice_no)
        except ValueError as exc:
            return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
    
    exists = db.query(ContainerStuffing).filter(ContainerStuffing.company_id == comp_code, ContainerStuffing.container_no == payload.container_no).first()
    if exists: return JSONResponse({"success": False, "message": "Container stuffing already logged"}, status_code=400)
    
    entry = ContainerStuffing(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportShipment container No
    if payload.invoice_no:
        if invoice:
            invoice.container_no = entry.container_no
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
        write_audit(db, "container_stuffing", entry.id, comp_code, "CANCEL", "ACTIVE", "CANCELLED", email)
        entry.is_cancelled = True
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
    history = db.query(ShippingBill).filter(ShippingBill.company_id == comp_code, ShippingBill.is_cancelled != True).order_by(desc(ShippingBill.shipping_bill_date)).all()
    invoices = apply_invoice_container_defaults(db, comp_code, db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).all())
    return templates.TemplateResponse(request=request, name="export_documents/shipping_bill.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/shipping_bill/save")
def shipping_bill_save(request: Request, payload: ShippingBillSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        invoice = require_company_invoice(db, comp_code, payload.invoice_no)
    except ValueError as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
    
    exists = db.query(ShippingBill).filter(ShippingBill.company_id == comp_code, ShippingBill.shipping_bill_no == payload.shipping_bill_no).first()
    if exists: return JSONResponse({"success": False, "message": "Shipping Bill Number already registered"}, status_code=400)
    
    entry = ShippingBill(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker shipping bill pending status
    refresh_compliance(db, comp_code, invoice.shipment_no)
            
    write_audit(db, "shipping_bills", entry.id, comp_code, "CREATE", "NONE", f"Shipping Bill: {payload.shipping_bill_no}", email)
    db.commit()
    return {"success": True, "message": "Shipping Bill successfully registered"}

@router.post("/shipping_bill/delete/{log_id}")
def shipping_bill_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ShippingBill).filter(ShippingBill.id == log_id, ShippingBill.company_id == comp_code).first()
    if entry:
        invoice = require_company_invoice(db, comp_code, entry.invoice_no)
        write_audit(db, "shipping_bills", entry.id, comp_code, "CANCEL", "ACTIVE", "CANCELLED", email)
        entry.is_cancelled = True
        refresh_compliance(db, comp_code, invoice.shipment_no)
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
    history = db.query(BillOfLading).filter(BillOfLading.company_id == comp_code, BillOfLading.is_cancelled != True).order_by(desc(BillOfLading.bl_date)).all()
    invoices = apply_invoice_container_defaults(db, comp_code, db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).all())
    return templates.TemplateResponse(request=request, name="export_documents/bill_of_lading.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/bill_of_lading/save")
def bill_of_lading_save(request: Request, payload: BillOfLadingSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        invoice = require_company_invoice(db, comp_code, payload.invoice_no)
    except ValueError as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
    
    exists = db.query(BillOfLading).filter(BillOfLading.company_id == comp_code, BillOfLading.bl_no == payload.bl_no).first()
    if exists: return JSONResponse({"success": False, "message": "BL Number already registered"}, status_code=400)
    
    entry = BillOfLading(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker BL pending status
    refresh_compliance(db, comp_code, invoice.shipment_no)
            
    write_audit(db, "bill_of_ladings", entry.id, comp_code, "CREATE", "NONE", f"BL Entry: {payload.bl_no}", email)
    db.commit()
    return {"success": True, "message": "Bill of Lading recorded successfully"}

@router.post("/bill_of_lading/delete/{log_id}")
def bill_of_lading_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(BillOfLading).filter(BillOfLading.id == log_id, BillOfLading.company_id == comp_code).first()
    if entry:
        invoice = require_company_invoice(db, comp_code, entry.invoice_no)
        write_audit(db, "bill_of_ladings", entry.id, comp_code, "CANCEL", "ACTIVE", "CANCELLED", email)
        entry.is_cancelled = True
        refresh_compliance(db, comp_code, invoice.shipment_no)
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
    history = db.query(HealthCertificate).filter(HealthCertificate.company_id == comp_code, HealthCertificate.is_cancelled != True).order_by(desc(HealthCertificate.issue_date)).all()
    invoices = apply_invoice_container_defaults(db, comp_code, db.query(CommercialInvoice).filter(CommercialInvoice.company_id == comp_code, CommercialInvoice.is_cancelled != True).all())
    return templates.TemplateResponse(request=request, name="export_documents/health_certificate.html", context={"history": history, "invoices": invoices, "company_id": comp_code})

@router.post("/health_certificate/save")
def health_certificate_save(request: Request, payload: HealthCertificateSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    try:
        invoice = require_company_invoice(db, comp_code, payload.invoice_no)
    except ValueError as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
    
    exists = db.query(HealthCertificate).filter(HealthCertificate.company_id == comp_code, HealthCertificate.certificate_no == payload.certificate_no).first()
    if exists: return JSONResponse({"success": False, "message": "Certificate Number already exists"}, status_code=400)
    
    entry = HealthCertificate(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    
    # Update ExportComplianceTracker Health Certificate pending status
    refresh_compliance(db, comp_code, invoice.shipment_no)
            
    write_audit(db, "health_certificates", entry.id, comp_code, "CREATE", "NONE", f"Health Cert: {payload.certificate_no}", email)
    db.commit()
    return {"success": True, "message": "Health Certificate recorded successfully"}

@router.post("/health_certificate/delete/{log_id}")
def health_certificate_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(HealthCertificate).filter(HealthCertificate.id == log_id, HealthCertificate.company_id == comp_code).first()
    if entry:
        invoice = require_company_invoice(db, comp_code, entry.invoice_no)
        write_audit(db, "health_certificates", entry.id, comp_code, "CANCEL", "ACTIVE", "CANCELLED", email)
        entry.is_cancelled = True
        refresh_compliance(db, comp_code, invoice.shipment_no)
        db.commit()
        return {"success": True, "message": "Health certificate deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# PRINT / PDF / UPLOADED COPY STORAGE
# ============================================================
@router.get("/registers.xlsx")
def export_all_document_registers(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Unauthorized")
    content = document_register_workbook(db, comp_code)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Export_Document_Registers_{safe_filename(comp_code)}.xlsx"'},
    )


@router.get("/{doc_type}/register.xlsx")
def export_document_register(doc_type: str, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if doc_type not in export_doc_config():
        raise HTTPException(status_code=404, detail="Unsupported document type")
    content = document_register_workbook(db, comp_code, doc_type)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename(doc_type)}_Register.xlsx"'},
    )


@router.get("/shipment/{shipment_id}/dossier.zip")
def export_shipment_dossier(shipment_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        raise HTTPException(status_code=401, detail="Unauthorized")
    shipment = db.query(ExportShipment).filter(
        ExportShipment.id == shipment_id,
        ExportShipment.company_id == comp_code,
    ).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    records = [("export_shipment", shipment)]
    invoice = None
    if shipment.invoice_no:
        invoice = db.query(CommercialInvoice).filter(
            CommercialInvoice.company_id == comp_code,
            CommercialInvoice.invoice_no == shipment.invoice_no,
        ).first()
    if invoice:
        records.append(("commercial_invoice", invoice))
        linked_models = (
            ("packing_list", PackingList),
            ("container_stuffing", ContainerStuffing),
            ("shipping_bill", ShippingBill),
            ("bill_of_lading", BillOfLading),
            ("health_certificate", HealthCertificate),
        )
        for doc_type, model in linked_models:
            linked_rows = db.query(model).filter(
                model.company_id == comp_code,
                model.invoice_no == invoice.invoice_no,
            ).order_by(model.id).all()
            records.extend((doc_type, row) for row in linked_rows)

    output = BytesIO()
    manifest_rows = []
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for index, (doc_type, row) in enumerate(records, start=1):
            cfg = export_doc_config()[doc_type]
            document_no = str(getattr(row, cfg["no"], row.id))
            file_name = f"{index:02d}_{safe_filename(cfg['title'])}_{safe_filename(document_no)}.pdf"
            archive.writestr(file_name, render_document_pdf(cfg, row, comp_code, doc_type))
            manifest_rows.append((cfg["title"], document_no, "SYSTEM GENERATED", file_name))

        supporting = db.query(ExportDocumentFile).filter(
            ExportDocumentFile.company_id == comp_code,
            ExportDocumentFile.module_name == "export_supporting",
            ExportDocumentFile.record_id == shipment.id,
            ExportDocumentFile.is_current == True,
        ).order_by(ExportDocumentFile.document_kind).all()
        for file_row in supporting:
            file_name = f"Supporting/{safe_filename(file_row.document_kind)}_{safe_filename(file_row.file_name)}"
            archive.writestr(file_name, file_row.file_bytes)
            manifest_rows.append((file_row.document_kind, file_row.document_no or "", "UPLOADED COPY", file_name))

        present_types = {doc_type for doc_type, _ in records}
        for required_type in (
            "export_shipment", "commercial_invoice", "packing_list", "container_stuffing",
            "shipping_bill", "bill_of_lading", "health_certificate",
        ):
            if required_type not in present_types:
                manifest_rows.append((export_doc_config()[required_type]["title"], "", "MISSING", ""))

        manifest = openpyxl.Workbook()
        sheet = manifest.active
        sheet.title = "Shipment Dossier"
        sheet.append(["BKNR EXPORT SHIPMENT DOSSIER"])
        sheet.append(["Shipment No", shipment.shipment_no])
        sheet.append(["Company", comp_code])
        sheet.append(["Generated UTC", datetime.utcnow().strftime("%d-%b-%Y %H:%M")])
        sheet.append([])
        sheet.append(["Document Type", "Document No", "Source", "File"])
        for row in manifest_rows:
            sheet.append(row)
        for cell in sheet[6]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="176B87")
        for column, width in zip("ABCD", (28, 24, 20, 64)):
            sheet.column_dimensions[column].width = width
        manifest_output = BytesIO()
        manifest.save(manifest_output)
        archive.writestr("00_Dossier_Manifest.xlsx", manifest_output.getvalue())

    write_audit(
        db, "export_shipments", shipment.id, comp_code, "DOSSIER_EXPORT", "NONE",
        f"Exported {len(manifest_rows)} documents", request.session.get("email"),
    )
    db.commit()
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="Shipment_{safe_filename(shipment.shipment_no)}_Dossier.zip"'},
    )


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
    pdf_bytes = render_document_pdf(cfg, row, comp_code, doc_type)
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
    if len(content) > 25 * 1024 * 1024:
        return JSONResponse({"success": False, "message": "PDF size cannot exceed 25 MB"}, status_code=400)
    if not content.startswith(b"%PDF-"):
        return JSONResponse({"success": False, "message": "Invalid PDF file"}, status_code=400)
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
