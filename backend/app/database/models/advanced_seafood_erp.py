from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Date, Float, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class PondMaster(Base):
    __tablename__ = 'pond_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    farmer_name = Column(String(150), nullable=False)
    pond_location = Column(String(255), nullable=False)
    mpeda_reg_no = Column(String(50), nullable=True)
    water_source = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class HarvestLot(Base):
    __tablename__ = 'harvest_lots'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    lot_number = Column(String(100), unique=True, index=True, nullable=False)
    pond_id = Column(Integer, ForeignKey('pond_masters.id'), nullable=False)
    harvest_date = Column(Date, nullable=False)
    quantity_harvested = Column(Float, nullable=False)
    temperature = Column(Float, nullable=True)
    qc_status = Column(String(20), default='PENDING') # PENDING, APPROVED, REJECTED
    created_at = Column(DateTime, default=datetime.utcnow)

    pond = relationship("PondMaster")


class ProductionBatch(Base):
    __tablename__ = 'production_batches'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    batch_number = Column(String(100), unique=True, index=True, nullable=False)
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(20), default='OPEN') # OPEN, CLOSED
    wastage_qty = Column(Float, default=0.0)
    yield_percent = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProductionConversion(Base):
    __tablename__ = 'production_conversions'

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey('production_batches.id'), nullable=False)
    from_stage = Column(String(30), nullable=False) # e.g. HOSO
    to_stage = Column(String(30), nullable=False)   # e.g. HLSO
    input_weight = Column(Float, nullable=False)
    output_weight = Column(Float, nullable=False)
    process_loss = Column(Float, default=0.0)
    
    # Costings Allocations
    labour_cost = Column(Float, default=0.0)
    ice_cost = Column(Float, default=0.0)
    electricity_cost = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    batch = relationship("ProductionBatch")


class WorkflowConfig(Base):
    __tablename__ = 'workflow_configs'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    document_type = Column(String(50), nullable=False) # e.g. PURCHASE_ORDER, EXPORT_INVOICE
    approver_role = Column(String(50), nullable=False)  # e.g. MANAGER, GM, CEO
    approval_sequence = Column(Integer, nullable=False)  # 1, 2, 3

    __table_args__ = (
        UniqueConstraint('company_id', 'document_type', 'approver_role', name='uix_company_doc_role'),
    )


class DocumentApproval(Base):
    __tablename__ = 'document_approvals'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    document_type = Column(String(50), nullable=False)
    document_id = Column(Integer, nullable=False) # PK of Target Table
    current_sequence = Column(Integer, default=1)
    status = Column(String(20), default='PENDING') # PENDING, APPROVED, REJECTED
    last_updated_by = Column(String(100), nullable=True)
    last_updated_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
