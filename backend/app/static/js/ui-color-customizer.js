(function () {
  let initializedFromDb = false;
  const STORAGE_KEY = "bknr_ui_colors";
  const defaults = {
    accent: "#2563eb",
    sidebar: "#102a43",
    header: "#0b1f3a",
    dashboard: "#f5f6f7"
  };

  const darkDefaults = {
    accent: "#3b82f6",
    sidebar: "#0f172a",
    header: "#060913",
    dashboard: "#0f172a"
  };

  function getThemeMode(root) {
    const node = root || document.documentElement;
    return node.getAttribute("data-theme") || localStorage.getItem("theme") || "light";
  }

  function getDefaults(root) {
    const theme = getThemeMode(root);
    return theme === "dark" ? darkDefaults : defaults;
  }

  function normalizeHex(value, fallback) {
    const clean = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean : fallback;
  }

  function getStorageKey() {
    let email = "";
    let company = "";
    try {
      email = document.documentElement.getAttribute("data-user-email") || "";
      company = document.documentElement.getAttribute("data-company-code") || "";
      if (!email && !company && window.parent && window.parent.document) {
        email = window.parent.document.documentElement.getAttribute("data-user-email") || "";
        company = window.parent.document.documentElement.getAttribute("data-company-code") || "";
      }
    } catch (e) {}
    if (email || company) {
      return `bknr_ui_colors_${company}_${email}`;
    }
    return "bknr_ui_colors";
  }

  function readColors(root) {
    const currentDefaults = getDefaults(root);
    try {
      // 1. Try reading server-provided DB colors from html data-ui-colors attribute first
      if (!initializedFromDb) {
        const htmlColors = document.documentElement.getAttribute("data-ui-colors");
        if (htmlColors && htmlColors.trim()) {
          const parsed = JSON.parse(htmlColors);
          if (parsed && (parsed.accent || parsed.sidebar || parsed.header || parsed.dashboard)) {
            // Write it to localStorage to keep local storage synced
            const key = getStorageKey();
            localStorage.setItem(key, JSON.stringify(parsed));
            initializedFromDb = true;
            return {
              accent: normalizeHex(parsed.accent, currentDefaults.accent),
              sidebar: normalizeHex(parsed.sidebar, currentDefaults.sidebar),
              header: normalizeHex(parsed.header, currentDefaults.header),
              dashboard: normalizeHex(parsed.dashboard, currentDefaults.dashboard)
            };
          }
        }
      }

      // 2. Fallback to namespaced localStorage key
      const key = getStorageKey();
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      return {
        accent: normalizeHex(saved.accent, currentDefaults.accent),
        sidebar: normalizeHex(saved.sidebar, currentDefaults.sidebar),
        header: normalizeHex(saved.header, currentDefaults.header),
        dashboard: normalizeHex(saved.dashboard, currentDefaults.dashboard)
      };
    } catch (e) {
      return { ...currentDefaults };
    }
  }

  function writeColors(colors) {
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(colors));
    document.documentElement.setAttribute("data-ui-colors", JSON.stringify(colors));
    initializedFromDb = true;
  }

  function hasSavedColors() {
    // Check local storage or active data-ui-colors attribute
    const key = getStorageKey();
    if (localStorage.getItem(key)) return true;
    const htmlColors = document.documentElement.getAttribute("data-ui-colors");
    if (htmlColors && htmlColors.trim()) {
      try {
        const parsed = JSON.parse(htmlColors);
        return Boolean(parsed && (parsed.accent || parsed.sidebar || parsed.header || parsed.dashboard));
      } catch (e) {}
    }
    return false;
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex, "#ffffff").slice(1);
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function getReadableTextColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const srgb = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    return luminance > 0.48 ? "#0f172a" : "#ffffff";
  }

  function getMutedTextColor(hex) {
    return getReadableTextColor(hex) === "#ffffff" ? "#cbd5e1" : "#475569";
  }

  function rgbToHex({ r, g, b }) {
    return "#" + [r, g, b].map((value) => {
      const hex = Math.max(0, Math.min(255, Math.round(value))).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  }

  function mixHex(colorA, colorB, weightA) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    const w = Math.max(0, Math.min(1, weightA));
    return rgbToHex({
      r: a.r * w + b.r * (1 - w),
      g: a.g * w + b.g * (1 - w),
      b: a.b * w + b.b * (1 - w)
    });
  }

  function getSidebarDerivedColors(colors) {
    const sidebarText = getReadableTextColor(colors.sidebar);
    const cardBg = mixHex(colors.sidebar, sidebarText, 0.88);
    const hoverBg = mixHex(colors.sidebar, sidebarText, 0.76);
    return {
      sidebarText,
      sidebarMuted: getMutedTextColor(colors.sidebar),
      cardBg,
      cardText: getReadableTextColor(cardBg),
      hoverBg,
      hoverText: getReadableTextColor(hoverBg)
    };
  }

  function getModeAdjustedColors(colors, root) {
    const mode = getThemeMode(root);
    if (mode === "dark") {
      return {
        accent: mixHex(colors.accent, "#93c5fd", 0.82),
        sidebar: mixHex(colors.sidebar, "#020617", 0.34),
        header: mixHex(colors.header, "#020617", 0.34),
        dashboard: mixHex(colors.dashboard, "#020617", 0.26)
      };
    }
    return {
      accent: colors.accent,
      sidebar: mixHex(colors.sidebar, "#ffffff", 0.72),
      header: mixHex(colors.header, "#ffffff", 0.72),
      dashboard: mixHex(colors.dashboard, "#ffffff", 0.46)
    };
  }

  function setCssVars(root, baseColors) {
    const colors = getModeAdjustedColors(baseColors, root);
    const sidebar = getSidebarDerivedColors(colors);
    const headerText = getReadableTextColor(colors.header);
    const dashboardText = getReadableTextColor(colors.dashboard);
    const dashboardMuted = getMutedTextColor(colors.dashboard);
    const panelBg = mixHex(colors.dashboard, dashboardText, getThemeMode(root) === "dark" ? 0.91 : 0.95);
    const elevatedBg = mixHex(colors.dashboard, dashboardText, getThemeMode(root) === "dark" ? 0.84 : 0.90);
    const inputBg = mixHex(colors.dashboard, dashboardText, getThemeMode(root) === "dark" ? 0.88 : 0.97);
    const borderColor = mixHex(colors.dashboard, dashboardText, getThemeMode(root) === "dark" ? 0.76 : 0.84);

    root.style.setProperty("--ui-accent", colors.accent);
    root.style.setProperty("--ui-sidebar-bg", colors.sidebar);
    root.style.setProperty("--ui-header-bg", colors.header);
    root.style.setProperty("--ui-dashboard-bg", colors.dashboard);
    root.style.setProperty("--ui-sidebar-text", sidebar.sidebarText);
    root.style.setProperty("--ui-sidebar-muted", sidebar.sidebarMuted);
    root.style.setProperty("--ui-sidebar-card-bg", sidebar.cardBg);
    root.style.setProperty("--ui-sidebar-card-text", sidebar.cardText);
    root.style.setProperty("--ui-sidebar-card-hover-bg", sidebar.hoverBg);
    root.style.setProperty("--ui-sidebar-card-hover-text", sidebar.hoverText);
    root.style.setProperty("--ui-header-text", headerText);
    root.style.setProperty("--ui-header-muted", getMutedTextColor(colors.header));
    root.style.setProperty("--ui-dashboard-text", dashboardText);
    root.style.setProperty("--ui-dashboard-muted", dashboardMuted);

    root.style.setProperty("--corp-dash", colors.accent);
    root.style.setProperty("--corp-primary", colors.accent);
    root.style.setProperty("--erp-accent", colors.accent);
    root.style.setProperty("--corp-ops", colors.accent);
    root.style.setProperty("--corp-fin", colors.accent);
    root.style.setProperty("--corp-rep", colors.accent);
    root.style.setProperty("--corp-hr", colors.accent);
    root.style.setProperty("--accent-blue", colors.accent);
    root.style.setProperty("--primary-accent", colors.accent);
    root.style.setProperty("--accent", colors.accent);

    root.style.setProperty("--bg-app", colors.dashboard);
    root.style.setProperty("--slate-bg", colors.dashboard);
    root.style.setProperty("--surface-panel", panelBg);
    root.style.setProperty("--glass-bg", colors.header);
    root.style.setProperty("--card-bg", panelBg);
    root.style.setProperty("--panel-bg", panelBg);
    root.style.setProperty("--card", panelBg);
    root.style.setProperty("--bg-color", colors.dashboard);
    root.style.setProperty("--header-bg", elevatedBg);
    root.style.setProperty("--th-bg", elevatedBg);
    root.style.setProperty("--input-bg", inputBg);
    root.style.setProperty("--input-border", borderColor);
    root.style.setProperty("--border-light", borderColor);
    root.style.setProperty("--border-color", borderColor);
    root.style.setProperty("--border", borderColor);
    root.style.setProperty("--table-line", borderColor);
    root.style.setProperty("--row-hover", elevatedBg);
    root.style.setProperty("--text-primary", dashboardText);
    root.style.setProperty("--primary-text", dashboardText);
    root.style.setProperty("--text-main", dashboardText);
    root.style.setProperty("--text-secondary", dashboardMuted);
    root.style.setProperty("--secondary-text", dashboardMuted);
    root.style.setProperty("--text-muted", dashboardMuted);
    root.style.setProperty("--text-tertiary", mixHex(dashboardMuted, colors.dashboard, 0.72));
  }

  function applyColors(colors) {
    document.documentElement.setAttribute("data-ui-customizer-active", "true");
    setCssVars(document.documentElement, colors);
  }

  function clearColors() {
    document.documentElement.removeAttribute("data-ui-customizer-active");
    const root = document.documentElement;
    [
      "--ui-accent",
      "--ui-sidebar-bg",
      "--ui-header-bg",
      "--ui-dashboard-bg",
      "--ui-sidebar-text",
      "--ui-sidebar-muted",
      "--ui-sidebar-card-bg",
      "--ui-sidebar-card-text",
      "--ui-sidebar-card-hover-bg",
      "--ui-sidebar-card-hover-text",
      "--ui-header-text",
      "--ui-header-muted",
      "--ui-dashboard-text",
      "--ui-dashboard-muted",
      "--corp-dash",
      "--corp-primary",
      "--erp-accent",
      "--corp-ops",
      "--corp-fin",
      "--corp-rep",
      "--corp-hr",
      "--accent-blue",
      "--primary-accent",
      "--accent",
      "--bg-app",
      "--slate-bg",
      "--surface-panel",
      "--glass-bg",
      "--card-bg",
      "--panel-bg",
      "--card",
      "--bg-color",
      "--header-bg",
      "--th-bg",
      "--input-bg",
      "--input-border",
      "--border-light",
      "--border-color",
      "--border",
      "--table-line",
      "--row-hover",
      "--text-primary",
      "--primary-text",
      "--text-main",
      "--text-secondary",
      "--secondary-text",
      "--text-muted",
      "--text-tertiary"
    ].forEach((key) => root.style.removeProperty(key));
  }

  function updateInputs(colors) {
    ["accent", "sidebar", "header", "dashboard"].forEach((key) => {
      const input = document.getElementById(`uiColor_${key}`);
      if (input) input.value = colors[key];
    });
  }

  function applyColorsToFrame(frame, colors, force) {
    if (!frame) return;
    try {
      const frameDoc = frame.contentDocument || frame.contentWindow.document;
      if (frameDoc && frameDoc.documentElement) {
        if (force || hasSavedColors()) {
          frameDoc.documentElement.setAttribute("data-ui-customizer-active", "true");
          setCssVars(frameDoc.documentElement, colors);
          // Inject customizer stylesheet if not present in the frame
          if (frameDoc.head && !frameDoc.querySelector('link[href*="ui-color-customizer.css"]')) {
            const link = frameDoc.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/static/css/ui-color-customizer.css?v=2.4';
            frameDoc.head.appendChild(link);
          }
        } else {
          frameDoc.documentElement.removeAttribute("data-ui-customizer-active");
          const root = frameDoc.documentElement;
          [
            "--ui-accent",
            "--ui-sidebar-bg",
            "--ui-header-bg",
            "--ui-dashboard-bg",
            "--ui-sidebar-text",
            "--ui-sidebar-muted",
            "--ui-sidebar-card-bg",
            "--ui-sidebar-card-text",
            "--ui-sidebar-card-hover-bg",
            "--ui-sidebar-card-hover-text",
            "--ui-header-text",
            "--ui-header-muted",
            "--ui-dashboard-text",
            "--ui-dashboard-muted",
            "--corp-dash",
            "--corp-primary",
            "--erp-accent",
            "--corp-ops",
            "--corp-fin",
            "--corp-rep",
            "--corp-hr",
            "--accent-blue",
            "--primary-accent",
            "--accent",
            "--bg-app",
            "--slate-bg",
            "--surface-panel",
            "--glass-bg",
            "--card-bg",
            "--panel-bg",
            "--card",
            "--bg-color",
            "--header-bg",
            "--th-bg",
            "--input-bg",
            "--input-border",
            "--border-light",
            "--border-color",
            "--border",
            "--table-line",
            "--row-hover",
            "--text-primary",
            "--primary-text",
            "--text-main",
            "--text-secondary",
            "--secondary-text",
            "--text-muted",
            "--text-tertiary"
          ].forEach((key) => root.style.removeProperty(key));
        }
      }
      if (frame.contentWindow && (force || hasSavedColors())) {
        frame.contentWindow.postMessage({ type: "BKNR_UI_COLORS", colors }, window.location.origin);
      }
    } catch (e) {}
  }

  function applyCurrentColorsToFrame(frame) {
    applyColorsToFrame(frame, readColors(), false);
  }

  window.BKNRColorCustomizer = {
    get defaults() { return getDefaults(); },
    read: readColors,
    apply: applyColors,
    save(colors) {
      const currentDefaults = getDefaults();
      const next = {
        accent: normalizeHex(colors.accent, currentDefaults.accent),
        sidebar: normalizeHex(colors.sidebar, currentDefaults.sidebar),
        header: normalizeHex(colors.header, currentDefaults.header),
        dashboard: normalizeHex(colors.dashboard, currentDefaults.dashboard)
      };
      writeColors(next);
      applyColors(next);
      updateInputs(next);
      applyCurrentColorsToFrame(document.getElementById("frame"));
      applyCurrentColorsToFrame(document.getElementById("complaintsFrame"));

      // Sync colors to backend database
      fetch('/auth/ui-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      }).catch(err => console.error("Failed to save custom colors to database:", err));

      return next;
    },
    reset() {
      localStorage.removeItem(getStorageKey());
      document.documentElement.removeAttribute("data-ui-colors");
      clearColors();
      const currentDefaults = getDefaults();
      updateInputs(currentDefaults);
      applyCurrentColorsToFrame(document.getElementById("frame"));
      applyCurrentColorsToFrame(document.getElementById("complaintsFrame"));

      // Clear custom colors in backend database
      fetch('/auth/ui-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accent: "", sidebar: "", header: "", dashboard: "" })
      }).catch(err => console.error("Failed to clear custom colors in database:", err));

      return { ...currentDefaults };
    },
    applyToFrame: applyCurrentColorsToFrame,
    previewToFrame(frame, colors) {
      applyColorsToFrame(frame, colors, true);
    }
  };

  window.applyBKNRUiColors = function () {
    const colors = readColors();
    if (hasSavedColors()) {
      applyColors(colors);
    } else {
      clearColors();
    }
    updateInputs(colors);
    return colors;
  };

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin && event.origin !== "null") return;
    if (event.data && event.data.type === "BKNR_UI_COLORS" && event.data.colors) {
      applyColors(event.data.colors);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === getStorageKey()) {
      if (hasSavedColors()) applyColors(readColors());
      else clearColors();
    }
  });

  if (hasSavedColors()) {
    applyColors(readColors());
  }
})();
