from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Date, Float, Text, DateTime, ForeignKey, ForeignKeyConstraint, Boolean, LargeBinary, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base  # Fixed: use central Base (was declarative_base())


class ProformaInvoice(Base):
    """Pre-shipment commercial offer issued to an export buyer."""
    __tablename__ = "proforma_invoices"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    pi_no = Column(String, index=True, nullable=False)
    pi_date = Column(Date, nullable=False)
    validity_date = Column(Date, nullable=True)
    po_number = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=False)
    buyer_address = Column(Text, nullable=False)
    country = Column(String, index=True, nullable=False)
    currency = Column(String, default="USD", nullable=False)
    incoterm = Column(String, nullable=False)
    payment_terms = Column(String, nullable=False)
    port_of_loading = Column(String, nullable=True)
    port_of_discharge = Column(String, nullable=True)
    product_description = Column(Text, nullable=False)
    quantity = Column(Numeric(18, 3), default=0, nullable=False)
    unit = Column(String, default="KG", nullable=False)
    unit_price = Column(Numeric(18, 4), default=0, nullable=False)
    total_amount = Column(Numeric(18, 2), default=0, nullable=False)
    status = Column(String, default="DRAFT", index=True, nullable=False)
    approval_status = Column(String, default="PENDING", index=True, nullable=False)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_remarks = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    is_cancelled = Column(Boolean, default=False, index=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "pi_no", name="uq_proforma_invoices_company_pi_no"),
    )


class ExportShipment(Base):
    """
    The Central Backbone Table for all Seafood Export Operations.
    Links PO, Invoice, Container, and Financial Tracking into one single lifecycle.
    """
    __tablename__ = 'export_shipments'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    shipment_no = Column(String, index=True, nullable=False) # e.g., SHP-2026-0001
    po_number = Column(String, index=True, nullable=False)
    invoice_no = Column(String, index=True, nullable=True)     # Updates once Commercial Invoice is created
    container_no = Column(String, index=True, nullable=True)   # Updates once stuffing is assigned
    buyer_name = Column(String, index=True, nullable=False)
    country = Column(String, index=True, nullable=False)
    
    # Global Logistics & Tracking Dates
    etd = Column(Date, nullable=True)
    eta = Column(Date, nullable=True)
    completion_date = Column(Date, nullable=True)
    
    # Global State Engine Workflow
    # States: OPEN -> PACKED -> STUFFED -> SHIPPED -> PAYMENT_PENDING -> CLOSED
    status = Column(String, default="OPEN", index=True)
    is_completed = Column(Boolean, default=False, index=True)
    is_cancelled = Column(Boolean, default=False, index=True)
    
    # Audit Trail System
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_status = Column(String, default="PENDING", index=True) # PENDING / APPROVED / REJECTED

    # Relationships
    invoice_rel = relationship("CommercialInvoice", back_populates="shipment_rel", uselist=False)
    compliance_rel = relationship("ExportComplianceTracker", back_populates="shipment_rel", uselist=False)

    __table_args__ = (UniqueConstraint('company_id', 'shipment_no', name='uq_export_shipments_company_shipment_no'),)


class ExportComplianceTracker(Base):
    """
    Tracks pending statutory certifications and critical tasks for operations.
    """
    __tablename__ = 'export_compliance_tracker'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    shipment_no = Column(String, nullable=False)
    
    # Compliance Checklists
    invoice_pending = Column(Boolean, default=True)
    packing_list_pending = Column(Boolean, default=True)
    health_cert_pending = Column(Boolean, default=True)       # EIA Cert Tracking
    shipping_bill_pending = Column(Boolean, default=True)
    bl_pending = Column(Boolean, default=True)
    payment_pending = Column(Boolean, default=True)
    
    last_checked_at = Column(DateTime, default=datetime.utcnow)
    remarks = Column(Text, nullable=True)

    shipment_rel = relationship("ExportShipment", back_populates="compliance_rel")

    __table_args__ = (
        UniqueConstraint('company_id', 'shipment_no', name='uq_export_compliance_company_shipment_no'),
        ForeignKeyConstraint(
            ['company_id', 'shipment_no'], ['export_shipments.company_id', 'export_shipments.shipment_no'],
            name='fk_export_compliance_company_shipment',
        ),
    )


