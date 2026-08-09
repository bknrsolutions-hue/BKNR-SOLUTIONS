from fastapi import APIRouter, Depends
from app.routers.export_documents.common import (
    ensure_export_document_schema,
    repost_invoice_cogs,
    get_export_company_profile,
    export_doc_config,
    get_export_record_or_404,
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
