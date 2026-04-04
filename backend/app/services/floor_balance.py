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
    CENTRAL FLOOR BALANCE CALCULATOR (Strict Location Match)
    - Soaking In-Qty: Floor nundi minus (-) avthundi.
    - Soaking Rejection: Variety HOSO/HLSO ayithe tirigi floor ki add (+) avthundi.
    """

    variety_upper = variety.strip().upper() if variety else ""

    # ================================================
    # 🔴 SOAKING IMPACT (In-Qty & Rejection)
    # ================================================
    soaking_in = db.query(
        func.coalesce(func.sum(Soaking.in_qty), 0)
    ).filter(
        Soaking.company_id == company_id,
        Soaking.production_at == location,
        Soaking.batch_number == batch,
        Soaking.in_count == count,
        Soaking.species == species,
        Soaking.variety_name == variety_upper
    ).scalar()

    soaking_rejection = 0.0
    if variety_upper in ["HOSO", "HLSO"]:
        soaking_rejection = db.query(
            func.coalesce(func.sum(Soaking.rejection_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.production_at == location,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == variety_upper
        ).scalar()

    available = 0.0

    # ================================================
    # 🔵 HOSO (RMP + Grading In + Rejection - Grading Out - DeHeading - Soaking In)
    # ================================================
    if variety_upper == "HOSO":
        rmp_qty = db.query(
            func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)
        ).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.peeling_at == location,
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.species == species,
            RawMaterialPurchasing.variety_name == "HOSO"
        ).scalar()

        grading_plus = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.peeling_at == location,
            Grading.batch_number == batch,
            Grading.graded_count == count,
            Grading.species == species,
            Grading.variety_name == "HOSO"
        ).scalar()

        grading_minus = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.peeling_at == location,
            Grading.batch_number == batch,
            Grading.hoso_count == count,
            Grading.species == species,
            Grading.variety_name == "HOSO"
        ).scalar()

        deheading_used = db.query(
            func.coalesce(func.sum(DeHeading.hoso_qty), 0)
        ).filter(
            DeHeading.company_id == company_id,
            DeHeading.peeling_at == location,
            DeHeading.batch_number == batch,
            DeHeading.hoso_count == count,
            DeHeading.species == species
        ).scalar()

        available = (rmp_qty + grading_plus + soaking_rejection - grading_minus - deheading_used - soaking_in)

    # ================================================
    # 🟢 HLSO / PD / PDTO / PUD (Peeling Input Logic)
    # ================================================
    # Note: If variety is NOT HOSO, it checks balance against HLSO stock sources
    else:
        # Grading nundi vachina HLSO
        grading_qty = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.peeling_at == location,
            Grading.batch_number == batch,
            Grading.graded_count == count,
            Grading.species == species,
            Grading.variety_name == "HLSO"
        ).scalar()

        # De-Heading nundi vachina HLSO
        deheading_out = db.query(
            func.coalesce(func.sum(DeHeading.hlso_qty), 0)
        ).filter(
            DeHeading.company_id == company_id,
            DeHeading.peeling_at == location,
            DeHeading.batch_number == batch,
            DeHeading.hoso_count == count,
            DeHeading.species == species
        ).scalar()

        # Peeling lo vellina Input (HLSO Qty)
        peeling_used = db.query(
            func.coalesce(func.sum(Peeling.hlso_qty), 0)
        ).filter(
            Peeling.company_id == company_id,
            Peeling.peeling_at == location,
            Peeling.batch_number == batch,
            Peeling.hlso_count == count,
            Peeling.species == species
        ).scalar()

        # FORMULA REMAINS SAME AS PER YOUR REQUIREMENT
        available = (grading_qty + deheading_out + soaking_rejection - peeling_used - soaking_in)

    return round(max(available, 0), 2)