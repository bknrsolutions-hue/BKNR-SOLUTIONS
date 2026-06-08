from sqlalchemy.orm import Session
from datetime import date
import re

from app.database.models.inventory_management import (
    pending_orders,
    stock_entry
)

from app.database.models.requirements import (
    ProductionRequirement
)

from app.database.models.criteria import (
    packing_styles
)


class ProductionRequirementService:

    @staticmethod
    def refresh_requirements(
        db: Session,
        company_id: str
    ):

        # ==========================================
        # DELETE OLD SNAPSHOT
        # ==========================================

        db.query(
            ProductionRequirement
        ).filter(
            ProductionRequirement.company_id == company_id
        ).delete()

        db.commit()

        # ==========================================
        # LOAD DATA (FIFO)
        # ==========================================

        orders = (
            db.query(pending_orders)
            .filter(
                pending_orders.company_id == company_id
            )
            .order_by(
                pending_orders.date,
                pending_orders.id
            )
            .all()
        )

        stocks = (
            db.query(stock_entry)
            .filter(
                stock_entry.company_id == company_id
            )
            .all()
        )

        packings = (
            db.query(packing_styles)
            .filter(
                packing_styles.company_id == company_id
            )
            .all()
        )

        # ==========================================
        # BUILD STOCK POOL
        # ==========================================

        stock_pool = {}

        for s in stocks:

            glaze_match = re.search(
                r"(\d+)",
                str(s.glaze or "0")
            )

            glaze = (
                glaze_match.group(1)
                if glaze_match
                else "0"
            )

            key = (
                f"{str(s.production_for or '').upper()}|"
                f"{str(s.species or '').lower()}|"
                f"{str(s.variety or '').lower()}|"
                f"{str(s.grade or '').lower()}|"
                f"{str(s.packing_style or '').lower()}|"
                f"{glaze}|"
                f"{str(s.freezer or '').lower()}"
            )

            qty = float(s.quantity or 0)

            if str(
                s.cargo_movement_type or ""
            ).upper() == "OUT":

                qty = qty * -1

            stock_pool[key] = (
                stock_pool.get(key, 0)
                + qty
            )

        # ==========================================
        # GENERATE REQUIREMENTS
        # ==========================================

        requirement_rows = []

        for order in orders:

            production_for_name = str(
                order.company_name or ""
            ).upper()

            species = str(
                order.species or ""
            ).lower()

            variety = str(
                order.variety or ""
            ).lower()

            grade = str(
                order.grade or ""
            ).lower()

            packing = str(
                order.packing_style or ""
            ).lower()

            freezer = str(
                order.freezer or ""
            ).lower()

            glaze_match = re.search(
                r"(\d+)",
                str(order.count_glaze or "0")
            )

            count_glaze = (
                int(glaze_match.group(1))
                if glaze_match
                else 0
            )

            stock_key = (
                f"{production_for_name}|"
                f"{species}|"
                f"{variety}|"
                f"{grade}|"
                f"{packing}|"
                f"{count_glaze}|"
                f"{freezer}"
            )

            # ======================================
            # PACKING WEIGHT
            # ======================================

            mc_weight = 1.0

            packing_rec = next(
                (
                    p
                    for p in packings
                    if str(
                        p.packing_style or ""
                    ).lower() == packing
                ),
                None
            )

            if packing_rec:
                mc_weight = float(
                    packing_rec.mc_weight or 1
                )

            ordered_qty = round(
                float(order.no_of_mc or 0)
                * mc_weight,
                2
            )

            # ======================================
            # FIFO STOCK CONSUMPTION
            # ======================================

            current_stock = round(
                stock_pool.get(
                    stock_key,
                    0
                ),
                2
            )

            utilized_stock = round(
                min(
                    current_stock,
                    ordered_qty
                ),
                2
            )

            pending_production = round(
                ordered_qty
                - utilized_stock,
                2
            )

            # reduce stock for next PO
            stock_pool[stock_key] = round(
                current_stock
                - utilized_stock,
                2
            )

            pending_percentage = 0

            if ordered_qty > 0:
                pending_percentage = round(
                    (
                        pending_production
                        / ordered_qty
                    ) * 100,
                    2
                )

            # ======================================
            # SAVE SNAPSHOT
            # ======================================

            requirement_rows.append(
                ProductionRequirement(

                    company_id=company_id,

                    po_number=order.po_number,
                    po_date=order.date,

                    customer_name=order.buyer,

                    species=order.species,
                    variety=order.variety,
                    grade=order.grade,

                    packing_style=order.packing_style,
                    freezer=order.freezer,

                    count_glaze=order.count_glaze,
                    weight_glaze=order.weight_glaze,

                    no_of_mc=float(
                        order.no_of_mc or 0
                    ),

                    ordered_qty=ordered_qty,

                    available_stock=current_stock,

                    existed_stock_util=utilized_stock,

                    pending_production=(
                        pending_production
                    ),

                    pending_percentage=(
                        pending_percentage
                    ),

                    production_for=(
                        order.company_name
                    ),

                    snapshot_stock=current_stock,

                    snapshot_date=date.today(),

                    calculation_date=date.today(),

                    status=(
                        "READY"
                        if pending_production <= 0
                        else "PENDING"
                    )
                )
            )

        # ==========================================
        # SAVE
        # ==========================================

        if requirement_rows:

            db.bulk_save_objects(
                requirement_rows
            )

        db.commit()

        return len(requirement_rows)