from pathlib import Path

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

# 1. Add CSS for #global3DBg
bg_css = """
  /* FULL-SCREEN DYNAMIC 3D SPLINE BACKGROUND CANVAS */
  #global3DBg {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 0;
    pointer-events: none;
    opacity: 0.88;
  }
"""

if "#global3DBg {" not in text:
    text = text.replace("</style>", bg_css + "\n</style>")

# 2. Add <canvas id="global3DBg"></canvas> right after <body>
if '<canvas id="global3DBg"></canvas>' not in text:
    text = text.replace("<body>", "<body>\n  <!-- FULL-SCREEN 3D SPLINE BACKGROUND -->\n  <canvas id=\"global3DBg\"></canvas>")

# 3. Update initErpRigAnimationBackend to include global3DBg canvas
old_canvas_query = "const canvases = [...document.querySelectorAll('.erp-rig-canvas')];"
new_canvas_query = "const canvases = [document.getElementById('global3DBg'), ...document.querySelectorAll('.erp-rig-canvas')].filter(Boolean);"

if old_canvas_query in text:
    text = text.replace(old_canvas_query, new_canvas_query)

# 4. Make rx and ry scale dynamically for full-screen viewport on global3DBg
old_rx_ry = """          const cx = width / 2;
          const cy = height / 2 + 8;
          const rx = Math.min(width * 0.45, 270);
          const ry = Math.min(height * 0.35, 68);"""

new_rx_ry = """          const isFullBg = canvas.id === 'global3DBg';
          const cx = width / 2;
          const cy = height / 2 + (isFullBg ? 0 : 8);
          const rx = isFullBg ? Math.min(width * 0.46, 560) : Math.min(width * 0.45, 270);
          const ry = isFullBg ? Math.min(height * 0.38, 220) : Math.min(height * 0.35, 68);"""

if old_rx_ry in text:
    text = text.replace(old_rx_ry, new_rx_ry)

target_file.write_text(text, encoding="utf-8")
print(f"SUCCESSFULLY SET FULL SCREEN 3D SPLINE BACKGROUND IN LOGIN.HTML! ({len(text)} bytes)")
