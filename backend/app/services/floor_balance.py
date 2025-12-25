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
    batch: str,
    count: str,
    species: str,
    variety: str
) -> float:
    """
    CENTRAL FLOOR BALANCE CALCULATOR
    Auto calculates available qty
    No manual entry
    """

    variety = variety.strip().upper()

    # ================================
    # 🔵 HOSO
    # ================================
    if variety == "HOSO":

        rmp_qty = db.query(
            func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)
        ).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.species == species,
            RawMaterialPurchasing.variety_name == "HOSO"
        ).scalar()

        grading_plus = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch,
            Grading.graded_count == count,
            Grading.species == species,
            Grading.variety_name == "HOSO"
        ).scalar()

        grading_minus = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch,
            Grading.hoso_count == count,
            Grading.species == species,
            Grading.variety_name == "HOSO"
        ).scalar()

        deheading_used = db.query(
            func.coalesce(func.sum(DeHeading.hoso_qty), 0)
        ).filter(
            DeHeading.company_id == company_id,
            DeHeading.batch_number == batch,
            DeHeading.hoso_count == count,
            DeHeading.species == species
        ).scalar()

        soaking_in = db.query(
            func.coalesce(func.sum(Soaking.in_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == "HOSO"
        ).scalar()

        soaking_rej = db.query(
            func.coalesce(func.sum(Soaking.rejection_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == "HOSO"
        ).scalar()

        available = (
            rmp_qty
            + grading_plus
            - grading_minus
            - deheading_used
            - soaking_in
            + soaking_rej
        )

    # ================================
    # 🟢 HLSO
    # ================================
    elif variety == "HLSO":

        grading_qty = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch,
            Grading.graded_count == count,
            Grading.species == species,
            Grading.variety_name == "HLSO"
        ).scalar()

        peeling_used = db.query(
            func.coalesce(func.sum(Peeling.hlso_qty), 0)
        ).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.hlso_count == count,
            Peeling.species == species
        ).scalar()

        soaking_in = db.query(
            func.coalesce(func.sum(Soaking.in_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == "HLSO"
        ).scalar()

        soaking_rej = db.query(
            func.coalesce(func.sum(Soaking.rejection_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == "HLSO"
        ).scalar()

        available = grading_qty - peeling_used - soaking_in + soaking_rej

    # ================================
    # 🟡 OTHER VARIETIES (PD / PDTO / ETC)
    # ================================
    else:

        peeled_qty = db.query(
            func.coalesce(func.sum(Peeling.peeled_qty), 0)
        ).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.variety_name == variety,
            Peeling.hlso_count == count,
            Peeling.species == species
        ).scalar()

        soaking_in = db.query(
            func.coalesce(func.sum(Soaking.in_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.variety_name == variety,
            Soaking.in_count == count,
            Soaking.species == species
        ).scalar()

        soaking_rej = db.query(
            func.coalesce(func.sum(Soaking.rejection_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.variety_name == variety,
            Soaking.in_count == count,
            Soaking.species == species
        ).scalar()

        available = peeled_qty - soaking_in + soaking_rej

    return round(max(available, 0), 2)
