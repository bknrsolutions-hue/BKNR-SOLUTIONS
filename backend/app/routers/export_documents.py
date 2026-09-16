"""
Legacy module compatibility forwarder for export_documents package.
The export_documents router has been modularized into app.routers.export_documents sub-package.
"""
from app.routers.export_documents import (
    router,
    ensure_export_document_schema,
    repost_invoice_cogs,
    get_export_company_profile,
    export_doc_config,
)
