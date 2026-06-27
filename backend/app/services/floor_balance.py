from sqlalchemy.orm import Session
from sqlalchemy import func, cast, String, or_, and_  # Added or_, and_ for multi-day date calculations
from app.database.models.processing import (
    RawMaterialPurchasing, Grading, DeHeading, Peeling, Soaking
)
from app.database.models.reprocess import Reprocess 
from app.database.models.floor_balance import FloorBalance


def get_live_floor_balance_rows(
    db: Session,
    company_id: str,
    production_for: str | None = None,
    location: str | None = None,
    allowed_locations: list[str] | None = None,
) -> list[dict]:
    """Return the canonical grouped floor stock for the active session scope."""
    query = db.query(
        FloorBalance.location.label("location"),
        FloorBalance.production_for.label("production_for"),
        FloorBalance.batch_number.label("batch_number"),
        FloorBalance.source_type.label("source_type"),
        FloorBalance.species.label("species"),
        FloorBalance.variety.label("variety"),
        FloorBalance.count.label("count"),
        func.coalesce(func.sum(FloorBalance.available_qty), 0).label("available_qty"),
    ).filter(FloorBalance.company_id == company_id)

    if production_for:
        query = query.filter(
            func.upper(func.trim(FloorBalance.production_for))
            == str(production_for).strip().upper()
        )
    if location:
        query = query.filter(
            func.upper(func.trim(FloorBalance.location))
            == str(location).strip().upper()
        )
    elif allowed_locations:
        clean_locations = [str(value).strip().upper() for value in allowed_locations if str(value).strip()]
        if clean_locations:
            query = query.filter(func.upper(func.trim(FloorBalance.location)).in_(clean_locations))

    rows = query.group_by(
        FloorBalance.location,
        FloorBalance.production_for,
        FloorBalance.batch_number,
        FloorBalance.source_type,
        FloorBalance.species,
        FloorBalance.variety,
        FloorBalance.count,
    ).having(func.sum(FloorBalance.available_qty) > 0.01).order_by(
        FloorBalance.location,
        FloorBalance.production_for,
        FloorBalance.batch_number,
        FloorBalance.species,
        FloorBalance.variety,
        FloorBalance.count,
    ).all()

    return [
        {
            "location": row.location or "Floor",
            "production_for": row.production_for or "General Stock",
            "batch": row.batch_number or "N/A",
            "source": row.source_type or "RMP",
            "species": row.species or "N/A",
            "variety": row.variety or "N/A",
            "count": row.count or "N/A",
            "available_qty": round(float(row.available_qty or 0), 2),
        }
        for row in rows
    ]

