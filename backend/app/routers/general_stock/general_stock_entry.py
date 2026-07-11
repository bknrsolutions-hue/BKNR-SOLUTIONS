
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import case, func, text
from datetime import datetime
from app.utils.timezone import ist_now

from app.database import get_db
from app.database.models.general_stock import GeneralStock, GeneralStoreItems
from app.database.models.criteria import hsn_codes, production_at, vendors
from app.database.models.inventory_management import pending_orders, sales_dispatch
from app.database.models.enterprise_finance import AccountGroup, LedgerMaster, VoucherDetail, VoucherHeader
from app.services.bill_accounting import cancel_linked_bill_voucher, list_posting_ledgers, resolve_posting_ledger
from app.services.posting_engine import PostingEngineService

# 🔥 URL లో Duplicate రాకుండా prefix తీసేశాం, కేవలం tags మాత్రమే ఉంచాం
router = APIRouter(tags=["GENERAL STOCK"])


def ensure_general_stock_accounting_schema(db: Session) -> None:
    statements = [
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100)",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS unit_id INTEGER",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS production_at VARCHAR(255)",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS po_number VARCHAR(100)",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS vendor_id INTEGER",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255)",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(50)",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS gst_percent DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS total_amount DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS accounting_ledger_id INTEGER",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE general_stock ADD COLUMN IF NOT EXISTS journal_id INTEGER",
    ]
    for statement in statements:
        db.execute(text(statement))
    db.flush()


def item_accounting_profile(item_name: str):
    clean = (item_name or "").strip().lower()
    if "sticker" in clean or "label" in clean:
        return {"asset": "Stickers Stock A/c", "expense": "Stickers Consumption Expense A/c"}
    if any(word in clean for word in ["chemical", "chem", "salt", "stpp", "soda", "powder", "dry", "wet"]):
        return {"asset": "Chemicals Stock A/c", "expense": "Chemical Consumption Expense A/c"}
    return {"asset": "Packing Material Stock A/c", "expense": "Packing Material Consumption Expense A/c"}


def purchase_ledger_profile(item_name: str):
    profile = item_accounting_profile(item_name)
    return {"ledger": profile["asset"], "group": "Current Assets", "type": "ASSET", "parent": None}


def post_general_stock_purchase(db: Session, company_id: str, row: GeneralStock, email: str):
    profile = purchase_ledger_profile(row.item_name)
    posting_ledger = resolve_posting_ledger(
        db,
        company_id,
        row.accounting_ledger_id,
        profile["ledger"],
        profile["group"],
        profile["type"],
        profile["parent"],
    )
    if posting_ledger["group_type"] != "ASSET":
        posting_ledger = {
            "ledger_name": profile["ledger"],
            "group_name": profile["group"],
            "group_type": profile["type"],
            "parent_group_name": profile["parent"],
        }

    reference_no = f"GS-IN-{row.id}"
    amount = round(float(row.amount or 0.0), 2)
    tax_amount = round(float(row.tax_amount or 0.0), 2)
    total_amount = round(float(row.total_amount or 0.0), 2)
    if total_amount <= 0:
        return None

    clean_vendor = (row.vendor_name or "General Store Vendor").strip() or "General Store Vendor"
    vendor_ledger = clean_vendor if clean_vendor.lower().endswith("a/c") else f"{clean_vendor} A/c"
    details = [
        {
            "ledger_name": posting_ledger["ledger_name"],
            "group_name": posting_ledger["group_name"],
            "group_type": posting_ledger["group_type"],
            "parent_group_name": posting_ledger["parent_group_name"],
            "debit_amount": amount,
            "credit_amount": 0.0,
            "remarks": f"{reference_no} | {row.invoice_number or row.grn_number}",
        },
        {
            "ledger_name": vendor_ledger,
            "group_name": "Sundry Creditors",
            "group_type": "LIABILITY",
            "parent_group_name": "Current Liabilities",
            "debit_amount": 0.0,
            "credit_amount": total_amount,
            "remarks": f"{reference_no} | {row.invoice_number or row.grn_number}",
        },
    ]
    if tax_amount:
        details.insert(
            1,
            {
                "ledger_name": "Input GST Credit A/c",
                "group_name": "Loans & Advances",
                "group_type": "ASSET",
                "parent_group_name": "Current Assets",
                "debit_amount": tax_amount,
                "credit_amount": 0.0,
                "remarks": f"{reference_no} | Input GST",
            },
        )

    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Journal",
        row.date,
        f"General store stock IN {row.item_name} invoice {row.invoice_number or row.grn_number}",
        details,
        reference_no=reference_no,
        created_by=email or "SYSTEM",
        status="POSTED",
    )


