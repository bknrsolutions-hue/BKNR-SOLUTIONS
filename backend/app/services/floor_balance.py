from sqlalchemy.orm import Session
from sqlalchemy import func, cast, String # cast, String ఇంపోర్ట్ చేసుకోవాలి
from app.database.models.processing import (
    RawMaterialPurchasing, Grading, DeHeading, Peeling, Soaking
)
from app.database.models.reprocess import Reprocess 

def get_floor_balance(
    db: Session,
    company_id: str,
    location: str,
    batch: str,
    count: str,
    species: str,
    variety: str,
    production_for: str = None,
    source_type: str = "RMP",
    cutoff_datetime=None
) -> float:
    
    variety_upper = variety.strip().upper() if variety else ""
    # కౌంట్ ని క్లీన్ చేస్తున్నాం
    clean_count = str(count).strip() if count else ""

    # --- SAFE FILTER HELPER ---
    def apply_filters(query_obj, model_obj, is_repro=False):
        q = query_obj.filter(model_obj.company_id == company_id)
        
        if is_repro:
            q = q.filter(
                model_obj.production_at == location,
                model_obj.new_batch_id == batch,
                # కౌంట్ మ్యాచ్ కోసం క్లీన్ వెర్షన్
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

    # ================================================
    # STEP 1: MAIN INWARD
    # ================================================
    main_inward_qty = 0.0
    if source_type == "REPROCESS":
        in_q = apply_filters(db.query(func.coalesce(func.sum(Reprocess.in_qty), 0)), Reprocess, True)
        repro_in = in_q.filter(~Reprocess.reprocess_type.in_(['SALES', 'STORING'])).scalar() or 0
        main_inward_qty = float(repro_in)
    else:
        rmp_q = apply_filters(db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)), RawMaterialPurchasing)
        # ఇక్కడ కౌంట్ ఫిల్టర్ ని స్ట్రింగ్ కాస్ట్ తో అప్‌డేట్ చేశాను
        main_inward_qty = rmp_q.filter(func.trim(cast(RawMaterialPurchasing.count, String)) == clean_count).scalar() or 0

    # ================================================
    # STEP 2: COMMON IMPACTS (SOAKING)
    # ================================================
    # Soaking లో కూడా కౌంట్ కాలమ్ ని స్ట్రింగ్ గా మార్చి పోల్చాలి
    s_in = apply_filters(db.query(func.coalesce(func.sum(Soaking.in_qty), 0)), Soaking)
    soaking_in = s_in.filter(func.trim(cast(Soaking.in_count, String)) == clean_count).scalar() or 0

    s_rej = apply_filters(db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)), Soaking)
    soaking_rejection = s_rej.filter(func.trim(cast(Soaking.in_count, String)) == clean_count).scalar() or 0

    base_stock = float(main_inward_qty) + float(soaking_rejection) - float(soaking_in)
    available = 0.0

    # ================================================
    # STEP 3: VARIETY SPECIFIC LOGIC
    # ================================================
    if variety_upper == "HOSO":
        g_p = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, String)) == clean_count).scalar() or 0
        g_m = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.hoso_count, String)) == clean_count).scalar() or 0
        dh_u = apply_filters(db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, String)) == clean_count).scalar() or 0
        available = base_stock + float(g_p) - float(g_m) - float(dh_u)

    elif variety_upper == "HLSO":
        g_h = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, String)) == clean_count).scalar() or 0
        dh_o = apply_filters(db.query(func.coalesce(func.sum(DeHeading.hlso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, String)) == clean_count).scalar() or 0
        
        # --- MODIFIED PEELING QUERY ---
        # Ikkada manually query chestunnam variety filter lekunda, 
        # endukante HLSO nundi ey variety tayaru chesina stock deduct avvali.
        p_q = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.peeling_at == location,
            Peeling.species == species,
            func.trim(cast(Peeling.hlso_count, String)) == clean_count
        )
        
        # Production for filter optional kabatti adi check chestunnam
        if production_for and production_for != "N/A":
            p_q = p_q.filter(Peeling.production_for == production_for)
        elif production_for == "N/A":
            p_q = p_q.filter((Peeling.production_for == None) | (Peeling.production_for == ""))
            
        p_u = p_q.scalar() or 0
        
        available = base_stock + float(g_h)  - float(p_u)
    else:
        p_q = apply_filters(db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)), Peeling).filter(func.trim(cast(Peeling.hlso_count, String)) == clean_count).scalar() or 0
        available = base_stock + float(p_q)

    return round(max(available, 0.0), 2)