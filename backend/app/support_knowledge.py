"""Code-backed SVBK ERP support knowledge base.

Keep answers operational and consistent with the implemented routers, services,
models and user interfaces. The API and all three support clients consume this
single source so documentation does not diverge by platform.
"""

from __future__ import annotations

from collections import Counter


def _entry(category, question, answer, *, tags="", route=None):
    return {
        "id": f"kb-{len(KNOWLEDGE_BASE) + 1:03d}",
        "category": category,
        "question": question,
        "answer": answer,
        "tags": tags,
        "route": route,
    }


KNOWLEDGE_BASE: list[dict] = []


def _add(category, rows):
    for row in rows:
        question, answer, *meta = row
        options = meta[0] if meta else {}
        KNOWLEDGE_BASE.append(_entry(category, question, answer, **options))


_add("Getting Started & Security", [
    ("What is SVBK ERP?", "SVBK ERP is a tenant-scoped seafood processing ERP covering masters, batch processing, floor balance, finished inventory, orders, exports, operational bills, double-entry accounts, HRMS, payroll, reports, dashboards, administration and support.", {"tags": "overview modules"}),
    ("How is one company’s data separated from another company?", "The signed session carries company_code. Protected queries filter company_id/company_code, and global production/location scope is applied before records, dropdowns, reports or KPIs are returned.", {"tags": "tenant company security"}),
    ("How do global Company and Plant Location filters work?", "The selected Production For and Plant Location are stored in the active session/cookie context. Forms, reports and dashboards pass that scope to backend queries. A user can only select locations listed in allowed_locations.", {"tags": "global filters production location"}),
    ("Why can a user not see a page shown to another user?", "Menus and backend routes use permission keys from User Configuration. Page visibility is only the first layer; protected backend route prefixes enforce the same permission.", {"tags": "permissions roles"}),
    ("What happens when the session expires?", "Protected requests return an authentication response and React/native session handling redirects to the login screen. Unsaved form data is not submitted after the session is invalid.", {"tags": "session expiry login"}),
    ("Can the same email stay logged in on two devices?", "No. A successful login updates current_session_id. When the same email signs in elsewhere, the older session no longer matches and is logged out.", {"tags": "single device session"}),
    ("How do OTP, password setup and password reset work?", "Registration/login flows validate the company and email, send/verify OTP where required, then establish or reset the password through the authentication routes. OTP and session checks run on the backend.", {"tags": "otp password register reset"}),
    ("What does the Profile page show?", "Profile reads the logged-in account and matching employee registration data: name, login email, designation, employee ID, date of birth, blood group, working location and address. Missing matching address is shown as an update notice.", {"tags": "profile employee"}),
    ("How does tenant logo customization work?", "A tenant admin can upload PNG, JPEG or WebP up to 2 MB. The file signature is validated, the company logo_path is updated, and React, template and native headers read company_logo_url from the session/profile APIs.", {"tags": "logo branding tenant"}),
    ("Why is data missing from a dropdown?", "Dropdowns are company- and location-scoped and usually come from a relevant master or upstream transaction. Confirm the global filters, user allowed locations, master status and the upstream record before raising a ticket.", {"tags": "dropdown missing data"}),
    ("What happens after a successful form save?", "The backend validates and commits the transaction, returns success, the UI shows a success state and refreshes the form/data. On failure the form is preserved so the user can close the error and correct the entry.", {"tags": "save success error refresh"}),
    ("Are delete and cancel the same?", "No. Operational and financial records generally use soft cancellation so traceability remains. Financially posted sources reverse their linked voucher; physical deletion is avoided for auditable transactions.", {"tags": "cancel delete reversal audit"}),
])


