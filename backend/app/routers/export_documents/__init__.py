from fastapi import APIRouter, Depends
from app.routers.export_documents.common import (
    # ── Core helpers ──────────────────────────────────────────────────────────
    ensure_export_document_schema,
    repost_invoice_cogs,
    get_export_company_profile,
    export_doc_config,
    get_export_record_or_404,
    # ── Constants ─────────────────────────────────────────────────────────────
    EXPORT_SUPPORT_DOCUMENT_TYPES,
    EXPORT_REQUIREMENT_STAGE_FIELDS,
    # ── Utility functions ─────────────────────────────────────────────────────
    export_document_mode,
    is_supporting_document_admin,
    requirement_display_value,
    requirement_field_values,
    refresh_email_approval_status,
    safe_filename,
    # ── Pydantic Schemas ──────────────────────────────────────────────────────
    BillOfLadingSchema,
    CommercialInvoiceSchema,
    ContainerStuffingSchema,
    ExportShipmentSchema,
    HealthCertificateSchema,
    PackingListBulkLineSchema,
    PackingListBulkSchema,
    PackingListSchema,
    ProformaInvoiceSchema,
    ShippingBillSchema,
    SupportingDocumentApprovalSchema,
)
from app.routers.export_documents.proforma_invoice import router as proforma_router
from app.routers.export_documents.commercial_invoice import router as commercial_router
from app.routers.export_documents.shipments_and_packing import router as shipments_router
from app.routers.export_documents.supporting_documents import router as supporting_router

router = APIRouter()
router.dependencies.append(Depends(ensure_export_document_schema))

router.include_router(proforma_router)
router.include_router(commercial_router)
router.include_router(shipments_router)
router.include_router(supporting_router)
