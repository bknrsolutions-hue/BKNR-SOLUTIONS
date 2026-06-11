from sqlalchemy.orm import Session
from app.database.models.processing import HlsoForGrading
from app.utils.timezone import ist_now

# =====================================================================
# 1. DE-HEADING ACTIONS (Pool లోకి స్టాక్ యాడ్ చేయడం / తీసేయడం)
# =====================================================================

def add_deheading_to_grading_pool(db: Session, dh_obj) -> bool:
    """De-Heading Entry సేవ్ అయినప్పుడు ఆటోమేటిక్‌గా గ్రేడింగ్ పూల్ లో క్వాంటిటీ ని యాడ్ చేస్తుంది"""
    try:
        qty = float(dh_obj.hlso_qty or 0)
        if qty <= 0:
            return False

        # ఒకే కాంబినేషన్ లో ఆల్రెడీ Pending రికార్డ్ ఉందేమో వెతుకుతుంది
        record = db.query(HlsoForGrading).filter(
            HlsoForGrading.batch_number == dh_obj.batch_number,
            HlsoForGrading.production_for == dh_obj.production_for,
            HlsoForGrading.peeling_at == dh_obj.peeling_at,
            HlsoForGrading.species == dh_obj.species,
            HlsoForGrading.hoso_count == dh_obj.hoso_count,
            HlsoForGrading.company_id == dh_obj.company_id,
            HlsoForGrading.status == "Pending"
        ).first()

        if record:
            record.total_hlso_qty += qty
            record.available_qty += qty
        else:
            current_ist = ist_now()
            record = HlsoForGrading(
                date=current_ist.date(),
                time=current_ist.time(),
                batch_number=dh_obj.batch_number,
                production_for=dh_obj.production_for,
                peeling_at=dh_obj.peeling_at,
                species=dh_obj.species,
                hoso_count=dh_obj.hoso_count,
                total_hlso_qty=qty,
                graded_qty=0.0,
                available_qty=qty,
                status="Pending",
                email=dh_obj.email,
                company_id=dh_obj.company_id
            )
            db.add(record)
        return True
    except Exception as e:
        print(f"❌ Error in add_deheading_to_grading_pool: {str(e)}")
        return False

def remove_deheading_from_grading_pool(db: Session, dh_obj) -> bool:
    """De-Heading Entry డిలీట్ అయినప్పుడు పూల్ లో నుండి ఆ బరువును రివర్స్ మైనస్ చేస్తుంది"""
    try:
        qty = float(dh_obj.hlso_qty or 0)
        record = db.query(HlsoForGrading).filter(
            HlsoForGrading.batch_number == dh_obj.batch_number,
            HlsoForGrading.production_for == dh_obj.production_for,
            HlsoForGrading.peeling_at == dh_obj.peeling_at,
            HlsoForGrading.species == dh_obj.species,
            HlsoForGrading.hoso_count == dh_obj.hoso_count,
            HlsoForGrading.company_id == dh_obj.company_id,
            HlsoForGrading.status == "Pending"
        ).first()

        if record:
            record.total_hlso_qty -= qty
            record.available_qty -= qty
            # ఒకవేళ మొత్తం స్టాక్ జీరో కి వస్తే రికార్డును క్లీన్ చేస్తుంది
            if record.total_hlso_qty <= 0.01:
                db.delete(record)
            return True
        return False
    except Exception as e:
        print(f"❌ Error in remove_deheading_from_grading_pool: {str(e)}")
        return False


# =====================================================================
# 2. GRADING ACTIONS (Pool లో నుండి స్టాక్ తగ్గించడం / రోల్‌బ్యాక్ చేయడం)
# =====================================================================

def consume_hlso_for_grading(db: Session, grad_obj) -> bool:
    """Grading Entry సేవ్ అయినప్పుడు పూల్ లోని Pending రికార్డుల నుండి బరువును తగ్గిస్తుంది (FIFO పద్ధతి)"""
    try:
        qty_to_consume = float(grad_obj.quantity or 0)
        if qty_to_consume <= 0:
            return False

        records = db.query(HlsoForGrading).filter(
            HlsoForGrading.batch_number == grad_obj.batch_number,
            HlsoForGrading.production_for == grad_obj.production_for,
            HlsoForGrading.peeling_at == grad_obj.peeling_at,
            HlsoForGrading.species == grad_obj.species,
            HlsoForGrading.hoso_count == grad_obj.hoso_count,
            HlsoForGrading.company_id == grad_obj.company_id,
            HlsoForGrading.status == "Pending"
        ).order_by(HlsoForGrading.date.asc(), HlsoForGrading.time.asc()).all()

        for record in records:
            if qty_to_consume <= 0:
                break
                
            if record.available_qty >= qty_to_consume:
                record.available_qty -= qty_to_consume
                record.graded_qty += qty_to_consume
                qty_to_consume = 0
            else:
                qty_to_consume -= record.available_qty
                record.graded_qty += record.available_qty
                record.available_qty = 0

            # ఎప్పుడైతే అవైలబుల్ క్వాంటిటీ జీరో అవుతుందో ఆటోమేటిక్‌గా 'Completed' (Done) అవుతుంది
            if record.available_qty <= 0.01:
                record.status = "Completed"
        return True
    except Exception as e:
        print(f"❌ Error in consume_hlso_for_grading: {str(e)}")
        return False

def rollback_grading_consumption(db: Session, grad_obj) -> bool:
    """Grading Entry డిలీట్ అయినప్పుడు పూల్ లోని రికార్డుకు ఆ బరువును మళ్లీ వెనక్కి ఇచ్చేస్తుంది (Rollback)"""
    try:
        qty_to_rollback = float(grad_obj.quantity or 0)
        
        # మొదట ఈ కాంబినేషన్ కి చెందిన Completed లేదా Pending రికార్డులను వెతుకుతుంది
        records = db.query(HlsoForGrading).filter(
            HlsoForGrading.batch_number == grad_obj.batch_number,
            HlsoForGrading.production_for == grad_obj.production_for,
            HlsoForGrading.peeling_at == grad_obj.peeling_at,
            HlsoForGrading.species == grad_obj.species,
            HlsoForGrading.hoso_count == grad_obj.hoso_count,
            HlsoForGrading.company_id == grad_obj.company_id
        ).order_by(HlsoForGrading.date.desc(), HlsoForGrading.time.desc()).all()

        for record in records:
            if qty_to_rollback <= 0:
                break
                
            if record.graded_qty >= qty_to_rollback:
                record.graded_qty -= qty_to_rollback
                record.available_qty += qty_to_rollback
                qty_to_rollback = 0
            else:
                qty_to_rollback -= record.graded_qty
                record.available_qty += record.graded_qty
                record.graded_qty = 0

            if record.available_qty > 0.01:
                record.status = "Pending"
        return True
    except Exception as e:
        print(f"❌ Error in rollback_grading_consumption: {str(e)}")
        return False