import base64
from pathlib import Path
from PIL import Image

brain_dir = Path("/Users/nagaraju/.gemini/antigravity-ide/brain/4ed93a22-66c9-4303-ad31-25037d673a72")
template_path = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")
backend_static_img = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/static/images")
backend_static_img.mkdir(parents=True, exist_ok=True)

mappings = {
    "bknr_gate_entry_thumb": ("gate", "bknr_gate_entry_thumb.png"),
    "bknr_rm_purchase_thumb": ("purchase", "bknr_rm_purchase_thumb.png"),
    "bknr_deheading_thumb": ("heading", "bknr_deheading_thumb.png"),
    "bknr_grading_thumb": ("grading", "bknr_grading_thumb.png"),
    "bknr_peeling_thumb": ("peeling", "bknr_peeling_thumb.png"),
    "bknr_soaking_thumb": ("soaking", "bknr_soaking_thumb.png"),
    "bknr_production_thumb": ("production", "bknr_production_thumb.png"),
    "bknr_cold_stock_thumb": ("stock", "bknr_cold_stock_thumb.png"),
    "bknr_export_port_thumb": ("export", "bknr_export_port_thumb.png"),
}

b64_data = {}
for prefix, (key, filename) in mappings.items():
    files = list(brain_dir.glob(f"{prefix}*.png"))
    if files:
        img_path = files[0]
        with Image.open(img_path) as img:
            img = img.resize((240, 240), Image.Resampling.LANCZOS)
            img.save(backend_static_img / filename, format="PNG", optimize=True)
            with open(backend_static_img / filename, "rb") as f:
                b64_data[key] = f"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"

print(f"Saved {len(b64_data)} AI images to static images folder and generated Base64 strings!")

html = template_path.read_text(encoding="utf-8")

new_flow = f'''          <div class="operations-flow" role="list" aria-label="Seafood processing workflow">
            <article class="operation-node operation-node--gate" role="listitem"><img src="{b64_data['gate']}" alt="Gate Entry" class="op-thumb-img-large"><b class="op-node-title">Gate Entry</b></article>
            <span class="operation-rail operation-rail--gate-purchase" aria-hidden="true"><span class="operation-rail-stream-3"></span></span>
            <article class="operation-node operation-node--purchase" role="listitem"><img src="{b64_data['purchase']}" alt="RM Purchase" class="op-thumb-img-large"><b class="op-node-title">RM Purchase</b></article>
            <span class="operation-rail operation-rail--purchase-heading" aria-hidden="true"><span class="operation-rail-stream-3"></span></span>
            <article class="operation-node operation-node--heading" role="listitem"><img src="{b64_data['heading']}" alt="De-heading" class="op-thumb-img-large"><b class="op-node-title">De-heading</b></article>
            <span class="operation-rail operation-rail--vertical operation-rail--heading-grading" aria-hidden="true"></span>
            <article class="operation-node operation-node--grading" role="listitem"><img src="{b64_data['grading']}" alt="Grading" class="op-thumb-img-large"><b class="op-node-title">Grading</b></article>
            <span class="operation-rail operation-rail--grading-peeling operation-rail--reverse" aria-hidden="true"><span class="operation-rail-stream-3"></span></span>
            <article class="operation-node operation-node--peeling" role="listitem"><img src="{b64_data['peeling']}" alt="Peeling" class="op-thumb-img-large"><b class="op-node-title">Peeling</b></article>
            <span class="operation-rail operation-rail--peeling-soaking operation-rail--reverse" aria-hidden="true"><span class="operation-rail-stream-3"></span></span>
            <article class="operation-node operation-node--soaking" role="listitem"><img src="{b64_data['soaking']}" alt="Soaking" class="op-thumb-img-large"><b class="op-node-title">Soaking</b></article>
            <span class="operation-rail operation-rail--vertical operation-rail--soaking-production" aria-hidden="true"></span>
            <article class="operation-node operation-node--production" role="listitem"><img src="{b64_data['production']}" alt="Production" class="op-thumb-img-large"><b class="op-node-title">Production</b></article>
            <span class="operation-rail operation-rail--production-stock" aria-hidden="true"><span class="operation-rail-stream-3"></span></span>
            <article class="operation-node operation-node--stock" role="listitem"><img src="{b64_data['stock']}" alt="Stock Entry" class="op-thumb-img-large"><b class="op-node-title">Stock Entry</b></article>
            <span class="operation-rail operation-rail--stock-export" aria-hidden="true"><span class="operation-rail-stream-3"></span></span>
            <article class="operation-node operation-node--export" role="listitem"><img src="{b64_data['export']}" alt="Cold Store / Export" class="op-thumb-img-large"><b class="op-node-title">Cold Store / Export</b></article>
            <span class="operation-transfer" aria-hidden="true"><i class="fa-solid fa-microchip"></i><span></span><span></span></span>
          </div>'''

start_tag = '<div class="operations-flow"'
end_tag = '</div>'
start_pos = html.find(start_tag)
if start_pos != -1:
    end_pos = html.find(end_tag, start_pos) + len(end_tag)
    html = html[:start_pos] + new_flow + html[end_pos:]
    template_path.write_text(html, encoding="utf-8")
    print("SUCCESSFULLY INJECTED 9 BASE64 AI IMAGES INTO LOGIN.HTML!")