# ============================================================================
# 1. EXISTING ORIGINAL FUNCTION (TOUCH CHEYYADAM LEDU - NO CHANGES)
# ============================================================================
def get_floor_balance(
    db: Session,
    company_id: str,
    location: str,
    batch: str,
    count: str,
    species: str,
    variety: str,
    production_for: str = None,
    source_type: str = "RMP"
) -> float:
    
    variety_upper = variety.strip().upper() if variety else ""
    clean_count = str(count).strip() if count else ""

    def apply_filters(query_obj, model_obj, is_repro=False):
        q = query_obj.filter(model_obj.company_id == company_id)
        if hasattr(model_obj, 'is_cancelled'):
            q = q.filter(model_obj.is_cancelled != True)
        if is_repro:
            q = q.filter(
                model_obj.production_at == location,
                model_obj.new_batch_id == batch,
                func.trim(cast(model_obj.grade, String)) == clean_count,
                model_obj.species == species,
                model_obj.variety == variety
            )
        else:
            if hasattr(model_obj, 'peeling_at'):
                q = q.filter(model_obj.peeling_at == location)
            elif hasattr(model_obj, 'production_at'):
                q = q.filter(model_obj.production_at == location)

            q = q.filter(model_obj.batch_number == batch)
            q = q.filter(model_obj.species == species)

            if hasattr(model_obj, 'variety_name'):
                q = q.filter(model_obj.variety_name == variety_upper)
            elif hasattr(model_obj, 'variety'):
                q = q.filter(model_obj.variety == variety_upper)

        if hasattr(model_obj, 'production_for'):
            p_for_clean = str(production_for).strip() if production_for else ""
            if p_for_clean and p_for_clean not in ("N/A", "General Stock", "GENERAL STOCK"):
                q = q.filter(model_obj.production_for == production_for)
            else:
                q = q.filter((model_obj.production_for == None) | (func.trim(model_obj.production_for) == ""))
        return q

    main_inward_qty = 0.0
    if source_type == "REPROCESS":
        in_q = apply_filters(db.query(func.coalesce(func.sum(Reprocess.in_qty), 0)), Reprocess, True)
        repro_in = in_q.filter(~Reprocess.reprocess_type.in_(['SALES', 'STORING'])).scalar() or 0
        main_inward_qty = float(repro_in)
    else:
        rmp_q = apply_filters(db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)), RawMaterialPurchasing)
        main_inward_qty = rmp_q.filter(func.trim(cast(RawMaterialPurchasing.count, String)) == clean_count).scalar() or 0

    s_in = apply_filters(db.query(func.coalesce(func.sum(Soaking.in_qty), 0)), Soaking)
    soaking_in = s_in.filter(func.trim(cast(Soaking.in_count, String)) == clean_count).scalar() or 0

    s_rej = apply_filters(db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)), Soaking)
    soaking_rejection = s_rej.filter(func.trim(cast(Soaking.in_count, String)) == clean_count).scalar() or 0

    base_stock = float(main_inward_qty) + float(soaking_rejection) - float(soaking_in)
    available = 0.0

    if variety_upper == "HOSO":
        g_p = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, String)) == clean_count).scalar() or 0
        g_m = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.hoso_count, String)) == clean_count).scalar() or 0
        dh_u = apply_filters(db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, String)) == clean_count).scalar() or 0
        available = base_stock + float(g_p) - float(g_m) - float(dh_u)

    elif variety_upper == "HLSO":
        g_h = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, String)) == clean_count).scalar() or 0
        dh_o = apply_filters(db.query(func.coalesce(func.sum(DeHeading.hlso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, String)) == clean_count).scalar() or 0
        
        p_q = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.peeling_at == location,
            Peeling.species == species,
            func.trim(cast(Peeling.hlso_count, String)) == clean_count,
            Peeling.is_cancelled != True
        )
        if production_for and production_for != "N/A":
            p_q = p_q.filter(Peeling.production_for == production_for)
        elif production_for == "N/A":
            p_q = p_q.filter((Peeling.production_for == None) | (Peeling.production_for == ""))
            
        p_u = p_q.scalar() or 0
        available = base_stock + float(g_h) - float(p_u)
    else:
        p_q = apply_filters(db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)), Peeling).filter(func.trim(cast(Peeling.hlso_count, String)) == clean_count).scalar() or 0
        available = base_stock + float(p_q)

    return round(max(available, 0.0), 2)