MASTER_GUIDES = [
    ("Buyers", "stores customer/export buyer identity used by pending orders, shipments, invoices, receivables and export documents", "/criteria/buyers"),
    ("Buyer Agents", "stores buyer representative/agent details used in commercial and export workflows", "/criteria/buyer_agents"),
    ("Suppliers", "stores raw-material supplier, statutory and bank details used by gate/RM purchase and supplier payables", "/criteria/suppliers"),
    ("Vendors", "stores non-RM vendor, GST and bank details used by purchase, service bills and vendor payments", "/criteria/vendors"),
    ("Countries", "supplies destination-country values to buyers, exports and commercial documents", "/criteria/countries"),
    ("Brands", "supplies company/brand identity used by product, packing and export presentation", "/criteria/brands"),
    ("Species", "defines seafood species and feeds variety/product logic across processing and inventory", "/criteria/species"),
    ("Varieties", "defines processed product forms and the yield/packing identity used from processing through exports", "/criteria/varieties"),
    ("Grades", "defines count/grade values used by grading, peeling, production, stock and orders", "/criteria/grades"),
    ("Freezers", "defines production freezer lines used by production and finished-stock classification", "/criteria/freezers"),
    ("Glazes", "defines glaze declarations used in production, stock, packing and export documents", "/criteria/glazes"),
    ("Packing Styles", "defines packing configuration and weights used for product description and quantity calculations", "/criteria/packing_styles"),
    ("Contractors", "stores contractor identity, GST/TDS/bank details used by processing rates and contractor bills", "/criteria/contractors"),
    ("Peeling At", "defines permitted peeling locations used to scope peeling entries and balances", "/criteria/peeling_at"),
    ("Peeling Rates", "maps species/variety/count/contractor/effective date to the processing charge used for contractor cost", "/criteria/peeling_rates"),
    ("Production At", "defines plant locations used by global filters, shifts and operational records", "/criteria/production_at"),
    ("Production For", "defines the production company/customer context used throughout processing and inventory", "/criteria/production_for"),
    ("Production Types", "defines product/process types and linked glaze/freezer/charge defaults", "/criteria/production_types"),
    ("Chemicals", "supplies approved treatment chemical names to soaking and production treatment records", "/criteria/chemicals"),
    ("Purposes", "defines stock movement purposes used to classify IN/OUT inventory transactions", "/criteria/purposes"),
    ("Grade to HOSO", "maps finished grade demand back to HOSO-equivalent raw material for requirement planning", "/criteria/grade_to_hoso"),
    ("HOSO & HLSO", "stores conversion/yield relationships used between whole shrimp, headed material and peeling requirements", "/criteria/hoso_hlso"),
    ("Cold Storage Master", "stores coldstore identity and rate configuration used by holding and storage-cost reports", "/inventory/cold_storage"),
    ("Coldstore Locations", "defines physical coldstore locations used by stock and holding movements", "/criteria/coldstore_locations"),
    ("Vehicle Numbers", "supplies approved vehicle identities to gate, logistics and dispatch forms", "/criteria/vehicle_numbers"),
    ("HSN Codes", "maps goods/services to HSN and GST rates used by purchase, invoice and tax records", "/criteria/hsn_codes"),
    ("General Store Items", "defines store item, unit, category, HSN and stock-accounting identity for general-store transactions", "/general_stock/items"),
]

for master_name, purpose, route in MASTER_GUIDES:
    _add("Masters & Configuration", [(
        f"What does the {master_name} master control?",
        f"The {master_name} master {purpose}. Records are company-scoped; inactive or unavailable values do not appear in dependent dropdowns.",
        {"tags": f"master {master_name.lower()}", "route": route},
    )])

_add("Masters & Configuration", [
    ("Why must masters be configured before transactions?", "Operational forms deliberately load controlled master values instead of free text for business-critical identities. This keeps product descriptions, yields, rates, GST, ledgers and reports consistent.", {"tags": "master setup dropdown"}),
    ("How do edits to masters affect old records?", "Existing transaction rows retain the values saved at transaction time. Master edits affect future selections/defaults; they do not rewrite historical operational or financial transactions.", {"tags": "master edit history"}),
    ("What is Item Accounting Link?", "It maps an operational item/category to its stock, purchase, consumption or expense ledger. Posting services use this mapping to select the correct debit ledger.", {"tags": "accounting master ledger mapping", "route": "/finance_accounts/item_accounting_link/entry"}),
])


