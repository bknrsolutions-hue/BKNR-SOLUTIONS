
from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.utils.timezone import ist_now
import json
import re

from app.database import get_db
# Models import
from app.database.models.processing import RawMaterialPurchasing, GateEntry
from app.database.models.criteria import (
    varieties, species, suppliers, hsn_codes, 
    HOSO_HLSO_Yields, packing_styles, peeling_at
)
from app.database.models.inventory_management import pending_orders, stock_entry

router = APIRouter(tags=["RAW MATERIAL PURCHASING"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------
# TODAY RANGE (9 AM TO NEXT DAY 9 AM)
# -----------------------------------------------------
def get_today_range():
    now = ist_now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end
    
    
    
    

# -----------------------------------------------------
# HOSO SUMMARY CALCULATION
# -----------------------------------------------------
def get_hoso_summary_data(db: Session, company_code: str):
    start, _ = get_today_range()
    
    purchased = db.query(
        RawMaterialPurchasing.species,
        RawMaterialPurchasing.count,
        func.sum(RawMaterialPurchasing.received_qty).label("total_rec")
    ).filter(
        RawMaterialPurchasing.company_id == company_code,
        RawMaterialPurchasing.date >= start.date(),
        func.upper(RawMaterialPurchasing.variety_name) == 'HOSO'
    ).group_by(RawMaterialPurchasing.species, RawMaterialPurchasing.count).all()
    
    rec_map = {f"{str(p.species).strip().upper()}|{str(p.count).strip().upper()}": float(p.total_rec or 0) for p in purchased}

    all_stock = db.query(stock_entry).filter(stock_entry.company_id == company_code).all()
    stock_pool = {}
    for s in all_stock:
        s_gl = re.search(r'(\d+)', str(s.glaze or "0"))
        s_gl_val = s_gl.group(1) if s_gl else "0"
        key = f"{str(s.production_for or '').strip().upper()}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{s_gl_val}|{str(s.freezer or 'N/A').strip().lower()}"
        qty = float(s.quantity or 0)
        stock_pool[key] = stock_pool.get(key, 0.0) + (qty if str(s.cargo_movement_type).upper() == "IN" else -qty)

    rows = db.query(pending_orders).filter(pending_orders.company_id == company_code).all()
    yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
    p_styles = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    v_records = db.query(varieties).filter(varieties.company_id == company_code).all()

    summary_agg = {}
    drill_down_dict = {}

    for r in rows:
        p_spec = str(r.species or "").strip().upper()
        p_var = str(r.variety or "").strip().upper()
        if not p_spec: continue

        p_grad, p_pack = str(r.grade or "").strip().lower(), str(r.packing_style or "").strip().lower()
        p_frz = str(r.freezer or "N/A").strip().lower()
        c_gl_match = re.search(r'(\d+)', str(r.count_glaze or "0"))
        p_c_gl_val = float(c_gl_match.group(1)) if c_gl_match else 0.0
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
        w_gl_match = re.search(r'(\d+)', str(r.weight_glaze or "0"))
        w_gl_factor = (100 - float(w_gl_match.group(1) if w_gl_match else 0)) / 100

        exact_key = f"{str(r.company_name or '').strip().upper()}|{p_spec.lower()}|{p_var.lower()}|{p_grad}|{p_pack}|{str(int(p_c_gl_val))}|{p_frz}"
        opening_bal = round(stock_pool.get(exact_key, 0.0), 2)
        
        p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        mc_wt = float(p_match.mc_weight or 1.0) if p_match else 1.0
        ordered_qty = round(mc_wt * float(r.no_of_mc or 0), 2)
        pending_to_produce = ordered_qty - min(opening_bal, ordered_qty) if opening_bal > 0 else ordered_qty
        stock_pool[exact_key] = opening_bal - ordered_qty

        net_cnt = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
        hoso_req_qty, hoso_count_str = 0, "0"

        if "HOSO" in p_var:
            hoso_count_str = str(round(net_cnt))
            hoso_req_qty = pending_to_produce * w_gl_factor
        else:
            v_data = next((v for v in v_records if str(v.variety_name).strip().upper() == p_var), None)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            hl_cnt = round(net_cnt * peeling_y * soaking_y, 2)
            sp_yields = [y for y in yield_records if str(y.species).strip().upper() == p_spec]
            if sp_yields:
                nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - hl_cnt))
                hoso_count_str = str(round(nearest_y.hoso_count))
                h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                req_hlso = (pending_to_produce * w_gl_factor) / (peeling_y * soaking_y) if (peeling_y * soaking_y) > 0 else 0
                hoso_req_qty = req_hlso / h_yield_pct if h_yield_pct > 0 else 0

        agg_key = f"{p_spec}|{p_var}|{hoso_count_str}"
        if agg_key not in summary_agg:
            summary_agg[agg_key] = {"species": p_spec, "variety": p_var, "hoso_count": hoso_count_str, "total_req": 0}
        summary_agg[agg_key]["total_req"] += hoso_req_qty

        if agg_key not in drill_down_dict: drill_down_dict[agg_key] = []
        drill_down_dict[agg_key].append({
            "po_no": r.po_number, "buyer": r.buyer, "grade": r.grade,
            "ordered": ordered_qty, "pending": round(pending_to_produce, 2), "req": round(hoso_req_qty, 2)
        })

    return [
        {
            "species": v["species"], "variety": v["variety"], "hoso_count": v["hoso_count"],
            "total_hoso_req": round(v["total_req"], 2),
            "received_today": round(rec_map.get(f"{v['species']}|{v['hoso_count']}", 0.0), 2),
            "balance": round(v["total_req"] - rec_map.get(f"{v['species']}|{v['hoso_count']}", 0.0), 2)
        } for v in summary_agg.values()
    ], drill_down_dict