# ============================================================================
# 2. FIXED PRODUCTION MOVEMENT LOGIC (STRICT MULTI-DAY TIME & DATE VALIDATION)
# ============================================================================
def get_floor_movement_after_snapshot(
    db: Session,
    company_id: str,
    location: str,
    batch: str,
    count: str,
    species: str,
    variety: str,
    production_for: str = None,
    source_type: str = "RMP",
    snapshot_date_str: str = None   # MUST Pass as 'YYYY-MM-DD'
) -> float:
    
    if not snapshot_date_str:
        return 0.0

    variety_upper = variety.strip().upper() if variety else ""
    clean_count = str(count).strip() if count else ""

    def apply_shift_filters(query_obj, model_obj, is_repro=False):
        q = query_obj.filter(model_obj.company_id == company_id)
        if hasattr(model_obj, 'is_cancelled'):
            q = q.filter(model_obj.is_cancelled != True)
        
        # 🟢 FIX 1 & 2: Handles multi-day offsets + standard string sorting matching validation matrix
        if hasattr(model_obj, 'date') and hasattr(model_obj, 'time'):
            q = q.filter(
                or_(
                    model_obj.date > snapshot_date_str,
                    and_(model_obj.date == snapshot_date_str, model_obj.time >= "09:00:00")
                )
            )

        if is_repro:
            q = q.filter(
                model_obj.production_at == location,
                model_obj.new_batch_id == batch,
                func.trim(cast(model_obj.grade, String)) == clean_count,
                model_obj.species == species,
                model_obj.variety == variety
            )
        else:
            if hasattr(model_obj, 'peeling_at'):
                q = q.filter(model_obj.peeling_at == location)
            elif hasattr(model_obj, 'production_at'):
                q = q.filter(model_obj.production_at == location)

            q = q.filter(model_obj.batch_number == batch)
            q = q.filter(model_obj.species == species)

            if hasattr(model_obj, 'variety_name'):
                q = q.filter(model_obj.variety_name == variety_upper)
            elif hasattr(model_obj, 'variety'):
                q = q.filter(model_obj.variety == variety_upper)

        if hasattr(model_obj, 'production_for'):
            if production_for and production_for != "N/A":
                q = q.filter(model_obj.production_for == production_for)
            elif production_for == "N/A":
                q = q.filter((model_obj.production_for == None) | (model_obj.production_for == ""))
        return q

    # Run multi-tier transactional pipelines calculations
    main_inward_qty = 0.0
    if source_type == "REPROCESS":
        in_q = apply_shift_filters(db.query(func.coalesce(func.sum(Reprocess.in_qty), 0)), Reprocess, True)
        repro_in = in_q.filter(~Reprocess.reprocess_type.in_(['SALES', 'STORING'])).scalar() or 0
        main_inward_qty = float(repro_in)
    else:
        rmp_q = apply_shift_filters(db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)), RawMaterialPurchasing)
        main_inward_qty = rmp_q.filter(func.trim(cast(RawMaterialPurchasing.count, String)) == clean_count).scalar() or 0

    s_in = apply_shift_filters(db.query(func.coalesce(func.sum(Soaking.in_qty), 0)), Soaking)
    soaking_in = s_in.filter(func.trim(cast(Soaking.in_count, String)) == clean_count).scalar() or 0

    s_rej = apply_shift_filters(db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)), Soaking)
    soaking_rejection = s_rej.filter(func.trim(cast(Soaking.in_count, String)) == clean_count).scalar() or 0

    base_stock = float(main_inward_qty) + float(soaking_rejection) - float(soaking_in)
    movement_delta = 0.0

    if variety_upper == "HOSO":
        g_p = apply_shift_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, String)) == clean_count).scalar() or 0
        g_m = apply_shift_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.hoso_count, String)) == clean_count).scalar() or 0
        dh_u = apply_shift_filters(db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, String)) == clean_count).scalar() or 0
        movement_delta = base_stock + float(g_p) - float(g_m) - float(dh_u)

    elif variety_upper == "HLSO":
        g_h = apply_shift_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, String)) == clean_count).scalar() or 0
        dh_o = apply_shift_filters(db.query(func.coalesce(func.sum(DeHeading.hlso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, String)) == clean_count).scalar() or 0
        
        # 🟢 FIX 1: Apply identical multi-day conditional boundaries for native peeling structures query
        p_q = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.peeling_at == location,
            Peeling.species == species,
            func.trim(cast(Peeling.hlso_count, String)) == clean_count,
            Peeling.is_cancelled != True
        ).filter(
            or_(
                Peeling.date > snapshot_date_str,
                and_(Peeling.date == snapshot_date_str, Peeling.time >= "09:00:00")
            )
        )
        if production_for and production_for != "N/A":
            p_q = p_q.filter(Peeling.production_for == production_for)
        elif production_for == "N/A":
            p_q = p_q.filter((Peeling.production_for == None) | (Peeling.production_for == ""))
            
        p_u = p_q.scalar() or 0
        movement_delta = base_stock + float(g_h) - float(p_u)
    else:
        p_q = apply_shift_filters(db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)), Peeling).filter(func.trim(cast(Peeling.hlso_count, String)) == clean_count).scalar() or 0
        movement_delta = base_stock + float(p_q)

    return round(movement_delta, 2)