_add("Processing & Production", [
    ("What does Gate Entry create?", "Gate Entry records the arriving vehicle, supplier, material/box details, company and location and establishes the batch identity used by Raw Material Purchasing and downstream traceability.", {"tags": "gate batch vehicle supplier", "route": "/processing/gate_entry"}),
    ("Where does the RM Purchasing batch dropdown come from?", "It comes from eligible company/location-scoped Gate Entry records. Selecting a batch loads supplier and gate context so purchase weight and commercial values remain linked.", {"tags": "rm purchase batch dropdown", "route": "/processing/raw_material_purchasing"}),
    ("What happens when RM Purchasing is saved?", "The purchase record is validated, initial raw-material Floor Balance is created/updated and, when configured, a balanced purchase voucher posts purchase/Input GST/TDS against the supplier payable. journal_id links the source and voucher.", {"tags": "rm purchase floor balance accounting"}),
    ("How is a raw-material purchase voucher calculated?", "Base purchase is debited to Raw Shrimp Purchase; input GST is debited when applicable; TDS Payable is credited when applicable; the supplier is credited for base plus GST minus TDS.", {"tags": "double entry supplier payable"}),
    ("How does De-Heading choose available quantity?", "It reads the live company/location/batch raw-material Floor Balance. Save locks/validates the pool, consumes input and creates the headed-stage output balance without allowing negative quantity.", {"tags": "deheading available floor balance", "route": "/processing/de_heading"}),
    ("How is De-Heading yield understood?", "Yield compares headed output with the consumed source quantity. Difference remains visible as process loss/wastage; reports aggregate quantities and linked contractor cost by period.", {"tags": "deheading yield wastage"}),
    ("What does Grading consume and produce?", "Grading consumes eligible headed/HLSO balance for the selected batch and splits output by grade/count. Each saved row updates the grade-specific downstream pool.", {"tags": "grading hlso grade count", "route": "/processing/grading"}),
    ("Why can Grading reject an entry?", "The requested graded quantity cannot exceed the currently available eligible batch pool. Company, location, batch and stage identity must match.", {"tags": "grading validation quantity"}),
    ("What is Required Peeling?", "Required Peeling converts order/product needs and available HLSO through configured yield relationships to show the peeling input still required. It is not the same as a historical summary.", {"tags": "required peeling yield requirement"}),
    ("How does Peeling auto-fill species?", "The selected eligible batch/count row carries upstream species. The UI fills it from the backend lookup; editable dropdown values still come from the species master.", {"tags": "peeling species dropdown", "route": "/processing/peeling"}),
    ("How is Peeling cost calculated?", "The effective Peeling Rate matching company, species, variety, HLSO count and contractor is applied to the accepted peeling quantity. The source charge can post to contractor payable accounting.", {"tags": "peeling rate contractor bill"}),
    ("What does Soaking track?", "Soaking records batch/product/count input, chemical treatment, start date/time, quantities and status. Available quantity is limited to the matched upstream peeling/grade pool.", {"tags": "soaking chemical time status", "route": "/processing/soaking"}),
    ("How is soaking duration calculated?", "For an active soak it is elapsed time from the saved start date/time; after completion it uses the recorded completion/status time. The display is derived from timestamps, not typed duration.", {"tags": "soaking duration time"}),
    ("Can Soaking status be changed?", "Authorized users can use the status action exposed by the Production workspace. The backend validates the row and records the status transition so downstream availability uses the current state.", {"tags": "soaking status change"}),
    ("How is rejection handled?", "Rejection records identify rejected quantity/status against the relevant production/soaking context. Only accepted/released quantity should continue to finished production; status changes remain auditable.", {"tags": "rejection quality status"}),
    ("What are Production Requirements?", "The Requirements tab calculates PO-wise demand, existing finished stock and yield-adjusted raw/intermediate material still required. PO subtotals show the demand hierarchy.", {"tags": "production requirements po subtotal", "route": "/production-requirements"}),
    ("What is the Production Register?", "The Register tab lists actual production entries and their product, batch, PO, freezer, glaze, packing and output quantities. It is the operational history, separate from calculated requirements.", {"tags": "production register", "route": "/processing/production"}),
    ("What happens when Production is saved?", "It validates eligible input, consumes the matched WIP stage and creates finished production output. The production record then becomes a source for Stock Entry and production/cost reports.", {"tags": "production save stock wip"}),
    ("What is Reprocess?", "Reprocess records controlled movement of eligible finished/intermediate material back through a production correction process while keeping original batch traceability.", {"tags": "reprocess correction", "route": "/reports/re-process"}),
    ("How does Floor Balance stay accurate?", "The FloorBalanceService uses canonical company/location/batch/stage keys. Each stage consumes its source and creates/refunds its target inside the transaction; cancellation reverses the movement.", {"tags": "floor balance canonical live"}),
    ("What happens when a processing row is cancelled?", "The row is soft-cancelled, its live Floor Balance impact is reversed and any linked financial voucher is reversed where applicable. Downstream safety checks can block an invalid cancellation.", {"tags": "processing cancel refund reversal"}),
    ("How can a batch be traced end to end?", "Use batch-linked stage reports and Batch Summary: Gate Entry → RM Purchase → De-Heading → Grading → Peeling → Soaking → Production → Stock Entry → order/export references.", {"tags": "batch traceability summary", "route": "/summary/processing"}),
])


_add("Inventory, Orders & Stores", [
    ("What does Stock Entry IN do?", "IN adds finished quantity to the signed stock ledger using PO, batch, product, freezer, glaze, packing, company and location attributes.", {"tags": "stock in finished inventory", "route": "/inventory/stock_entry"}),
    ("What does Stock Entry OUT do?", "OUT consumes a specifically matched stock pool. The backend checks available master cartons and loose quantity before saving, so the balance cannot go negative.", {"tags": "stock out availability"}),
    ("How is available stock calculated?", "Available quantity is the signed sum of active Stock Entry movements: IN adds and OUT subtracts within the same company/location/product/batch/PO identity. Cancelled rows are excluded.", {"tags": "available quantity signed sum"}),
    ("How are master cartons and loose quantity converted?", "The form uses configured master-carton and slab/unit weights. Total quantity is derived from carton quantity plus loose units using the matching packing configuration.", {"tags": "mc loose weight quantity"}),
    ("Why does Stock Entry show only one PO option sometimes?", "The PO dropdown is scoped to eligible order/production context. A safe fallback option is available when required, but saving still validates the transaction’s company and stock identity.", {"tags": "stock po dropdown"}),
    ("What are Pending Orders?", "Pending Orders store PO-wise buyer demand and product specification. They drive production requirements, stock allocation, shipment/export workspaces and pending balance reports.", {"tags": "pending orders po demand", "route": "/inventory/pending_orders"}),
    ("How are pending quantities calculated?", "Pending equals ordered quantity less completed/allocated/dispatch quantity under the same PO/product identity. Reports group by PO and show PO-wise subtotals.", {"tags": "pending quantity subtotal"}),
    ("What does Move to Sales do?", "It converts an eligible order/stock allocation into the sales-dispatch flow, preserving PO, buyer and product references used by Sales and Export documents.", {"tags": "move sales dispatch"}),
    ("What does Cold Storage Holding record?", "It records batch/product quantity placed in or removed from a configured coldstore/location and retains in-date/rent context for holding and storage-cost reports.", {"tags": "cold storage holding rent", "route": "/inventory/cold_storage_holding"}),
    ("How is cold-storage cost calculated?", "Holding duration and the matched cold-storage rate are applied to eligible held quantity according to the stored rent configuration and billing dates.", {"tags": "storage cost calculation", "route": "/reports/storage_cost_report"}),
    ("What does General Store IN do?", "A priced IN row creates store stock by item/unit/GRN and can post Stock/Input GST debit against Vendor Payable credit.", {"tags": "general store in grn", "route": "/general_stock/entry"}),
    ("What does General Store OUT do?", "OUT consumes an available GRN/item pool, values it from the source rate and posts consumption expense debit against material stock credit when accounting is enabled.", {"tags": "general store out consumption"}),
    ("What is Inventory Costing?", "It combines available finished stock with production/purchase cost allocation to report quantity, unit cost and inventory value by product and stock identity.", {"tags": "inventory costing value", "route": "/summary/inventory_costing"}),
    ("What is Floor Balance Value?", "It applies available cost/rate data to canonical live WIP Floor Balance. KPI and report values use the same backend aggregation.", {"tags": "floor value kpi", "route": "/summary/floor_balance_value"}),
    ("When are inventory snapshots created?", "The scheduler creates daily inventory and Floor Balance snapshots at the configured morning schedule. Snapshots support opening/history reporting; current availability still comes from live movements.", {"tags": "snapshot scheduler 0900"}),
])


