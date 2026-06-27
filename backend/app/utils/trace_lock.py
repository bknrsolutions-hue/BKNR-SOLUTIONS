from sqlalchemy.orm import Session
from app.database.models.processing import (
    GateEntry,
    RawMaterialPurchasing,
    DeHeading,
    Grading,
    Peeling,
    Soaking,
    Production
)

def is_batch_used_in_rmp(db: Session, batch_number: str, company_id: str) -> bool:
    """Check if the batch has moved from Gate Entry to Raw Material Purchasing."""
    if not batch_number or not company_id:
        return False
    exists = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.batch_number == batch_number,
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.is_cancelled == False
    ).first()
    return exists is not None

def is_batch_used_downstream_from_rmp(db: Session, batch_number: str, company_id: str) -> tuple[bool, str | None]:
    """Check if the RMP batch is used in subsequent stages (DeHeading, Grading, Peeling, Soaking, Production)."""
    if not batch_number or not company_id:
        return False, None

    # Check Deheading
    if db.query(DeHeading).filter(
        DeHeading.batch_number == batch_number,
        DeHeading.company_id == company_id,
        DeHeading.is_cancelled == False
    ).first():
        return True, "DeHeading"

    # Check Grading
    if db.query(Grading).filter(
        Grading.batch_number == batch_number,
        Grading.company_id == company_id,
        Grading.is_cancelled == False
    ).first():
        return True, "Grading"

    # Check Peeling
    if db.query(Peeling).filter(
        Peeling.batch_number == batch_number,
        Peeling.company_id == company_id,
        Peeling.is_cancelled == False
    ).first():
        return True, "Peeling"

    # Check Soaking
    if db.query(Soaking).filter(
        Soaking.batch_number == batch_number,
        Soaking.company_id == company_id,
        Soaking.is_cancelled == False
    ).first():
        return True, "Soaking"

    # Check Production
    if db.query(Production).filter(
        Production.batch_number == batch_number,
        Production.company_id == company_id,
        Production.is_cancelled == False
    ).first():
        return True, "Production"

    return False, None

def is_batch_used_downstream_from_deheading(db: Session, batch_number: str, company_id: str) -> tuple[bool, str | None]:
    """Check if DeHeading batch is used downstream (Grading, Peeling, Soaking, Production)."""
    if not batch_number or not company_id:
        return False, None

    # Check Grading
    if db.query(Grading).filter(
        Grading.batch_number == batch_number,
        Grading.company_id == company_id,
        Grading.is_cancelled == False
    ).first():
        return True, "Grading"

    # Check Peeling
    if db.query(Peeling).filter(
        Peeling.batch_number == batch_number,
        Peeling.company_id == company_id,
        Peeling.is_cancelled == False
    ).first():
        return True, "Peeling"

    # Check Soaking
    if db.query(Soaking).filter(
        Soaking.batch_number == batch_number,
        Soaking.company_id == company_id,
        Soaking.is_cancelled == False
    ).first():
        return True, "Soaking"

    # Check Production
    if db.query(Production).filter(
        Production.batch_number == batch_number,
        Production.company_id == company_id,
        Production.is_cancelled == False
    ).first():
        return True, "Production"

    return False, None

def is_batch_used_downstream_from_grading(db: Session, batch_number: str, company_id: str) -> tuple[bool, str | None]:
    """Check if Grading batch is used downstream (Peeling, Soaking, Production)."""
    if not batch_number or not company_id:
        return False, None

    # Check Peeling
    if db.query(Peeling).filter(
        Peeling.batch_number == batch_number,
        Peeling.company_id == company_id,
        Peeling.is_cancelled == False
    ).first():
        return True, "Peeling"

    # Check Soaking
    if db.query(Soaking).filter(
        Soaking.batch_number == batch_number,
        Soaking.company_id == company_id,
        Soaking.is_cancelled == False
    ).first():
        return True, "Soaking"

    # Check Production
    if db.query(Production).filter(
        Production.batch_number == batch_number,
        Production.company_id == company_id,
        Production.is_cancelled == False
    ).first():
        return True, "Production"

    return False, None

def is_batch_used_downstream_from_peeling(db: Session, batch_number: str, company_id: str) -> tuple[bool, str | None]:
    """Check if Peeling batch is used downstream (Soaking, Production)."""
    if not batch_number or not company_id:
        return False, None

    # Check Soaking
    if db.query(Soaking).filter(
        Soaking.batch_number == batch_number,
        Soaking.company_id == company_id,
        Soaking.is_cancelled == False
    ).first():
        return True, "Soaking"

    # Check Production
    if db.query(Production).filter(
        Production.batch_number == batch_number,
        Production.company_id == company_id,
        Production.is_cancelled == False
    ).first():
        return True, "Production"

    return False, None

def is_batch_used_downstream_from_soaking(db: Session, batch_number: str, company_id: str) -> tuple[bool, str | None]:
    """Check if Soaking batch is used downstream (Production)."""
    if not batch_number or not company_id:
        return False, None

    # Check Production
    if db.query(Production).filter(
        Production.batch_number == batch_number,
        Production.company_id == company_id,
        Production.is_cancelled == False
    ).first():
        return True, "Production"

    return False, None