class ExportDocumentFile(Base):
    """
    Stores generated and uploaded export-document PDFs in DB, with a filesystem
    path for fast browser access.
    """
    __tablename__ = 'export_document_files'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    module_name = Column(String, index=True, nullable=False)
    record_id = Column(Integer, index=True, nullable=False)
    document_no = Column(String, index=True, nullable=True)
    document_kind = Column(String, default="GENERATED_PDF", index=True)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=True)
    content_type = Column(String, default="application/pdf")
    file_bytes = Column(LargeBinary, nullable=False)
    file_size = Column(Integer, default=0)
    version_no = Column(Integer, default=1)
    is_current = Column(Boolean, default=True, index=True)
    uploaded_by = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    remarks = Column(Text, nullable=True)
    approval_status = Column(String, default="PENDING", index=True, nullable=False)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_remarks = Column(Text, nullable=True)
    document_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    issuer_name = Column(String, nullable=True)
    reference_no = Column(String, nullable=True)
    currency = Column(String, nullable=True)
    amount = Column(Numeric(18, 2), nullable=True)
    details_json = Column(Text, nullable=True)


class ExportDocumentApproval(Base):
    """Email-wise unanimous approval assignment for an uploaded export document."""
    __tablename__ = "export_document_approvals"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    file_id = Column(Integer, ForeignKey("export_document_files.id", ondelete="CASCADE"), index=True, nullable=False)
    approver_email = Column(String, index=True, nullable=False)
    decision = Column(String, default="PENDING", index=True, nullable=False)
    remarks = Column(Text, nullable=True)
    assigned_by = Column(String, nullable=True)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("file_id", "approver_email", name="uq_export_document_approvals_file_email"),
    )


class ExportRequiredDocument(Base):
    """PO-wise export document checklist configured by the operations team."""
    __tablename__ = 'export_required_documents'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    po_number = Column(String, index=True, nullable=False)
    document_kind = Column(String, index=True, nullable=False)
    document_label = Column(String, nullable=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            'company_id', 'po_number', 'document_kind',
            name='uq_export_required_documents_company_po_kind',
        ),
    )


class CommercialInvoice(Base):
    __tablename__ = 'commercial_invoices'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    shipment_no = Column(String, nullable=False)
    
    # Standardized Master Keys
    invoice_no = Column(String, index=True, nullable=False) # e.g., INV-2026-0001
    po_number = Column(String, index=True, nullable=False)
    container_no = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=False)
    
    invoice_date = Column(Date, nullable=False)
    buyer_address = Column(Text, nullable=False)
    consignee_name = Column(String, nullable=True)
    notify_party = Column(Text, nullable=True)
    country = Column(String, index=True, nullable=False)
    
    # Financials & Multi-Currency System
    currency = Column(String, default="USD")
    exchange_rate = Column(Numeric(18, 6), default=1.0)
    total_amount = Column(Numeric(18, 2), default=0.0)       # In Foreign Currency
    invoice_value_inr = Column(Numeric(18, 2), default=0.0)   # Auto-calculated (total_amount * exchange_rate)
    
    # Logistics Specifications
    shipment_type = Column(String, default="SEA")    # SEA / AIR
    payment_terms = Column(String, nullable=False)
    shipment_terms = Column(String, nullable=False)  # FOB / CIF / CFR
    payment_status = Column(String, default="PENDING")
    status = Column(String, default="OPEN")          # System Workflow Status (OPEN -> CLOSED)
    
    # Weights & Measures
    total_mc = Column(Integer, default=0)            # Total Master Cartons
    total_net_weight = Column(Float, default=0.0)
    total_gross_weight = Column(Float, default=0.0)
    port_of_loading = Column(String, nullable=True)
    port_of_discharge = Column(String, nullable=True)
    final_destination = Column(String, nullable=True)
    
    # Attachments & Audit Controls
    document_path = Column(String, nullable=True)    # Path to Invoice Signed PDF Scan
    remarks = Column(Text, nullable=True)

    # --- Accounting Integration (Added) ---
    # Journal created when invoice is POSTED
    journal_id = Column(Integer, nullable=True)              # FK → voucher_headers.id (Sales Dr / Revenue Cr)
    cogs_journal_id = Column(Integer, nullable=True)         # FK → voucher_headers.id (COGS Dr / FG Inventory Cr)
    gstr1_updated = Column(Boolean, default=False)           # Set True after GSTR-1 auto-population
    customer_ledger_id = Column(Integer, nullable=True)      # FK → ledger_masters.id
    sales_ledger_id = Column(Integer, nullable=True)         # FK → ledger_masters.id

    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_status = Column(String, default="PENDING")
    is_cancelled = Column(Boolean, default=False, index=True)

    shipment_rel = relationship("ExportShipment", back_populates="invoice_rel")
    packing_items = relationship("PackingList", back_populates="invoice")

    __table_args__ = (
        UniqueConstraint('company_id', 'invoice_no', name='uq_commercial_invoices_company_invoice_no'),
        ForeignKeyConstraint(
            ['company_id', 'shipment_no'], ['export_shipments.company_id', 'export_shipments.shipment_no'],
            name='fk_commercial_invoices_company_shipment',
        ),
    )


