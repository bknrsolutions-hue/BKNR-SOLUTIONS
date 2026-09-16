from pathlib import Path

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

# 1. Remove top hero animation banner block (.erp-rig-banner--landing)
top_hero_banner = """          <div class="erp-rig-banner erp-rig-banner--landing" title="SVBK ERP Live Rig Animation">
            <canvas id="erp-rig-canvas-landing" class="erp-rig-canvas"></canvas>
            <div class="erp-rig-overlay">
              <span class="erp-rig-badge">
                <i class="fa-solid fa-microchip" style="margin-right: 6px;"></i>
                ERP DIGITAL TWIN RIG
              </span>
            </div>
          </div>"""

if top_hero_banner in text:
    text = text.replace(top_hero_banner, "")
    print("SUCCESSFULLY REMOVED TOP HERO ANIMATION BANNER!")
else:
    print("WARNING: Exact top_hero_banner string not found, using regex fallback")
    import re
    text = re.sub(r'<div class="erp-rig-banner erp-rig-banner--landing"[\s\S]*?</div>\s*</div>', '', text)

# 2. Upgrade CSS height and backdrop for .erp-rig-banner--flow
old_flow_css = ".erp-rig-banner--flow {\n      height: 380px;"
new_flow_css = ".erp-rig-banner--flow {\n      height: 480px;\n      background: radial-gradient(1200px at 50% 30%, rgba(14, 156, 147, 0.22), #061322);\n      border: 1px solid rgba(44, 187, 175, 0.6);\n      box-shadow: 0 25px 65px rgba(2, 10, 24, 0.7);"

if old_flow_css in text:
    text = text.replace(old_flow_css, new_flow_css)

# 3. Upgrade render function in JS to make lower animation ultra-premium Spline 3D
old_render_block = """          const cx = width / 2;
          const cy = height / 2 + 10;
          const rx = Math.min(width * 0.42, 220);
          const ry = Math.min(height * 0.32, 55);

          ctx.clearRect(0, 0, width, height);

          const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.7);
          bgGrad.addColorStop(0, 'rgba(16, 36, 73, 0.6)');
          bgGrad.addColorStop(0.6, 'rgba(9, 24, 51, 0.95)');
          bgGrad.addColorStop(1, 'rgba(4, 10, 24, 0.98)');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(57, 123, 216, 0.18)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 6]);
          ctx.stroke();
          ctx.setLineDash([]);"""

new_render_block = """          const cx = width / 2;
          const cy = height / 2 + 8;
          const rx = Math.min(width * 0.44, 280);
          const ry = Math.min(height * 0.36, 72);

          ctx.clearRect(0, 0, width, height);

          // Deep Cyber Spline 3D Radial Stage Background
          const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.75);
          bgGrad.addColorStop(0, 'rgba(18, 44, 76, 0.8)');
          bgGrad.addColorStop(0.5, 'rgba(8, 23, 38, 0.96)');
          bgGrad.addColorStop(1, 'rgba(4, 11, 20, 0.99)');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Glowing Outer Spline Orbit Track 1
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(44, 187, 175, 0.45)';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#2CBBAF';
          ctx.shadowBlur = 16;
          ctx.stroke();

          // Counter-rotating Inner Spline Track 2
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * 0.58, ry * 0.58, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(232, 98, 61, 0.35)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([8, 10]);
          ctx.shadowColor = '#E8623D';
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();"""

if old_render_block in text:
    text = text.replace(old_render_block, new_render_block)
    print("SUCCESSFULLY UPGRADED LOWER ANIMATION TO ULTRA-PREMIUM SPLINE 3D RENDERER!")
else:
    print("WARNING: Exact old_render_block string not found, trying partial replace")

# 4. Enhance 3D node pill rendering in modItems loop
old_pill_render = """            ctx.beginPath();
            ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
            ctx.fillStyle = 'rgba(10, 31, 51, 0.9)';
            ctx.fill();
            ctx.strokeStyle = '#2CBBAF';
            ctx.lineWidth = 1.2;
            ctx.stroke();"""

new_pill_render = """            ctx.beginPath();
            ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8);
            ctx.fillStyle = 'rgba(8, 23, 38, 0.95)';
            ctx.shadowColor = 'rgba(44, 187, 175, 0.6)';
            ctx.shadowBlur = 16;
            ctx.fill();
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = 'rgba(44, 187, 175, 0.85)';
            ctx.stroke();
            ctx.shadowBlur = 0;"""

if old_pill_render in text:
    text = text.replace(old_pill_render, new_pill_render)
    print("SUCCESSFULLY UPGRADED 3D NODE CARDS WITH SPLINE GLASSMORPHISM!")

target_file.write_text(text, encoding="utf-8")
print(f"DONE! login.html lines: {len(text.splitlines())}, bytes: {len(text)}")
