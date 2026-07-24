# Jinja → React SPA Migration & Architecture Roadmap

## Executive Summary
BKNR ERP is currently in a hybrid state operating two UI delivery systems:
1. **Legacy Server-Rendered Jinja Templates** (~147 HTML files in `backend/app/templates/`)
2. **Modern React 19 Single Page Application (SPA)** (~130 pages/components in `frontend/src/`)

While the React SPA serves as the canonical user interface (`/app/`), legacy Jinja templates are loaded inside an `BackendConsole` iframe for non-migrated routes. This document outlines the migration roadmap to complete 100% native React coverage and retire legacy Jinja templates.

---

## Current Architecture State

```
                      ┌───────────────────────────────────────────────┐
                      │             User Request (/app/)              │
                      └──────────────────────┬────────────────────────┘
                                             │
                                  React 19 SPA (Vite 8)
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │                                           │
         Native React Component                       Legacy Fallback Route
     (e.g., GateEntry, StockEntry)                   (Loaded via BackendConsole iframe)
                       │                                           │
             FastAPI JSON API                             FastAPI Jinja Template
        (/processing/gate_entry/...)                 (/processing/gate_entry.html)
```

---

## Migration Strategy & Phased Timeline

### Phase 1 — Router & Menu Decoupling (Completed)
- Extracted lazy routing registry to [`frontend/src/routes/routeRegistry.js`](file:///Users/nagaraju/Documents/BKNR_ERP/frontend/src/routes/routeRegistry.js).
- Standardized opaque token resolution (`/p/<token>`) allowing URLs to map directly to React components.
- Standardized brand configuration to **BKNR ERP**.

### Phase 2 — Core Operational & Master Forms Migration (Completed)
- Native React components built for all 31 Criteria/Master Data entities (`Buyers`, `Suppliers`, `Species`, `Grades`, `VehicleNumbers`, `HsnCodes`, etc.).
- Native React components built for core Processing forms (`GateEntry`, `RMP`, `DeHeading`, `Grading`, `Peeling`, `Soaking`, `Production`).
- Native React components built for Inventory operations (`StockEntry`, `PendingOrders`, `ColdStorageHolding`).

### Phase 3 — Finance & Accounts Migration (In Progress)
- Native React components built for double-entry journals, bank transactions, vouchers, receivables, payables, and Tally dashboard.
- **Target**: Port remaining specialized sub-registers (`FixedAssetsPage`, `GstRegisterPage`, `LcTrackingPage`) from iframe rendering to 100% native React views.

### Phase 4 — Jinja Template Retirement & Endpoint Cleanup (Planned)
- Deprecate `/backend/app/templates/` directory once all pages are rendered natively in React.
- Convert remaining template-rendering FastAPI routes (`TemplateResponse`) to pure JSON API endpoints.
- Remove `BackendConsole.jsx` iframe wrapper from `frontend/src/App.jsx`.

---

## Verification & Guidelines for New Feature Development
1. **New UI pages MUST be written exclusively in React** inside `frontend/src/pages/`.
2. All new components must be registered in [`frontend/src/routes/routeRegistry.js`](file:///Users/nagaraju/Documents/BKNR_ERP/frontend/src/routes/routeRegistry.js).
3. Do not create new `.html` files in `backend/app/templates/`.