def grn_available_qty(db: Session, company_id: str, item_name: str, grn_number: str, unit_id: int = 0) -> float:
    filters = [
        func.upper(func.trim(GeneralStock.company_id)) == company_id,
        func.upper(func.trim(GeneralStock.item_name)) == item_name.strip().upper(),
        GeneralStock.grn_number == grn_number,
        GeneralStock.is_cancelled != True,
    ]
    if unit_id:
        filters.append(GeneralStock.unit_id == unit_id)
    qty = db.query(
        func.coalesce(
            func.sum(
                case(
                    (GeneralStock.movement_type == "IN", GeneralStock.quantity),
                    else_=-GeneralStock.quantity,
                )
            ),
            0.0,
        )
    ).filter(*filters).scalar()
    return round(float(qty or 0.0), 2)


def item_available_qty(db: Session, company_id: str, item_name: str, unit_id: int = 0) -> float:
    filters = [
        func.upper(func.trim(GeneralStock.company_id)) == company_id,
        func.upper(func.trim(GeneralStock.item_name)) == item_name.strip().upper(),
        GeneralStock.is_cancelled != True,
    ]
    if unit_id:
        filters.append(GeneralStock.unit_id == unit_id)
    qty = db.query(
        func.coalesce(
            func.sum(
                case(
                    (GeneralStock.movement_type == "IN", GeneralStock.quantity),
                    else_=-GeneralStock.quantity,
                )
            ),
            0.0,
        )
    ).filter(*filters).scalar()
    return round(float(qty or 0.0), 2)


def grn_rate(db: Session, company_id: str, item_name: str, grn_number: str, unit_id: int = 0) -> float:
    filters = [
        func.upper(func.trim(GeneralStock.company_id)) == company_id,
        func.upper(func.trim(GeneralStock.item_name)) == item_name.strip().upper(),
        GeneralStock.grn_number == grn_number,
        GeneralStock.movement_type == "IN",
        GeneralStock.is_cancelled != True,
    ]
    if unit_id:
        filters.append(GeneralStock.unit_id == unit_id)
    row = db.query(GeneralStock).filter(*filters).order_by(GeneralStock.id.asc()).first()
    return round(float(row.rate or 0.0), 4) if row else 0.0


def grn_source_entry(db: Session, company_id: str, item_name: str, grn_number: str, unit_id: int = 0):
    filters = [
        func.upper(func.trim(GeneralStock.company_id)) == company_id,
        func.upper(func.trim(GeneralStock.item_name)) == item_name.strip().upper(),
        GeneralStock.grn_number == grn_number,
        GeneralStock.movement_type == "IN",
        GeneralStock.is_cancelled != True,
    ]
    if unit_id:
        filters.append(GeneralStock.unit_id == unit_id)
    return db.query(GeneralStock).filter(*filters).order_by(GeneralStock.id.asc()).first()


def post_general_stock_consumption(db: Session, company_id: str, row: GeneralStock, email: str):
    profile = item_accounting_profile(row.item_name)
    amount = round(float(row.amount or 0.0), 2)
    if amount <= 0:
        return None
    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Journal",
        row.date,
        f"General store consumption {row.item_name} GRN {row.grn_number}",
        [
            {
                "ledger_name": profile["expense"],
                "group_name": "Direct Expenses",
                "group_type": "EXPENSE",
                "debit_amount": amount,
                "credit_amount": 0.0,
                "remarks": f"{row.grn_number} | Qty: {row.quantity} | Rate: {row.rate}",
            },
            {
                "ledger_name": profile["asset"],
                "group_name": "Current Assets",
                "group_type": "ASSET",
                "debit_amount": 0.0,
                "credit_amount": amount,
                "remarks": row.grn_number,
            },
        ],
        reference_no=f"GS-OUT-{row.id}",
        created_by=email or "SYSTEM",
    )


