import React, { useEffect, useRef } from 'react';

// ─── PLACEHOLDER when route is unknown ───────────────────────────────────────
function NoRoutePlaceholder({ page }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 40, textAlign: 'center',
      color: 'var(--text-secondary)',
    }}>
      <div style={{ fontSize: 40, opacity: 0.3 }}>🛠️</div>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
        {page?.replace(/_/g, ' ') || 'Page'} — Under Development
      </div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>
        This ERP module is being configured. Please check back shortly.
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
// Props:
//   activePage  – the page key string (e.g. "gate_entry")
//   activeRoute – the exact backend URL (e.g. "/processing/gate_entry") from sidebar config
//   theme       – "dark" | "light"
export default function BackendConsole({ activePage, activeRoute, theme }) {
  const iframeRef = useRef(null);

  // The URL to load: prefer the explicit route passed from sidebar, else fallback to key-based heuristic
  const iframeUrl = activeRoute || null;

  const syncTheme = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      if (doc.documentElement) doc.documentElement.setAttribute('data-theme', theme || 'dark');
      if (doc.body)            doc.body.setAttribute('data-theme', theme || 'dark');
    } catch (_) {}
  };

  useEffect(() => { syncTheme(); }, [theme, activePage]);

  if (!iframeUrl) {
    return <NoRoutePlaceholder page={activePage} />;
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', overflow: 'hidden',
    }}>
      <iframe
        key={activePage}
        ref={iframeRef}
        src={iframeUrl}
        onLoad={syncTheme}
        style={{
          flex: 1, border: 'none',
          width: '100%', height: '100%',
          background: 'transparent',
        }}
        title={activePage}
      />
    </div>
  );
}