_add("Export Documents", [
    ("How does the export workflow start?", "An eligible PO/order becomes an Export Shipment workspace. The PO and shipment references are reused across commercial, packing, logistics, compliance and supporting documents.", {"tags": "export workflow po shipment", "route": "/export_documents/workspace"}),
    ("What does the Export Dashboard show?", "It summarizes shipment/document completion, pending compliance and operational export KPIs from tenant-scoped export records.", {"tags": "export dashboard", "route": "/export_documents/dashboard"}),
    ("What is a Proforma Invoice?", "It records the pre-shipment commercial offer for the selected buyer/PO, including products, values, currency and validity. Approval/cancellation status is retained.", {"tags": "proforma invoice pi"}),
    ("What does Export Shipment store?", "It creates the common shipment identity: PO, buyer, destination, shipment number and planning/status information used by all linked export documents.", {"tags": "shipment identity"}),
    ("What happens when a Commercial Invoice is posted?", "The invoice stores export sale details and can create Customer Receivable/Sales and COGS/Finished Goods vouchers. journal references link the commercial source to accounting.", {"tags": "commercial invoice sales receivable cogs"}),
    ("What does a Packing List contain?", "It records PO/shipment-linked packages, product descriptions, batch/lot traceability, net/gross weights and packing totals used by logistics and the final dossier.", {"tags": "packing list batch weight"}),
    ("What does Container Stuffing record?", "It records container, seal, vehicle, stuffing date/location and packed shipment details, linking the physical load to its PO/shipment documents.", {"tags": "container stuffing seal"}),
    ("What does a Shipping Bill record?", "It stores customs shipping-bill identity, date, port/value references and links them to the shipment and commercial documents.", {"tags": "shipping bill customs"}),
    ("What does a Bill of Lading record?", "It stores carrier/vessel, BL number/date, ports, consignee and shipment movement details linked to the export shipment.", {"tags": "bill lading vessel"}),
    ("What does a Health Certificate record?", "It stores the health/compliance certificate identity, authority/date/product references and attaches it to the shipment dossier.", {"tags": "health certificate compliance"}),
    ("What are Requirement Forms?", "They are PO/shipment-linked operational document pages used to capture the required declarations and supporting information for the export file.", {"tags": "requirement forms document center", "route": "/export_documents/requirement-pages/entry"}),
    ("How do Supporting Documents work?", "Admins configure required document codes per PO. Users enter metadata/upload PDFs; each upload is versioned and moves through assigned email-wise approvals.", {"tags": "supporting documents upload version", "route": "/export_documents/supporting_documents/entry"}),
    ("When is a supporting document approved?", "All assigned approvers must approve the current version. Rejection requires a reason, and uploading a revision resets approval for the new version.", {"tags": "document unanimous approval"}),
    ("What is the Export Approvals page?", "It filters supporting documents requiring the current user’s decision and exposes approve/reject actions with audit metadata.", {"tags": "export approval queue", "route": "/export_documents/approvals"}),
    ("What do Export Registers provide?", "They provide searchable/exportable lists of shipments and documents and allow the linked dossier to be retrieved by PO/shipment.", {"tags": "export register excel dossier", "route": "/export_documents/registers"}),
    ("What do Department Registers provide?", "Export Documents, Processing, Inventory, Accounts and HRMS registers provide tenant-controlled master workbooks and individual downloads in one Data Management library. Every register, module export, blank template and shipment dossier requires a fresh Admin OTP; the one-time grant cannot be reused.", {"tags": "department export processing inventory accounts hrms registers excel data management admin otp secure download", "route": "/admin/data-management"}),
    ("How is export cancellation controlled?", "Linked document order is respected. A parent shipment/invoice cannot be cancelled in a way that leaves invalid active downstream documents; accounting vouchers are reversed where applicable.", {"tags": "export cancel dependency reversal"}),
])


