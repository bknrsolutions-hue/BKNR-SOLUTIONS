from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.database.models.inventory_management import (
    InventorySummary,
    InventoryDailySnapshot
)
from app.utils.timezone import ist_now


def create_inventory_snapshot():

    db: Session = SessionLocal()

    try:
        snapshot_date = ist_now().date()

        already_exists = db.query(
            InventoryDailySnapshot
        ).filter(
            InventoryDailySnapshot.snapshot_date == snapshot_date
        ).first()

        if already_exists:
            print(f"Snapshot already exists for {snapshot_date}")
            return

        rows = db.query(InventorySummary).all()

        for row in rows:
            db.add(
                InventoryDailySnapshot(
                    snapshot_date=snapshot_date,
                    company_id=row.company_id,
                    species=row.species,
                    variety=row.variety,
                    grade=row.grade,
                    packing_style=row.packing_style,
                    glaze=row.glaze,
                    production_for=row.production_for,
                    production_at=row.production_at,
                    freezer=row.freezer,
                    opening_qty=row.available_qty,
                    opening_mc=row.available_mc,
                    opening_loose=row.available_loose,
                    avg_rate=row.avg_rate,
                    inventory_value=row.inventory_value
                )
            )

        db.commit()

        print(
            f"Inventory Snapshot Created : "
            f"{snapshot_date} ({len(rows)} rows)"
        )

    except Exception as e:
        db.rollback()
        print("Snapshot Error:", str(e))

    finally:
        db.close()