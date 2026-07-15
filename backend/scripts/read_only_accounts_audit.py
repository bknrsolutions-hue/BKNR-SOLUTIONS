"""Read-only accounting integrity audit.  Never writes to the database."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect, text

from app.database import engine


def scalar(connection, sql):
    return connection.execute(text(sql)).scalar() or 0


def rows(connection, sql):
    return [dict(row._mapping) for row in connection.execute(text(sql)).all()]


def main():
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    result = {"checks": {}, "details": {}}
    with engine.connect() as connection:
        result["revision"] = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        result["checks"]["posted_vouchers"] = scalar(connection, "SELECT count(*) FROM voucher_headers WHERE status='POSTED'")
        result["checks"]["unbalanced_posted_vouchers"] = scalar(connection, """
            SELECT count(*) FROM (
                SELECT vh.id
                  FROM voucher_headers vh JOIN voucher_details vd ON vd.voucher_id=vh.id
                 WHERE vh.status='POSTED'
                 GROUP BY vh.id
                HAVING abs(sum(vd.debit_amount)-sum(vd.credit_amount)) > 0.009
            ) problem
        """)
        result["checks"]["posted_vouchers_without_lines"] = scalar(connection, """
            SELECT count(*) FROM voucher_headers vh
             WHERE vh.status='POSTED' AND NOT EXISTS (SELECT 1 FROM voucher_details vd WHERE vd.voucher_id=vh.id)
        """)
        result["checks"]["invalid_voucher_lines"] = scalar(connection, """
            SELECT count(*) FROM voucher_details
             WHERE debit_amount < 0 OR credit_amount < 0
                OR ((debit_amount > 0)::int + (credit_amount > 0)::int) <> 1
        """)
        result["checks"]["orphan_voucher_lines"] = scalar(connection, """
            SELECT count(*) FROM voucher_details vd LEFT JOIN voucher_headers vh ON vh.id=vd.voucher_id WHERE vh.id IS NULL
        """)
        result["checks"]["cross_company_ledger_lines"] = scalar(connection, """
            SELECT count(*) FROM voucher_details vd
            JOIN voucher_headers vh ON vh.id=vd.voucher_id
            JOIN ledger_masters lm ON lm.id=vd.ledger_id
            WHERE vh.company_id <> lm.company_id
        """)
        result["checks"]["duplicate_voucher_numbers"] = scalar(connection, """
            SELECT count(*) FROM (
                SELECT company_id,voucher_no FROM voucher_headers GROUP BY company_id,voucher_no HAVING count(*)>1
            ) duplicate
        """)
        source_coverage = {
            "raw_material_purchasing": "is_cancelled IS NOT TRUE AND coalesce(amount,0)>0 AND journal_id IS NULL",
            "de_heading": "is_cancelled IS NOT TRUE AND coalesce(amount,0)>0 AND journal_id IS NULL",
            "peeling": "is_cancelled IS NOT TRUE AND coalesce(amount,0)>0 AND journal_id IS NULL",
            "general_stock": "is_cancelled IS NOT TRUE AND movement_type='IN' AND coalesce(total_amount,amount,0)>0 AND journal_id IS NULL",
            "sales_dispatch": "coalesce(amount_inr,0)>0 AND journal_id IS NULL",
            "customer_receivables": "is_cancelled IS NOT TRUE AND coalesce(invoice_value_inr,0)>0 AND journal_id IS NULL",
            "vendor_payments": "is_cancelled IS NOT TRUE AND coalesce(total_amount,0)>0 AND journal_id IS NULL",
            "bank_transactions": "is_cancelled IS NOT TRUE AND (coalesce(debit,0)>0 OR coalesce(credit,0)>0) AND journal_id IS NULL",
            "expense_vouchers": "is_cancelled IS NOT TRUE AND coalesce(total_amount,0)>0 AND journal_id IS NULL",
            "payment_receipts": "is_cancelled IS NOT TRUE AND coalesce(amount_inr,0)>0 AND journal_id IS NULL",
            "commercial_invoices": "is_cancelled IS NOT TRUE AND coalesce(invoice_value_inr,0)>0 AND journal_id IS NULL",
        }
        missing_source_journals = 0
        for table_name, predicate in source_coverage.items():
            if table_name not in tables:
                continue
            columns = {column["name"] for column in inspector.get_columns(table_name)}
            if "journal_id" not in columns:
                continue
            count = scalar(connection, f"SELECT count(*) FROM {table_name} WHERE {predicate}")
            result["checks"][f"active_source_without_journal_{table_name}"] = count
            missing_source_journals += count
        result["checks"]["active_financial_sources_without_journal_total"] = missing_source_journals
        for table_name in ("raw_material_purchasing", "de_heading", "peeling"):
            result["checks"][f"duplicate_source_journal_links_{table_name}"] = scalar(connection, f"""
                SELECT count(*) FROM (
                    SELECT journal_id FROM {table_name}
                     WHERE journal_id IS NOT NULL AND is_cancelled IS NOT TRUE
                     GROUP BY journal_id HAVING count(*) > 1
                ) duplicate
            """)

        link_tables = {
            "commercial_invoices": ["journal_id", "cogs_journal_id"],
            "customer_receivables": ["journal_id"],
            "vendor_payments": ["journal_id"],
            "bank_transactions": ["journal_id"],
            "expense_vouchers": ["journal_id"],
            "journal_entries": ["journal_id"],
            "payment_receipts": ["journal_id"],
            "production_cost_allocations": ["wip_journal_id", "fg_journal_id"],
            "fixed_asset_masters": ["purchase_journal_id"],
        }
        orphan_links = 0
        for table_name, candidates in link_tables.items():
            if table_name not in tables:
                continue
            columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column in candidates:
                if column not in columns:
                    continue
                count = scalar(connection, f"""
                    SELECT count(*) FROM {table_name} src
                    LEFT JOIN voucher_headers vh ON vh.id=src.{column}
                    WHERE src.{column} IS NOT NULL AND (vh.id IS NULL OR vh.company_id<>src.company_id)
                """)
                result["checks"][f"orphan_link_{table_name}_{column}"] = count
                orphan_links += count
        result["checks"]["orphan_journal_links_total"] = orphan_links

        result["checks"]["production_allocations_missing_required_journals"] = scalar(connection, """
            SELECT count(*) FROM production_cost_allocations
             WHERE is_cancelled IS NOT TRUE AND (
                (upper(status) IN ('COST_ALLOCATED','FG_TRANSFERRED') AND wip_journal_id IS NULL)
                OR (upper(status)='FG_TRANSFERRED' AND fg_journal_id IS NULL)
             )
        """)
        result["checks"]["packing_batches_without_fg_cost"] = scalar(connection, """
            SELECT count(*) FROM packing_lists pl
            LEFT JOIN production_cost_allocations pca
              ON pca.company_id=pl.company_id AND pca.batch_number=pl.batch_no
             AND upper(pca.status)='FG_TRANSFERRED' AND pca.is_cancelled IS NOT TRUE
            WHERE pl.is_cancelled IS NOT TRUE AND (pl.batch_no IS NULL OR pca.id IS NULL OR coalesce(pca.cost_per_kg,0)<=0)
        """)
        result["checks"]["posted_invoices_without_sales_journal"] = scalar(connection, """
            SELECT count(*) FROM commercial_invoices
             WHERE is_cancelled IS NOT TRUE AND upper(status)='POSTED' AND journal_id IS NULL
        """)
        result["checks"]["packed_invoices_without_cogs_journal"] = scalar(connection, """
            SELECT count(*) FROM commercial_invoices ci
             WHERE ci.is_cancelled IS NOT TRUE AND ci.cogs_journal_id IS NULL
               AND EXISTS (SELECT 1 FROM packing_lists pl WHERE pl.company_id=ci.company_id AND pl.invoice_no=ci.invoice_no AND pl.is_cancelled IS NOT TRUE)
        """)
        if "bill_allocations" in tables:
            result["checks"]["linked_payments_without_bill_allocation"] = scalar(connection, """
                SELECT count(*) FROM payment_receipts pr
                 WHERE pr.is_cancelled IS NOT TRUE AND (pr.invoice_no IS NOT NULL OR pr.vendor_bill_no IS NOT NULL)
                   AND NOT EXISTS (
                       SELECT 1 FROM bill_allocations ba
                        WHERE ba.company_id=pr.company_id AND ba.payment_receipt_id=pr.id AND ba.is_reversed IS NOT TRUE
                   )
            """)
            result["checks"]["active_allocations_for_cancelled_payments"] = scalar(connection, """
                SELECT count(*) FROM bill_allocations ba JOIN payment_receipts pr ON pr.id=ba.payment_receipt_id
                 WHERE ba.is_reversed IS NOT TRUE AND pr.is_cancelled IS TRUE
            """)
        result["checks"]["unmatched_bank_statement_lines"] = scalar(connection, "SELECT count(*) FROM bank_reconciliations WHERE is_matched IS NOT TRUE")
        result["checks"]["matched_bank_lines_without_voucher"] = scalar(connection, """
            SELECT count(*) FROM bank_reconciliations br LEFT JOIN voucher_details vd ON vd.id=br.voucher_detail_id
             WHERE br.is_matched IS TRUE AND vd.id IS NULL
        """)
        if "forex_revaluations" in tables:
            result["checks"]["active_forex_rows_without_journal"] = scalar(connection, """
                SELECT count(*) FROM forex_revaluations fr LEFT JOIN voucher_headers vh ON vh.id=fr.journal_id
                 WHERE fr.is_reversed IS NOT TRUE AND (vh.id IS NULL OR vh.status<>'POSTED')
            """)
        result["checks"]["cancelled_vouchers_without_reversal_audit"] = scalar(connection, """
            SELECT count(*) FROM voucher_headers vh
             WHERE vh.status='CANCELLED' AND NOT EXISTS (
                SELECT 1 FROM finance_audit_trails fat
                 WHERE fat.company_id=vh.company_id AND fat.table_name='voucher_headers'
                   AND fat.record_id=vh.id AND fat.action='REVERSE'
             )
        """)
        result["details"]["packing_cost_gaps"] = rows(connection, """
            SELECT pl.company_id,pl.invoice_no,pl.packing_no,pl.batch_no,pl.net_weight
              FROM packing_lists pl
              LEFT JOIN production_cost_allocations pca
                ON pca.company_id=pl.company_id AND pca.batch_number=pl.batch_no
               AND upper(pca.status)='FG_TRANSFERRED' AND pca.is_cancelled IS NOT TRUE
             WHERE pl.is_cancelled IS NOT TRUE AND (pl.batch_no IS NULL OR pca.id IS NULL OR coalesce(pca.cost_per_kg,0)<=0)
        """)
        result["details"]["invoice_cogs_gaps"] = rows(connection, """
            SELECT ci.company_id,ci.invoice_no,ci.invoice_date,ci.total_net_weight
              FROM commercial_invoices ci
             WHERE ci.is_cancelled IS NOT TRUE AND ci.cogs_journal_id IS NULL
               AND EXISTS (SELECT 1 FROM packing_lists pl WHERE pl.company_id=ci.company_id AND pl.invoice_no=ci.invoice_no AND pl.is_cancelled IS NOT TRUE)
        """)
        if "bill_allocations" in tables:
            result["details"]["payment_allocation_gaps"] = rows(connection, """
                SELECT pr.company_id,pr.id,pr.receipt_no,pr.transaction_type,pr.invoice_no,pr.vendor_bill_no,pr.amount_inr
                  FROM payment_receipts pr
                 WHERE pr.is_cancelled IS NOT TRUE AND (pr.invoice_no IS NOT NULL OR pr.vendor_bill_no IS NOT NULL)
                   AND NOT EXISTS (SELECT 1 FROM bill_allocations ba WHERE ba.company_id=pr.company_id AND ba.payment_receipt_id=pr.id AND ba.is_reversed IS NOT TRUE)
                 ORDER BY pr.entry_date,pr.id
            """)
        result["details"]["cancelled_voucher_controls"] = rows(connection, """
            SELECT vh.company_id,count(*) AS cancelled,
                   count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM finance_audit_trails fat
                        WHERE fat.company_id=vh.company_id AND fat.table_name='voucher_headers'
                          AND fat.record_id=vh.id AND fat.action='REVERSE'
                   )) AS with_reversal_audit
              FROM voucher_headers vh WHERE vh.status='CANCELLED' GROUP BY vh.company_id
        """)
        result["details"]["opening_balance_control"] = rows(connection, """
            SELECT company_id,
                   round(sum(CASE WHEN opening_balance_type='DR' THEN opening_balance ELSE 0 END)::numeric,2) AS opening_debit,
                   round(sum(CASE WHEN opening_balance_type='CR' THEN opening_balance ELSE 0 END)::numeric,2) AS opening_credit
              FROM ledger_masters GROUP BY company_id
        """)
        result["details"]["voucher_status"] = rows(connection, "SELECT company_id,status,count(*) AS count FROM voucher_headers GROUP BY company_id,status ORDER BY company_id,status")
        result["details"]["accounting_population"] = rows(connection, """
            SELECT company_id,
                   count(*) FILTER (WHERE status='POSTED') AS posted,
                   round(coalesce(sum(total_debit),0)::numeric,2) AS posted_debits
              FROM (
                SELECT vh.company_id,vh.status,vh.id,sum(vd.debit_amount) AS total_debit
                FROM voucher_headers vh LEFT JOIN voucher_details vd ON vd.voucher_id=vh.id
                GROUP BY vh.company_id,vh.status,vh.id
              ) vouchers GROUP BY company_id ORDER BY company_id
        """)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