_add("Accounts & Finance", [
    ("What is double-entry accounting in SVBK ERP?", "Every posted voucher must have equal total debit and credit. Each line contains either a debit or credit, never both, and uses company-scoped ledger/cost-center identity.", {"tags": "double entry balanced voucher"}),
    ("What does Ledger Master control?", "It defines the account name, group and behavior used by operational posting, journals, settlements and finance reports.", {"tags": "ledger master chart accounts", "route": "/finance_accounts/ledger_master/entry"}),
    ("What does Bank Master control?", "It defines company bank accounts used by bank transactions, receipts, payments and reconciliation.", {"tags": "bank master", "route": "/finance_accounts/bank_master/entry"}),
    ("How are operational bills integrated with accounts?", "Approved bill forms call the posting engine with source type/id, amount, party, tax and mapped ledger. The resulting voucher ID is saved on the source for audit and reversal.", {"tags": "posting engine source journal"}),
    ("How is an Electricity Bill posted?", "Electricity Expense/Input GST are debited as applicable and the electricity board/vendor payable is credited. Payment later debits the payable and credits bank/cash.", {"tags": "electricity bill journal", "route": "/api/electricity/entry"}),
    ("How is Diesel posted?", "Purchase increases Diesel Stock/Input GST against Vendor Payable; consumption moves value from Diesel Stock credit to Diesel Consumption Expense debit.", {"tags": "diesel stock consumption", "route": "/api/diesel/entry"}),
    ("How is Purchase & Packaging posted?", "The selected item/accounting link determines stock or expense debit; Input GST is debited when applicable and Vendor Payable is credited for the invoice total.", {"tags": "purchase packaging payable", "route": "/api/purchase/entry"}),
    ("How is Logistics & Freight posted?", "Freight/Logistics Expense and eligible Input GST are debited; transporter/vendor payable is credited. Payment settles the payable against bank.", {"tags": "logistics freight voucher", "route": "/api/container/entry"}),
    ("How are Contractor Bills posted?", "The contractor processing expense is debited; GST/TDS lines are applied as configured; the net contractor payable is credited.", {"tags": "contractor bill gst tds", "route": "/api/contractor_bills/entry"}),
    ("How are Salary entries posted?", "Salary/Wages Expense and employer statutory costs are debited; employee salary payable and statutory liabilities are credited. Payment debits payable and credits bank.", {"tags": "salary payable payroll journal", "route": "/api/salaries/entry"}),
    ("What do Vendor Bills and Supplier Bills track?", "They record approved payable obligations for the selected party and feed operational payable/payment workflows without losing source invoice identity.", {"tags": "vendor supplier bills payable"}),
    ("What do Payment Logs record?", "They record settlement/payment references against eligible obligations, including date, method/bank and party context.", {"tags": "payment logs settlement", "route": "/api/payment_logs/entry"}),
    ("How are QA Testing Charges posted?", "QA/Testing Expense and eligible Input GST are debited; laboratory/vendor payable is credited.", {"tags": "qa testing expense", "route": "/api/qa/entry"}),
    ("How are Other Expenses posted?", "The selected expense ledger is debited, tax is handled as configured and the payment/payable ledger is credited. Source and journal remain linked.", {"tags": "other expense voucher", "route": "/api/expenses/entry"}),
    ("What is a Journal Entry?", "It is a controlled manual voucher with multiple debit/credit lines. The backend rejects unbalanced entries and locked financial periods.", {"tags": "journal entry validation", "route": "/finance_accounts/journal_entry/entry"}),
    ("What is an Expense Voucher?", "It records a supported business expense and posts the selected expense/tax debit against cash, bank or payable credit.", {"tags": "expense voucher", "route": "/finance_accounts/expense_voucher/entry"}),
    ("What is a Bank Transaction?", "It records a bank-side payment, receipt, contra or adjustment using the selected bank and counterpart ledger and feeds reconciliation.", {"tags": "bank transaction", "route": "/finance_accounts/bank_transaction/entry"}),
    ("What are Remittance & Receipts?", "They record customer/buyer receipts, currency/UTR and allocation. Accounting debits bank and credits the customer receivable/party ledger.", {"tags": "payment receipt remittance", "route": "/finance_accounts/payment_receipt/entry"}),
    ("How do Customer Receivables work?", "Commercial invoices/sales create amounts due by customer. Receipts allocate against them and ageing reports show the remaining balance.", {"tags": "accounts receivable ageing", "route": "/finance_accounts/customer_receivable/entry"}),
    ("How do Vendor Payments work?", "Approved supplier/vendor obligations become payment candidates. Payment debits the party payable and credits the selected bank/cash ledger.", {"tags": "accounts payable vendor payment", "route": "/finance_accounts/vendor_payment/entry"}),
    ("What does the GST Register show?", "It aggregates tax-bearing purchase/sales sources into GST records used for input/output tax review and filing status.", {"tags": "gst input output filing", "route": "/finance_accounts/gst_register/entry"}),
    ("How do Fixed Assets work?", "Asset Master records purchase/value/useful-life details. Depreciation schedules move value from the asset through accumulated depreciation and depreciation expense.", {"tags": "fixed asset depreciation", "route": "/finance_accounts/fixed_assets/entry"}),
    ("What is LC Tracking?", "It records letter-of-credit issue, limits, expiry, shipment, negotiation and payment milestones for export finance control.", {"tags": "letter credit lc", "route": "/finance_accounts/lc_tracking/entry"}),
    ("What is Export Incentive Register?", "It tracks eligible export incentive claims, sanction/utilization and outstanding status linked to export transactions.", {"tags": "export incentive", "route": "/finance_accounts/export_incentive_register/entry"}),
    ("What is Production Cost Allocation?", "It collects source processing, labor, overhead and inventory costs and allocates them to production output to establish unit/product cost.", {"tags": "production costing allocation", "route": "/finance_accounts/production_cost_allocation/entry"}),
    ("How are posted finance records cancelled?", "A posted voucher is not deleted. Cancellation creates an immutable reversal/contra entry and records audit metadata; related source status is updated consistently.", {"tags": "finance cancellation contra"}),
    ("What reports come from the finance engine?", "Trial Balance, Profit & Loss, Balance Sheet, Ledger Statement, Day Book, GST Summary, Voucher Register, Cash Flow, receivable/payable ageing, bank reconciliation and finance dashboards.", {"tags": "finance reports tally"}),
])


