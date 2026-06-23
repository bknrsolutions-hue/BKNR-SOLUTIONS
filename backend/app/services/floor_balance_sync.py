from app.database.models.floor_balance import FloorBalance
from app.services.floor_balance import get_floor_balance
from app.utils.timezone import ist_now
import traceback


def refresh_floor_balance(
    db,
    company_id,
    batch_number=None
):
    """
    Refresh floor balance table for a specific batch or the entire company.
    """
    from app.database.models.reprocess import Reprocess
    from app.database.models.processing import RawMaterialPurchasing, Grading, Peeling
    from app.routers.summary.floor_balance_value import calculate_balance_value
    from app.utils.timezone import ist_now

    now = ist_now()
    current_date = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%I:%M:%S %p")

    if batch_number:
        print(f"🔄 FLOOR BALANCE REFRESH FOR BATCH: {batch_number} (Company: {company_id})")
        
        # 1. Collect all unique combos for this batch across all tables
        combos = set()
        
        # RMP
        rmps = db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.batch_number == batch_number
        ).all()
        for r in rmps:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))
            
        # Grading
        grads = db.query(Grading).filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch_number
        ).all()
        for r in grads:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))
            
        # Peeling
        peels = db.query(Peeling).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch_number
        ).all()
        for r in peels:
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))
            
        # Reprocess
        repros = db.query(Reprocess).filter(
            Reprocess.company_id == company_id,
            Reprocess.new_batch_id == batch_number,
            Reprocess.reprocess_type != 'SALES'
        ).all()
        for r in repros:
            glaze_val = getattr(r, 'glaze', None)
            combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS", glaze_val))

        # 2. Delete existing FloorBalance entries for this batch
        db.query(FloorBalance).filter(
            FloorBalance.company_id == company_id,
            FloorBalance.batch_number == batch_number
        ).delete()
        
        # 3. Re-calculate and insert each combo if available qty > 0.01
        updated_count = 0
        for batch, count, species_val, variety, prod_for, row_location, s_type, glaze in combos:
            qty = get_floor_balance(
                db=db,
                company_id=company_id,
                location=row_location,
                batch=batch,
                count=count,
                species=species_val,
                variety=variety,
                production_for=prod_for,
                source_type=s_type
            )
            qty = round(qty, 2) if qty else 0.0
            
            if qty > 0.01:
                val = calculate_balance_value(db, company_id, batch, variety, count, species_val, qty, s_type, glaze)
                prod_for_clean = prod_for if prod_for and prod_for != "N/A" else "General Stock"
                
                new_row = FloorBalance(
                    company_id=company_id,
                    location=row_location,
                    production_for=prod_for_clean,
                    batch_number=batch,
                    source_type=s_type,
                    species=species_val,
                    variety=variety,
                    count=count,
                    available_qty=qty,
                    inventory_value=val,
                    last_transaction="MUTATION_REFRESH",
                    last_updated=now,
                    date=current_date,
                    time=current_time,
                    email="System"
                )
                db.add(new_row)
                updated_count += 1
                
        db.commit()
        print(f"✅ BATCH REFRESH COMPLETED : {updated_count} ROWS ADDED/UPDATED")
        return updated_count

    else:
        print(f"🔄 FULL FLOOR BALANCE REFRESH START : {company_id}")

        rows = db.query(FloorBalance).filter(
            FloorBalance.company_id == company_id
        ).all()

        print(f"📦 Rows Found : {len(rows)}")

        updated_count = 0

        for row in rows:

            try:

                qty = get_floor_balance(
                    db=db,
                    company_id=company_id,
                    location=row.location,
                    batch=row.batch_number,
                    count=row.count,
                    species=row.species,
                    variety=row.variety,      # ✅ FIX
                    production_for=row.production_for,
                    source_type=row.source_type
                )

                qty = float(qty or 0)

                old_qty = float(row.available_qty or 0)

                row.available_qty = qty

                # Recalculate Inventory Value
                if old_qty > 0:

                    rate = float(
                        row.inventory_value or 0
                    ) / old_qty

                    row.inventory_value = round(
                        qty * rate,
                        2
                    )

                else:

                    row.inventory_value = 0

                # IST Timestamp
                row.last_updated = now
                row.date = now.strftime("%Y-%m-%d")
                row.time = now.strftime("%I:%M:%S %p")

                updated_count += 1

                print(
                    f"✅ {row.batch_number} | "
                    f"{old_qty} → {qty}"
                )

            except Exception as e:

                print(
                    f"❌ FLOOR BALANCE ERROR "
                    f"[{row.batch_number}] : {str(e)}"
                )

                import traceback
                traceback.print_exc()

        db.commit()

        print(
            f"✅ FLOOR BALANCE REFRESH COMPLETED : "
            f"{updated_count} ROWS UPDATED"
        )

        return updated_count