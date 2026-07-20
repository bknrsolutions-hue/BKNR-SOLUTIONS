import { useState, useEffect, useRef } from 'react';
import AnimatedBrandLogo from './AnimatedBrandLogo';

const DEFAULT_QUICK_ACTION_IDS = [
  'raw_material_purchasing',
  'production',
  'proforma_invoice',
  'commercial_invoice',
  'export_shipment',
  'finance_journal_entry',
];

function readQuickActions(email) {
  try {
    const saved = localStorage.getItem(`quick_actions_${email || 'default'}`);
    return saved === null ? DEFAULT_QUICK_ACTION_IDS : JSON.parse(saved);
  } catch {
    return DEFAULT_QUICK_ACTION_IDS;
  }
}

export default function Header({ toggleTheme, user, handleLogout, setSidebarOpen, setActivePage, availableMenuItems = [] }) {
  const companyName = user?.company || 'SVBK IT Solutions';
  const userName = user?.name || 'Administrator';
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [qaPanelOpen, setQaPanelOpen] = useState(false);
  const [qaSearch, setQaSearch] = useState('');
  const [quickActionIds, setQuickActionIds] = useState(() => readQuickActions(user?.email));
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [entityResults, setEntityResults] = useState([]);
  const [entitySearchLoading, setEntitySearchLoading] = useState(false);
  const [openMasterGroups, setOpenMasterGroups] = useState({ 'Admin & Support': true });
  const [profilePopupOpen, setProfilePopupOpen] = useState(false);
  const [profileDetails, setProfileDetails] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [tenantLogoUrl, setTenantLogoUrl] = useState(user?.company_logo_url || '');
  const [tenantLogoSaving, setTenantLogoSaving] = useState(false);
  const [tenantLogoMessage, setTenantLogoMessage] = useState('');

  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [prodForFilter, setProdForFilter] = useState('');
  const [plantLocFilter, setPlantLocFilter] = useState('');
  const dropdownRef = useRef(null);
  const commandInputRef = useRef(null);
  const tenantLogoInputRef = useRef(null);

  // Customizer States
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [sidebarColor, setSidebarColor] = useState('#102a43');
  const [headerColor, setHeaderColor] = useState('#0b1f3a');
  const [dashboardColor, setDashboardColor] = useState('#f5f6f7');

  const toggleColorCustomizer = () => {
    const nextOpen = !colorOpen;
    if (nextOpen && window.BKNRColorCustomizer) {
      const activeColors = window.BKNRColorCustomizer.read();
      if (activeColors) {
        setAccentColor(activeColors.accent || '#2563eb');
        setSidebarColor(activeColors.sidebar || '#102a43');
        setHeaderColor(activeColors.header || '#0b1f3a');
        setDashboardColor(activeColors.dashboard || '#f5f6f7');
      }
    }
    setColorOpen(nextOpen);
    setDropdownOpen(false);
    setNotifOpen(false);
  };

  const handleColorChange = (key, value) => {
    const updated = {
      accent: key === 'accent' ? value : accentColor,
      sidebar: key === 'sidebar' ? value : sidebarColor,
      header: key === 'header' ? value : headerColor,
      dashboard: key === 'dashboard' ? value : dashboardColor
    };
    
    if (key === 'accent') setAccentColor(value);
    else if (key === 'sidebar') setSidebarColor(value);
    else if (key === 'header') setHeaderColor(value);
    else if (key === 'dashboard') setDashboardColor(value);
    
    if (window.BKNRColorCustomizer) {
      window.BKNRColorCustomizer.apply(updated);
    }
  };

  const handleSaveColors = () => {
    if (window.BKNRColorCustomizer) {
      window.BKNRColorCustomizer.save({
        accent: accentColor,
        sidebar: sidebarColor,
        header: headerColor,
        dashboard: dashboardColor
      });
    }
    setColorOpen(false);
  };

  const handleResetColors = () => {
    if (window.BKNRColorCustomizer) {
      const resetDefaults = window.BKNRColorCustomizer.reset();
      setAccentColor(resetDefaults.accent || '#2563eb');
      setSidebarColor(resetDefaults.sidebar || '#102a43');
      setHeaderColor(resetDefaults.header || '#0b1f3a');
      setDashboardColor(resetDefaults.dashboard || '#f5f6f7');
    }
    setColorOpen(false);
  };

  const handleSwatchClick = (color) => {
    setAccentColor(color);
    const updated = {
      accent: color,
      sidebar: sidebarColor,
      header: headerColor,
      dashboard: dashboardColor
    };
    if (window.BKNRColorCustomizer) {
      window.BKNRColorCustomizer.apply(updated);
    }
  };

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
        setNotifOpen(false);
        setColorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleCommandShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === 'Escape') {
        setCommandOpen(false);
        setProfilePopupOpen(false);
      }
    };
    window.addEventListener('keydown', handleCommandShortcut);
    return () => window.removeEventListener('keydown', handleCommandShortcut);
  }, []);

  useEffect(() => {
    if (commandOpen) {
      requestAnimationFrame(() => commandInputRef.current?.focus());
    } else {
      setCommandSearch('');
      setEntityResults([]);
    }
  }, [commandOpen]);

  useEffect(() => {
    if (!dropdownOpen) setOpenMasterGroups({ 'Admin & Support': true });
  }, [dropdownOpen]);

  useEffect(() => {
    setTenantLogoUrl(user?.company_logo_url || '');
  }, [user?.company_logo_url]);

  // Fetch dropdown options and notifications on load
  useEffect(() => {
    fetch('/auth/global-dropdowns')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to load global dropdowns');
      })
      .then(data => {
        if (data.status === 'success') {
          setCompanies(data.companies || []);
          setLocations(data.locations || []);
        }
      })
      .catch(err => console.error('Error fetching global dropdowns in header:', err));

    fetch('/menu/notifications')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to load notifications');
      })
      .then(data => {
        setNotifications(data || []);
      })
      .catch(err => console.warn('Error loading notifications in Header.jsx:', err));
  }, []);

  // Sync filters to localstorage / session
  const handleProdForChange = (val) => {
    setProdForFilter(val);
    localStorage.setItem('production_for_filter', val);
    window.dispatchEvent(new CustomEvent('filter_change', { detail: { production_for: val, location: plantLocFilter } }));
  };

  const handlePlantLocChange = (val) => {
    setPlantLocFilter(val);
    localStorage.setItem('plant_location_filter', val);
    window.dispatchEvent(new CustomEvent('filter_change', { detail: { production_for: prodForFilter, location: val } }));
  };

  // Permission pipe matching allow() helper
  const permissions = user?.permissions || [];
  const isDefaultSuperAdmin = user?.email?.trim().toLowerCase() === "bknr.solutions@gmail.com";
  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  const canManageTenantLogo = isDefaultSuperAdmin || ['admin', 'super_admin', 'super admin'].includes(normalizedRole);

  const allow = (key) => {
    if (['admin_helpdesk', 'manage_support', 'user_activity'].includes(key)) {
      return isDefaultSuperAdmin;
    }
    if (isDefaultSuperAdmin) return true;
    if (!permissions) return false;
    if (typeof permissions === 'string') {
      return permissions === 'ALL' || permissions.split(',').map(item => item.trim()).includes(key);
    }
    return permissions.includes("ALL") || permissions.includes(key);
  };

  // Full web shortcut menu.
  const dropdownConsoleMenuConfig = [
    {
      title: "Business Masters",
      items: [
        { id: 'criteria_buyers',         token: 'mst_byr', perm: 'buyers',          icon: 'fa-users',             label: 'Buyers',             route: '/criteria/buyers' },
        { id: 'criteria_buyer_agents',   token: 'mst_bya', perm: 'buyer_agents',    icon: 'fa-user-tie',          label: 'Buyer Agents',       route: '/criteria/buyer_agents' },
        { id: 'criteria_suppliers',      token: 'mst_sup', perm: 'suppliers',       icon: 'fa-truck-field',       label: 'Suppliers',          route: '/criteria/suppliers' },
        { id: 'criteria_vendors',        token: 'mst_vnd', perm: 'vendors',         icon: 'fa-store',             label: 'Vendors',            route: '/criteria/vendors' },
        { id: 'criteria_countries',      token: 'mst_cty', perm: 'countries',       icon: 'fa-globe',             label: 'Countries',          route: '/criteria/countries' },
        { id: 'criteria_brands',         token: 'mst_brd', perm: 'brands',          icon: 'fa-building',          label: 'Brands',             route: '/criteria/brands' }
      ]
    },
    {
      title: "Production Masters",
      items: [
        { id: 'criteria_species',          token: 'mst_spc',      perm: 'species',          icon: 'fa-fish',             label: 'Species',           route: '/criteria/species' },
        { id: 'criteria_varieties',        token: 'mst_var',      perm: 'varieties',        icon: 'fa-seedling',         label: 'Varieties',         route: '/criteria/varieties' },
        { id: 'criteria_grades',           token: 'mst_grd',      perm: 'grades',           icon: 'fa-medal',            label: 'Grades',            route: '/criteria/grades' },
        { id: 'criteria_freezers',         token: 'mst_frz',      perm: 'freezers',         icon: 'fa-snowflake',        label: 'Freezers',          route: '/criteria/freezers' },
        { id: 'criteria_glazes',           token: 'mst_glz',      perm: 'glazes',           icon: 'fa-igloo',            label: 'Glazes',            route: '/criteria/glazes' },
        { id: 'criteria_packing_styles',   token: 'mst_pks',      perm: 'packing_styles',   icon: 'fa-box',              label: 'Packing Styles',    route: '/criteria/packing_styles' },
        { id: 'criteria_contractors',      token: 'mst_con',      perm: 'contractors',      icon: 'fa-hard-hat',         label: 'Contractors',       route: '/criteria/contractors' },
        { id: 'criteria_peeling_at',       token: 'mst_pat',      perm: 'peeling_at',       icon: 'fa-map-pin',          label: 'Peeling At',        route: '/criteria/peeling_at' },
        { id: 'criteria_peeling_rates',    token: 'mst_prt',      perm: 'peeling_rates',    icon: 'fa-money-bill',       label: 'Peeling Rates',     route: '/criteria/peeling_rates' },
        { id: 'criteria_production_at',    token: 'mst_pra',      perm: 'production_at',    icon: 'fa-industry',         label: 'Production At',     route: '/criteria/production_at' },
        { id: 'criteria_production_for',   token: 'pf_8Kx92LmQ',  perm: 'production_for',   icon: 'fa-building-flag',    label: 'Production For',    route: '/criteria/production_for' },
        { id: 'criteria_production_types', token: 'mst_prt2',     perm: 'production_types', icon: 'fa-tags',             label: 'Production Types',  route: '/criteria/production_types' },
        { id: 'criteria_chemicals',        token: 'mst_chem',     perm: 'chemicals',        icon: 'fa-flask',            label: 'Chemicals',         route: '/criteria/chemicals' },
        { id: 'criteria_purposes',         token: 'mst_purp',     perm: 'purposes',         icon: 'fa-bullseye',         label: 'Purposes',          route: '/criteria/purposes' },
        { id: 'criteria_grade_to_hoso',    token: 'mst_gth',      perm: 'grade_to_hoso',    icon: 'fa-exchange-alt',     label: 'Grade to HOSO',     route: '/criteria/grade_to_hoso' },
        { id: 'criteria_hoso_hlso',        token: 'mst_hh',       perm: 'hoso_hlso',        icon: 'fa-ruler-combined',   label: 'HOSO & HLSO',       route: '/criteria/hoso_hlso' }
      ]
    },
    {
      title: "Inv & Fin Masters",
      items: [
        { id: 'criteria_cold_storage',        token: 'mst_cs',  perm: 'cold_storage',        icon: 'fa-igloo',            label: 'Cold Storage Master',    route: '/inventory/cold_storage' },
        { id: 'criteria_coldstore_locations', token: 'mst_csl', perm: 'coldstore_locations', icon: 'fa-map-location-dot', label: 'Coldstore Locations',    route: '/criteria/coldstore_locations' },
        { id: 'criteria_vehicle_numbers',     token: 'mst_veh', perm: 'vehicle_numbers',     icon: 'fa-truck',            label: 'Vehicle Numbers',        route: '/criteria/vehicle_numbers' },
        { id: 'criteria_hsn_codes',           token: 'mst_hsn', perm: 'hsn_codes',           icon: 'fa-barcode',          label: 'HSN Codes',              route: '/criteria/hsn_codes' },
        { id: 'criteria_general_store_items', token: 'mst_gsi', perm: 'general_store_items', icon: 'fa-cubes',            label: 'General Store Items',    route: '/general_stock/items' }
      ]
    },
    {
      title: "Admin & Support",
      items: [
        { id: 'admin_add_user',          token: 'adm_usr',  perm: 'add_user',          icon: 'fa-user-gear',          label: 'User Configuration',    route: '/admin/add_user' },
        { id: 'admin_shifts',            token: 'adm_shf',  perm: 'shifts',            icon: 'fa-business-time',      label: 'Shifts',                route: '/attendance/shifts' },
        { id: 'admin_data_management',   token: 'adm_dm',   perm: 'data_management',   icon: 'fa-database',           label: 'Data Management',       route: '/data-management' },
        ...(isDefaultSuperAdmin ? [
          { id: 'admin_system_settings',      token: 'adm_sys', perm: 'system_settings',      icon: 'fa-sliders', label: 'System & Pipeline',    route: '/admin/system_settings' },
          { id: 'admin_system_architecture',  token: 'adm_arc', perm: 'system_architecture',  icon: 'fa-sitemap', label: 'System Architecture',  route: '/admin/system_architecture' }
        ] : []),
        { id: 'admin_raise_ticket',      token: 'sup_tkt',  perm: 'raise_ticket',      icon: 'fa-support-agent',      label: 'My Complaints',         route: '/support/my_tickets' },
        { id: 'admin_helpdesk',          token: 'sup_hd',   perm: 'admin_helpdesk',    icon: 'fa-ticket',             label: 'Helpdesk',              route: '/admin/all_tickets' },
        { id: 'admin_manage_support',    token: 'sup_team', perm: 'manage_support',    icon: 'fa-users-gear',         label: 'Support Team',          route: '/admin/support_team' },
        { id: 'admin_user_activity',     token: 'sup_act',  perm: 'user_activity',     icon: 'fa-clock-rotate-left',  label: 'User Activity Logs',    route: '/admin/activities' }
      ]
    }
  ];

  const quickActionStorageKey = `quick_actions_${user?.email || 'default'}`;
  const allQuickActionOptions = Array.from(new Map([
    ...availableMenuItems,
    ...dropdownConsoleMenuConfig.flatMap(category => category.items.map(item => ({
      ...item,
      category: `MASTERS > ${category.title}`,
    }))),
  ]
    .filter(item => allow(item.perm))
    .map(item => [item.id, item])).values());

  const updateQuickActions = (itemId) => {
    setQuickActionIds(current => {
      const next = current.includes(itemId)
        ? current.filter(id => id !== itemId)
        : [...current, itemId];
      localStorage.setItem(quickActionStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const selectedQuickActions = quickActionIds
    .map(id => allQuickActionOptions.find(item => item.id === id))
    .filter(Boolean);
  const cleanQaSearch = qaSearch.trim().toLowerCase();
  const quickActionSearchResults = cleanQaSearch
    ? allQuickActionOptions.filter(item =>
        item.label.toLowerCase().includes(cleanQaSearch)
        || item.category.toLowerCase().includes(cleanQaSearch))
    : [];
  const cleanCommandSearch = commandSearch.trim().toLowerCase();
  const commandPageResults = cleanCommandSearch
    ? allQuickActionOptions.filter(item =>
        item.label.toLowerCase().includes(cleanCommandSearch)
        || item.category.toLowerCase().includes(cleanCommandSearch))
    : allQuickActionOptions.slice(0, 6);

  useEffect(() => {
    if (!commandOpen || cleanCommandSearch.length < 2) {
      setEntityResults([]);
      setEntitySearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEntitySearchLoading(true);
      try {
        const response = await fetch(`/menu/search_entities?query=${encodeURIComponent(commandSearch.trim())}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const payload = await response.json();
          setEntityResults(Array.isArray(payload) ? payload : []);
        } else {
          setEntityResults([]);
        }
      } catch (error) {
        if (error.name !== 'AbortError') setEntityResults([]);
      } finally {
        if (!controller.signal.aborted) setEntitySearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [commandOpen, commandSearch, cleanCommandSearch]);

  const openSupportPage = (pageId) => {
    const target = pageId === 'admin_helpdesk'
      ? { id: 'admin_helpdesk', route: '/admin/all_tickets' }
      : { id: 'admin_raise_ticket', route: '/support/my_tickets' };
    setActivePage(target.id, target.route);
    setQaPanelOpen(false);
    setDropdownOpen(false);
    setNotifOpen(false);
    setColorOpen(false);
  };

  const openMenuItem = (item) => {
    if (item.id === 'admin_raise_ticket' || item.id === 'admin_helpdesk') {
      openSupportPage(item.id);
      return;
    }
    // Use token for clean URL; fallback to id for any unlisted items
    setActivePage(item.token || item.id, item.route);
    setDropdownOpen(false);
    setQaPanelOpen(false);
  };

  const openProfilePopup = async () => {
    setDropdownOpen(false);
    setProfilePopupOpen(true);
    setProfileLoading(true);
    setProfileError('');
    try {
      const response = await fetch('/auth/profile?format=json', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Unable to load profile');
      setProfileDetails(payload.profile || null);
      setTenantLogoUrl(payload.profile?.company_logo_url || user?.company_logo_url || '');
    } catch (error) {
      setProfileError(error.message || 'Unable to load profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const uploadTenantLogo = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setTenantLogoSaving(true);
    setTenantLogoMessage('');
    try {
      const body = new FormData();
      body.append('logo', file);
      const response = await fetch('/auth/tenant-logo', {
        method: 'POST',
        body,
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Unable to update company logo');
      const refreshedUrl = payload.company_logo_url ? `${payload.company_logo_url}?v=${Date.now()}` : '';
      setTenantLogoUrl(refreshedUrl);
      setProfileDetails(current => current ? { ...current, company_logo_url: refreshedUrl } : current);
      setTenantLogoMessage('Company logo updated.');
      window.dispatchEvent(new CustomEvent('tenant_logo_changed', { detail: { company_logo_url: refreshedUrl } }));
    } catch (error) {
      setTenantLogoMessage(error.message || 'Unable to update company logo');
    } finally {
      setTenantLogoSaving(false);
    }
  };

  const openCommandResult = (item) => {
    const menuItem = item.id ? item : allQuickActionOptions.find(option => option.route === item.route);
    if (menuItem) {
      openMenuItem(menuItem);
    } else if (item.route) {
      window.location.assign(item.route);
    }
    setCommandOpen(false);
  };

  return (
    <>
      <style>{`
        /* Mega menu custom dropdown console styles exactly replicating menu.html */
        .dropdown-console-custom {
          position: absolute;
          top: calc(var(--header-h) + 12px);
          right: 20px;
          background: var(--surface-panel);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border-radius: var(--radius-panel);
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-float);
          display: flex;
          flex-direction: column;
          z-index: 99999999;
          overflow: hidden;
          padding: 20px;
          width: min(300px, calc(100vw - 24px));
          gap: 16px;
        }

        .mega-menu-grid {
          display: grid;
          grid-template-columns: 1fr !important;
          align-items: start;
          gap: 7px;
          max-height: 390px;
          overflow-y: auto;
          padding-inline: 0;
        }

        .dropdown-pillar-block {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--border-light);
          border-radius: 9px;
          background: color-mix(in srgb, var(--surface-panel) 92%, var(--corp-dash) 8%);
        }

        .dropdown-pillar-title {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-tertiary);
          border: 0;
          padding: 10px 11px;
          background: transparent;
          cursor: pointer;
          text-align: left;
          min-height: 38px;
        }

        .dropdown-pillar-title i {
          color: var(--corp-dash);
          transition: transform .2s ease;
        }

        .dropdown-pillar-title.open i {
          transform: rotate(90deg);
        }

        .dropdown-pillar-items {
          padding: 2px 7px 7px;
          border-top: 1px solid var(--border-light);
        }

        .dropdown-submenu-item {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          color: var(--text-secondary);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          border-radius: var(--radius-element);
          transition: 0.2s;
          border-left: 2px solid transparent;
        }

        .dropdown-submenu-item:hover {
          background: rgba(255,255,255,0.05);
          color: var(--text-primary);
          border-left-color: var(--corp-dash) !important;
        }

        [data-theme="light"] .dropdown-submenu-item:hover {
          background: rgba(0,0,0,0.04);
        }

        .universal-filters-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 8px;
        }

        .dropdown-filter-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .dropdown-filter-box label {
          font-size: 9px;
          font-weight: 800;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .global-select-input {
          background: rgba(0,0,0,0.1);
          color: var(--text-primary);
          border: 1px solid var(--border-light);
          font-size: 12px;
          font-weight: 700;
          padding: 8px 24px 8px 12px;
          border-radius: 8px;
          outline: none;
          width: 100%;
          cursor: pointer;
          transition: 0.2s;
        }

        [data-theme="light"] .global-select-input {
          background: rgba(0,0,0,0.03);
        }

        .profile-logout-section {
          margin-top: 12px;
          border-top: 1px solid var(--border-light);
          padding-top: 12px;
        }

        .profile-popup-overlay {
          position: fixed;
          inset: 0;
          z-index: 100000000;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(15, 23, 42, .34);
          backdrop-filter: blur(3px);
        }

        .profile-popup {
          width: min(470px, 100%);
          max-height: min(680px, calc(100vh - 36px));
          overflow: auto;
          border: 1px solid var(--border-light);
          border-radius: 16px;
          background: var(--surface-panel);
          box-shadow: var(--shadow-float);
        }

        .profile-popup-head {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 16px;
          border-bottom: 1px solid var(--border-light);
          background: var(--surface-panel);
        }

        .profile-popup-head-copy { flex: 1; min-width: 0; }
        .profile-popup-head strong { display: block; color: var(--text-primary); font-size: 15px; }
        .profile-popup-head span { display: block; margin-top: 3px; color: var(--text-tertiary); font-size: 10px; font-weight: 700; }
        .profile-popup-close { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--border-light); border-radius: 9px; background: transparent; color: var(--text-secondary); cursor: pointer; }
        .profile-popup-body { padding: 8px 16px 16px; }
        .profile-popup-state { padding: 34px 12px; color: var(--text-secondary); font-size: 12px; font-weight: 700; text-align: center; }
        .profile-detail-row { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 11px; min-height: 55px; border-bottom: 1px solid var(--border-light); }
        .profile-detail-row:last-child { border-bottom: 0; }
        .profile-detail-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: color-mix(in srgb, var(--corp-dash) 10%, transparent); color: var(--corp-dash); font-size: 12px; }
        .profile-detail-copy span { display: block; color: var(--text-tertiary); font-size: 8px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
        .profile-detail-copy strong { display: block; margin-top: 3px; color: var(--text-primary); font-size: 12px; font-weight: 800; overflow-wrap: anywhere; }
        .profile-detail-copy strong.attention { color: #b45309; }
        .tenant-logo-tools { margin: 10px 0 2px; padding: 11px; border: 1px solid var(--border-light); border-radius: 11px; background: color-mix(in srgb, var(--surface-panel) 94%, var(--corp-dash) 6%); }
        .tenant-logo-tools-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text-primary); font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .tenant-logo-tools-title small { color: var(--text-tertiary); font-size: 8px; }
        .tenant-logo-actions { display: flex; gap: 7px; margin-top: 9px; }
        .tenant-logo-actions button { flex: 1; min-height: 34px; border: 1px solid var(--border-light); border-radius: 8px; background: var(--surface-panel); color: var(--text-secondary); font-size: 9px; font-weight: 900; cursor: pointer; }
        .tenant-logo-actions button.primary { border-color: var(--corp-dash); background: var(--corp-dash); color: #fff; }
        .tenant-logo-actions button:disabled { opacity: .55; cursor: wait; }
        .tenant-logo-message { margin-top: 7px; color: var(--text-secondary); font-size: 9px; font-weight: 750; }
        .corp-avatar-img { padding: 4px; object-fit: contain; background: transparent; }

        @media (max-width: 700px) {
          .dropdown-console-custom {
            width: min(300px, calc(100vw - 24px));
            right: 12px;
            padding: 14px;
          }
          .mega-menu-grid {
            grid-template-columns: 1fr !important;
          }
        }

        /* 🌟 PANELS (QUICK ACTIONS & COMPLAINTS) 🌟 */
        .side-panel-overlay {
          position: fixed; inset: 0; z-index: 99999998;
          background: rgba(2, 6, 23, 0.28); backdrop-filter: blur(1px);
          -webkit-backdrop-filter: blur(1px);
        }
        .quick-action-panel {
          position: fixed; top: 0; right: -380px; width: 380px; max-width: 100vw; height: 100vh;
          background: var(--surface-panel); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          box-shadow: none; border-left: 1px solid var(--border-light);
          z-index: 99999999; transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column;
        }
        .quick-action-panel.open { right: 0 !important; }
        .quick-action-panel.support-panel { right: -760px; width: 760px; max-width: 100vw; }
        .quick-action-panel.support-panel.open { right: 0 !important; }
        .support-panel-body { flex: 1; min-height: 0; overflow: hidden; }
        
        .qa-header { height: 70px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;}
        .qa-title { font-size: 14px; font-weight: 800; color: var(--text-primary); }
        .qa-body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .qa-search-box { position: relative; margin-bottom: 6px; }
        .qa-search-box > i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); font-size: 12px; }
        .qa-search-input { width: 100%; height: 40px; padding: 0 12px 0 34px; border: 1px solid var(--border-light); border-radius: 8px; background: rgba(255,255,255,0.03); color: var(--text-primary); font: inherit; font-size: 12px; outline: none; box-sizing: border-box; }
        .qa-search-input:focus { border-color: var(--corp-dash); box-shadow: 0 0 0 2px color-mix(in srgb, var(--corp-dash) 15%, transparent); }
        [data-theme="light"] .qa-search-input { background: #fff; }
        .qa-section-title { margin: 5px 2px 2px; color: var(--text-tertiary); font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
        .qa-btn {
          background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px;
          padding: 10px 12px; display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;
          text-align: left;
        }
        [data-theme="light"] .qa-btn { background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
        .qa-btn:hover { border-color: var(--corp-dash); transform: translateY(-2px); }
        .qa-btn i { color: var(--corp-dash); font-size: 16px; }
        .qa-btn-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .qa-btn-content small { color: var(--text-tertiary); font-size: 9px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .qa-toggle-btn { width: 27px; height: 27px; flex: 0 0 27px; display: grid; place-items: center; border: 1px solid var(--border-light); border-radius: 7px; background: transparent; color: var(--corp-dash); cursor: pointer; }
        .qa-toggle-btn.remove { color: #ef4444; }
        .qa-toggle-btn:hover { background: color-mix(in srgb, currentColor 10%, transparent); border-color: currentColor; }
        .qa-empty { padding: 24px 12px; text-align: center; color: var(--text-tertiary); font-size: 11px; border: 1px dashed var(--border-light); border-radius: 8px; }

        /* Notification elements styles */
        .notification-dot {
          position: absolute; top: -2px; right: -2px; width: 10px; height: 10px;
          background: #ef4444; border-radius: 50%; border: 2px solid var(--glass-bg);
        }

        .notif-header { padding: 16px; border-bottom: 1px solid var(--border-light); font-size: 13px; font-weight: 800; display: flex; justify-content: space-between; align-items: center;}
        .notif-header span { font-size: 10px; color: var(--corp-dash); cursor: pointer; }
        .notif-list { display: flex; flex-direction: column; max-height: 300px; overflow-y: auto; }
        .notif-item { padding: 12px 16px; border-bottom: 1px solid var(--border-light); display: flex; gap: 12px; cursor: pointer; transition: 0.2s; }
        .notif-item:hover { background: rgba(255,255,255,0.03); }
        .notif-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; flex-shrink: 0;}
        .notif-text { display: flex; flex-direction: column; gap: 4px; text-align: left; }
        .notif-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
        .notif-time { font-size: 10px; color: var(--text-tertiary); }

        /* Color Customizer console styles */
        .color-console { width: 330px; gap: 14px; padding: 16px; }
        .color-console-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border-light); }
        .color-console-title strong { color: var(--text-primary); font-size: 13px; font-weight: 800; }
        .color-console-grid { display: grid; gap: 10px; }
        .color-field { display: grid; grid-template-columns: 1fr 44px; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border-light); border-radius: 8px; background: rgba(255, 255, 255, 0.03); }
        [data-theme="light"] .color-field { background: rgba(0, 0, 0, 0.02); }
        .color-field span { display: block; color: var(--text-primary); font-size: 12px; font-weight: 800; text-align: left; }
        .color-field small { display: block; margin-top: 2px; color: var(--text-tertiary); font-size: 10px; font-weight: 600; text-align: left; }
        .color-field input[type="color"] { width: 44px; height: 34px; padding: 0; border: 1px solid var(--border-light); border-radius: 8px; background: transparent; cursor: pointer; }
        .color-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .color-action-btn { height: 34px; border-radius: 8px; border: 1px solid var(--border-light); font-size: 11px; font-weight: 800; cursor: pointer; font-family: inherit; }
        .color-save-btn { background: var(--ui-accent, var(--corp-dash, #2563eb)); color: #ffffff; border-color: transparent; }
        .color-reset-btn { background: transparent; color: var(--text-secondary); }
        .color-swatches { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .color-swatch { height: 26px; border-radius: 7px; border: 1px solid var(--border-light); cursor: pointer; }

        .global-search-container { flex: 1; max-width: 450px; min-width: 220px; margin: 0 24px; position: relative; display: flex; align-items: center; cursor: text; }
        .global-search-container input { width: 100%; height: 40px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-light); border-radius: var(--radius-element); padding: 0 66px 0 42px; font: inherit; font-size: 12px; color: var(--text-primary); outline: none; cursor: text; }
        [data-theme="light"] .global-search-container input { background: rgba(0,0,0,0.03); }
        .global-search-container:hover input { border-color: color-mix(in srgb, var(--corp-dash) 55%, var(--border-light)); }
        .global-search-container > i { position: absolute; left: 14px; color: var(--text-tertiary); font-size: 13px; z-index: 1; }
        .cmd-k-hint { position: absolute; right: 10px; font-size: 9px; font-weight: 800; color: var(--text-tertiary); background: rgba(255,255,255,0.08); border: 1px solid var(--border-light); padding: 3px 6px; border-radius: 5px; pointer-events: none; }
        [data-theme="light"] .cmd-k-hint { background: rgba(0,0,0,0.04); }
        .command-palette-overlay { position: fixed; inset: 0; z-index: 100000000; display: flex; align-items: flex-start; justify-content: center; padding: min(15vh, 120px) 16px 16px; background: rgba(2,6,23,.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
        .command-palette-box { width: min(680px, 100%); max-height: min(620px, 76vh); display: flex; flex-direction: column; overflow: hidden; background: var(--surface-panel); border: 1px solid var(--border-light); border-radius: 14px; box-shadow: var(--shadow-float); }
        .command-palette-head { height: 58px; flex: 0 0 58px; display: flex; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid var(--border-light); }
        .command-palette-head > i { color: var(--corp-dash); }
        .command-palette-head input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; }
        .command-palette-head kbd { color: var(--text-tertiary); border: 1px solid var(--border-light); border-radius: 5px; padding: 3px 6px; font: inherit; font-size: 9px; font-weight: 800; }
        .command-results { overflow-y: auto; padding: 10px; }
        .command-section-title { display: block; padding: 6px 9px; color: var(--text-tertiary); font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
        .command-result-item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px; border: 0; border-radius: 9px; background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; font: inherit; }
        .command-result-item:hover { background: color-mix(in srgb, var(--corp-dash) 9%, transparent); }
        .command-result-item > i { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border-radius: 8px; color: var(--corp-dash); background: color-mix(in srgb, var(--corp-dash) 10%, transparent); }
        .command-result-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .command-result-copy strong { font-size: 12px; }
        .command-result-copy small { color: var(--text-tertiary); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .command-empty { padding: 24px; color: var(--text-tertiary); font-size: 11px; text-align: center; }
        @media (max-width: 900px) { .global-search-container { display: none; } }
      `}</style>

      <header className="app-header" ref={dropdownRef}>
        {/* Left side actions */}
        <div className="header-left-meta">
          <button 
            className="hamburger-trigger-btn" 
            onClick={() => setSidebarOpen(true)} 
            title="Menu"
          >
            <i className="fa-solid fa-bars-staggered"></i>
          </button>

          <button 
            className="mobile-top-menu-btn" 
            onClick={() => { setDropdownOpen(!dropdownOpen); setNotifOpen(false); setColorOpen(false); }} 
            title="Open App Menu"
          >
            MENU
          </button>

          <button 
            className="header-home-btn" 
            onClick={() => setActivePage('dashboard_processing')} 
            title="Home Workspace Screen"
          >
            <i className="fa-solid fa-house"></i>
          </button>

          <div className="header-brand-title-box">
            <div className="header-premium-title">{companyName}</div>
            <div className="header-premium-subtitle">ENTERPRISE WORKSPACE</div>
          </div>
        </div>

        <div
          className="global-search-container"
          role="button"
          tabIndex={0}
          onClick={() => setCommandOpen(true)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') setCommandOpen(true);
          }}
          aria-label="Open global search"
        >
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Search Customer, Supplier, Batch, Invoice..."
            readOnly
            tabIndex={-1}
          />
          <span className="cmd-k-hint">Ctrl + K</span>
        </div>

        {/* Right side actions */}
        <div className="header-right-actions">
          
          {/* Quick Actions Trigger */}
          <div
            className="icon-action-btn action-quick"
            onClick={() => setQaPanelOpen(true)}
            title="Quick Actions"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-plus"></i>
            <span className="icon-action-label">Quick</span>
          </div>

          <div
            className="icon-action-btn action-support"
            onClick={() => openSupportPage(isDefaultSuperAdmin ? 'admin_helpdesk' : 'admin_raise_ticket')}
            title="Support & Helpdesk"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-support-agent"></i>
            <span className="icon-action-label">Support</span>
          </div>

          {/* Notifications Trigger */}
          <div
            className="icon-action-btn action-alerts"
            onClick={() => { setNotifOpen(!notifOpen); setDropdownOpen(false); setColorOpen(false); }}
            title="Notifications"
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            <i className="fa-solid fa-bell"></i>
            <span className="icon-action-label">Alerts</span>
            {notifications.length > 0 && <div className="notification-dot"></div>}
          </div>

          {/* Theme switch button */}
          <div
            className="icon-action-btn action-theme"
            onClick={toggleTheme}
            title="Switch Mode"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-circle-half-stroke"></i>
            <span className="icon-action-label">Theme</span>
          </div>

          {/* Customize Colors Trigger */}
          <div
            className="icon-action-btn action-colors"
            onClick={toggleColorCustomizer}
            title="Customize Colors"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-palette"></i>
            <span className="icon-action-label">Colors</span>
          </div>

          {/* User profile dropdown button */}
          <div 
            className={`corp-profile-btn ${dropdownOpen ? 'active' : ''}`} 
            onClick={() => { setDropdownOpen(!dropdownOpen); setNotifOpen(false); setColorOpen(false); }}
          >
            {tenantLogoUrl
              ? <img className="corp-avatar corp-avatar-img" src={tenantLogoUrl} alt={`${companyName} logo`} />
              : <AnimatedBrandLogo size={34} className="corp-avatar" />}
            <div className="corp-info">
              <span className="corp-name">{userName}</span>
              <span className="corp-role">{user?.role || 'Role'} | {companyName}</span>
            </div>
            <i className="fa-solid fa-chevron-down" style={{ fontSize: '10px', marginLeft: '6px', color: 'var(--text-tertiary)' }}></i>
          </div>

          {/* ── Dropdown Console Mega Menu ── */}
          {dropdownOpen && (
            <div className="dropdown-console-custom">
              
              {/* Universal Filters */}
              <div className="universal-filters-row">
                <div className="dropdown-filter-box">
                  <label>Production For</label>
                  <select 
                    className="global-select-input" 
                    value={prodForFilter} 
                    onChange={(e) => handleProdForChange(e.target.value)}
                  >
                    <option value="">All Corporate Entities</option>
                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                
                <div className="dropdown-filter-box">
                  <label>Plant Location</label>
                  <select 
                    className="global-select-input" 
                    value={plantLocFilter} 
                    onChange={(e) => handlePlantLocChange(e.target.value)}
                  >
                    <option value="">All Active Plants</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Mega Menu Grid */}
              <div className="mega-menu-grid">
                {dropdownConsoleMenuConfig.map((cat, idx) => {
                  const allowedItems = cat.items.filter(item => allow(item.perm));
                  if (allowedItems.length === 0) return null;

                  return (
                    <div key={idx} className="dropdown-pillar-block">
                      <button
                        type="button"
                        className={`dropdown-pillar-title ${openMasterGroups[cat.title] ? 'open' : ''}`}
                        onClick={() => setOpenMasterGroups(current => ({ ...current, [cat.title]: !current[cat.title] }))}
                        aria-expanded={Boolean(openMasterGroups[cat.title])}
                      >
                        <span>{cat.title}</span>
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                      {openMasterGroups[cat.title] && <div className="dropdown-pillar-items">{allowedItems.map((item) => {
                        const hasExplicitIcon = cat.title === 'Admin & Support' && item.icon;
                        return (
                        <div key={item.id} className="dropdown-item-row">
                          <a 
                            className="dropdown-submenu-item" 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              openMenuItem(item);
                            }}
                          >
                            <i
                              className={`fa-solid ${hasExplicitIcon ? item.icon : 'fa-circle'}`}
                              style={{ fontSize: hasExplicitIcon ? '12px' : '5px', marginRight: '8px', color: 'var(--corp-dash)' }}
                            ></i>
                            {item.label}
                          </a>
                        </div>
                        );
                      })}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Profile logout at bottom */}
              <div className="profile-logout-section">
                <button
                  style={{ width: '100%', marginBottom: '8px', padding: '10px', background: 'var(--surface-panel)', color: 'var(--corp-dash)', border: '1px solid var(--border-light)', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}
                  onClick={openProfilePopup}
                >
                  <i className="fa-solid fa-user" style={{ marginRight: '7px' }}></i>
                  MY PROFILE
                </button>
                <button style={{ width: '100%', padding: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }} onClick={handleLogout}>
                  SIGN OUT
                </button>
              </div>

            </div>
          )}

          {/* ── Notifications Dropdown ── */}
          {notifOpen && (
            <div className="dropdown-console show" style={{ width: '320px', padding: 0, right: '150px' }}>
              <div className="notif-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Notifications
                </div>
                <span onClick={() => setNotifications([])}>Mark all read</span>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div style={{ padding: '25px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                    <i className="fa-solid fa-bell-slash" style={{ fontSize: '20px', marginBottom: '10px', display: 'block', opacity: 0.4, color: 'var(--text-tertiary)' }}></i>
                    All systems sync'd, no active alerts
                  </div>
                ) : (
                  notifications.map((item, idx) => (
                    <div key={idx} className="notif-item" style={{ alignItems: 'flex-start' }}>
                      <div className="notif-icon" style={{ background: item.bg || '#3b82f6', marginTop: '2px' }}><i className={`fa-solid ${item.icon || 'fa-info'}`}></i></div>
                      <div className="notif-text" style={{ flex: 1, minWidth: 0 }}>
                        <span className="notif-title" style={{ wordBreak: 'break-word' }}>{item.title}</span>
                        <span className="notif-time" style={{ fontWeight: 'normal', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-word' }}>{item.desc}</span>
                        {item.media_path && (
                          <div style={{ marginTop: '6px', borderRadius: '6px', overflow: 'hidden', maxWidth: '100%', maxHeight: '120px', border: '1px solid var(--border-light)' }}>
                            <img src={item.media_path} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }} onClick={() => window.open(item.media_path, '_blank')} />
                          </div>
                        )}
                        <span className="notif-time" style={{ fontSize: '9px', opacity: 0.6, marginTop: '4px' }}>{item.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Color Customizer Dropdown ── */}
          {colorOpen && (
            <div className="dropdown-console color-console show" style={{ right: '100px' }}>
              <div className="color-console-title">
                <strong><i className="fa-solid fa-palette" style={{ color: 'var(--corp-dash)' }}></i> UI Colors</strong>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700' }}>Menu + Dashboard</span>
              </div>
              <div className="color-console-grid">
                <label className="color-field">
                  <span>Accent / Buttons<small>Icons, active links, highlights</small></span>
                  <input type="color" value={accentColor} onChange={(e) => handleColorChange('accent', e.target.value)} />
                </label>
                <label className="color-field">
                  <span>Side Menu<small>Main menu and dashboard rail</small></span>
                  <input type="color" value={sidebarColor} onChange={(e) => handleColorChange('sidebar', e.target.value)} />
                </label>
                <label className="color-field">
                  <span>Header<small>Top navigation bar</small></span>
                  <input type="color" value={headerColor} onChange={(e) => handleColorChange('header', e.target.value)} />
                </label>
                <label className="color-field">
                  <span>Dashboard BG<small>Dashboard page background</small></span>
                  <input type="color" value={dashboardColor} onChange={(e) => handleColorChange('dashboard', e.target.value)} />
                </label>
              </div>
              <div className="color-swatches">
                <button className="color-swatch" style={{ background: '#2563eb' }} onClick={() => handleSwatchClick('#2563eb')} title="Blue"></button>
                <button className="color-swatch" style={{ background: '#0d9488' }} onClick={() => handleSwatchClick('#0d9488')} title="Teal"></button>
                <button className="color-swatch" style={{ background: '#4f46e5' }} onClick={() => handleSwatchClick('#4f46e5')} title="Indigo"></button>
                <button className="color-swatch" style={{ background: '#ea580c' }} onClick={() => handleSwatchClick('#ea580c')} title="Orange"></button>
                <button className="color-swatch" style={{ background: '#64748b' }} onClick={() => handleSwatchClick('#64748b')} title="Slate"></button>
              </div>
              <div className="color-actions">
                <button className="color-action-btn color-reset-btn" onClick={handleResetColors}>Reset Colors</button>
                <button className="color-action-btn color-save-btn" onClick={handleSaveColors}>Save Colors</button>
              </div>
            </div>
          )}

        </div>
      </header>

      {profilePopupOpen && (
        <div className="profile-popup-overlay" onMouseDown={() => setProfilePopupOpen(false)}>
          <section className="profile-popup" role="dialog" aria-modal="true" aria-label="My Profile" onMouseDown={event => event.stopPropagation()}>
            <div className="profile-popup-head">
              {tenantLogoUrl
                ? <img className="corp-avatar corp-avatar-img" src={tenantLogoUrl} alt={`${companyName} logo`} style={{ width: 42, height: 42 }} />
                : <AnimatedBrandLogo size={42} />}
              <div className="profile-popup-head-copy">
                <strong>{profileDetails?.name || userName}</strong>
                <span>{profileDetails?.company_name || companyName} · {profileDetails?.role || user?.role || 'Role'}</span>
              </div>
              <button type="button" className="profile-popup-close" onClick={() => setProfilePopupOpen(false)} aria-label="Close profile">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="profile-popup-body">
              {profileLoading && <div className="profile-popup-state">Loading profile…</div>}
              {!profileLoading && profileError && <div className="profile-popup-state">{profileError}</div>}
              {!profileLoading && !profileError && profileDetails && [
                ['fa-id-card', 'Employee ID', profileDetails.employee_id],
                ['fa-envelope', 'Login Email', profileDetails.email],
                ['fa-id-badge', 'Designation', profileDetails.designation],
                ['fa-calendar', 'Date of Birth', profileDetails.date_of_birth],
                ['fa-droplet', 'Blood Group', profileDetails.blood_group],
                ['fa-location-dot', 'Working Location', profileDetails.working_location],
                ['fa-house', 'Address', profileDetails.address || 'Please update', !profileDetails.address],
              ].map(([icon, label, value, attention]) => (
                <div className="profile-detail-row" key={label}>
                  <span className="profile-detail-icon"><i className={`fa-solid ${icon}`}></i></span>
                  <div className="profile-detail-copy">
                    <span>{label}</span>
                    <strong className={attention ? 'attention' : ''}>{value || '—'}</strong>
                  </div>
                </div>
              ))}
              {!profileLoading && !profileError && profileDetails && canManageTenantLogo && (
                <div className="tenant-logo-tools">
                  <div className="tenant-logo-tools-title">
                    <span>Tenant Logo</span>
                    <small>PNG, JPEG or WebP · Max 2 MB</small>
                  </div>
                  <input ref={tenantLogoInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadTenantLogo} />
                  <div className="tenant-logo-actions">
                    <button type="button" className="primary" disabled={tenantLogoSaving} onClick={() => tenantLogoInputRef.current?.click()}>
                      {tenantLogoSaving ? 'UPDATING…' : tenantLogoUrl ? 'CHANGE' : 'UPLOAD'}
                    </button>
                  </div>
                  {tenantLogoMessage && <div className="tenant-logo-message">{tenantLogoMessage}</div>}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {commandOpen && (
        <div className="command-palette-overlay" onMouseDown={() => setCommandOpen(false)}>
          <div className="command-palette-box" onMouseDown={event => event.stopPropagation()}>
            <div className="command-palette-head">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                ref={commandInputRef}
                value={commandSearch}
                onChange={event => setCommandSearch(event.target.value)}
                placeholder="Search Customer, Supplier, Batch, Invoice..."
                autoComplete="off"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              <span className="command-section-title">
                {cleanCommandSearch ? 'Matching Pages' : 'Available Pages'}
              </span>
              {commandPageResults.map(item => (
                <button
                  type="button"
                  className="command-result-item"
                  key={`page-${item.id}`}
                  onClick={() => openCommandResult(item)}
                >
                  <i className={`fa-solid ${item.icon || 'fa-file'}`}></i>
                  <span className="command-result-copy">
                    <strong>{item.label}</strong>
                    <small>{item.category}</small>
                  </span>
                </button>
              ))}

              {cleanCommandSearch.length >= 2 && (
                <>
                  <span className="command-section-title">Matching Database Records</span>
                  {entityResults.map((item, index) => (
                    <button
                      type="button"
                      className="command-result-item"
                      key={`entity-${item.route}-${item.title}-${index}`}
                      onClick={() => openCommandResult(item)}
                    >
                      <i className={`fa-solid ${item.icon || 'fa-database'}`}></i>
                      <span className="command-result-copy">
                        <strong>{item.title}</strong>
                        <small>{item.desc}</small>
                      </span>
                    </button>
                  ))}
                  {!entitySearchLoading && entityResults.length === 0 && commandPageResults.length === 0 && (
                    <div className="command-empty">No matching pages or database records found.</div>
                  )}
                  {entitySearchLoading && <div className="command-empty">Searching records…</div>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {qaPanelOpen && (
        <div
          className="side-panel-overlay"
          onClick={() => setQaPanelOpen(false)}
          onTouchEnd={() => setQaPanelOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Quick Actions Sidebar Panel ── */}
      <div className={`quick-action-panel ${qaPanelOpen ? 'open' : ''}`}>
        <div className="qa-header">
          <span className="qa-title">Quick Actions</span>
          <i className="fa-solid fa-xmark" style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }} onClick={() => setQaPanelOpen(false)}></i>
        </div>
        <div className="qa-body">
          <div className="qa-search-box">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              className="qa-search-input"
              value={qaSearch}
              onChange={event => setQaSearch(event.target.value)}
              placeholder="Search pages to add..."
              autoFocus={qaPanelOpen}
            />
          </div>

          {cleanQaSearch ? (
            <>
              <div className="qa-section-title">Search Results</div>
              {quickActionSearchResults.length ? quickActionSearchResults.map(item => {
                const isSelected = quickActionIds.includes(item.id);
                return (
                  <div className="qa-btn" key={item.id}>
                    <i className={`fa-solid ${item.icon || 'fa-file'}`}></i>
                    <div className="qa-btn-content">
                      <span>{item.label}</span>
                      <small>{item.category}</small>
                    </div>
                    <button
                      type="button"
                      className={`qa-toggle-btn ${isSelected ? 'remove' : ''}`}
                      onClick={() => updateQuickActions(item.id)}
                      title={isSelected ? 'Remove from Quick Actions' : 'Add to Quick Actions'}
                      aria-label={isSelected ? `Remove ${item.label}` : `Add ${item.label}`}
                    >
                      <i className={`fa-solid ${isSelected ? 'fa-minus' : 'fa-plus'}`}></i>
                    </button>
                  </div>
                );
              }) : <div className="qa-empty">No matching pages found.</div>}
            </>
          ) : (
            <>
              <div className="qa-section-title">Added Quick Actions</div>
              {selectedQuickActions.length ? selectedQuickActions.map(item => (
                <div
                  className="qa-btn"
                  key={item.id}
                  onClick={() => openMenuItem(item)}
                >
                  <i className={`fa-solid ${item.icon || 'fa-file'}`}></i>
                  <div className="qa-btn-content">
                    <span>{item.label}</span>
                    <small>{item.category}</small>
                  </div>
                  <button
                    type="button"
                    className="qa-toggle-btn remove"
                    onClick={event => { event.stopPropagation(); updateQuickActions(item.id); }}
                    title="Remove from Quick Actions"
                    aria-label={`Remove ${item.label}`}
                  >
                    <i className="fa-solid fa-minus"></i>
                  </button>
                </div>
              )) : <div className="qa-empty">Search for a page and click + to add it here.</div>}
            </>
          )}
        </div>
      </div>

    </>
  );
}
