from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import date, datetime, timedelta
from app.utils.timezone import ist_now
import logging

from app.database import get_db
from app.services.cache import cache_get, cache_set
from app.services.accounting_reports import AccountingReportsService

# =========================================================================
# 🗄️ EXACT MODEL ARCHITECTURE INTEGRATION (Zero Column Mismatch Setup)
# =========================================================================
from app.database.models.inventory_management import stock_entry, sales_dispatch
from app.database.models.processing import RawMaterialPurchasing, DeHeading, Peeling, Production
from app.database.models.bills import ElectricityLog, DieselLog, PurchaseInvoice, ContainerLog, QATestingLog, OtherExpense
from app.database.models.attendance import EmployeeRegistration
from app.database.models.criteria import packing_styles, production_at
from app.utils.cancel_math import active_sum, signed_sum

router = APIRouter(tags=["CORPORATE COSTING DASHBOARD"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


def _current_fy_start(today: date) -> int:
    return today.year if today.month >= 4 else today.year - 1


def _parse_fy_start(fy_value: str, fallback_year: int) -> int:
    if not fy_value:
        return fallback_year
    try:
        return int(str(fy_value).split("-")[0])
    except (TypeError, ValueError):
        return fallback_year


def _parse_iso_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except Exception as exc:
        logger.warning("Invalid date format %s. %s", value, exc)
        return None


def _apply_date_range(query, column, start_date: date | None, end_date: date | None):
    if start_date:
        query = query.filter(column >= start_date)
    if end_date:
        query = query.filter(column <= end_date)
    return query


def _apply_string_date_range(query, column, start_date: date | None, end_date: date | None):
    if start_date:
        query = query.filter(column >= start_date.isoformat())
    if end_date:
        query = query.filter(column <= end_date.isoformat())
    return query


def _apply_text_location(query, column, location: str):
    if location:
        query = query.filter(func.trim(column) == func.trim(location))
    return query


def _blank_profit_loss():
    return {
        "total_income": 0.0,
        "total_expense": 0.0,
        "net_profit": 0.0,
        "details": {"income_ledgers": [], "expense_ledgers": []},
    }


def _safe_accounting_call(db: Session, label: str, fallback, fn, *args):
    try:
        return fn(db, *args)
    except Exception:
        db.rollback()
        logger.exception("Costing dashboard accounting fallback used for %s", label)
        return fallback


def _safe_scalar(db: Session, label: str, query, fallback=0.0):
    try:
        return query.scalar()
    except Exception:
        db.rollback()
        logger.exception("Costing dashboard scalar fallback used for %s", label)
        return fallback


def _safe_all(db: Session, label: str, query, fallback=None):
    try:
        return query.all()
    except Exception:
        db.rollback()
        logger.exception("Costing dashboard list fallback used for %s", label)
        return [] if fallback is None else fallback


def _sale_amounts(row, weight_map):
    pack_key = str(row.packing_style or "").strip()
    mc_weight = weight_map.get(pack_key, 1.0)
    qty = float(row.no_of_mc or 0) * mc_weight
    usd = qty * float(row.price or 0)
    inr = usd * float(row.exchange_rate or 83.5)
    return qty, usd, inr


@router.get("/costing_dashboard", response_class=HTMLResponse)
def costing_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    company_id: str = Query("", description="Selected Company ID for filtering data"),
    fy: str = Query("", description="Financial year start, example: 2025 or 2025-26"),
    location: str = Query("", description="Production location"),
    from_date: str = Query("", description="YYYY-MM-DD"),
    to_date: str = Query("", description="YYYY-MM-DD")
):
    # ---------------------------------------------------------
    # 🔐 AUTHENTICATION & MULTI-COMPANY CONTROLLER
    # ---------------------------------------------------------
    email = request.session.get("email")
    session_comp_code = request.session.get("company_code")

    if not email or not session_comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    comp_code = session_comp_code

    # ---------------------------------------------------------
    # 🏢 SEARCHABLE COMPANY DROPDOWN DATA
    # ---------------------------------------------------------
    available_companies = [{"name": session_comp_code, "code": session_comp_code}]

    locations = [
        row[0] for row in db.query(production_at.production_at)
        .filter(production_at.company_id == comp_code)
        .order_by(production_at.production_at)
        .all()
        if row[0]
    ]

    # ---------------------------------------------------------
    # 📅 FINANCIAL YEAR / DATE RANGE CONFIGURATION MATRIX
    # ---------------------------------------------------------
    today = ist_now().date()
    current_fy_year = _current_fy_start(today)
    selected_fy_year = _parse_fy_start(fy, current_fy_year)
    selected_fy = f"{selected_fy_year}-{str(selected_fy_year + 1)[2:]}"
    fy_options = [f"{year}-{str(year + 1)[2:]}" for year in range(current_fy_year, current_fy_year - 6, -1)]

    parsed_from = _parse_iso_date(from_date)
    parsed_to = _parse_iso_date(to_date)
    if not parsed_from:
        parsed_from = date(selected_fy_year, 4, 1)
        from_date = parsed_from.isoformat()
    if not parsed_to:
        parsed_to = date(selected_fy_year + 1, 3, 31)
        to_date = parsed_to.isoformat()

    last_updated_timestamp = ist_now().strftime("%Y-%m-%d %H:%M:%S IST")
    cache_key = f"bknr:costing_dashboard:{comp_code}:{selected_fy}:{location or 'ALL'}:{from_date}:{to_date}"
    cached_context = cache_get(cache_key)
    if cached_context is not None:
        if request.query_params.get("format") == "json":
            return JSONResponse(cached_context)
        cached_context["request"] = request
        return templates.TemplateResponse(
            request=request,
            name="dashboard/costing_dashboard.html",
            context=cached_context
        )

    try:
        # ---------------------------------------------------------
        # 🦐 RAW MATERIAL PURCHASING
        # ---------------------------------------------------------
        rmp_q = db.query(active_sum(RawMaterialPurchasing, RawMaterialPurchasing.amount)).filter(RawMaterialPurchasing.company_id == comp_code)
        qty_q = db.query(active_sum(RawMaterialPurchasing, RawMaterialPurchasing.received_qty)).filter(RawMaterialPurchasing.company_id == comp_code)

        rmp_q = _apply_date_range(rmp_q, RawMaterialPurchasing.date, parsed_from, parsed_to)
        qty_q = _apply_date_range(qty_q, RawMaterialPurchasing.date, parsed_from, parsed_to)
        rmp_q = _apply_text_location(rmp_q, RawMaterialPurchasing.peeling_at, location)
        qty_q = _apply_text_location(qty_q, RawMaterialPurchasing.peeling_at, location)
            
        rmp_cost = float(_safe_scalar(db, "raw_material_cost", rmp_q) or 0.0)
        total_qty = float(_safe_scalar(db, "raw_material_qty", qty_q) or 0.0)

        # ---------------------------------------------------------
        # 📈 SALES DISPATCH
        # ---------------------------------------------------------
        packing_rows_q = db.query(
            packing_styles.packing_style,
            packing_styles.mc_weight,
        ).filter(packing_styles.company_id == comp_code)
        packing_rows = _safe_all(db, "packing_style_weights", packing_rows_q)
        weight_map = {str(name or "").strip(): float(weight or 1.0) for name, weight in packing_rows}

        sales_rows_q = db.query(
            sales_dispatch.variety,
            sales_dispatch.no_of_mc,
            sales_dispatch.packing_style,
            sales_dispatch.price,
            sales_dispatch.exchange_rate,
            sales_dispatch.status,
        ).filter(sales_dispatch.company_id == comp_code)
        sales_rows_q = _apply_string_date_range(sales_rows_q, sales_dispatch.invoice_date, parsed_from, parsed_to)
        sales_rows_q = _apply_text_location(sales_rows_q, sales_dispatch.production_at, location)
        sales_rows = _safe_all(db, "sales_dispatch_rows", sales_rows_q)

        sales_qty = 0.0
        total_sales = 0.0
        receivable_outstanding = 0.0
        sales_by_variety = {}
        for row in sales_rows:
            qty_kg, _, amount_inr = _sale_amounts(row, weight_map)
            sales_qty += qty_kg
            total_sales += amount_inr
            if str(row.status or "").strip().lower() == "unpaid":
                receivable_outstanding += amount_inr
            if row.variety:
                sales_by_variety[row.variety] = sales_by_variety.get(row.variety, 0.0) + amount_inr

        # ---------------------------------------------------------
        # 🏭 FACTORY PROCESSING SEGMENTS
        # ---------------------------------------------------------
        deh_q = db.query(signed_sum(DeHeading, DeHeading.amount)).filter(DeHeading.company_id == comp_code)
        deh_q = _apply_date_range(deh_q, DeHeading.date, parsed_from, parsed_to)
        deh_q = _apply_text_location(deh_q, DeHeading.peeling_at, location)
        deheading_cost = float(_safe_scalar(db, "deheading_cost", deh_q) or 0.0)

        pee_q = db.query(signed_sum(Peeling, Peeling.amount)).filter(Peeling.company_id == comp_code)
        pee_q = _apply_date_range(pee_q, Peeling.date, parsed_from, parsed_to)
        pee_q = _apply_text_location(pee_q, Peeling.peeling_at, location)
        peeling_cost = float(_safe_scalar(db, "peeling_cost", pee_q) or 0.0)

        # No monetary grading/soaking source is stored in these tables.
        grading_cost = 0.0

        soaking_cost = 0.0

        prod_qty_q = db.query(signed_sum(Production, Production.production_qty)).filter(Production.company_id == comp_code)
        prod_qty_q = _apply_date_range(prod_qty_q, Production.date, parsed_from, parsed_to)
        prod_qty_q = _apply_text_location(prod_qty_q, Production.production_at, location)
        prod_qty = float(_safe_scalar(db, "production_qty", prod_qty_q) or 0.0)

        # ---------------------------------------------------------
        # ⚡ UTILITIES OPERATIONAL PIPELINES (With Table Joins)
        # ---------------------------------------------------------
        elec_q = db.query(signed_sum(ElectricityLog, ElectricityLog.total_cost)).join(
            production_at, ElectricityLog.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code)
        elec_q = _apply_date_range(elec_q, ElectricityLog.reading_date, parsed_from, parsed_to)
        elec_q = _apply_text_location(elec_q, production_at.production_at, location)
        electricity_cost = float(_safe_scalar(db, "electricity_cost", elec_q) or 0.0)

        dies_q = db.query(signed_sum(DieselLog, DieselLog.net_val)).join(
            production_at, DieselLog.unit_id == production_at.id
        ).filter(and_(production_at.company_id == comp_code, DieselLog.type == "OUT"))
        dies_q = _apply_date_range(dies_q, DieselLog.log_date, parsed_from, parsed_to)
        dies_q = _apply_text_location(dies_q, production_at.production_at, location)
        diesel_cost = float(_safe_scalar(db, "diesel_cost", dies_q) or 0.0)

        water_cost = 0.0
        ice_cost = 0.0

        # ---------------------------------------------------------
        # 📦 OVERHEADS & EXPENDITURES
        # ---------------------------------------------------------
        pack_q = db.query(signed_sum(PurchaseInvoice, PurchaseInvoice.grand_total)).filter(PurchaseInvoice.company_id == comp_code)
        if location:
            pack_q = pack_q.join(production_at, PurchaseInvoice.production_at_id == production_at.id)
            pack_q = _apply_text_location(pack_q, production_at.production_at, location)
        pack_q = _apply_date_range(pack_q, PurchaseInvoice.invoice_date, parsed_from, parsed_to)
        packaging_cost = float(_safe_scalar(db, "packaging_cost", pack_q) or 0.0)

        log_q = db.query(signed_sum(ContainerLog, ContainerLog.lended_total)).filter(ContainerLog.company_id == comp_code)
        log_q = _apply_date_range(log_q, ContainerLog.date, parsed_from, parsed_to)
        log_q = _apply_text_location(log_q, ContainerLog.production_at, location)
        logistics_cost = float(_safe_scalar(db, "container_logistics_cost", log_q) or 0.0)

        qa_q = db.query(signed_sum(QATestingLog, QATestingLog.test_cost)).join(
            production_at, QATestingLog.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code)
        qa_q = _apply_date_range(qa_q, QATestingLog.test_date, parsed_from, parsed_to)
        qa_q = _apply_text_location(qa_q, production_at.production_at, location)
        qa_cost = float(_safe_scalar(db, "qa_testing_cost", qa_q) or 0.0)

        oth_q = db.query(signed_sum(OtherExpense, OtherExpense.amount)).join(
            production_at, OtherExpense.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code)
        oth_q = _apply_date_range(oth_q, OtherExpense.date, parsed_from, parsed_to)
        oth_q = _apply_text_location(oth_q, production_at.production_at, location)
        other_cost = float(_safe_scalar(db, "other_expense_cost", oth_q) or 0.0)

        payroll_q = db.query(func.coalesce(func.sum(EmployeeRegistration.current_salary), 0.0)).filter(
            and_(EmployeeRegistration.company_id == comp_code, EmployeeRegistration.status == "ACTIVE")
        )
        payroll_cost = float(_safe_scalar(db, "payroll_cost", payroll_q) or 0.0)

        # ---------------------------------------------------------
        # 💼 STOCK MANAGEMENT & WORKING CAPITAL MATRIX
        # ---------------------------------------------------------
        inventory_q = db.query(func.coalesce(func.sum(stock_entry.inventory_value), 0.0)).filter(
            stock_entry.company_id == comp_code
        )
        inventory_q = _apply_string_date_range(inventory_q, stock_entry.date, parsed_from, parsed_to)
        inventory_q = _apply_text_location(inventory_q, stock_entry.production_at, location)
        inventory_value = float(_safe_scalar(db, "inventory_value", inventory_q) or 0.0)

        # Sales dispatch has no due-date field, so do not invent ageing buckets.
        receivable_ageing = {
            "current_frame": receivable_outstanding,
            "mid_frame": 0.0,
            "warning_frame": 0.0,
            "risk_frame": 0.0,
        }

        payable_q = db.query(signed_sum(PurchaseInvoice, PurchaseInvoice.grand_total)).filter(
            PurchaseInvoice.company_id == comp_code
        )
        payable_unpaid_q = db.query(signed_sum(PurchaseInvoice, PurchaseInvoice.grand_total)).filter(
            PurchaseInvoice.company_id == comp_code,
            PurchaseInvoice.status == "POSTED",
        )
        if location:
            payable_q = payable_q.join(production_at, PurchaseInvoice.production_at_id == production_at.id)
            payable_q = _apply_text_location(payable_q, production_at.production_at, location)
            payable_unpaid_q = payable_unpaid_q.join(production_at, PurchaseInvoice.production_at_id == production_at.id)
            payable_unpaid_q = _apply_text_location(payable_unpaid_q, production_at.production_at, location)
        payable_q = _apply_date_range(payable_q, PurchaseInvoice.invoice_date, parsed_from, parsed_to)
        payable_unpaid_q = _apply_date_range(payable_unpaid_q, PurchaseInvoice.invoice_date, parsed_from, parsed_to)
        payable_outstanding = float(_safe_scalar(db, "payable_outstanding", payable_q) or 0.0)
        payable_outstanding_unpaid = float(_safe_scalar(db, "payable_outstanding_unpaid", payable_unpaid_q) or 0.0)

        report_end = parsed_to or today
        trial_balance = _safe_accounting_call(
            db,
            "trial_balance",
            [],
            AccountingReportsService.get_trial_balance,
            comp_code,
            report_end,
        )
        cash_balance = sum(
            row["balance"] for row in trial_balance
            if row["type"] == "LEDGER"
            and row["group_type"] == "ASSET"
            and row.get("group_name") in {"Cash-in-hand", "Bank Accounts"}
        )

        working_capital = {
            "inventory_value": inventory_value,
            "receivable": receivable_outstanding,
            "cash_balance": cash_balance,
            "payables": payable_outstanding_unpaid
        }

        total_expense = (rmp_cost + deheading_cost + peeling_cost + grading_cost + soaking_cost +
                         electricity_cost + diesel_cost + water_cost + ice_cost +
                         packaging_cost + logistics_cost + qa_cost + payroll_cost + other_cost)

        ebitda = total_sales - total_expense
        
        inventory_days = round((inventory_value / (total_expense or 1.0)) * 30)
        receivable_days = round((receivable_outstanding / (total_sales or 1.0)) * 30)
        payable_days = round((payable_outstanding_unpaid / (rmp_cost + packaging_cost or 1.0)) * 30) or 15
        cash_conversion_cycle = (inventory_days + receivable_days) - payable_days

        current_period_start = parsed_from or date(report_end.year, report_end.month, 1)
        current_pl = _safe_accounting_call(
            db,
            "current_profit_and_loss",
            _blank_profit_loss(),
            AccountingReportsService.get_profit_and_loss,
            comp_code,
            current_period_start,
            report_end,
        )
        current_month_profit = current_pl["net_profit"]
        previous_month_end = current_period_start - timedelta(days=1)
        previous_month_start = date(previous_month_end.year, previous_month_end.month, 1)
        previous_pl = _safe_accounting_call(
            db,
            "previous_profit_and_loss",
            _blank_profit_loss(),
            AccountingReportsService.get_profit_and_loss,
            comp_code,
            previous_month_start,
            previous_month_end,
        )
        prev_month_profit = previous_pl["net_profit"]
        profit_delta = current_month_profit - prev_month_profit
        mom_variance_pct = (profit_delta / (prev_month_profit or 1.0)) * 100

        # ---------------------------------------------------------
        # 🕒 INVENTORY AGEING DYNAMIC BUCKETS (Fixed Datetime Delta Fields)
        # ---------------------------------------------------------
        today_date = today
        d30 = today_date - timedelta(days=30)
        d60 = today_date - timedelta(days=60)
        d90 = today_date - timedelta(days=90)

        try:
            age_base_filters = [stock_entry.company_id == comp_code]
            if location:
                age_base_filters.append(func.trim(stock_entry.production_at) == func.trim(location))

            fast_turn_q = float(db.query(func.coalesce(func.sum(stock_entry.inventory_value), 0.0)).filter(
                *age_base_filters,
                stock_entry.date >= d30.isoformat(),
                stock_entry.date <= report_end.isoformat(),
            ).scalar() or 0.0)

            std_hold_q = float(db.query(func.coalesce(func.sum(stock_entry.inventory_value), 0.0)).filter(
                *age_base_filters,
                stock_entry.date < d30.isoformat(),
                stock_entry.date >= d60.isoformat(),
                stock_entry.date <= report_end.isoformat(),
            ).scalar() or 0.0)

            slow_clr_q = float(db.query(func.coalesce(func.sum(stock_entry.inventory_value), 0.0)).filter(
                *age_base_filters,
                stock_entry.date < d60.isoformat(),
                stock_entry.date >= d90.isoformat(),
                stock_entry.date <= report_end.isoformat(),
            ).scalar() or 0.0)

            stagnant_q = float(db.query(func.coalesce(func.sum(stock_entry.inventory_value), 0.0)).filter(
                *age_base_filters,
                stock_entry.date < d90.isoformat(),
                stock_entry.date <= report_end.isoformat(),
            ).scalar() or 0.0)
        except Exception:
            db.rollback()
            logger.exception("Costing dashboard inventory ageing fallback used")
            fast_turn_q, std_hold_q, slow_clr_q, stagnant_q = 0.0, 0.0, 0.0, 0.0

        inventory_ageing_buckets = {
            "fast_turn": fast_turn_q,
            "standard_hold": std_hold_q,
            "slow_clearance": slow_clr_q,
            "stagnant_risk": stagnant_q,
        }

        # Five-month trend from posted accounting vouchers.
        month_starts = []
        cursor = date(report_end.year, report_end.month, 1)
        for offset in range(4, -1, -1):
            year = cursor.year
            month = cursor.month - offset
            while month <= 0:
                month += 12
                year -= 1
            month_starts.append(date(year, month, 1))
        month_labels = [month.strftime("%b %y") for month in month_starts]
        revenue_trend = []
        expense_trend = []
        profit_trend = []
        for index, month_start in enumerate(month_starts):
            if index + 1 < len(month_starts):
                month_end = month_starts[index + 1] - timedelta(days=1)
            else:
                month_end = report_end
            month_pl = _safe_accounting_call(
                db,
                f"trend_profit_and_loss_{month_start.isoformat()}",
                _blank_profit_loss(),
                AccountingReportsService.get_profit_and_loss,
                comp_code,
                month_start,
                month_end,
            )
            revenue_trend.append(month_pl["total_income"])
            expense_trend.append(month_pl["total_expense"])
            profit_trend.append(month_pl["net_profit"])

        # Advanced SKU Split Matrix
        product_q = db.query(
            stock_entry.variety,
            func.sum(stock_entry.quantity).label("total_weight"),
            func.sum(stock_entry.inventory_value).label("total_val")
        ).filter(stock_entry.company_id == comp_code)
        product_q = _apply_string_date_range(product_q, stock_entry.date, parsed_from, parsed_to)
        product_q = _apply_text_location(product_q, stock_entry.production_at, location)
        product_rows = _safe_all(db, "product_costing_matrix", product_q.group_by(stock_entry.variety))
        master_product_list = []
        for r in product_rows:
            if r.variety:
                p_cost = float(r.total_val or 0.0)
                p_qty = float(r.total_weight or 1.0)
                p_rev = sales_by_variety.get(r.variety, 0.0)
                p_profit = p_rev - p_cost
                master_product_list.append({
                    "product_name": r.variety,
                    "qty": round(p_qty, 2),
                    "revenue": round(p_rev, 2),
                    "cost": round(p_cost, 2),
                    "profit": round(p_profit, 2),
                    "profit_per_kg": round(p_profit / p_qty, 2) if p_qty > 0 else 0.0
                })

        sorted_products_by_margin = sorted(master_product_list, key=lambda x: x["profit"], reverse=True)
        top_products = sorted_products_by_margin[:5]
        bottom_products = sorted_products_by_margin[-5:] if len(sorted_products_by_margin) > 5 else sorted_products_by_margin

    except Exception:
        logger.exception(
            "Costing dashboard failed company=%s fy=%s location=%s from=%s to=%s",
            comp_code,
            selected_fy,
            location or "ALL",
            from_date,
            to_date,
        )
        raise

    # ---------------------------------------------------------
    # 🎯 DATA RECONCILIATION LAYER OUTPUT
    # ---------------------------------------------------------
    context = {
            "comp_code": comp_code,
            "company_id": comp_code,
            "email": email,
            "available_companies": available_companies,
            "locations": locations,
            "location": location,
            "fy_options": fy_options,
            "selected_fy": selected_fy,
            "selected_fy_year": str(selected_fy_year),
            "last_updated": last_updated_timestamp,
            "rmp_cost": round(rmp_cost, 2),
            "total_qty": round(total_qty, 2),
            "sales_qty": round(sales_qty, 2),
            "prod_qty": round(prod_qty, 2),
            "deheading_cost": round(deheading_cost, 2),
            "peeling_cost": round(peeling_cost, 2),
            "grading_cost": round(grading_cost, 2),
            "soaking_cost": round(soaking_cost, 2),
            "electricity_cost": round(electricity_cost, 2),
            "diesel_cost": round(diesel_cost, 2),
            "water_cost": round(water_cost, 2),
            "ice_cost": round(ice_cost, 2),
            "packaging_cost": round(packaging_cost, 2),
            "logistics_cost": round(logistics_cost, 2),
            "qa_cost": round(qa_cost, 2),
            "other_cost": round(other_cost, 2),
            "payroll_cost": round(payroll_cost, 2),
            "inventory_value": round(inventory_value, 2),
            "total_sales": round(total_sales, 2),
            "receivable_outstanding": round(receivable_outstanding, 2),
            "total_expense": round(total_expense, 2),
            "ebitda": round(ebitda, 2),
            "inventory_days": inventory_days,
            "receivable_days": receivable_days,
            "payable_days": payable_days,
            "cash_conversion_cycle": cash_conversion_cycle,
            "prev_month_profit": round(prev_month_profit, 2),
            "current_month_profit": round(current_month_profit, 2),
            "mom_variance_pct": round(mom_variance_pct, 2),
            "working_capital": working_capital,
            "receivable_ageing": receivable_ageing,
            "inventory_ageing_buckets": inventory_ageing_buckets,
            "inventory_aging_buckets": inventory_ageing_buckets,
            "top_products": top_products,
            "bottom_products": bottom_products,
            "product_costing_matrix": sorted_products_by_margin,
            "month_labels": month_labels,
            "revenue_trend": revenue_trend,
            "expense_trend": expense_trend,
            "profit_trend": profit_trend,
            "from_date": from_date,
            "to_date": to_date
        }
    cache_context = dict(context)
    cache_set(cache_key, cache_context, ttl=60)

    if request.query_params.get("format") == "json":
        return JSONResponse(context)

    return templates.TemplateResponse(
        request=request,
        name="dashboard/costing_dashboard.html",
        context=context
    )