def general_stock_in_voucher_is_asset_posted(db: Session, company_id: str, journal_id: int) -> bool:
    if not journal_id:
        return False
    asset_debit = (
        db.query(VoucherDetail.id)
        .join(LedgerMaster, VoucherDetail.ledger_id == LedgerMaster.id)
        .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
        .join(VoucherHeader, VoucherHeader.id == VoucherDetail.voucher_id)
        .filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.id == journal_id,
            VoucherHeader.status == "POSTED",
            AccountGroup.group_type == "ASSET",
            VoucherDetail.debit_amount > 0,
        )
        .first()
    )
    return bool(asset_debit)


def repair_general_stock_in_accounting(db: Session, company_id: str, email: str) -> None:
    rows = db.query(GeneralStock).filter(
        func.upper(func.trim(GeneralStock.company_id)) == company_id,
        GeneralStock.movement_type == "IN",
        GeneralStock.is_cancelled != True,
        GeneralStock.amount > 0,
        GeneralStock.total_amount > 0,
    ).all()
    changed = False
    for row in rows:
        if not row.journal_id:
            existing_voucher = db.query(VoucherHeader).filter(
                VoucherHeader.company_id == company_id,
                VoucherHeader.reference_no == f"GS-IN-{row.id}",
                VoucherHeader.status == "POSTED",
            ).order_by(VoucherHeader.id.desc()).first()
            if existing_voucher and general_stock_in_voucher_is_asset_posted(db, company_id, existing_voucher.id):
                row.journal_id = existing_voucher.id
                changed = True
                continue
        if general_stock_in_voucher_is_asset_posted(db, company_id, row.journal_id):
            continue
        if row.journal_id:
            cancel_linked_bill_voucher(db, company_id, row.journal_id, email)
            row.journal_id = None
        voucher = post_general_stock_purchase(db, company_id, row, email)
        if voucher:
            row.journal_id = voucher.id
            changed = True
    if changed:
        db.flush()

# =============================================================
# 1. PAGE LOAD (GET) - సెషన్ వైజ్ డ్రాప్‌డౌన్స్ & ఈరోజు డేటా
# =============================================================
@router.get("/entry", response_class=HTMLResponse)
def general_stock_entry_page(request: Request, db: Session = Depends(get_db)):
    user_email = request.session.get("email")
    comp_code = (request.session.get("company_code") or "").strip().upper() 

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)
    ensure_general_stock_accounting_schema(db)
    repair_general_stock_in_accounting(db, comp_code, user_email)
    db.commit()

    # GRN నంబర్లు (డిఫాల్ట్ గా చూపించడానికి)
    grn_list = [x[0] for x in db.query(GeneralStock.grn_number).filter(
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).distinct().all() if x[0]]
    
    # మాస్టర్ ఐటమ్స్ ఫిల్టరింగ్
    all_master_records = db.query(GeneralStoreItems).all()
    
    items_set = set()
    units_set = set()
    
    for record in all_master_records:
        record_comp_id = str(record.company_id or "").strip().upper()
        is_global = record_comp_id in ["", "NULL", "NONE"]
        
        if record_comp_id == comp_code or is_global:
            if record.item_name:
                items_set.add(str(record.item_name).strip().upper())
            if record.unit_name:
                units_set.add(str(record.unit_name).strip())
                
    items = sorted(list(items_set))
    units = sorted(list(units_set))
    vendor_list = db.query(vendors).filter(vendors.company_id == comp_code).order_by(vendors.name).all()
    hsn_list = db.query(hsn_codes).filter(hsn_codes.company_id == comp_code).order_by(hsn_codes.hsn_code).all()
    location_list = db.query(production_at).filter(production_at.company_id == comp_code).order_by(production_at.production_at).all()
    pending_po = db.query(pending_orders.po_number).filter(
        func.upper(func.trim(pending_orders.company_id)) == comp_code,
        pending_orders.po_number.isnot(None),
        pending_orders.po_number != "",
    ).distinct().all()
    sales_po = db.query(sales_dispatch.po_number).filter(
        func.upper(func.trim(sales_dispatch.company_id)) == comp_code,
        sales_dispatch.po_number.isnot(None),
        sales_dispatch.po_number != "",
    ).distinct().all()
    po_set = {"N/A"}
    for row in list(pending_po) + list(sales_po):
        value = (row[0] or "").strip()
        if value and value.upper() not in {"-", "NONE", "NULL"}:
            po_set.add(value)
    po_list = sorted(po_set)
    posting_ledgers = list_posting_ledgers(
        db,
        comp_code,
        group_types={"ASSET"},
        group_names={"Current Assets", "Stock-in-hand"},
    )

    # ఈరోజు ఎంటర్ చేసిన డేటా
    today = ist_now().date()
    today_data = db.query(GeneralStock).filter(
        GeneralStock.date == today,
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).order_by(GeneralStock.id.desc()).all()

    return request.app.state.templates.TemplateResponse(
        request=request,
        name="general_stock/general_stock_entry.html",
        context={
            "request": request,
            "grn_list": grn_list,
            "items": items,
            "units": units,
            "today_data": today_data,
            "vendors": vendor_list,
            "hsn_list": hsn_list,
            "locations": location_list,
            "posting_ledgers": posting_ledgers,
            "po_list": po_list,
        }
    )