_add("HRMS & Payroll", [
    ("What does Staff Registration store?", "It is the employee source of truth: employee ID, name, employment dates/type, department/designation, salary, bank/statutory, contact, profile, address and work location.", {"tags": "employee register profile", "route": "/attendance/employee/register"}),
    ("What does Shift Master control?", "It defines company/location shift name, start/end time, break, night-shift flag and active status. Attendance uses it to determine required working hours.", {"tags": "shift master schedule", "route": "/attendance/shifts"}),
    ("How does Daily Attendance work?", "Employee and shift are selected, movements record punch IN/OUT, and working hours/status are derived. Company/location scope and duplicate/open-duty rules are validated.", {"tags": "attendance punch movements", "route": "/attendance/daily"}),
    ("How is payable duty credit calculated?", "Working hours are compared with the shift’s required hours after break. Manager approval can set absent/half/single/double/triple duty credit according to configured thresholds.", {"tags": "duty credit hours approval"}),
    ("How is overtime handled?", "Calculated OT remains pending until an authorized manager approves or rejects it. Approved OT hours—not raw calculated hours—feed payroll.", {"tags": "ot approval payroll"}),
    ("What does Increment Details do?", "It records old salary, increment type/value, new salary, effective date, reason and approval. Effective active increments update payroll salary context.", {"tags": "employee increment effective", "route": "/attendance/employee-increment"}),
    ("What does Payroll Master control?", "It stores effective PF, EPS, ESI, PT and LWF applicability, identifiers, rates, limits and dates per employee.", {"tags": "statutory pf esi pt lwf", "route": "/attendance/tax-master"}),
    ("How do Salary Advances work?", "An approved advance stores amount, deduction mode/schedule, paid and remaining balance. Monthly payroll creates one recovery record per employee/advance/month.", {"tags": "salary advance recovery", "route": "/attendance/salary-advance"}),
    ("What does Monthly Salary Sheet calculate?", "It combines payable attendance credit, approved OT, salary components, adjustments, statutory deductions, TDS and scheduled advance recovery to calculate gross deductions and net salary.", {"tags": "monthly salary net pay", "route": "/attendance/salary/monthly-sheet"}),
    ("What does Salary Processing do?", "It saves the approved employee-wise payroll, posts salary liability/statutory accounting and can record payment/UTR. Cancellation reverses journals and advance recovery.", {"tags": "salary processing journal payment", "route": "/finance_accounts/salary_processing/entry"}),
    ("What does the HR Dashboard show?", "It combines manpower, attendance, OT/duty approvals, salary cost, compliance risks, directory, trends, birthdays and upcoming festivals under the selected scope.", {"tags": "hr dashboard kpi festival", "route": "/dashboard/hr_command_center"}),
    ("What is Attendance Audit?", "It shows attendance movement/status history and related employee/shift context for review. Approval changes remain traceable.", {"tags": "attendance audit"}),
])


