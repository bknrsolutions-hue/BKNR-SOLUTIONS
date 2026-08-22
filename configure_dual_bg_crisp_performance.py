from pathlib import Path

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

# 1. Remove all backdrop-filter: blur(...) to satisfy "blur avvaradu" (crisp sharp visual rendering)
text = text.replace("backdrop-filter: blur(14px) !important;", "/* crisp sharp */")
text = text.replace("backdrop-filter: blur(12px) !important;", "/* crisp sharp */")
text = text.replace("backdrop-filter: blur(10px) !important;", "/* crisp sharp */")
text = text.replace("backdrop-filter: blur(16px) !important;", "/* crisp sharp */")
text = text.replace("backdrop-filter: blur(24px) !important;", "/* crisp sharp */")
text = text.replace("backdrop-filter: blur(8px);", "/* crisp sharp */")
text = text.replace("backdrop-filter: blur(10px);", "/* crisp sharp */")

# 2. Add ultra-smooth button performance and crisp high-contrast styling in CSS
crisp_perf_css = """
  /* CRISP HIGH-CONTRAST NO-BLUR & ULTRA-SMOOTH BUTTON PERFORMANCE STYLING */
  body, html {
    background: #040B14 !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .btn, .portal-primary, .role-tab, .sd-close, button {
    transform: translateZ(0);
    backface-visibility: hidden;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease !important;
  }
  .btn:hover, .portal-primary:hover {
    transform: translateY(-2px) translateZ(0) !important;
  }
  .btn:active, .portal-primary:active {
    transform: translateY(0) translateZ(0) !important;
  }
  .portal-shell {
    background: #081726 !important;
    border: 1px solid rgba(44, 187, 175, 0.5) !important;
    box-shadow: 0 35px 90px rgba(0, 0, 0, 0.85) !important;
  }
"""

if "/* CRISP HIGH-CONTRAST NO-BLUR & ULTRA-SMOOTH BUTTON PERFORMANCE STYLING */" not in text:
    text = text.replace("</style>", crisp_perf_css + "\n</style>")

# 3. Update Canvas Render Loop to differentiate Landing Page vs Login Page 3D background rendering
old_render_items_call = """          modItems.sort((a, b) => a.normZ - b.normZ);

          const renderItem = (item) => {"""

new_render_items_call = """          modItems.sort((a, b) => a.normZ - b.normZ);

          // Check whether Login Modal Portal is active or standalone login route
          const portalEl = document.getElementById('portal');
          const isLoginActive = PORTAL_ONLY || (portalEl && (portalEl.classList.contains('is-open') || portalEl.style.display === 'flex'));

          // Draw 12 Floating 3D Spline Module Pills & Energy Beams ONLY for Login Page or Section Canvas
          const shouldDraw3DModules = isLoginActive || !isFullBg;

          const renderItem = (item) => {
            if (!shouldDraw3DModules) return;"""

if old_render_items_call in text:
    text = text.replace(old_render_items_call, new_render_items_call)
    print("SUCCESSFULLY SEPARATED LANDING VS LOGIN 3D BACKGROUND RENDERING!")

# 4. Check core drawing block and wrap with shouldDraw3DModules check
old_core_draw = """        // Draw Center Core
        ctx.save();
        ctx.translate(cx, cy);"""

new_core_draw = """        // Draw Center Core only when 3D modules are active
        const portalCheck = document.getElementById('portal');
        const isPortalActive = PORTAL_ONLY || (portalCheck && (portalCheck.classList.contains('is-open') || portalCheck.style.display === 'flex'));
        if (isPortalActive || !isFullBg) {
          ctx.save();
          ctx.translate(cx, cy);"""

if old_core_draw in text:
    text = text.replace(old_core_draw, new_core_draw)
    # Also add closing bracket for core draw if replaced
    text = text.replace("ctx.fillText('CORE', 0, 0);\n        ctx.restore();", "ctx.fillText('CORE', 0, 0);\n        ctx.restore();\n        }")

target_file.write_text(text, encoding="utf-8")
print(f"COMPLETED CRISP NO-BLUR DUAL BACKGROUND & PERFORMANCE UPGRADE! ({len(text)} bytes)")
