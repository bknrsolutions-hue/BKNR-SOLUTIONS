from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from app.database.models.enterprise_finance import (
    AccountGroup, LedgerMaster, VoucherHeader, VoucherDetail, VoucherType
)

class AccountingReportsService:

    @staticmethod
    def get_ledger_balance(db: Session, ledger_id: int, as_of_date: date = None, company_id: str = None) -> dict:
        """Calculates opening, net period change, and closing balances for a ledger."""
        ledger_query = db.query(LedgerMaster).filter(LedgerMaster.id == ledger_id)
        if company_id:
            ledger_query = ledger_query.filter(LedgerMaster.company_id == company_id)
        ledger = ledger_query.first()
        if not ledger:
            return {"opening": 0.0, "debit": 0.0, "credit": 0.0, "closing": 0.0}

        # Opening balance baseline
        opening = ledger.opening_balance if ledger.opening_balance_type == 'DR' else -ledger.opening_balance

        # Vouchers calculation
        query = db.query(
            func.sum(VoucherDetail.debit_amount).label('debits'),
            func.sum(VoucherDetail.credit_amount).label('credits')
        ).join(VoucherHeader).filter(
            VoucherDetail.ledger_id == ledger_id,
            VoucherHeader.company_id == ledger.company_id,
            VoucherHeader.status == 'POSTED'
        )

        if as_of_date:
            query = query.filter(VoucherHeader.voucher_date <= as_of_date)

        result = query.first()
        debits = float(result.debits or 0.0)
        credits = float(result.credits or 0.0)

        net_change = debits - credits
        closing_bal = opening + net_change

        return {
            "opening": opening,
            "debit": debits,
            "credit": credits,
            "closing": closing_bal,
            "formatted_closing": f"{abs(closing_bal):,.2f} {'DR' if closing_bal >= 0 else 'CR'}"
        }

    @staticmethod
    def get_trial_balance(db: Session, company_id: str, as_of_date: date = None) -> list:
        """
        Recursively computes the Trial Balance for all accounts.
        Supports unlimited nested structures.
        """
        if not as_of_date:
            as_of_date = date.today()

        groups = db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all()
        ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == company_id).all()

        # Build group map and child map
        group_map = {g.id: g for g in groups}
        ledger_by_group = {}
        for l in ledgers:
            ledger_by_group.setdefault(l.group_id, []).append(l)

        # Fetch all posted movements in one query; opening balances come from the master.
        movements = db.query(
            VoucherDetail.ledger_id,
            func.coalesce(func.sum(VoucherDetail.debit_amount), 0.0).label("debits"),
            func.coalesce(func.sum(VoucherDetail.credit_amount), 0.0).label("credits"),
        ).join(VoucherHeader).filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.status == "POSTED",
            VoucherHeader.voucher_date <= as_of_date,
        ).group_by(VoucherDetail.ledger_id).all()
        movement_map = {row.ledger_id: float(row.debits) - float(row.credits) for row in movements}
        ledger_balances = {
            ledger.id: (
                float(ledger.opening_balance or 0.0)
                if ledger.opening_balance_type == "DR"
                else -float(ledger.opening_balance or 0.0)
            ) + movement_map.get(ledger.id, 0.0)
            for ledger in ledgers
        }

        # 2. Helper to compute group balances recursively
        group_balances = {}
        def compute_group_bal(group_id):
            if group_id in group_balances:
                return group_balances[group_id]
            
            # Balance from immediate ledgers
            total = sum(ledger_balances.get(l.id, 0.0) for l in ledger_by_group.get(group_id, []))
            
            # Balance from child groups
            children = [g.id for g in groups if g.parent_group_id == group_id]
            for child_id in children:
                total += compute_group_bal(child_id)
                
            group_balances[group_id] = total
            return total

        for g_id in group_map:
            compute_group_bal(g_id)

        # 3. Format Trial Balance entries
        tb_rows = []
        for g_id, g in group_map.items():
            bal = group_balances.get(g_id, 0.0)
            if abs(bal) > 0.01 or ledger_by_group.get(g_id):
                tb_rows.append({
                    "type": "GROUP",
                    "id": g_id,
                    "name": g.group_name,
                    "parent_id": g.parent_group_id,
                    "group_type": g.group_type,
                    "balance": bal,
                    "debit": bal if bal >= 0 else 0.0,
                    "credit": abs(bal) if bal < 0 else 0.0
                })
                
                # Append child ledgers
                for l in ledger_by_group.get(g_id, []):
                    l_bal = ledger_balances.get(l.id, 0.0)
                    tb_rows.append({
                        "type": "LEDGER",
                        "id": l.id,
                        "name": l.ledger_name,
                        "parent_id": g_id,
                        "group_name": g.group_name,
                        "group_type": g.group_type,
                        "balance": l_bal,
                        "debit": l_bal if l_bal >= 0 else 0.0,
                        "credit": abs(l_bal) if l_bal < 0 else 0.0
                    })

        return tb_rows

    @staticmethod
    def get_profit_and_loss(db: Session, company_id: str, start_date: date, end_date: date) -> dict:
        """
        Calculates Profit & Loss Statement values.
        Gross Profit = Revenue (Direct Income) - Cost of Goods Sold / Purchase (Direct Expense)
        Net Profit = Gross Profit + Indirect Income - Indirect Expense
        """
        if start_date > end_date:
            raise ValueError("start_date must be on or before end_date")

        rows = db.query(
            LedgerMaster.ledger_name,
            AccountGroup.group_type,
            func.coalesce(func.sum(VoucherDetail.debit_amount), 0.0).label("debits"),
            func.coalesce(func.sum(VoucherDetail.credit_amount), 0.0).label("credits"),
        ).join(AccountGroup, AccountGroup.id == LedgerMaster.group_id).join(
            VoucherDetail, VoucherDetail.ledger_id == LedgerMaster.id
        ).join(VoucherHeader, VoucherHeader.id == VoucherDetail.voucher_id).filter(
            LedgerMaster.company_id == company_id,
            VoucherHeader.company_id == company_id,
            VoucherHeader.status == "POSTED",
            VoucherHeader.voucher_date.between(start_date, end_date),
            AccountGroup.group_type.in_(["INCOME", "EXPENSE"]),
        ).group_by(LedgerMaster.id, LedgerMaster.ledger_name, AccountGroup.group_type).all()

        income = 0.0
        expense = 0.0
        details = {"income_ledgers": [], "expense_ledgers": []}

        for row in rows:
            net = float(row.debits) - float(row.credits)
            if row.group_type == "INCOME":
                val = -net
                income += val
                details["income_ledgers"].append({"name": row.ledger_name, "amount": val})
            else:
                val = net
                expense += val
                details["expense_ledgers"].append({"name": row.ledger_name, "amount": val})

        net_profit = income - expense
        return {
            "total_income": income,
            "total_expense": expense,
            "net_profit": net_profit,
            "details": details
        }

    @staticmethod
    def get_balance_sheet(db: Session, company_id: str, as_of_date: date = None) -> dict:
        """
        Calculates Balance Sheet statement.
        Assets == Liabilities + Equity (including Net Profit carryover).
        """
        if not as_of_date:
            as_of_date = date.today()

        tb = AccountingReportsService.get_trial_balance(db, company_id, as_of_date)
        
        assets = 0.0
        liabilities = 0.0
        equity = 0.0
        
        details = {"assets": [], "liabilities": [], "equity": []}

        # Balance Sheet needs cumulative retained earnings unless year-end
        # closing journals have already transferred P&L into equity.
        pl = AccountingReportsService.get_profit_and_loss(db, company_id, date(1900, 1, 1), as_of_date)
        retained_earnings = pl["net_profit"]

        for row in tb:
            if row["type"] == "LEDGER":
                if row["group_type"] == "ASSET":
                    val = row["balance"]
                    assets += val
                    details["assets"].append({"name": row["name"], "amount": val})
                elif row["group_type"] == "LIABILITY":
                    val = -row["balance"]
                    liabilities += val
                    details["liabilities"].append({"name": row["name"], "amount": val})
                elif row["group_type"] == "EQUITY":
                    val = -row["balance"]
                    equity += val
                    details["equity"].append({"name": row["name"], "amount": val})

        # Add retained earnings to equity
        equity += retained_earnings
        details["equity"].append({"name": "Retained Earnings (P&L to Date)", "amount": retained_earnings})

        return {
            "total_assets": assets,
            "total_liabilities": liabilities,
            "total_equity": equity,
            "is_balanced": abs(assets - (liabilities + equity)) < 1.0,
            "difference": assets - (liabilities + equity),
            "details": details
        }

    @staticmethod
    def get_ledger_statement(db: Session, ledger_id: int, start_date: date, end_date: date, company_id: str = None) -> dict:
        """Generates detailed transaction statement for a ledger over a date range."""
        ledger_query = db.query(LedgerMaster).filter(LedgerMaster.id == ledger_id)
        if company_id:
            ledger_query = ledger_query.filter(LedgerMaster.company_id == company_id)
        ledger = ledger_query.first()
        if not ledger:
            return {}

        # Opening balance before start date
        ob_res = AccountingReportsService.get_ledger_balance(
            db, ledger_id, start_date - timedelta(days=1), ledger.company_id
        )
        opening_bal = ob_res['closing']

        # Vouchers in date range
        v_details = db.query(
            VoucherHeader.voucher_no,
            VoucherHeader.voucher_date,
            VoucherHeader.narration,
            VoucherDetail.debit_amount,
            VoucherDetail.credit_amount,
            VoucherDetail.remarks
        ).join(VoucherHeader).filter(
            VoucherDetail.ledger_id == ledger_id,
            VoucherHeader.company_id == ledger.company_id,
            VoucherHeader.status == 'POSTED',
            VoucherHeader.voucher_date.between(start_date, end_date)
        ).order_by(VoucherHeader.voucher_date, VoucherHeader.id).all()

        transactions = []
        running_bal = opening_bal
        
        for v in v_details:
            debit = float(v.debit_amount or 0.0)
            credit = float(v.credit_amount or 0.0)
            running_bal += debit - credit
            transactions.append({
                "voucher_no": v.voucher_no,
                "voucher_date": v.voucher_date.strftime('%Y-%m-%d'),
                "narration": v.narration,
                "debit": debit,
                "credit": credit,
                "balance": running_bal,
                "formatted_balance": f"{abs(running_bal):,.2f} {'DR' if running_bal >= 0 else 'CR'}",
                "remarks": v.remarks
            })

        return {
            "ledger_name": ledger.ledger_name,
            "opening_balance": opening_bal,
            "closing_balance": running_bal,
            "transactions": transactions
        }

    @staticmethod
    def get_day_book(db: Session, company_id: str, target_date: date) -> list:
        """Lists all vouchers posted on a specific day."""
        vouchers = db.query(VoucherHeader).options(
            joinedload(VoucherHeader.details),
            joinedload(VoucherHeader.voucher_type),
        ).filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.voucher_date == target_date,
            VoucherHeader.status == "POSTED",
        ).order_by(VoucherHeader.created_at.desc(), VoucherHeader.id.desc()).all()

        results = []
        for v in vouchers:
            total_debit = sum(d.debit_amount for d in v.details)
            created_at = v.created_at
            if created_at and created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=ZoneInfo("UTC"))
            voucher_time = created_at.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%H:%M:%S") if created_at else ""
            results.append({
                "voucher_id": v.id,
                "voucher_no": v.voucher_no,
                "voucher_time": voucher_time,
                "voucher_type": v.voucher_type.name if v.voucher_type else "Journal",
                "narration": v.narration,
                "status": v.status,
                "total_amount": total_debit
            })
        return results

    @staticmethod
    def get_gst_summary(db: Session, company_id: str, start_date: date, end_date: date) -> dict:
        """Summarizes GST Inputs and Outputs."""
        ledgers = db.query(LedgerMaster).filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.ledger_name.like('%GST%')
        ).all()

        summary = {}
        for l in ledgers:
            bal_res = AccountingReportsService.get_ledger_statement(db, l.id, start_date, end_date)
            summary[l.ledger_name] = {
                "opening": bal_res.get("opening_balance", 0.0),
                "closing": bal_res.get("closing_balance", 0.0),
                "transactions": len(bal_res.get("transactions", []))
            }
        return summary
