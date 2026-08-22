import re
from pathlib import Path

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

# 1. Remove the top hero 3D banner block from Hero section
hero_banner_pattern = r'<!-- HERO 3D ERP RIG STAGE -->\s*<div class="erp-rig-banner erp-rig-banner--hero"[\s\S]*?</div>\s*</div>'
text = re.sub(hero_banner_pattern, '</div>', text)

# Alternative regex if comment is slightly different
hero_banner_pattern_alt = r'<div class="erp-rig-banner erp-rig-banner--hero"[\s\S]*?</div>\s*</div>'
text = re.sub(hero_banner_pattern_alt, '', text)

# 2. Upgrade the flow animation renderer function inside initSpline3DErpRigEngine / initErpRigAnimationBackend
# Update flow canvas stage height and styling
text = text.replace('.erp-rig-banner--flow {\n    height: 380px;', '.erp-rig-banner--flow {\n    height: 440px;')

# Upgrade renderStage flow visual renderer into ultra-premium Spline 3D stage
old_flow_renderer = """        if (type === 'flow') {
          // Continuous Factory Pipeline 3D Stage
          ctx.beginPath();
          ctx.moveTo(30, cy);
          ctx.lineTo(w - 30, cy);
          ctx.strokeStyle = 'rgba(44, 187, 175, 0.25)';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Stream data packets across 9 factory stages
          const now = performance.now() / 1000;
          for (let st = 0; st < 9; st++) {
            const sx = 40 + st * ((w - 80) / 8);
            const sy = cy + Math.sin(now * 2 + st) * 6;
            ctx.beginPath();
            ctx.arc(sx, sy, 12, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(10, 31, 51, 0.9)';
            ctx.fill();
            ctx.strokeStyle = st % 2 === 0 ? '#2CBBAF' : '#E8623D';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = 'bold 9px IBM Plex Mono, monospace';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('0' + (st + 1), sx, sy);
          }
        }"""

new_flow_renderer = """        if (type === 'flow') {
          // ULTRA-PREMIUM 3D SPLINE DIGITAL TWIN FLOW STAGE
          const rx = Math.min(w * 0.44, 260);
          const ry = Math.min(h * 0.36, 68);

          // Outer glowing 3D orbit ring
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(44, 187, 175, 0.35)';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#2CBBAF';
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Inner counter-orbit ring
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(232, 98, 61, 0.28)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          const modItems = [];
          for (let i = 0; i < 12; i++) {
            const modObj = getObj('Module ' + (i + 1));
            const packetObj = getObj('Packet ' + (i + 1));
            const pos = modObj.position;
            const normX = pos.x / 560;
            const normZ = pos.z / 560;
            const px = cx + normX * rx;
            const py = cy + normZ * ry + (pos.y - 300) * 0.35;
            const scaleVal = (0.75 + (normZ + 1) * 0.25) * (modObj.scale.x || 1);

            modItems.push({ index: i, px, py, normZ, scaleVal, modObj, packetObj, label: moduleLabels[i] });
          }

          modItems.sort((a, b) => a.normZ - b.normZ);

          modItems.forEach(item => {
            // Glowing energy laser beams
            ctx.beginPath();
            ctx.moveTo(item.px, item.py);
            ctx.lineTo(cx, cy);
            const beamGrad = ctx.createLinearGradient(item.px, item.py, cx, cy);
            beamGrad.addColorStop(0, 'rgba(44, 187, 175, 0.8)');
            beamGrad.addColorStop(0.5, 'rgba(96, 165, 250, 0.9)');
            beamGrad.addColorStop(1, 'rgba(232, 98, 61, 0.8)');
            ctx.strokeStyle = beamGrad;
            ctx.lineWidth = Math.max(1.2, 2.2 * item.scaleVal);
            ctx.shadowColor = '#2CBBAF';
            ctx.shadowBlur = 8 * item.scaleVal;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Streamed data packet particles
            const pScale = item.packetObj.scale.x || 0.001;
            if (pScale > 0.05) {
              const zVal = item.packetObj.position.z;
              const flightRatio = Math.min(1, Math.max(0, (545 - zVal) / 320));
              const packetX = item.px + (cx - item.px) * flightRatio;
              const packetY = item.py + (cy - item.py) * flightRatio;

              ctx.beginPath();
              ctx.arc(packetX, packetY, Math.max(3, 6 * pScale), 0, Math.PI * 2);
              ctx.fillStyle = '#D9A441';
              ctx.shadowColor = '#D9A441';
              ctx.shadowBlur = 14 * pScale;
              ctx.fill();
              ctx.shadowBlur = 0;
            }

            // Glassmorphic 3D Spline Node Pill
            ctx.save();
            ctx.translate(item.px, item.py);
            ctx.scale(item.scaleVal, item.scaleVal);

            const cardW = 108; const cardH = 36; const cornerR = 8;
            ctx.beginPath();
            ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, cornerR);
            ctx.fillStyle = 'rgba(8, 23, 38, 0.94)';
            ctx.shadowColor = 'rgba(44, 187, 175, 0.5)';
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = 'rgba(44, 187, 175, 0.75)';
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.font = '13px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label.icon, -cardW / 2 + 8, 0);

            ctx.font = 'bold 10.5px Inter, system-ui, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(item.label.title, -cardW / 2 + 28, 0);

            ctx.restore();
          });
        }"""

text = text.replace(old_flow_renderer, new_flow_renderer)

target_file.write_text(text, encoding="utf-8")
print(f"REMOVED TOP HERO 3D ANIMATION & UPGRADED FLOW SECTION TO ULTRA-PREMIUM SPLINE 3D! ({len(text)} bytes)")