class PackingList(Base):
    __tablename__ = 'packing_lists'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    packing_no = Column(String, index=True, nullable=False)  # e.g., PL-2026-0001
    
    # Standardized Cross-Linking Blocks
    invoice_no = Column(String, nullable=False)
    po_number = Column(String, index=True, nullable=True)
    container_no = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=True)
    invoice_item_no = Column(Integer, nullable=True)
    
    # Cold Storage Inventory Integration (Traceability)
    inventory_batch_id = Column(String, index=True, nullable=True) # Cold Storage Lot ID
    stock_entry_no = Column(String, index=True, nullable=True)     # Material Release Note Ref
    
    # Seafood Specific Traceability
    product_name = Column(String, nullable=False)    # e.g., Vannamei HLSO IQF
    grade = Column(String, nullable=False)           # e.g., 16/20, 21/25
    batch_no = Column(String, index=True, nullable=True)
    lot_no = Column(String, index=True, nullable=True)
    glaze = Column(String, nullable=True)            # e.g., 10% Glaze
    freezing_type = Column(String, nullable=True)    # IQF / Block Frozen / Blast
    hs_code = Column(String, nullable=True)
    
    manufacturing_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    
    # Physical Configuration
    packing_style = Column(String, nullable=False)
    inner_pack = Column(String, nullable=True)       # e.g., Printed Pouch
    outer_pack = Column(String, nullable=True)       # e.g., 5-Ply Master Carton
    master_cartons = Column(Integer, default=0)
    net_weight = Column(Float, default=0.0)
    gross_weight = Column(Float, default=0.0)
    pallet_count = Column(Integer, default=0)
    
    document_path = Column(String, nullable=True)    # Packing List PDF Copy
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    is_cancelled = Column(Boolean, default=False, index=True)

    invoice = relationship("CommercialInvoice", back_populates="packing_items")

    __table_args__ = (
        ForeignKeyConstraint(
            ['company_id', 'invoice_no'], ['commercial_invoices.company_id', 'commercial_invoices.invoice_no'],
            name='fk_packing_lists_company_invoice',
        ),
    )


class ContainerStuffing(Base):
    __tablename__ = 'container_stuffing'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    company_name = Column(String, nullable=True)
    
    # Standardized Identifiers
    container_no = Column(String, index=True, nullable=False)
    invoice_no = Column(String, index=True, nullable=True)
    po_number = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=True)
    
    seal_no = Column(String, nullable=False)
    shipping_line = Column(String, nullable=True)
    stuffing_date = Column(Date, nullable=False)
    stuffing_location = Column(String, nullable=True)
    
    # Container Environment Metrics
    container_type = Column(String, default="Reefer") # Reefer / Dry
    container_size = Column(String, default="40FT")   # 20FT / 40FT
    container_condition = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    temperature_before_loading = Column(Float, nullable=True)
    temperature_after_loading = Column(Float, nullable=True)
    temperature = Column(Float, nullable=False)       # Core set temp (e.g., -18°C)
    
    vehicle_no = Column(String, nullable=False)
    driver_name = Column(String, nullable=True)
    loading_supervisor = Column(String, nullable=False)
    photo_path = Column(String, nullable=True)        # Geo-tagged stuffing proof image
    document_path = Column(String, nullable=True)     # Stuffing Report Signed Copy
    remarks = Column(Text, nullable=True)
    
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_status = Column(String, default="PENDING")
    is_cancelled = Column(Boolean, default=False, index=True)

    __table_args__ = (UniqueConstraint('company_id', 'container_no', name='uq_container_stuffing_company_container_no'),)


