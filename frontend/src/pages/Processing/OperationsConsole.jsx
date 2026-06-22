import React, { useEffect, useRef } from 'react';

// ─── OPERATIONS PAGE ROUTE MAP ────────────────────────────────────────────────
// Maps sidebar page keys → backend HTML template routes
// All templates load real live data from the FastAPI backend via Jinja2.
const OPERATIONS_ROUTE_MAP = {
  gate_entry:              '/processing/gate_entry',
  raw_material_purchasing: '/processing/raw_material_purchasing',
  de_heading:              '/processing/de_heading',
  grading:                 '/processing/grading',
  peeling:                 '/processing/peeling',
  soaking:                 '/processing/soaking',
  production:              '/processing/production',
};

export default function OperationsConsole({ activePage, theme }) {
  const iframeRef = useRef(null);

  const getIframeUrl = (page) => {
    return OPERATIONS_ROUTE_MAP[page] || `/processing/${page}`;
  };

  const iframeUrl = getIframeUrl(activePage);

  // Push parent theme into iframe after load
  const syncThemeToIframe = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      if (doc.documentElement) doc.documentElement.setAttribute('data-theme', theme);
      if (doc.body) doc.body.setAttribute('data-theme', theme);
    } catch (e) {
      // Cross-origin safety — silently ignore
    }
  };

  useEffect(() => {
    syncThemeToIframe();
  }, [theme, activePage]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
    }}>
      <iframe
        key={activePage}
        ref={iframeRef}
        src={iframeUrl}
        onLoad={syncThemeToIframe}
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
        title={activePage}
      />
    </div>
  );
}
