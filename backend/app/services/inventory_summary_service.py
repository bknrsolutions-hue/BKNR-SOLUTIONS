from datetime import datetime
from sqlalchemy import func

from app.database.models.inventory_management import (
    stock_entry,
    InventorySummary
)


class InventorySummaryService:

    @staticmethod
    def refresh_inventory_summary(
        db,
        company_id
    ):

        # ==========================================
        # CLEAR OLD SUMMARY
        # ==========================================

        db.query(InventorySummary).filter(
            InventorySummary.company_id == company_id
        ).delete()

        # ==========================================
        # GROUP STOCK DATA
        # ==========================================

        rows = db.query(
            stock_entry.company_id,
            stock_entry.species,
            stock_entry.variety,
            stock_entry.grade,
            stock_entry.packing_style,
            stock_entry.glaze,
            stock_entry.production_for,
            stock_entry.production_at,
            stock_entry.freezer,

            func.sum(
                stock_entry.quantity
            ).label("available_qty"),

            func.sum(
                stock_entry.no_of_mc
            ).label("available_mc"),

            func.sum(
                stock_entry.loose
            ).label("available_loose"),

            func.avg(
                stock_entry.product_kg_value
            ).label("avg_rate"),

            func.max(
                stock_entry.date
            ).label("last_transaction_date")

        ).filter(
            stock_entry.company_id == company_id

        ).group_by(
            stock_entry.company_id,
            stock_entry.species,
            stock_entry.variety,
            stock_entry.grade,
            stock_entry.packing_style,
            stock_entry.glaze,
            stock_entry.production_for,
            stock_entry.production_at,
            stock_entry.freezer
        ).all()

        # ==========================================
        # INSERT SUMMARY
        # ==========================================

        for row in rows:

            qty = float(row.available_qty or 0)
            rate = float(row.avg_rate or 0)

            summary = InventorySummary(

                company_id=row.company_id,

                species=row.species,
                variety=row.variety,
                grade=row.grade,

                packing_style=row.packing_style,
                glaze=row.glaze,

                production_for=row.production_for,
                production_at=row.production_at,

                freezer=row.freezer,

                available_qty=qty,
                available_mc=float(row.available_mc or 0),
                available_loose=float(row.available_loose or 0),

                avg_rate=rate,
                inventory_value=qty * rate,

                reserved_qty=0,
                pending_prod_qty=0,

                last_transaction_date=row.last_transaction_date,
                updated_at=datetime.utcnow()
            )

            db.add(summary)

        db.commit()

        return len(rows)