from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database.models.processing import (
    RawMaterialPurchasing,
    Grading,
    DeHeading,
    Peeling,
    Soaking
)

def get_floor_balance(
    db: Session,
    company_id: str,
    location: str,
    batch: str,
    count: str,
    species: str,
    variety: str
) -> float:
    """
    CENTRAL FLOOR BALANCE CALCULATOR
    - RMP: Direct purchase for any variety (+)
    - Soaking In: Deduction from floor (-)
    - Soaking Rejection: Recovery to floor (+)
    """

    variety_upper = variety.strip().upper()

    # ================================================
    # 🔴 COMMON IMPACTS (RMP, SOAKING IN, REJECTION)
    # ================================================
    
    # 1. Direct Purchase (RMP) - ఏ వెరైటీ అయినా సరే ఫ్లోర్ మీదకు వస్తుంది
    rmp_qty = db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.peeling_at == location,
        RawMaterialPurchasing.batch_number == batch,
        RawMaterialPurchasing.count == count,
        RawMaterialPurchasing.species == species,
        RawMaterialPurchasing.variety_name == variety_upper
    ).scalar()

    # 2. Soaking In (Deduction)
    soaking_in = db.query(func.coalesce(func.sum(Soaking.in_qty), 0)).filter(
        Soaking.company_id == company_id,
        Soaking.production_at == location,
        Soaking.batch_number == batch,
        Soaking.in_count == count,
        Soaking.species == species,
        Soaking.variety_name == variety_upper
    ).scalar()

    # 3. Soaking Rejection (Recovery)
    soaking_rejection = db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)).filter(
        Soaking.company_id == company_id,
        Soaking.production_at == location,
        Soaking.batch_number == batch,
        Soaking.in_count == count,
        Soaking.species == species,
        Soaking.variety_name == variety_upper
    ).scalar()

    available = 0.0

    # ================================================
    # 🔵 HOSO LOGIC
    # ================================================
    if variety_upper == "HOSO":
        grading_plus = db.query(func.coalesce(func.sum(Grading.quantity), 0)).filter(
            Grading.company_id == company_id, Grading.peeling_at == location,
            Grading.batch_number == batch, Grading.graded_count == count,
            Grading.species == species, Grading.variety_name == "HOSO"
        ).scalar()

        grading_minus = db.query(func.coalesce(func.sum(Grading.quantity), 0)).filter(
            Grading.company_id == company_id, Grading.peeling_at == location,
            Grading.batch_number == batch, Grading.hoso_count == count,
            Grading.species == species, Grading.variety_name == "HOSO"
        ).scalar()

        deheading_used = db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0)).filter(
            DeHeading.company_id == company_id, DeHeading.peeling_at == location,
            DeHeading.batch_number == batch, DeHeading.hoso_count == count,
            DeHeading.species == species
        ).scalar()

        # Calculation: (RMP + Grading In + Rejection) - (Grading Out + DeHeading + Soaking In)
        available = (rmp_qty + grading_plus + soaking_rejection - grading_minus - deheading_used - soaking_in)

    # ================================================
    # 🟢 HLSO LOGIC
    # ================================================
    elif variety_upper == "HLSO":
        grading_hlso = db.query(func.coalesce(func.sum(Grading.quantity), 0)).filter(
            Grading.company_id == company_id, Grading.peeling_at == location,
            Grading.batch_number == batch, Grading.graded_count == count,
            Grading.species == species, Grading.variety_name == "HLSO"
        ).scalar()

        # HLSO produced from DeHeading
        deheading_out = db.query(func.coalesce(func.sum(DeHeading.hlso_qty), 0)).filter(
            DeHeading.company_id == company_id, DeHeading.peeling_at == location,
            DeHeading.batch_number == batch, DeHeading.hoso_count == count, # Matching source count
            DeHeading.species == species
        ).scalar()

        peeling_used = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id, Peeling.peeling_at == location,
            Peeling.batch_number == batch, Peeling.hlso_count == count,
            Peeling.species == species
        ).scalar()

        # Calculation: (RMP + Grading HLSO + DeHeading Out + Rejection) - (Peeling + Soaking In)
        available = (rmp_qty + grading_hlso + deheading_out + soaking_rejection - peeling_used - soaking_in)

    # ================================================
    # 🟡 PD / PDTO / PUD / OTHERS
    # ================================================
    else:
        peeled_qty = db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)).filter(
            Peeling.company_id == company_id, Peeling.peeling_at == location,
            Peeling.batch_number == batch, Peeling.hlso_count == count,
            Peeling.species == species, Peeling.variety_name == variety_upper
        ).scalar()

        # Calculation: (RMP + Peeled Qty + Rejection) - (Soaking In)
        available = (rmp_qty + peeled_qty + soaking_rejection - soaking_in)

    return round(max(available, 0), 2)