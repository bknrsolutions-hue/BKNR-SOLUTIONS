import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOKEN_MAP, PAGE_ID_MAP } from './utils/pageTokens';
import './App.css';
import './SapHorizon.css';
import './ErpTables.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AnimatedBrandLogo from './components/AnimatedBrandLogo';
import ApprovalAlertPopup from './components/ApprovalAlertPopup';

let initialSessionRequest;

function isMobileClientEnv() {
  if (typeof window === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  const isWebView = Boolean(window.ReactNativeWebView || window.Capacitor || window.Cordova || ua.includes('wv') || ua.includes('bknr') || ua.includes('expo') || /android.*applewebkit/i.test(ua));
  const isMobileUrl = window.location.search.includes('mobile=true') || window.location.search.includes('is_mobile=true') || window.location.hash.includes('mobile=true');
  // window.isMobileApp is injected by the React Native WebView wrapper at runtime
  return isWebView || isMobileUrl || window.isMobileApp === true;
}

function loadInitialSession() {
  if (!initialSessionRequest) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    const headers = { Accept: 'application/json' };
    if (isMobileClientEnv()) {
      headers['X-Mobile-App'] = 'true';
    }

    initialSessionRequest = fetch('/auth/session-info', {
      credentials: 'include',
      signal: controller.signal,
      headers,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to read session');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Invalid session response');
        return response.json();
      })
      .catch(error => {
        initialSessionRequest = undefined;
        throw error;
      })
      .finally(() => window.clearTimeout(timeoutId));
  }
  return initialSessionRequest;
}

import {
  AuthContainer,
  DashboardsConsole,
  BackendConsole,
  ReportViewer,
  UserProfile,
  AdminConsole,
  SupportTicketDesk,
  RequirementDocumentPage,
  CRITERIA_COMPONENTS,
  REPORT_COMPONENTS,
  COMPACT_PROCESSING_FORM_PAGES,
  COMPACT_INVENTORY_FORM_PAGES,
  isCompactHrmsFormPage,
} from './routes/routeRegistry';


