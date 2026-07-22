import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { installActionFeedback } from '../utils/actionFeedback';

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
  const actionFeedbackCleanupRef = useRef(null);
  const [filterVersion, setFilterVersion] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);

  // Match menu.html loadPage(): propagate the universal filters to every
  // legacy route that is rendered through the fallback iframe.
  const iframeUrl = useMemo(() => {
    void filterVersion;
    if (!activeRoute) return null;
    const productionFor = localStorage.getItem('production_for_filter') || '';
    const location = localStorage.getItem('plant_location_filter') || '';
    const url = new URL(activeRoute, window.location.origin);
    if (productionFor) url.searchParams.set('production_for', productionFor);
    if (location) {
      url.searchParams.set('location', location);
      url.searchParams.set('peeling_at', location);
      url.searchParams.set('production_at', location);
      url.searchParams.set('receiving_center', location);
      url.searchParams.set('cold_storage_name', location);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }, [activeRoute, filterVersion]);

  const syncTheme = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      if (doc.documentElement) doc.documentElement.setAttribute('data-theme', theme || 'dark');
      if (doc.body)            doc.body.setAttribute('data-theme', theme || 'dark');
      
      if (window.BKNRColorCustomizer) {
        window.BKNRColorCustomizer.applyToFrame(iframe);
      }
    } catch {
      // A frame may be navigating while its document is being replaced.
    }
  }, [theme]);

  useEffect(() => { syncTheme(); }, [syncTheme, activePage]);

  useEffect(() => {
    setFrameLoading(true);
  }, [iframeUrl]);

  useEffect(() => {
    const handleFilterChange = () => setFilterVersion(version => version + 1);
    window.addEventListener('filter_change', handleFilterChange);
    return () => window.removeEventListener('filter_change', handleFilterChange);
  }, []);

  useEffect(() => () => actionFeedbackCleanupRef.current?.(), []);

  const handleFrameLoad = () => {
    syncTheme();
    setFrameLoading(false);
    actionFeedbackCleanupRef.current?.();
    try {
      const frameWindow = iframeRef.current?.contentWindow;
      actionFeedbackCleanupRef.current = frameWindow
        ? installActionFeedback(frameWindow, window)
        : null;
    } catch {
      actionFeedbackCleanupRef.current = null;
    }
  };

  if (!iframeUrl) {
    return <NoRoutePlaceholder page={activePage} />;
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', overflow: 'hidden', position: 'relative',
    }}>
      {frameLoading && (
        <div className="skel-iframe-overlay" role="status" aria-live="polite" aria-label="Loading page">
          <div className="skel-row">
            {[1, 2, 3, 4].map(item => <div className="skel-kpi-card" key={item}><div className="skel-block" /><div className="skel-block" /></div>)}
          </div>
          <div className="skel-table-wrap">
            {[1, 2, 3, 4, 5, 6].map(row => <div className="skel-table-row" key={row}><div className="skel-block" /><div className="skel-block" /><div className="skel-block" /><div className="skel-block" /></div>)}
          </div>
        </div>
      )}
      <iframe
        key={activePage}
        ref={iframeRef}
        src={iframeUrl}
        onLoad={handleFrameLoad}
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