class ShippingBill(Base):
    __tablename__ = 'shipping_bills'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    shipping_bill_no = Column(String, index=True, nullable=False) # SB-2026-0001
    shipping_bill_date = Column(Date, nullable=False)
    
    # Standardized Identifiers
    invoice_no = Column(String, index=True, nullable=False)
    container_no = Column(String, index=True, nullable=True)
    po_number = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=True)
    
    # Financial Benefits Configurations
    shipping_bill_value = Column(Numeric(18, 2), default=0.0)
    drawback_amount = Column(Numeric(18, 2), default=0.0)     # Duty Drawback (DBK) Receivable
    scheme = Column(String, default="NONE")          # ROSCTL / DBK / BOTH / NONE
    customs_status = Column(String, default="LEO")   # LEO / Assessment Pending
    
    port = Column(String, nullable=False)
    cha_name = Column(String, nullable=False)
    cha_bill_no = Column(String, nullable=True)
    vessel_name = Column(String, nullable=False)
    voyage_no = Column(String, nullable=False)
    etd = Column(Date, nullable=False)
    eta = Column(Date, nullable=False)
    
    document_path = Column(String, nullable=True)    # Scanned Shipping Bill PDF
    remarks = Column(Text, nullable=True)
    
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_status = Column(String, default="PENDING")
    is_cancelled = Column(Boolean, default=False, index=True)

    __table_args__ = (UniqueConstraint('company_id', 'shipping_bill_no', name='uq_shipping_bills_company_shipping_bill_no'),)


class BillOfLading(Base):
    __tablename__ = 'bill_of_ladings'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    bl_no = Column(String, index=True, nullable=False) # BL-2026-0001
    bl_date = Column(Date, nullable=False)
    onboard_date = Column(Date, nullable=True)
    
    # Standardized Identifiers
    invoice_no = Column(String, index=True, nullable=False)
    container_no = Column(String, index=True, nullable=False)
    po_number = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=True)
    
    shipping_line = Column(String, nullable=False)
    seal_no = Column(String, nullable=False)
    freight_terms = Column(String, default="PREPAID") # PREPAID / COLLECT
    no_of_original_bl = Column(Integer, default=3)
    marks_and_numbers = Column(Text, nullable=True)
    packages_description = Column(Text, nullable=True)
    
    place_of_receipt = Column(String, nullable=True)
    place_of_delivery = Column(String, nullable=True)
    gross_weight = Column(Float, default=0.0)
    net_weight = Column(Float, default=0.0)
    
    document_path = Column(String, nullable=True)    # BL Scanned Copy
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_status = Column(String, default="PENDING")
    is_cancelled = Column(Boolean, default=False, index=True)

    __table_args__ = (UniqueConstraint('company_id', 'bl_no', name='uq_bill_of_ladings_company_bl_no'),)


class HealthCertificate(Base):
    __tablename__ = 'health_certificates'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    certificate_no = Column(String, index=True, nullable=False) # HC-2026-0001
    issue_date = Column(Date, nullable=False)
    authority = Column(String, default="EIA")          # Export Inspection Agency
    factory_approval_no = Column(String, nullable=True)
    
    # Standardized Identifiers
    invoice_no = Column(String, index=True, nullable=False)
    container_no = Column(String, index=True, nullable=False)
    po_number = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=True)
    
    country = Column(String, nullable=True)
    species = Column(String, nullable=True)            # e.g., Litopenaeus vannamei
    temperature_verified = Column(Boolean, default=True)
    issued_by = Column(String, nullable=True)
    status = Column(String, default="ACTIVE")          # ACTIVE / AMENDED / CANCELLED
    
    document_path = Column(String, nullable=True)    # Health Certificate PDF Scan
    remarks = Column(Text, nullable=True)
    
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    is_cancelled = Column(Boolean, default=False, index=True)

    __table_args__ = (UniqueConstraint('company_id', 'certificate_no', name='uq_health_certificates_company_certificate_no'),)