function PageLoading() {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-label="Loading...">
      {/* Header bar skeleton */}
      <div className="skel-header">
        <div className="skel-block" style={{ width: 120, height: 18, borderRadius: 6 }} />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <div className="skel-circle" style={{ width: 32, height: 32 }} />
          <div className="skel-circle" style={{ width: 32, height: 32 }} />
          <div className="skel-circle" style={{ width: 32, height: 32 }} />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="skel-body">
        {/* KPI row */}
        <div className="skel-row">
          {[1,2,3,4].map(i => (
            <div key={i} className="skel-kpi-card">
              <div className="skel-block" style={{ width: 40, height: 10, borderRadius: 4, marginBottom: 10 }} />
              <div className="skel-block" style={{ width: 70, height: 22, borderRadius: 6, marginBottom: 6 }} />
              <div className="skel-block" style={{ width: 50, height: 8, borderRadius: 4 }} />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="skel-table-wrap">
          <div className="skel-block" style={{ width: 160, height: 14, borderRadius: 5, marginBottom: 14 }} />
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="skel-table-row">
              <div className="skel-block" style={{ flex: 2 }} />
              <div className="skel-block" style={{ flex: 3 }} />
              <div className="skel-block" style={{ flex: 2 }} />
              <div className="skel-block" style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme]               = useState(() => localStorage.getItem('theme') || 'light');
  const [user, setUser]                 = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [availableMenuItems, setAvailableMenuItems] = useState([]);
  const [appNotice, setAppNotice]       = useState(null);
  const [supportDrawer, setSupportDrawer] = useState(null);
  const [supportDrawerPosition, setSupportDrawerPosition] = useState(null);
  const [floatingSupportPosition, setFloatingSupportPosition] = useState(null);
  const supportDrawerRef = useRef(null);
  const floatingSupportRef = useRef(null);
  const floatingSupportDragged = useRef(false);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const closeSidebar = event => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        return;
      }
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('#app-sidebar, .mobile-top-menu-btn, .hamburger-trigger-btn')) return;
      setSidebarOpen(false);
    };

    document.addEventListener('pointerdown', closeSidebar);
    document.addEventListener('keydown', closeSidebar);
    return () => {
      document.removeEventListener('pointerdown', closeSidebar);
      document.removeEventListener('keydown', closeSidebar);
    };
  }, [sidebarOpen]);

  // ── Opaque token routing (/p/<token>) with legacy /page/<id> fallback ──────
  // Resolves the current URL to activePage + activeRoute without an API call.
  // Security for backend data remains in the existing FastAPI AuthMiddleware.
  const _rawPath = location.pathname;
  const _isTokenRoute  = _rawPath.startsWith('/p/');
  const _isLegacyRoute = _rawPath.startsWith('/page/');
  const _currentToken  = _isTokenRoute  ? decodeURIComponent(_rawPath.slice('/p/'.length))    : null;
  const _tokenEntry    = _currentToken  ? (TOKEN_MAP[_currentToken] ?? null)                   : null;

  const activePage = _isTokenRoute
    ? (_tokenEntry?.page_id || 'dashboard_processing')
    : _isLegacyRoute
    ? decodeURIComponent(_rawPath.slice('/page/'.length))
    : 'dashboard_processing';

  const activeRoute = _isTokenRoute
    ? (_tokenEntry?.backend ?? null)
    : new URLSearchParams(location.search).get('backend');
  const isEmbedded = new URLSearchParams(location.search).get('embedded') === 'true';
  const compactFormModule = COMPACT_PROCESSING_FORM_PAGES.has(activePage)
    ? 'processing'
    : COMPACT_INVENTORY_FORM_PAGES.has(activePage)
      ? 'inventory'
      : isCompactHrmsFormPage(activePage)
        ? 'hrms'
        : '';
  const mainContentClass = `main-content${compactFormModule ? ` erp-compact-module-forms erp-${compactFormModule}-forms` : ''}`;

  const setActivePage = useCallback((idOrToken, legacyRoute) => {
    // Support drawer pages open in a floating panel — not a full navigation.
    if (idOrToken === 'admin_raise_ticket' || idOrToken === 'admin_helpdesk') {
      setSupportDrawer({
        activePage: idOrToken,
        activeRoute: legacyRoute || (idOrToken === 'admin_helpdesk' ? '/admin/all_tickets' : '/support/my_tickets'),
      });
      setSupportDrawerPosition(null);
      setSidebarOpen(false);
      return;
    }
    // 1. Direct token passed (e.g. from Sidebar item.token)
    if (TOKEN_MAP[idOrToken]) {
      navigate(`/p/${encodeURIComponent(idOrToken)}`);
      return;
    }
    // 2. page_id passed — look up its token for a clean URL
    const tok = PAGE_ID_MAP[idOrToken];
    if (tok) {
      navigate(`/p/${encodeURIComponent(tok)}`);
      return;
    }
    // 3. Legacy fallback (unknown page_id / internal component calls)
    const search = legacyRoute ? `?backend=${encodeURIComponent(legacyRoute)}` : '';
    navigate(`/page/${encodeURIComponent(idOrToken)}${search}`);
  }, [navigate]);

  const dashboardPages = ['dashboard_processing', 'dashboard_inventory', 'dashboard_hr', 'dashboard_costing', 'dashboard_finance'];
  const showBackNavigation = !dashboardPages.includes(activePage);
  const isApplePlatform = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const backShortcutLabel = isApplePlatform ? '⌘ + [' : 'Alt + ←';
  const navigateBack = useCallback(() => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
      return;
    }
    setActivePage('dashboard_processing');
  }, [location.key, navigate, setActivePage]);

  useEffect(() => {
    if (!showBackNavigation) return undefined;
    const handleBackShortcut = event => {
      const isMacShortcut = event.metaKey && (event.key === '[' || event.key === 'ArrowLeft');
      const isStandardShortcut = event.altKey && event.key === 'ArrowLeft';
      if (isMacShortcut || isStandardShortcut) {
        event.preventDefault();
        navigateBack();
      }
    };
    window.addEventListener('keydown', handleBackShortcut);
    return () => window.removeEventListener('keydown', handleBackShortcut);
  }, [navigateBack, showBackNavigation]);

  useEffect(() => {
    if (activePage !== 'admin_raise_ticket' && activePage !== 'admin_helpdesk') return;
    setSupportDrawer({
      activePage,
      activeRoute: activeRoute || (activePage === 'admin_helpdesk' ? '/admin/all_tickets' : '/support/my_tickets'),
    });
    setSupportDrawerPosition(null);
    navigate('/page/dashboard_processing', { replace: true });
  }, [activePage, activeRoute, navigate]);

  useEffect(() => {
    window.BKNRCloseSupportDrawer = () => setSupportDrawer(null);
    return () => {
      delete window.BKNRCloseSupportDrawer;
    };
  }, []);

  useEffect(() => {
    if (!supportDrawer) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setSupportDrawer(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [supportDrawer]);

  const startSupportDrawerDrag = useCallback(event => {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
    const panel = supportDrawerRef.current;
    if (!panel) return;

    const bounds = panel.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;

    const moveDrawer = moveEvent => {
      const maxLeft = Math.max(0, window.innerWidth - bounds.width);
      const maxTop = Math.max(0, window.innerHeight - bounds.height);
      setSupportDrawerPosition({
        left: Math.min(maxLeft, Math.max(0, moveEvent.clientX - offsetX)),
        top: Math.min(maxTop, Math.max(0, moveEvent.clientY - offsetY)),
      });
    };
    const stopDragging = () => {
      document.removeEventListener('pointermove', moveDrawer);
      document.removeEventListener('pointerup', stopDragging);
      document.body.classList.remove('support-drawer-dragging');
    };

    event.preventDefault();
    document.body.classList.add('support-drawer-dragging');
    document.addEventListener('pointermove', moveDrawer);
    document.addEventListener('pointerup', stopDragging);
  }, []);

  const openFloatingSupport = useCallback(() => {
    if (floatingSupportDragged.current) {
      floatingSupportDragged.current = false;
      return;
    }
    if (supportDrawer) return;
    const isDefaultSuperAdmin = user?.email?.trim().toLowerCase() === 'bknr.solutions@gmail.com';
    setActivePage(
      isDefaultSuperAdmin ? 'admin_helpdesk' : 'admin_raise_ticket',
      isDefaultSuperAdmin ? '/admin/all_tickets' : '/support/my_tickets',
    );
  }, [setActivePage, supportDrawer, user?.email]);

  const startFloatingSupportDrag = useCallback(event => {
    if (event.button !== 0) return;
    const launcher = floatingSupportRef.current;
    if (!launcher) return;

    const bounds = launcher.getBoundingClientRect();
    const originX = event.clientX;
    const originY = event.clientY;
    const offsetX = originX - bounds.left;
    const offsetY = originY - bounds.top;
    let moved = false;

    const moveLauncher = moveEvent => {
      if (!moved && Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) < 5) return;
      moved = true;
      floatingSupportDragged.current = true;
      setFloatingSupportPosition({
        left: Math.min(Math.max(0, window.innerWidth - bounds.width), Math.max(0, moveEvent.clientX - offsetX)),
        top: Math.min(Math.max(0, window.innerHeight - bounds.height), Math.max(0, moveEvent.clientY - offsetY)),
      });
    };
    const stopDragging = () => {
      document.removeEventListener('pointermove', moveLauncher);
      document.removeEventListener('pointerup', stopDragging);
      document.body.classList.remove('floating-support-dragging');
      if (moved) window.setTimeout(() => { floatingSupportDragged.current = false; }, 0);
    };

    document.body.classList.add('floating-support-dragging');
    document.addEventListener('pointermove', moveLauncher);
    document.addEventListener('pointerup', stopDragging);
  }, []);

  // Sync theme to <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.applyBKNRUiColors?.();
  }, [theme]);

  useEffect(() => {
    if (!appNotice) return undefined;
    const timeout = window.setTimeout(() => setAppNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [appNotice]);

  useEffect(() => {
    const originalAlert = window.alert.bind(window);
    const successPattern = /success|saved|created|updated|cancelled|completed|registered|recorded|uploaded/i;
    const notify = (message, type = 'success') => setAppNotice({ message: String(message || 'Action completed successfully.'), type });
    const handleApiFeedback = event => {
      const detail = event.detail || {};
      notify(detail.message, detail.type === 'error' ? 'error' : 'success');
    };
    const appAlert = message => {
      if (successPattern.test(String(message || ''))) notify(message, 'success');
      else originalAlert(message);
    };
    window.BKNRNotify = notify;
    window.alert = appAlert;
    window.addEventListener('bknr:api-feedback', handleApiFeedback);
    return () => {
      window.removeEventListener('bknr:api-feedback', handleApiFeedback);
      if (window.alert === appAlert) window.alert = originalAlert;
      if (window.BKNRNotify === notify) delete window.BKNRNotify;
    };
  }, []);

  // Load session on mount
  useEffect(() => {
    let active = true;
    // Some mobile WebViews do not reliably reject a fetch after AbortController
    // fires, especially when a service worker has intercepted the request. Keep
    // the workspace loader bounded independently so the app can always recover.
    const loadingDeadline = window.setTimeout(() => {
      if (active) setLoadingSession(false);
    }, 6000);

    loadInitialSession()
      .then(data => {
        if (!active) return;
        if (data.authenticated) {
          document.documentElement.setAttribute('data-user-email', data.email || '');
          document.documentElement.setAttribute('data-company-code', data.company_code || '');
          window.applyBKNRUiColors?.();
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            mpeda_registration_code: data.mpeda_registration_code,
            company_logo_url: data.company_logo_url,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          localStorage.setItem('tenant_company_name', data.company_name || 'BKNR ERP');

          if (data.company_logo_url) localStorage.setItem('tenant_company_logo', data.company_logo_url);
          else localStorage.removeItem('tenant_company_logo');
          localStorage.setItem('user_email', data.email);
        } else {
          setUser(null);
        }
        return undefined;

      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        window.clearTimeout(loadingDeadline);
        if (active) setLoadingSession(false);
      });

    return () => {
      active = false;
      window.clearTimeout(loadingDeadline);
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      initialSessionRequest = undefined;
      document.documentElement.removeAttribute('data-user-email');
      document.documentElement.removeAttribute('data-company-code');
      localStorage.removeItem('user_email');
      setUser(null);
      setLoadingSession(false);
    };
    window.addEventListener('bknr:session-expired', handleSessionExpired);
    return () => window.removeEventListener('bknr:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let checking = false;
    const checkSession = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch('/auth/session-info', {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const data = await response.clone().json();
          if (!data.authenticated) {
            window.dispatchEvent(new CustomEvent('bknr:session-expired'));
          } else {
            setUser(current => current ? {
              ...current,
              email: data.email,
              name: data.name,
              company: data.company_name,
              company_code: data.company_code,
              company_logo_url: data.company_logo_url,
              role: data.role,
              permissions: data.permissions,
            } : current);
          }
        }
      } catch {
        // A temporary network outage must not log out a valid local session.
      } finally {
        checking = false;
      }
    };
    const interval = window.setInterval(checkSession, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkSession);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkSession);
    };
  }, [user]);

  const toggleTheme = () => setTheme(prev => {
    const next = prev === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    return next;
  });

  const handleLoginSuccess = async () => {
    try {
      const res = await fetch('/auth/session-info', {
        credentials: 'include'
      });
  
      if (res.ok) {
        const data = await res.json();
  
        if (data.authenticated) {
          document.documentElement.setAttribute('data-user-email', data.email || '');
          document.documentElement.setAttribute('data-company-code', data.company_code || '');
          window.applyBKNRUiColors?.();
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            mpeda_registration_code: data.mpeda_registration_code,
            company_logo_url: data.company_logo_url,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          localStorage.setItem('user_email', data.email);
          setActivePage('dashboard_processing', null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout');
    } catch {
      // Local session state is still cleared if the server is unreachable.
    }
    setUser(null);
    navigate('/', { replace: true });
  };

  // ── Page Router ──────────────────────────────────────────────────────────
  const renderActivePage = () => {
    // Dashboards — full React components (no iframe needed)
    if (['dashboard_processing', 'dashboard_inventory', 'dashboard_hr', 'dashboard_costing', 'dashboard_finance'].includes(activePage)) {
      return (
        <DashboardsConsole
          key={activePage}
          activeDashboard={activePage.replace('dashboard_', '')}
          theme={theme}
          setActivePage={setActivePage}
        />
      );
    }

    if (activePage === 'user_profile') {
      return (
        <UserProfile
          key="user_profile"
          onProfileUpdated={profile => setUser(current => current ? {
            ...current,
            name: profile.name,
            email: profile.email,
            designation: profile.designation,
          } : current)}
        />
      );
    }

    if (activePage.startsWith('admin_')) {
      return (
        <AdminConsole
          key={activePage}
          activePage={activePage}
          activeRoute={activeRoute}
          user={user}
          theme={theme}
          setActivePage={setActivePage}
        />
      );
    }

    // Direct React Criteria / Masters / Operations pages
    if (CRITERIA_COMPONENTS[activePage]) {
      const Component = CRITERIA_COMPONENTS[activePage];
      return (
        <Component
          key={activePage}
          user={user}
          theme={theme}
          setActivePage={setActivePage}
          activeRoute={activeRoute}
        />
      );
    }

    if (activePage.startsWith('export_requirement_') && activePage !== 'export_requirement_forms') {
      return (
        <RequirementDocumentPage
          key={activePage}
          documentKind={activePage.slice('export_requirement_'.length)}
        />
      );
    }

    // Custom React Reports
    if (REPORT_COMPONENTS[activePage]) {
      const Component = REPORT_COMPONENTS[activePage];
      return (
        <Component
          key={activePage}
          activeRoute={activeRoute}
          user={user}
          theme={theme}
        />
      );
    }

    // Fallback React Report Viewer (for compound dashboards/summaries)
    if (activePage.startsWith('report_')) {
      return (
        <ReportViewer
          key={activePage}
          reportId={activePage}
          activeRoute={activeRoute}
          user={user}
          theme={theme}
        />
      );
    }

    // Every other page — iframe loads the real backend HTML template
    // activeRoute comes directly from the sidebar's item.route field
    return (
      <BackendConsole
        key={activePage}
        activePage={activePage}
        activeRoute={activeRoute}
        theme={theme}
      />
    );
  };

  // ── Loading screen ───────────────────────────────────────────────────────
  if (loadingSession) {
    return <PageLoading />;
  }

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <Suspense fallback={<PageLoading />}>
        <AuthContainer handleLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  const noticePopup = appNotice && (
    <div className={`app-success-popup ${appNotice.type === 'error' ? 'error' : 'success'}`} role="status" aria-live="polite">
      <span className="app-success-popup-icon" aria-hidden="true">{appNotice.type === 'error' ? '!' : '✓'}</span>
      <span>{appNotice.message}</span>
      <button type="button" onClick={() => setAppNotice(null)} aria-label="Close notification">×</button>
    </div>
  );

  if (isEmbedded) {
    return (
      <div className="embedded-app-shell">
        <main className={`embedded-app-content${compactFormModule ? ` erp-compact-module-forms erp-${compactFormModule}-forms` : ''}`}>
          <Suspense fallback={<PageLoading />}>
            {renderActivePage()}
          </Suspense>
        </main>
        <ApprovalAlertPopup />
        {noticePopup}
      </div>
    );
  }

  // ── Main ERP Layout ──────────────────────────────────────────────────────
  return (
    <React.Fragment>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        user={user}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onMenuItemsReady={setAvailableMenuItems}
      />

      <div className={`app-container ${showBackNavigation ? 'has-back-navigation' : ''}`}>
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          user={user}
          handleLogout={handleLogout}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          setActivePage={setActivePage}
          availableMenuItems={availableMenuItems}
        />

        {showBackNavigation && (
          <nav className="app-back-strip" aria-label="Page navigation">
            <button type="button" onClick={navigateBack} title={`Back (${backShortcutLabel})`} aria-label="Go back">
              <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
            </button>
          </nav>
        )}

        <main className={mainContentClass}>
          <Suspense fallback={<PageLoading />}>
            {renderActivePage()}
          </Suspense>
        </main>
      </div>
      <ApprovalAlertPopup />
      {supportDrawer && (
        <div className="react-support-drawer" aria-label="Support and helpdesk">
          <aside
            ref={supportDrawerRef}
            className="react-support-drawer-panel"
            role="dialog"
            aria-modal="false"
            style={supportDrawerPosition ? {
              left: supportDrawerPosition.left,
              top: supportDrawerPosition.top,
              right: 'auto',
            } : undefined}
          >
            <div className="react-support-drawer-head" onPointerDown={startSupportDrawerDrag}>
              <div>
                <span>BKNR ERP</span>

                <strong>{supportDrawer.activePage === 'admin_helpdesk' ? 'Helpdesk' : 'Support'}</strong>
              </div>
              <button
                type="button"
                onClick={() => setSupportDrawer(null)}
                title="Close Support"
                aria-label="Close Support"
              >
                <i className="fa-solid fa-support-agent" aria-hidden="true" />
              </button>
            </div>
            <div className="react-support-drawer-content">
              <Suspense fallback={<PageLoading />}>
                <SupportTicketDesk
                  activePage={supportDrawer.activePage}
                  activeRoute={supportDrawer.activeRoute}
                  compact
                  onClose={() => setSupportDrawer(null)}
                />
              </Suspense>
            </div>
            <span className="react-support-resize-hint" aria-hidden="true">
              <i className="fa-solid fa-up-right-and-down-left-from-center" />
            </span>
          </aside>
        </div>
      )}
      <button
        ref={floatingSupportRef}
        type="button"
        className={`floating-support-launcher ${supportDrawer ? 'active' : ''}`}
        onClick={openFloatingSupport}
        onPointerDown={startFloatingSupportDrag}
        style={floatingSupportPosition ? {
          left: floatingSupportPosition.left,
          top: floatingSupportPosition.top,
          right: 'auto',
          bottom: 'auto',
        } : undefined}
        title="Open Support"
        aria-label="Open Support"
        aria-pressed={Boolean(supportDrawer)}
      >
        <i className="fa-solid fa-support-agent" aria-hidden="true" />
      </button>
      {noticePopup}
    </React.Fragment>
  );
}
