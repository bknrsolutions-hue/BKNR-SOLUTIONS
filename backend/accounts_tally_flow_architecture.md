# Accounts And Tally-Style Posting Architecture

## Core Rule

Every business transaction must have one source document and one accounting posting path.

Users should enter the transaction only in the operational source page. The app then creates the ledger voucher automatically. Manual finance pages are for journals, bank transactions, receipts, and controlled adjustments only.

## Source Documents

| Business flow | Entry page | Accounting result |
| --- | --- | --- |
| Purchase / packaging bill | `/api/purchase/entry` | Dr Purchase or Expense, Dr Input GST if available, Cr Vendor Payable |
| Diesel purchase | `/api/diesel/entry` | Dr Diesel Stock / Asset, Dr Input GST if available, Cr Vendor Payable |
| Diesel consumption | `/api/diesel/entry` | Dr Diesel Expense, Cr Diesel Stock / Asset |
| Logistics / freight bill | `/api/container/entry` | Dr Freight Expense, Dr Input GST if available, Cr Vendor Payable |
| QA testing bill | `/api/qa/entry` | Dr QA Testing Expense, Dr Input GST if available, Cr Vendor Payable |
| Other expense bill | `/api/expenses/entry` | Dr Expense, Dr Input GST if available, Cr Vendor Payable |
| Electricity reading / note | `/api/electricity/entry` | Tracking only until it is treated as an accounting bill |
| Export commercial invoice | `/export_documents/commercial_invoice/entry` | Dr Customer / Buyer, Cr Export Sales |
| Payment / receipt | `/finance_accounts/payment_receipt/entry` | Clears payable or receivable against ledger |
| Bank movement | `/finance_accounts/bank_transaction/entry` | Bank/cash ledger movement |
| Manual journal | `/finance_accounts/journal_entry/entry` | Adjustment voucher only |

## Duplicate Prevention Rule

These pages must not be used as normal invoice-entry screens because they can duplicate auto-posted source documents:

- Customer Receivables
- Vendor Payments
- Expense Vouchers

They are kept in code for old data and controlled admin corrections, but removed from normal menu/dashboard navigation.

## Menu Architecture

- `Operations` keeps production, inventory, and export document source files.
- `Finance > Operational Bills` keeps all payable source bills.
- `Finance > Accounts & Ledgers` keeps accounting masters and controlled ledger forms.
- `Finance > Cash & Banking` keeps payment, receipt, and bank movement.
- `Finance > Integrated Finance` keeps finance-specific registers such as export incentives, LC tracking, and production cost allocation.
- `HRMS` owns salary processing navigation.
- `Masters` owns non-accounting master data only.

## Outstanding Logic

Vendor outstanding and customer outstanding should come from ledger vouchers created by source documents and cleared by payment/receipt entries. The same invoice number should not be entered again in a manual payable/receivable page.

## Implementation Status

Operational bills and export commercial invoices now create posted vouchers automatically. Normal navigation no longer exposes the manual customer receivable, vendor payable, and expense voucher pages, so users do not re-enter the same invoice twice.