_add("Dashboards & Reports", [
    ("What does the Processing Dashboard show?", "It summarizes current operational input/output, yield, floor balances and processing-stage activity from live tenant/location-scoped transactions.", {"tags": "processing dashboard", "route": "/dashboard/processing_dashboard"}),
    ("What does the Inventory Dashboard show?", "It summarizes available finished stock, order coverage and inventory movement using the same signed stock logic as Stock Status.", {"tags": "inventory dashboard", "route": "/dashboard/inventory_dashboard"}),
    ("What does the Costing Dashboard show?", "It combines processing, inventory and operational cost sources into product/batch cost and management KPIs.", {"tags": "costing dashboard", "route": "/dashboard/costing_dashboard"}),
    ("What does the Finance Dashboard show?", "It summarizes finance postings, balances, receivable/payable, cash/bank and cost metrics from enterprise finance data.", {"tags": "finance dashboard", "route": "/dashboard/finance_dashboard"}),
    ("What does the Tally Dashboard show?", "It presents accounting/statutory summaries and report navigation based on posted voucher and tax data.", {"tags": "tally dashboard", "route": "/finance_accounts/tally_dashboard"}),
    ("What do processing stage reports support?", "Gate, RM Purchase, De-Heading, Grading, Peeling, Soaking, Production and Reprocess reports provide filters, compact tables, subtotals, audit/cancel actions and source-specific exports where enabled.", {"tags": "processing reports"}),
    ("What does Stock Status Report show?", "It groups active signed stock by product identity and shows available master cartons/loose quantity with location/company subtotals. Description remains the primary sticky/wrapped field in compact views.", {"tags": "stock status grouped subtotal", "route": "/inventory/stock_report"}),
    ("What does Floor Balance Report show?", "It reports live WIP by canonical stage/product/batch identity with company and location subtotals. It reads the same Floor Balance source used by processing availability.", {"tags": "floor balance report subtotal", "route": "/reports/floor_balance_report"}),
    ("What does Pending Orders Report show?", "It reports remaining demand grouped by PO with PO-wise subtotals after completed/allocated quantities are deducted.", {"tags": "pending orders report po", "route": "/reports/pending_orders_report"}),
    ("What does Sales Report show?", "It reports sales/dispatch movements with PO, buyer, product, quantity and related commercial references under tenant/location filters.", {"tags": "sales report dispatch", "route": "/inventory/sales_report"}),
    ("What does General Store Report show?", "It reports item-wise IN, OUT and available balance with GRN/vendor/value context.", {"tags": "general store report", "route": "/general_stock/report"}),
    ("What does Cold Storage Report show?", "It reports held batch/product quantities and movement/rent context by coldstore and location.", {"tags": "cold storage report", "route": "/inventory/cold_storage_holding_report"}),
    ("What is Periodic Summary?", "It aggregates processing activity over a selected date period for cross-stage operational review.", {"tags": "periodic summary", "route": "/summary/periodic-report"}),
    ("How do report global filters behave?", "Company, production location, dates and page-specific filters are sent to the backend. Native filters remain compact/sticky; report rows end above the fixed bottom menu.", {"tags": "report filters native"}),
    ("Can audit history open the affected row?", "Where the report exposes row-linked audit navigation, the audit record includes table/record ID and opens or focuses the relevant source row.", {"tags": "audit row id navigation"}),
    ("What is the Costing & Fin dashboard?", "Costing & Fin is the navigation label for the Costing Dashboard. It combines processing output, inventory and operational/finance cost sources into management KPIs.", {"tags": "Costing & Fin"}),
    ("What is the HR & Staff dashboard?", "HR & Staff opens the HR Command Center for manpower, attendance, payroll cost, approvals, compliance, directory and calendar information.", {"tags": "HR & Staff"}),
    ("What does Gate Entry Report provide?", "Gate Entry Report lists tenant/location/date-scoped vehicle and material arrivals with batch, supplier and gate-pass context.", {"tags": "Gate Entry Report"}),
    ("What does RM Purchase Report provide?", "RM Purchase Report lists batch-wise purchased quantity, supplier/commercial values and related processing/accounting context.", {"tags": "RM Purchase Report"}),
    ("What does De-Heading Report provide?", "De-Heading Report lists source and headed output quantities, yield/loss, contractor context and period totals.", {"tags": "De-Heading Report"}),
    ("What does Grading Report provide?", "Grading Report shows batch/grade-wise splits, source quantity, output quantity and grouped totals.", {"tags": "Grading Report"}),
    ("What does Peeling Report provide?", "Peeling Report shows contractor/species/variety/count-wise peeling input, output, yield and cost context.", {"tags": "Peeling Report"}),
    ("What does Soaking Report provide?", "Soaking Report shows batch/product/count quantities, chemical treatment, start/completion timing and status.", {"tags": "Soaking Report"}),
    ("What does Production Report provide?", "Production Report lists finished production by batch, PO, product, freezer, glaze, packing and quantity with grouped totals.", {"tags": "Production Report"}),
    ("What does Re-Process Report provide?", "Re-Process Report lists controlled reprocessing corrections with original traceability, quantities and status.", {"tags": "Re-Process Report"}),
    ("What does Storage & Cost Report provide?", "Storage & Cost Report combines cold-storage holding quantity, duration and configured rent/cost calculations.", {"tags": "Storage & Cost Report"}),
])


