from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Date, Float, Text, DateTime, ForeignKey, Boolean, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.timezone import ist_now


class CRMQuotation(Base):
    """
    Sales / CRM Price Quotation issued to domestic or international customers.
    """
    __tablename__ = "crm_quotations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    company_name = Column(String(255), nullable=True)
    inquiry_id = Column(Integer, nullable=True)
    quotation_no = Column(String(50), index=True, nullable=False)  # e.g., QT-2026-0001
    po_number = Column(String(100), nullable=True)
    linked_pi_id = Column(Integer, nullable=True)
    linked_pi_no = Column(String(100), nullable=True)
    quotation_date = Column(Date, nullable=False)
    valid_until = Column(Date, nullable=False)
    shipment_date = Column(String(100), nullable=True)
    
    # Customer / Buyer Details
    customer_name = Column(String(255), nullable=False)
    customer_address = Column(Text, nullable=True)
    agent = Column(String(255), nullable=True)
    country = Column(String(100), nullable=True)
    production_at = Column(String(255), nullable=True)
    currency = Column(String(20), default="USD", nullable=False)
    exchange_rate = Column(Float, default=83.5, nullable=True)
    incoterm = Column(String(50), nullable=True)     # FOB, CIF, CFR, etc.
    payment_terms = Column(String(255), nullable=True)
    
    total_amount = Column(Numeric(18, 2), default=0.0, nullable=False)
    status = Column(String(20), default="DRAFT", index=True, nullable=False) # DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED
    remarks = Column(Text, nullable=True)
    
    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    approved_by = Column(String(255), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_remarks = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=ist_now, nullable=False)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)
    is_cancelled = Column(Boolean, default=False, index=True, nullable=False)

    lines = relationship("CRMQuotationLine", back_populates="quotation", cascade="all, delete-orphan")
    email_replies = relationship("CRMQuotationReply", back_populates="quotation", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("company_id", "quotation_no", name="uq_crm_quotations_company_quotation_no"),
    )


class CRMQuotationLine(Base):
    """
    Individual Line Items within a Sales Quotation.
    Contains all product attributes matching Pending Orders.
    """
    __tablename__ = "crm_quotation_lines"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("crm_quotations.id", ondelete="CASCADE"), nullable=False)
    item_name = Column(String(150), nullable=False)
    brand = Column(String(100), nullable=True)
    packing_style = Column(String(100), nullable=True)
    freezer = Column(String(100), nullable=True)
    count_glaze = Column(String(50), nullable=True)
    weight_glaze = Column(String(50), nullable=True)
    species = Column(String(100), nullable=True)
    variety = Column(String(100), nullable=True)
    grade = Column(String(50), nullable=True)
    no_of_pieces = Column(String(50), nullable=True)
    no_of_mc = Column(Integer, default=0, nullable=True)
    quantity_kg = Column(Float, default=0.0, nullable=False)
    rate_per_kg = Column(Float, default=0.0, nullable=False)  # Bidding Price ($/Kg)
    hoso_count = Column(String(50), nullable=True)               # HOSO Count
    target_hoso_rate = Column(Float, default=0.0, nullable=True)  # Target HOSO Rate (₹/Kg)
    expenses = Column(Float, default=0.0, nullable=True)          # Production Cost / Expenses (₹/Kg)
    target_quotation_price = Column(Float, default=0.0, nullable=True) # Target Quotation Price ($/Kg)
    bidding_price = Column(Float, default=0.0, nullable=True)     # Bidding Price ($/Kg)
    amount = Column(Float, default=0.0, nullable=False)

    quotation = relationship("CRMQuotation", back_populates="lines")


class CRMQuotationReply(Base):
    """
    Customer Email Communication & Inbound Replies Log.
    """
    __tablename__ = "crm_quotation_replies"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("crm_quotations.id", ondelete="CASCADE"), nullable=False)
    quotation_no = Column(String(50), index=True, nullable=False)
    sender_email = Column(String(255), nullable=False)
    recipient_email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    message_body = Column(Text, nullable=False)
    received_at = Column(DateTime, default=ist_now, nullable=False)
    direction = Column(String(20), default="INBOUND", nullable=False) # INBOUND or OUTBOUND
    message_id = Column(String(255), nullable=True)
    attachments_json = Column(Text, nullable=True)  # JSON: [{filename, mime_type, data_url}]

    quotation = relationship("CRMQuotation", back_populates="email_replies")
