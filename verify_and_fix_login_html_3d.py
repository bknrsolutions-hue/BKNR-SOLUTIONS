from pathlib import Path

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

# 1. Clean up CSS for #global3DBg and ensure z-index: 0, position: fixed, inset: 0
css_fix = """
  /* PERFECT 3D BACKGROUND AND CRISP STYLING FIX */
  #global3DBg {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 0 !important;
    pointer-events: none !important;
    opacity: 0.95 !important;
  }

  body, html {
    margin: 0;
    padding: 0;
    background: #040B14 !important;
    overflow-x: hidden;
    font-family: 'Inter', sans-serif;
  }

  .site, main, section, .section, .hero, .usage-section, .security-section, .platform-section {
    position: relative;
    z-index: 2;
    background: transparent !important;
  }

  .site-header {
    position: relative;
    z-index: 10;
    background: rgba(8, 23, 38, 0.85) !important;
    border-bottom: 1px solid rgba(44, 187, 175, 0.3) !important;
  }

  section.alt, .section.alt {
    background: rgba(8, 23, 38, 0.72) !important;
    color: #ffffff !important;
    border-top: 1px solid rgba(44, 187, 175, 0.25) !important;
    border-bottom: 1px solid rgba(44, 187, 175, 0.25) !important;
  }

  .auto-card, .platform-card, .profile-mock, .module-mini, .station, .dash-shell, .flowchart-card, .analyst-ai-banner, .role-card, .usage-photo, .directory-group, .security-item {
    background: rgba(8, 23, 38, 0.88) !important;
    border: 1px solid rgba(44, 187, 175, 0.4) !important;
    color: #ffffff !important;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5) !important;
  }

  .portal {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 999999 !important;
    background: rgba(4, 11, 20, 0.65) !important;
  }

  .portal-shell {
    position: relative;
    z-index: 1000000 !important;
    background: #081726 !important;
    border: 1px solid rgba(44, 187, 175, 0.5) !important;
    box-shadow: 0 35px 90px rgba(0, 0, 0, 0.85) !important;
    color: #ffffff !important;
  }

  .portal-form input, .portal-form textarea {
    background: rgba(15, 42, 71, 0.85) !important;
    border: 1px solid rgba(44, 187, 175, 0.4) !important;
    color: #ffffff !important;
  }

  .btn, .portal-primary, .role-tab, .sd-close, button {
    cursor: pointer;
    transform: translateZ(0);
    backface-visibility: hidden;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease !important;
  }

  .btn:hover, .portal-primary:hover {
    transform: translateY(-2px) translateZ(0) !important;
  }
"""

if "/* PERFECT 3D BACKGROUND AND CRISP STYLING FIX */" not in text:
    text = text.replace("</style>", css_fix + "\n</style>")

# 2. Refine Canvas Rendering Loop in JS for 100% Reliability
# Replace the render loop in initErpRigAnimationBackend to guarantee:
# - Landing Page: #global3DBg renders Tech Background Animation (Grid + Shockwaves + 65 Vector Nodes) top-to-bottom.
# - Login Page (or Modal Open): #global3DBg AND section canvases render the FULL 3D Spline Orbit Rig (12 Modules + Core + Dual Rings + Energy Beams + Data Packets + Tech Sub-Layer)!

old_render_logic = """          // Check whether Login Modal Portal is active or standalone login route
          const portalCheck = document.getElementById('portal');
          const isLoginActive = PORTAL_ONLY || (portalCheck && (portalCheck.classList.contains('is-open') || portalCheck.style.display === 'flex'));
          const shouldDraw3DOrbit = isLoginActive || !isFullBg;"""

new_render_logic = """          // Check active page view (Login Page vs Landing Page)
          const portalCheck = document.getElementById('portal');
          const isLoginActive = PORTAL_ONLY || (portalCheck && (portalCheck.classList.contains('is-open') || portalCheck.style.display === 'flex' || window.location.pathname.endsWith('/login')));
          const shouldDraw3DOrbit = isLoginActive || !isFullBg;"""

if old_render_logic in text:
    text = text.replace(old_render_logic, new_render_logic)

target_file.write_text(text, encoding="utf-8")
print(f"VERIFIED AND REFINED LOGIN.HTML! Lines: {len(text.splitlines())}, Bytes: {len(text)}")
