from pathlib import Path
import re

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

# 1. Fix PORTAL_ONLY definition at top of <head> script
head_script_old = """  <script>
    function openPortal(panel = 'login') {"""

head_script_new = """  <script>
    let PORTAL_ONLY = false;
    try { PORTAL_ONLY = Boolean(JSON.parse("{{ 'true' if show_login else 'false' }}")); } catch (e) { PORTAL_ONLY = false; }

    function openPortal(panel = 'login') {
      const portal = document.getElementById('portal');
      if (portal) {
        portal.style.display = 'flex';
        portal.style.opacity = '1';
        portal.style.visibility = 'visible';
        portal.style.zIndex = '999999';
        portal.classList.add('is-open');
        document.body.classList.add('portal-open');
      }
      if (typeof showPanel === 'function') showPanel(panel);
    }"""

if head_script_old in text:
    text = text.replace(head_script_old, head_script_new)
    print("SUCCESSFULLY FIXED HEAD OPENPORTAL FUNCTION & PORTAL_ONLY DECLARATION!")

# 2. Replace static SVG chart under "From vehicle gate to cold store and export desk" with 3D Rig Banner Stage
old_chart_container = r'<div class="system-view">[\s\S]*?</div>\s*</div>\s*</div>\s*</div>'

new_3d_stage = """<!-- 3D ERP CONTINUOUS FLOW STAGE UNDER OPERATIONS HEADING -->
          <div class="ops-clean-container" style="margin-top: 24px; margin-bottom: 32px;">
            <div class="erp-rig-banner erp-rig-banner--flow card-3d-tilt" title="SVBK ERP Live Rig Animation" style="height: 440px; border-radius: 20px; border: 1px solid rgba(44, 187, 175, 0.5); overflow: hidden; position: relative; background: #061322;">
              <canvas class="erp-rig-canvas" id="flowRigCanvas"></canvas>
              <div class="erp-rig-overlay" style="position: absolute; top: 16px; left: 18px; z-index: 5;">
                <span class="erp-rig-badge" style="background: rgba(8, 23, 38, 0.9); border: 1px solid rgba(44, 187, 175, 0.5); color: #2CBBAF; padding: 6px 14px; border-radius: 20px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; text-transform: uppercase;">
                  <i class="fa-solid fa-microchip" style="margin-right: 6px;"></i>
                  FACTORY CONTINUOUS FLOW RIG · LIVE 3D ORBIT
                </span>
              </div>
            </div>
          </div>"""

if '<div class="system-view">' in text:
    # Match from <div class="system-view"> to end of system-footer-line
    text = re.sub(r'<div class="system-view">[\s\S]*?</div>\s*</div>\s*</div>', new_3d_stage, text, count=1)
    print("SUCCESSFULLY REPLACED STATIC CHART WITH 3D ORBIT RIG STAGE UNDER OPERATIONS HEADING!")

# 3. Ensure initErpRigAnimationBackend initializes all .erp-rig-canvas elements including #flowRigCanvas
text = text.replace("const canvases = [document.getElementById('global3DBg'), ...document.querySelectorAll('.erp-rig-canvas')].filter(Boolean);", "const canvases = [document.getElementById('global3DBg'), document.getElementById('flowRigCanvas'), ...document.querySelectorAll('.erp-rig-canvas')].filter((c, i, a) => c && a.indexOf(c) === i);")

target_file.write_text(text, encoding="utf-8")
print(f"FIXED NAVIGATION & 3D STAGE IN LOGIN.HTML! Lines: {len(text.splitlines())}, Bytes: {len(text)}")
