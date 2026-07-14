from app.database import SessionLocal
from app.database.models.floor_balance import (
    FloorBalance,
    FloorBalanceSnapshot
)
from app.utils.timezone import ist_now


def create_floor_balance_snapshot():

    db = SessionLocal()

    try:

        today = ist_now().date()

        # Already created today?
        exists = db.query(FloorBalanceSnapshot).filter(
            FloorBalanceSnapshot.snapshot_date == today
        ).first()

        if exists:
            print(f"⚠️ Floor Balance Snapshot already exists for {today}")
            return

        rows = db.query(FloorBalance).all()

        count = 0

        for row in rows:

            db.add(
                FloorBalanceSnapshot(
                    snapshot_date=today,

                    company_id=row.company_id,

                    location=row.location,
                    production_for=row.production_for,

                    batch_number=row.batch_number,

                    source_type=row.source_type,

                    species=row.species,
                    variety=row.variety,
                    count=row.count,

                    opening_qty=row.available_qty,
                    inventory_value=row.inventory_value
                )
            )

            count += 1

        db.commit()

        print(
            f"✅ Floor Balance Snapshot Created : {count} rows"
        )

    except Exception as e:

        db.rollback()
        print(f"❌ Floor Balance Snapshot Error: {e}")

    finally:
        db.close()