# -----------------------------------------------------
# REUSABLE PAGE RENDERER
# -----------------------------------------------------
def render_rmp_page(request: Request, db: Session, company_code: str, edit_data=None):
    hoso_summary, drill_down = get_hoso_summary_data(db, company_code)
    
    gate_entries = db.query(GateEntry).filter(GateEntry.company_id == company_code).order_by(GateEntry.id.desc()).all()
    prod_for_list = sorted(list(set([g.production_for for g in gate_entries if g.production_for])))
    
    prod_batch_map = {}
    for g in gate_entries:
        if g.production_for:
            if g.production_for not in prod_batch_map:
                prod_batch_map[g.production_for] = []
            if g.batch_number not in prod_batch_map[g.production_for]:
                prod_batch_map[g.production_for].append(g.batch_number)

    # Master data for Searchable Columns [2026-01-24]
    supplier_list = [s.supplier_name for s in db.query(suppliers).filter(suppliers.company_id == company_code).all()]
    variety_list = [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()]
    species_list = [s.species_name for s in db.query(species).filter(species.species_name != None, species.company_id == company_code).all()]
    hsn_records = db.query(hsn_codes).filter(hsn_codes.company_id == company_code).all()
    peeling_locs = [p.peeling_at for p in db.query(peeling_at).filter(peeling_at.company_id == company_code).all()]

    start, end = get_today_range()
    today_data = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == company_code,
        and_(
            RawMaterialPurchasing.date >= start.date(), 
            RawMaterialPurchasing.date <= end.date()
        )
    ).order_by(RawMaterialPurchasing.id.desc()).all()

    # ✅ FIXED: TemplateResponse for new FastAPI versions
    return templates.TemplateResponse(
        request=request,
        name="processing/raw_material_purchasing.html",
        context={
            "today_data": today_data, "edit_data": edit_data,
            "batch_list": [g.batch_number for g in gate_entries if g.batch_number],
            "supplier_list": supplier_list, "variety_list": variety_list, "species_list": species_list,
            "peeling_locations": peeling_locs, "prod_for_list": prod_for_list,
            "hsn_list": [h.description for h in hsn_records],
            "hsn_map_json": json.dumps({h.description: h.hsn_code for h in hsn_records}),
            "hoso_summary": hoso_summary, "drill_down_json": json.dumps(drill_down),
            "prod_batch_map_json": json.dumps(prod_batch_map), 
            "batch_supplier_map_json": json.dumps({g.batch_number: {"supplier": g.supplier_name, "prod_for": g.production_for} for g in gate_entries}),
            "message": request.session.pop("message", None)
        }
    )

