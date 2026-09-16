import { useEffect, useRef } from 'react';

export default function ErpRigAnimation() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Handle canvas resizing
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas);

    // Object store for spline bridge
    const objects = {};
    const getObj = (id) => {
      if (!objects[id]) {
        objects[id] = {
          id,
          position: { x: 0, y: 300, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        };
      }
      return objects[id];
    };

    // Spline Bridge implementation
    const splineBridge = {
      ready: Promise.resolve(true),
      findObjectByName: async (name) => {
        getObj(name);
        return { id: name, name };
      },
      updateObject: (id, props) => {
        const obj = getObj(id);
        if (props.position) Object.assign(obj.position, props.position);
        if (props.rotation) Object.assign(obj.rotation, props.rotation);
        if (props.scale) Object.assign(obj.scale, props.scale);
      }
    };

    // Attach to window.spline so user script accesses it smoothly
    window.spline = splineBridge;

    const moduleLabels = [
      { code: 'M1', title: 'Gate Entry', icon: '🚪' },
      { code: 'M2', title: 'RM Purchase', icon: '📦' },
      { code: 'M3', title: 'De-Heading', icon: '✂️' },
      { code: 'M4', title: 'Grading', icon: '📊' },
      { code: 'M5', title: 'Peeling', icon: '🧼' },
      { code: 'M6', title: 'Cold Store', icon: '❄️' }
    ];

    // Execute User's Provided Animation Script Verbatim
    (async () => {
      await window.spline.ready;

      const clamp01 = (x) => Math.min(1, Math.max(0, x));
      const prog = (t, delay, dur) => clamp01((t - delay) / dur);
      const easeOutBack = (p) => { const c = 1.70158; const q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
      const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

      const R = 560;        // orbit radius
      const BASE_Y = 300;   // module / core height
      const W = 0.12;       // orbit angular speed (rad/s)
      const DEG = 180 / Math.PI;

      // resolve to ids where possible, else drive by name (the bridge accepts both)
      const ref = async (name) => {
        try { const o = await window.spline.findObjectByName(name); return (o && o.id) ? o.id : name; }
        catch { return name; }
      };
      const mods = [], links = [], packets = [];
      for (let i = 1; i <= 6; i++) {
        mods.push(await ref('Module ' + i));
        links.push(await ref('Link ' + i));
        packets.push(await ref('Packet ' + i));
      }
      const core = await ref('Core');
      const ringA = await ref('Core Ring A');
      const ringB = await ref('Core Ring B');
      console.log('ERP rig resolved:', mods.join(' | '));

      const t0 = performance.now();

      (function tick(now) {
        const t = (now - t0) / 1000;

        // core: slow spin + breathing, counter-rotating rings
        const coreIn = easeOutBack(prog(t, 0, 1.1));
        const cs = Math.max(0.001, (1 + Math.sin(t * 1.1) * 0.035) * coreIn);
        window.spline.updateObject(core, {
          rotation: { x: Math.sin(t * 0.35) * 6, y: (t * 12) % 360, z: Math.cos(t * 0.27) * 5 },
          scale: { x: cs, y: cs, z: cs }
        });
        window.spline.updateObject(ringA, { rotation: { x: -90, y: 0, z: (t * 28) % 360 } });
        window.spline.updateObject(ringB, { rotation: { x: -68 + Math.sin(t * 0.4) * 6, y: (-t * 16) % 360, z: 24 } });

        for (let i = 0; i < 6; i++) {
          const a = (i * 60) * Math.PI / 180 + t * W;
          const grow = easeOutBack(prog(t, 0.35 + i * 0.16, 0.9));
          const idle = prog(t, 1.4 + i * 0.16, 1.2);
          const bob = Math.sin(t * (0.55 + i * 0.07) + i * 1.7) * 12 * idle;
          const s = Math.max(0.001, grow);
          window.spline.updateObject(mods[i], {
            position: { x: Math.sin(a) * R, y: BASE_Y + bob, z: Math.cos(a) * R },
            scale: { x: s, y: s, z: s }
          });
          window.spline.updateObject(links[i], { rotation: { x: 0, y: a * DEG, z: 0 } });

          // data packets streaming module -> core
          const cycle = 2.8 + i * 0.22;
          const u = ((t + i * 0.9) % cycle) / cycle;
          const flight = clamp01(u / 0.72);
          const z = 545 - easeOutCubic(flight) * 320;
          const alive = u < 0.78 ? 1 : 0;
          const ps = Math.max(0.001, alive * (0.7 + Math.sin(flight * Math.PI) * 0.7) * easeOutCubic(prog(t, 1.8, 1)));
          window.spline.updateObject(packets[i], { position: { x: 0, y: 0, z: z }, scale: { x: ps, y: ps, z: ps } });
        }
      })(t0);
    })();

    // 3D Visualizer Render Loop
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (!width || !height) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const cx = width / 2;
      const cy = height / 2 + 10;
      const rx = Math.min(width * 0.42, 220);
      const ry = Math.min(height * 0.32, 55);

      // Clear Canvas with cyber gradient background
      ctx.clearRect(0, 0, width, height);

      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.7);
      bgGrad.addColorStop(0, 'rgba(16, 36, 73, 0.6)');
      bgGrad.addColorStop(0.6, 'rgba(9, 24, 51, 0.95)');
      bgGrad.addColorStop(1, 'rgba(4, 10, 24, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw subtle orbital grid / ring behind elements
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(57, 123, 216, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      const coreObj = getObj('Core');
      const ringAObj = getObj('Core Ring A');
      const ringBObj = getObj('Core Ring B');

      // Sort modules by depth (Z position) for accurate 3D layering
      const modItems = [];
      for (let i = 0; i < 6; i++) {
        const modObj = getObj('Module ' + (i + 1));
        const packetObj = getObj('Packet ' + (i + 1));
        const pos = modObj.position;

        // Project 3D orbit (x: sin(a)*560, z: cos(a)*560) to 2D canvas
        const normX = pos.x / 560;
        const normZ = pos.z / 560;
        const px = cx + normX * rx;
        const py = cy + normZ * ry + (pos.y - 300) * 0.35;
        const scaleVal = (0.75 + (normZ + 1) * 0.25) * (modObj.scale.x || 1);

        modItems.push({
          index: i,
          px,
          py,
          normZ,
          scaleVal,
          modObj,
          packetObj,
          label: moduleLabels[i]
        });
      }

      // Sort back-to-front (lowest normZ rendered first)
      modItems.sort((a, b) => a.normZ - b.normZ);

      // Render back items (behind core)
      const renderItem = (item) => {
        // Draw Link ray line from module to central core
        ctx.beginPath();
        ctx.moveTo(item.px, item.py);
        ctx.lineTo(cx, cy);
        const lineGrad = ctx.createLinearGradient(item.px, item.py, cx, cy);
        lineGrad.addColorStop(0, 'rgba(57, 123, 216, 0.6)');
        lineGrad.addColorStop(0.5, 'rgba(96, 165, 250, 0.8)');
        lineGrad.addColorStop(1, 'rgba(217, 119, 6, 0.6)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = Math.max(1, 1.8 * item.scaleVal);
        ctx.stroke();

        // Draw Data Packet along the link line
        const pScale = item.packetObj.scale.x || 0.001;
        if (pScale > 0.05) {
          // Packet position z goes from 545 down towards 225
          const zVal = item.packetObj.position.z;
          const flightRatio = Math.min(1, Math.max(0, (545 - zVal) / 320));
          const packetX = item.px + (cx - item.px) * flightRatio;
          const packetY = item.py + (cy - item.py) * flightRatio;

          ctx.beginPath();
          ctx.arc(packetX, packetY, Math.max(2, 5 * pScale), 0, Math.PI * 2);
          ctx.fillStyle = '#fbbf24';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 12 * pScale;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Draw Module Card / Node
        ctx.save();
        ctx.translate(item.px, item.py);
        ctx.scale(item.scaleVal, item.scaleVal);

        // Glass card pill shape
        const cardW = 92;
        const cardH = 34;
        const cornerR = 8;

        ctx.beginPath();
        ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, cornerR);
        ctx.fillStyle = 'rgba(10, 24, 51, 0.88)';
        ctx.shadowColor = 'rgba(57, 123, 216, 0.35)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon & Text
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label.icon, -cardW / 2 + 8, 0);

        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(item.label.title, -cardW / 2 + 28, 0);

        ctx.restore();
      };

      // 1. Render modules with normZ < -0.2 (behind core)
      modItems.filter(m => m.normZ < -0.2).forEach(renderItem);

      // 2. Render Core & Counter-rotating Rings
      ctx.save();
      ctx.translate(cx, cy);

      const coreScale = coreObj.scale.x || 1;
      const rotZ_A = (ringAObj.rotation.z || 0) * Math.PI / 180;
      const rotZ_B = (ringBObj.rotation.z || 0) * Math.PI / 180;

      // Ring A (Cyan Outer Ring)
      ctx.save();
      ctx.rotate(rotZ_A);
      ctx.beginPath();
      ctx.ellipse(0, 0, 48 * coreScale, 18 * coreScale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Ring B (Golden Counter-Rotating Tilted Ring)
      ctx.save();
      ctx.rotate(rotZ_B + Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, 54 * coreScale, 16 * coreScale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Core Outer Glow Aura
      const auraGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 42 * coreScale);
      auraGrad.addColorStop(0, 'rgba(96, 165, 250, 0.9)');
      auraGrad.addColorStop(0.5, 'rgba(57, 123, 216, 0.5)');
      auraGrad.addColorStop(1, 'rgba(16, 36, 73, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, 42 * coreScale, 0, Math.PI * 2);
      ctx.fillStyle = auraGrad;
      ctx.fill();

      // Core Solid Orb
      const coreGrad = ctx.createRadialGradient(-6 * coreScale, -6 * coreScale, 2, 0, 0, 24 * coreScale);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.3, '#60a5fa');
      coreGrad.addColorStop(0.7, '#2563eb');
      coreGrad.addColorStop(1, '#1e3a8a');
      ctx.beginPath();
      ctx.arc(0, 0, 24 * coreScale, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 18 * coreScale;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Core Text Emblem
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ERP CORE', 0, 0);

      ctx.restore();

      // 3. Render modules in front of core (normZ >= -0.2)
      modItems.filter(m => m.normZ >= -0.2).forEach(renderItem);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="erp-rig-banner" title="SVBK ERP Live Rig Animation">
      <canvas ref={canvasRef} className="erp-rig-canvas" />
      <div className="erp-rig-overlay">
        <span className="erp-rig-badge">
          <i className="fa-solid fa-microchip" style={{ marginRight: '6px' }}></i>
          ERP DIGITAL TWIN RIG
        </span>
      </div>
    </div>
  );
}
