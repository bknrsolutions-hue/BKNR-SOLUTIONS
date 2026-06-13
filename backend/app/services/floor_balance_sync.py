from app.database.models.floor_balance import FloorBalance
from app.services.floor_balance import get_floor_balance
from app.utils.timezone import ist_now
import traceback


def refresh_floor_balance(
    db,
    company_id
):
    """
    Refresh complete floor balance table
    for one company.
    """

    print(f"🔄 FLOOR BALANCE REFRESH START : {company_id}")

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
            now = ist_now()

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

            traceback.print_exc()

    db.commit()

    print(
        f"✅ FLOOR BALANCE REFRESH COMPLETED : "
        f"{updated_count} ROWS UPDATED"
    )

    return updated_count