# -----------------------------------------------------
# ROUTES
# -----------------------------------------------------
@router.get("/raw_material_purchasing", response_class=HTMLResponse)
def show_rmp(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return RedirectResponse("/auth/login", status_code=303)
    return render_rmp_page(request, db, company_code)

@router.get("/raw_material_purchasing/edit/{id}", response_class=HTMLResponse)
def edit_rmp(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return RedirectResponse("/auth/login", status_code=303)
    
    entry = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == id, RawMaterialPurchasing.company_id == company_code).first()
    if not entry: return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
    
    return render_rmp_page(request, db, company_code, edit_data=entry)

@router.post("/raw_material_purchasing")
def save_rmp(
    request: Request, batch_number: str = Form(...), supplier_name: str = Form(""),
    production_for: str = Form(""), 
    peeling_at: str = Form(""), variety_name: str = Form(""), species: str = Form(""), 
    hsn_code: str = Form(""), count: str = Form(""), g1_qty: float = Form(0.0), 
    g2_qty: float = Form(0.0), dc_qty: float = Form(0.0), rate_per_kg: float = Form(0.0), 
    material_boxes: float = Form(0.0), remarks: str = Form(""), db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    now = ist_now()
    received = g1_qty + g2_qty + dc_qty
    total_billable_qty = g1_qty + (g2_qty / 2)
    amount = round(total_billable_qty * rate_per_kg, 2)

    entry = RawMaterialPurchasing(
        batch_number=batch_number, supplier_name=supplier_name, 
        production_for=production_for, 
        peeling_at=peeling_at, variety_name=variety_name,
        species=species, hsn_code=hsn_code, count=count, g1_qty=g1_qty, g2_qty=g2_qty,
        dc_qty=dc_qty, received_qty=received, rate_per_kg=rate_per_kg, amount=amount,
        material_boxes=material_boxes, remarks=remarks, email=request.session.get("email"),
        date=now.date(), time=now.time(), company_id=comp_code
    )
    db.add(entry)
    db.commit()
    request.session["message"] = "✔ Saved Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

@router.post("/raw_material_purchasing/update/{id}")
def update_rmp(
    id: int, request: Request, batch_number: str = Form(...), supplier_name: str = Form(""),
    production_for: str = Form(""), 
    peeling_at: str = Form(""), variety_name: str = Form(""), species: str = Form(""), 
    hsn_code: str = Form(""), count: str = Form(""), g1_qty: float = Form(0.0), 
    g2_qty: float = Form(0.0), dc_qty: float = Form(0.0), rate_per_kg: float = Form(0.0), 
    material_boxes: float = Form(0.0), remarks: str = Form(""), db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    entry = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == id, RawMaterialPurchasing.company_id == comp_code).first()
    if not entry: return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    total_billable_qty = g1_qty + (g2_qty / 2)
    
    entry.batch_number, entry.supplier_name = batch_number, supplier_name
    entry.production_for = production_for 
    entry.peeling_at = peeling_at
    entry.variety_name, entry.species, entry.hsn_code = variety_name, species, hsn_code
    entry.count, entry.g1_qty, entry.g2_qty, entry.dc_qty = count, g1_qty, g2_qty, dc_qty
    entry.received_qty = g1_qty + g2_qty + dc_qty
    entry.amount = round(total_billable_qty * rate_per_kg, 2)
    entry.rate_per_kg = rate_per_kg
    entry.material_boxes, entry.remarks = material_boxes, remarks
    
    db.commit()
    request.session["message"] = "✔ Updated Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

@router.post("/raw_material_purchasing/delete/{id}")
def delete_rmp(id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    entry = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == id, RawMaterialPurchasing.company_id == comp_code).first()
    if entry:
        db.delete(entry)
        db.commit()
    request.session["message"] = "🗑 Deleted Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)