_add("Administration, Mobile & Support", [
    ("What does User Configuration control?", "It creates/updates users, role, permissions, data-management access and allowed locations. The same backend conditions apply to React, templates and native clients.", {"tags": "user permissions configuration", "route": "/admin/add_user"}),
    ("What does Data Management provide?", "Authorized users can export modules, download blank templates, inspect Excel, map columns, import, undo the last import or clear controlled tables. Sensitive actions require admin OTP and create history.", {"tags": "data management excel otp", "route": "/data-management"}),
    ("What does System & Pipeline control?", "Super admin can manage maintenance mode, deployment lock, screen popup broadcasts and feature flags with deployment/audit visibility.", {"tags": "system pipeline maintenance feature flag", "route": "/admin/system_settings"}),
    ("Who can see System Architecture?", "It is restricted to the configured SVBK super-admin account and documents verified master, processing, inventory, accounts, HRMS and export flows.", {"tags": "architecture super admin", "route": "/admin/system_architecture"}),
    ("How does Support work?", "Users search this knowledge base first, then raise a complaint with subject/details and optional attachment. Tickets move through OPEN, IN_PROGRESS and RESOLVED with a complete message thread.", {"tags": "support ticket complaint"}),
    ("What happens if a user replies to a resolved ticket?", "A user reply reopens the ticket into IN_PROGRESS so support can continue the conversation.", {"tags": "support reopen"}),
    ("What can Helpdesk admins do?", "Authorized support admins view tenant tickets, open conversations, reply with attachments and update status. Resolved admin tickets remain closed unless the user reopens through a reply.", {"tags": "helpdesk admin"}),
    ("What does Support Team Management do?", "Super admin reviews and manages users assigned to support/helpdesk roles.", {"tags": "support team", "route": "/admin/support_team"}),
    ("What do User Activity Logs show?", "They expose registration, active-company/user, ticket and approval metrics plus the monitored helpdesk activity feed.", {"tags": "activity logs monitoring", "route": "/admin/activities"}),
    ("What is the native app scope?", "Native screens provide authentication, processing workspace/forms, dashboards, stock status, floor balance, attendance, profile, user configuration and compact support. They call the same backend APIs and permissions.", {"tags": "native mobile features"}),
    ("How does native Support open?", "The movable blue floating support icon opens a compact support drawer without blocking the rest of the app. The page/header support icon can close or reopen it.", {"tags": "native floating support"}),
    ("Why are charts omitted from native processing pages?", "Native processing focuses on compact visible tables and forms. Processing charts are intentionally not rendered to preserve small-screen usability.", {"tags": "native charts compact"}),
    ("How do light theme and header colors work?", "The app uses the supported light UI while header/background color choices are applied consistently to top and bottom navigation. Content contrast is preserved on white backgrounds.", {"tags": "theme header light"}),
    ("What should I do when a save returns 500 or validation error?", "Do not re-enter immediately. Keep the form open, read the returned message, verify required master/dropdown and quantity scope, correct the input and retry. Raise a ticket with page, time, values and screenshot if it persists.", {"tags": "error 500 troubleshooting"}),
])

_add("Accounts & Finance", [
    ("What is the Accounts Flow Guide?", "Accounts Flow Guide explains which operational source triggers accounting, which ledgers are debited/credited, the asset/expense/liability impact and how settlement or reversal continues the flow.", {"tags": "Accounts Flow Guide", "route": "/finance_accounts/accounts_flow_guide"}),
    ("Where are Electricity Bills entered?", "Electricity Bills opens the operational electricity entry, validates meter/bill/amount context and posts the configured expense, tax and payable accounting.", {"tags": "Electricity Bills", "route": "/api/electricity/entry"}),
    ("Where are Expense Vouchers entered?", "Expense Vouchers opens the finance expense-voucher workspace for supported manual expense posting against cash, bank or payable.", {"tags": "Expense Vouchers", "route": "/finance_accounts/expense_voucher/entry"}),
    ("Where are Export Incentives maintained?", "Export Incentives opens the incentive register for claim, sanction, utilization and outstanding export-benefit tracking.", {"tags": "Export Incentives", "route": "/finance_accounts/export_incentive_register/entry"}),
    ("Where are Journal Entries maintained?", "Journal Entries opens the balanced multi-line journal workspace; unbalanced or locked-period submissions are rejected.", {"tags": "Journal Entries", "route": "/finance_accounts/journal_entry/entry"}),
    ("What does the Salaries operational page do?", "Salaries displays/records salary payable bill information used by payment and accounts flows; detailed employee payroll calculation remains in Monthly Salary Sheet and Salary Processing.", {"tags": "Salaries", "route": "/api/salaries/entry"}),
])

_add("Inventory, Orders & Stores", [
    ("What is General Store Entry?", "General Store Entry records item-wise IN and OUT movements, validates the GRN/item pool and connects valued purchase or consumption movements to accounts.", {"tags": "General Store Entry", "route": "/general_stock/entry"}),
])


def knowledge_payload() -> dict:
    categories = Counter(item["category"] for item in KNOWLEDGE_BASE)
    return {
        "status": "success",
        "version": "2026.07",
        "total": len(KNOWLEDGE_BASE),
        "categories": [{"name": name, "count": count} for name, count in categories.items()],
        "entries": KNOWLEDGE_BASE,
    }
