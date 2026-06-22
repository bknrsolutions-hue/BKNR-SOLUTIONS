import React, { useEffect, useRef } from 'react';

// ─── COMPLETE CRITERIA / MASTER PAGE ROUTE MAP ───────────────────────────────
// Maps sidebar page keys → backend HTML template routes
// All templates live at /criteria/<name> and load their own CSS via /static/css/
// The /static proxy in vite.config.js ensures CSS loads in dev mode.
const CRITERIA_ROUTE_MAP = {
  // ── Buyer & Supplier ──────────────────────────────────────────
  criteria_buyers:              '/criteria/buyers',
  criteria_buyer_agents:        '/criteria/buyer_agents',
  criteria_suppliers:           '/criteria/suppliers',
  criteria_vendors:             '/criteria/vendors',
  criteria_shipping_vendors:    '/criteria/shipping_vendors',
  criteria_contractors:         '/criteria/contractors',

  // ── Product / Shrimp Classification ───────────────────────────
  criteria_species:             '/criteria/species',
  criteria_varieties:           '/criteria/varieties',
  criteria_grades:              '/criteria/grades',
  criteria_brands:              '/criteria/brands',
  criteria_packing_styles:      '/criteria/packing_styles',
  criteria_glazes:              '/criteria/glazes',
  criteria_hoso_hlso:           '/criteria/hoso_hlso',
  criteria_grade_to_hoso:       '/criteria/grade_to_hoso',

  // ── Production Configuration ───────────────────────────────────
  criteria_production_types:    '/criteria/production_types',
  criteria_production_at:       '/criteria/production_at',
  criteria_production_for:      '/criteria/production_for',
  criteria_peeling_at:          '/criteria/peeling_at',
  criteria_peeling_rates:       '/criteria/peeling_rates',
  criteria_purposes:            '/criteria/purposes',

  // ── Chemicals & Cold Storage ───────────────────────────────────
  criteria_chemicals:           '/criteria/chemicals',
  criteria_freezers:            '/criteria/freezers',
  criteria_coldstore_locations: '/criteria/coldstore_locations',

  // ── Locations & Reference ──────────────────────────────────────
  criteria_purchasing_locations: '/criteria/purchasing_locations',
  criteria_countries:           '/criteria/countries',
  criteria_vehicle_numbers:     '/criteria/vehicle_numbers',
  criteria_hsn_codes:           '/criteria/hsn_codes',

  // ── Inventory Pages (proxied via iframe too) ───────────────────
  stock_entry:             '/inventory/stock_entry',
  pending_orders:          '/inventory/pending_orders',
  cold_storage_holding:    '/inventory/inventory_report',
  general_stock_entry:     '/general_stock/entry',
  general_store_entry:     '/general_stock/items',
};

export default function CriteriaConsole({ activePage, theme }) {
  const iframeRef = useRef(null);

  // Resolve URL from map, fallback to pattern-based derivation
  const getIframeUrl = (page) => {
    if (CRITERIA_ROUTE_MAP[page]) return CRITERIA_ROUTE_MAP[page];
    // Fallback: strip prefix
    const tab = page.replace('criteria_', '');
    return `/criteria/${tab}`;
  };

  const iframeUrl = getIframeUrl(activePage);

  // Push parent theme into iframe document after load
  const syncThemeToIframe = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      if (doc.documentElement) doc.documentElement.setAttribute('data-theme', theme);
      if (doc.body) doc.body.setAttribute('data-theme', theme);
    } catch (e) {
      // Cross-origin safety – silently ignore
    }
  };

  // Re-sync whenever theme or page changes
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