# =============================================================
# 2. AUTO-FILL ITEM DETAILS API (AJAX)
# =============================================================
@router.get("/api/item_details")
def get_item_details(request: Request, item_name: str, unit_id: int = 0, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    ensure_general_stock_accounting_schema(db)
    req_item_name = item_name.strip().upper()
    
    all_items = db.query(GeneralStoreItems).all()
    master_item = None
    
    for m in all_items:
        db_item_name = str(m.item_name or "").strip().upper()
        c_id = str(m.company_id or "").strip().upper()
        is_global = c_id in ["", "NULL", "NONE"]
        
        if db_item_name == req_item_name and (c_id == comp_code or is_global):
            master_item = m
            break

    if not master_item:
        return JSONResponse({"error": "Item not found in master"}, status_code=404)

    opening_stock = item_available_qty(db, comp_code, req_item_name, unit_id)

    return JSONResponse({
        "unit_name": master_item.unit_name,
        "minimum_level": master_item.minimum_level,
        "opening_stock": opening_stock
    })

# =============================================================
# 3. 🔥 NEW: GET GRN NUMBERS FOR 'OUT' MOVEMENT (AJAX)
# =============================================================
@router.get("/api/get_item_grns")
def get_item_grns(request: Request, item_name: str, unit_id: int = 0, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    req_item_name = item_name.strip().upper()
    ensure_general_stock_accounting_schema(db)
    
    filters = [
        func.upper(func.trim(GeneralStock.company_id)) == comp_code,
        func.upper(func.trim(GeneralStock.item_name)) == req_item_name,
        GeneralStock.movement_type == "IN",
        GeneralStock.is_cancelled != True,
    ]
    if unit_id:
        filters.append(GeneralStock.unit_id == unit_id)
    rows = db.query(GeneralStock.grn_number).filter(*filters).distinct().all()
    
    grn_list = [
        g[0] for g in rows
        if g[0] and grn_available_qty(db, comp_code, req_item_name, g[0], unit_id) > 0
    ]
    
    return JSONResponse({"grns": grn_list})


@router.get("/api/grn_rate")
def get_grn_rate(request: Request, item_name: str, grn_number: str, unit_id: int = 0, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    if not comp_code:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    ensure_general_stock_accounting_schema(db)
    clean_item = item_name.strip().upper()
    return JSONResponse({
        "success": True,
        "rate": grn_rate(db, comp_code, clean_item, grn_number, unit_id),
        "available_qty": grn_available_qty(db, comp_code, clean_item, grn_number, unit_id),
    })

# =============================================================
# 4. SAVE / UPDATE STOCK ENTRY (POST)
# =============================================================
@router.post("/entry")
def save_stock_entry(
    request: Request,
    id: str = Form(None),
    grn_number: str = Form(...),
    invoice_date: str = Form(""),
    unit_id: int = Form(0),
    invoice_number: str = Form(""),
    vendor_id: int = Form(0),
    accounting_ledger_id: int = Form(0),
    po_number: str = Form("N/A"),
    hsn_code: str = Form(""),
    gst_percent: float = Form(0.0),
    item_name: str = Form(...),
    unit_name: str = Form(...),
    movement_type: str = Form(...),
    quantity: float = Form(...),
    rate: float = Form(0.0),
    minimum_level: float = Form(0.0),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    comp_code = (request.session.get("company_code") or "").strip().upper()

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)
    ensure_general_stock_accounting_schema(db)

    # --- EDIT MODE ---
    if id and id.strip() != "":
        existing_row = db.query(GeneralStock).filter(
            GeneralStock.id == int(id), 
            func.upper(func.trim(GeneralStock.company_id)) == comp_code
        ).first()
        if existing_row:
            if existing_row.journal_id:
                return JSONResponse({"success": False, "message": "Posted stock consumption cannot be edited. Cancel and re-enter."}, status_code=400)
            existing_row.grn_number = grn_number
            if invoice_date:
                existing_row.date = datetime.strptime(invoice_date, "%Y-%m-%d").date()
            existing_row.unit_id = unit_id or None
            loc = db.query(production_at).filter(production_at.id == unit_id, production_at.company_id == comp_code).first() if unit_id else None
            existing_row.production_at = loc.production_at if loc else ""
            existing_row.po_number = po_number.strip().upper() if po_number else "N/A"
            existing_row.invoice_number = invoice_number.strip().upper() if movement_type == "IN" else existing_row.invoice_number
            existing_row.vendor_id = vendor_id or None
            existing_row.accounting_ledger_id = accounting_ledger_id or None
            existing_row.hsn_code = hsn_code.strip()
            existing_row.gst_percent = gst_percent
            existing_row.item_name = item_name.strip().upper()
            existing_row.unit_name = unit_name.strip()
            existing_row.movement_type = movement_type
            existing_row.quantity = quantity
            existing_row.rate = rate
            existing_row.amount = round(float(quantity or 0.0) * float(rate or 0.0), 2)
            existing_row.tax_amount = round(existing_row.amount * float(gst_percent or 0.0) / 100.0, 2)
            existing_row.total_amount = round(existing_row.amount + existing_row.tax_amount, 2)
            existing_row.minimum_level = minimum_level
            db.commit()
            return RedirectResponse("/general_stock/entry", status_code=303)

    # --- NEW ENTRY MODE ---
    last_entry = db.query(GeneralStock).filter(
        func.upper(func.trim(GeneralStock.item_name)) == item_name.strip().upper(),
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).order_by(GeneralStock.id.desc()).first()

    current_bal = last_entry.available_stock if last_entry and last_entry.available_stock else 0

    if movement_type == "IN":
        vendor = db.query(vendors).filter(vendors.id == vendor_id, vendors.company_id == comp_code).first() if vendor_id else None
        if not vendor:
            return JSONResponse({"success": False, "message": "Vendor is required for stock IN purchase bill"}, status_code=400)
        loc = db.query(production_at).filter(production_at.id == unit_id, production_at.company_id == comp_code).first() if unit_id else None
        if not loc:
            return JSONResponse({"success": False, "message": "Location unit is required for stock IN purchase bill"}, status_code=400)
        new_bal = current_bal + quantity
    else:
        loc = db.query(production_at).filter(production_at.id == unit_id, production_at.company_id == comp_code).first() if unit_id else None
        if not loc:
            return JSONResponse({"success": False, "message": "Production At is required for stock OUT"}, status_code=400)
        available_for_grn = grn_available_qty(db, comp_code, item_name, grn_number, unit_id)
        if quantity > available_for_grn:
            return JSONResponse({"success": False, "message": f"Selected GRN available stock is only {available_for_grn}"}, status_code=400)
        source_row = grn_source_entry(db, comp_code, item_name, grn_number, unit_id)
        if not source_row:
            return JSONResponse({"success": False, "message": "Selected GRN source details not found"}, status_code=400)
        rate = float(source_row.rate or 0.0)
        invoice_number = source_row.invoice_number or ""
        vendor_id = int(source_row.vendor_id or 0)
        vendor_name = source_row.vendor_name or ""
        po_number = po_number.strip().upper() if po_number else "N/A"
        hsn_code = source_row.hsn_code or ""
        gst_percent = float(source_row.gst_percent or 0.0)
        accounting_ledger_id = int(source_row.accounting_ledger_id or 0)
        current_bal = item_available_qty(db, comp_code, item_name, unit_id)
        new_bal = current_bal - quantity
    amount = round(float(quantity or 0.0) * float(rate or 0.0), 2)
    tax_amount = round(amount * float(gst_percent or 0.0) / 100.0, 2) if movement_type == "IN" else 0.0
    total_amount = round(amount + tax_amount, 2) if movement_type == "IN" else amount
    if movement_type == "IN" and total_amount <= 0:
        return JSONResponse(
            {"success": False, "message": "Stock IN ki Base Price enter cheyyali. Amount 0 ayithe accounts lo asset/vendor effect raadu."},
            status_code=400,
        )

    new_row = GeneralStock(
        grn_number=grn_number,
        unit_id=unit_id or None,
        production_at=loc.production_at if loc else "",
        po_number=po_number.strip().upper() if po_number else "N/A",
        invoice_number=invoice_number.strip().upper() if invoice_number else "",
        vendor_id=vendor_id or None,
        vendor_name=vendor.name if movement_type == "IN" and vendor else vendor_name,
        hsn_code=hsn_code.strip() if hsn_code else "",
        gst_percent=gst_percent if movement_type == "IN" else float(gst_percent or 0.0),
        tax_amount=tax_amount,
        total_amount=total_amount,
        accounting_ledger_id=accounting_ledger_id or None,
        item_name=item_name.strip().upper(),
        unit_name=unit_name.strip(),
        movement_type=movement_type,
        quantity=quantity,
        rate=rate,
        amount=amount,
        opening_stock=current_bal,
        available_stock=new_bal,
        minimum_level=minimum_level,
        date=datetime.strptime(invoice_date, "%Y-%m-%d").date() if movement_type == "IN" and invoice_date else ist_now().date(),
        time=ist_now().time(),
        email=user_email,
        company_id=comp_code
    )

    db.add(new_row)
    db.flush()
    if movement_type == "IN":
        voucher = post_general_stock_purchase(db, comp_code, new_row, user_email)
        if voucher:
            new_row.journal_id = voucher.id
    elif movement_type == "OUT":
        voucher = post_general_stock_consumption(db, comp_code, new_row, user_email)
        if voucher:
            new_row.journal_id = voucher.id
    db.commit()
    return RedirectResponse("/general_stock/entry", status_code=303)

# =============================================================
# 5. DELETE ENTRY (POST)
# =============================================================
@router.post("/entry/delete/{id}")
def delete_stock(request: Request, id: int, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    row = db.query(GeneralStock).filter(
        GeneralStock.id == id, 
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).first()
    if row:
        journal_id = row.journal_id
        if not journal_id:
            refs = [f"GS-{row.movement_type}-{row.id}"]
            if row.movement_type == "IN":
                refs.extend([row.invoice_number, row.grn_number])
            fallback_voucher = db.query(VoucherHeader).filter(
                VoucherHeader.company_id == comp_code,
                VoucherHeader.status == "POSTED",
                VoucherHeader.reference_no.in_([ref for ref in refs if ref]),
            ).order_by(VoucherHeader.id.desc()).first()
            journal_id = fallback_voucher.id if fallback_voucher else None
        if journal_id:
            cancel_linked_bill_voucher(db, comp_code, journal_id, request.session.get("email"))
            row.journal_id = None
        row.is_cancelled = True
        row.quantity = 0.0
        row.rate = 0.0
        row.amount = 0.0
        row.tax_amount = 0.0
        row.total_amount = 0.0
        row.available_stock = row.opening_stock or 0.0
        db.commit()
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Record not found")

# =============================================================
# 6. ASYNC MODAL POPUP SAVE (ADD NEW ITEM TO MASTER)
# =============================================================
@router.post("/items/add")
def add_master_item_via_popup(
    request: Request,
    item_name: str = Form(...),
    unit_name: str = Form(...),
    minimum_level: float = Form(0.0),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    comp_code = (request.session.get("company_code") or "").strip().upper()

    new_item = GeneralStoreItems(
        item_name=item_name.upper().strip(),
        unit_name=unit_name.strip(),
        minimum_level=minimum_level,
        created_date=ist_now().date(),
        created_time=ist_now().time(),
        email=user_email,
        company_id=comp_code
    )
    db.add(new_item)
    db.commit()
    return {"status": "success"}
