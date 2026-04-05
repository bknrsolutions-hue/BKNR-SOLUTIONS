from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database.models.processing import (
    RawMaterialPurchasing,
    Grading,
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
    CENTRAL FLOOR BALANCE CALCULATOR (Updated as per User Request)
    - Value Added Logic: Peeling_Out + Other_Receiving + Other_Soaking_Rejection - Soaking_In
    - HLSO Logic: Grading + HLSO_Receiving + HLSO_Soaking_Rejection - Peeling_Used - Soaking_In
    """

    variety_upper = variety.strip().upper() if variety else ""

    # ================================================
    # 🔴 SOAKING IMPACT (Deduction & Rejection)
    # ================================================
    # Soaking lo vellina quantity (Deduction)
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

    # Soaking nundi vachina rejection (Recovery)
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
    # 🔵 HOSO (RMP + Grading In + Soaking Rejection - Grading Out - Soaking In - Deheading In)
    # ================================================
    if variety_upper == "HOSO":
        # 1. బయట నుండి కొన్న HOSO (Stock Increase)
        rmp_qty = db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.peeling_at == location,
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.species == species,
            RawMaterialPurchasing.variety_name == "HOSO"
        ).scalar()

        # 2. గ్రేడింగ్‌లో ఈ కౌంట్‌లోకి వచ్చిన క్వాంటిటీ (Stock Increase)
        grading_plus = db.query(func.coalesce(func.sum(Grading.quantity), 0)).filter(
            Grading.company_id == company_id, Grading.peeling_at == location,
            Grading.batch_number == batch, Grading.graded_count == count,
            Grading.species == species, Grading.variety_name == "HOSO"
        ).scalar()

        # 3. గ్రేడింగ్‌లో ఈ కౌంట్ నుండి బయటకు వెళ్ళిన క్వాంటిటీ (Stock Decrease)
        grading_minus = db.query(func.coalesce(func.sum(Grading.quantity), 0)).filter(
            Grading.company_id == company_id, Grading.peeling_at == location,
            Grading.batch_number == batch, Grading.hoso_count == count,
            Grading.species == species, Grading.variety_name == "HOSO"
        ).scalar()

        # 4. 🆕 DEHEADING కి ఇన్-ఫీడ్ (In-feed) గా వెళ్ళిన HOSO (Stock Decrease)
        # HOSO ని కట్ చేయడానికి పంపితే ఫ్లోర్ మీద HOSO స్టాక్ తగ్గుతుంది.
        deheading_in = db.query(func.coalesce(func.sum(Deheading.hoso_qty), 0)).filter(
            Deheading.company_id == company_id,
            Deheading.peeling_at == location,
            Deheading.batch_number == batch,
            Deheading.hoso_count == count,
            Deheading.species == species
        ).scalar()

        # FINAL HOSO CALCULATION
        # Formula: (కొన్నది + గ్రేడింగ్ ఇన్ + సోకింగ్ రిజెక్షన్) - (గ్రేడింగ్ అవుట్ + సోకింగ్ ఇన్ + డీహెడ్డింగ్ ఇన్)
        available = (rmp_qty + grading_plus + soaking_rejection - grading_minus - soaking_in - deheading_in)
    # ================================================
    # 🟢 HLSO (Grading + HLSO_Receiving + Rejection - Peeling_Used - Soaking_In)
    # ================================================
    elif variety_upper == "HLSO":
        grading_qty = db.query(func.coalesce(func.sum(Grading.quantity), 0)).filter(
            Grading.company_id == company_id, Grading.peeling_at == location,
            Grading.batch_number == batch, Grading.graded_count == count,
            Grading.species == species, Grading.variety_name == "HLSO"
        ).scalar()

        # Receiving HLSO (Raw Material Purchasing)
        receiving_hlso = db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.peeling_at == location,
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.species == species,
            RawMaterialPurchasing.variety_name == "HLSO"
        ).scalar()

        peeling_used = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id, Peeling.peeling_at == location,
            Peeling.batch_number == batch, Peeling.hlso_count == count,
            Peeling.species == species
        ).scalar()

        available = (grading_qty + receiving_hlso + soaking_rejection - peeling_used - soaking_in)

    # ================================================
    # 🟡 VALUE ADDED (Peeling_Out + Other_Receiving + Rejection - Soaking_In)
    # ================================================
    else:
        # 1. Peeling Out (Peeled Qty)
        peeled_out = db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)).filter(
            Peeling.company_id == company_id,
            Peeling.peeling_at == location,
            Peeling.batch_number == batch,
            Peeling.hlso_count == count,
            Peeling.species == species,
            Peeling.variety_name == variety_upper
        ).scalar()

        # 2. Receiving other than HOSO, HLSO
        receiving_others = db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.peeling_at == location,
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.species == species,
            RawMaterialPurchasing.variety_name == variety_upper,
            ~RawMaterialPurchasing.variety_name.in_(["HOSO", "HLSO"])
        ).scalar()

        available = (peeled_out + receiving_others + soaking_rejection - soaking_in)

    return round(max(available, 0), 2)