import React, { useState, useEffect, useRef } from 'react';

export default function Header({ theme, toggleTheme, user, handleLogout, sidebarOpen, setSidebarOpen, setActivePage }) {
  const companyName = user?.company || 'SVBK IT Solutions';
  const userName = user?.name || 'Administrator';
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [qaPanelOpen, setQaPanelOpen] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [prodForFilter, setProdForFilter] = useState('');
  const [plantLocFilter, setPlantLocFilter] = useState('');
  const dropdownRef = useRef(null);

  // Customizer States
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [sidebarColor, setSidebarColor] = useState('#0f172a');
  const [headerColor, setHeaderColor] = useState('#060913');
  const [dashboardColor, setDashboardColor] = useState('#0f172a');

  useEffect(() => {
    if (colorOpen && window.BKNRColorCustomizer) {
      const activeColors = window.BKNRColorCustomizer.read();
      if (activeColors) {
        setAccentColor(activeColors.accent || '#2563eb');
        setSidebarColor(activeColors.sidebar || '#0f172a');
        setHeaderColor(activeColors.header || '#060913');
        setDashboardColor(activeColors.dashboard || '#0f172a');
      }
    }
  }, [colorOpen]);

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
      setSidebarColor(resetDefaults.sidebar || '#0f172a');
      setHeaderColor(resetDefaults.header || '#060913');
      setDashboardColor(resetDefaults.dashboard || '#0f172a');
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
  const isDefaultSuperAdmin = user?.email === "bknr.solutions@gmail.com" || user?.email === "bknr.solutions@gmail.com";

  const allow = (key) => {
    if (isDefaultSuperAdmin) return true;
    if (!permissions) return false;
    if (typeof permissions === 'string') {
      return permissions === 'ALL' || permissions.split(',').includes(key);
    }
    return permissions.includes("ALL") || permissions.includes(key);
  };

  // Full web shortcut menu.
  const dropdownConsoleMenuConfig = [
    {
      title: "Business Masters",
      items: [
        { id: 'criteria_buyers', perm: 'buyers', icon: 'fa-users', label: 'Buyers', route: '/criteria/buyers' },
        { id: 'criteria_buyer_agents', perm: 'buyer_agents', icon: 'fa-user-tie', label: 'Buyer Agents', route: '/criteria/buyer_agents' },
        { id: 'criteria_suppliers', perm: 'suppliers', icon: 'fa-truck-field', label: 'Suppliers', route: '/criteria/suppliers' },
        { id: 'criteria_vendors', perm: 'vendors', icon: 'fa-store', label: 'Vendors', route: '/criteria/vendors' },
        { id: 'criteria_countries', perm: 'countries', icon: 'fa-globe', label: 'Countries', route: '/criteria/countries' },
        { id: 'criteria_brands', perm: 'brands', icon: 'fa-building', label: 'Brands', route: '/criteria/brands' }
      ]
    },
    {
      title: "Production Masters",
      items: [
        { id: 'criteria_species', perm: 'species', icon: 'fa-fish', label: 'Species', route: '/criteria/species' },
        { id: 'criteria_varieties', perm: 'varieties', icon: 'fa-seedling', label: 'Varieties', route: '/criteria/varieties' },
        { id: 'criteria_grades', perm: 'grades', icon: 'fa-medal', label: 'Grades', route: '/criteria/grades' },
        { id: 'criteria_freezers', perm: 'freezers', icon: 'fa-snowflake', label: 'Freezers', route: '/criteria/freezers' },
        { id: 'criteria_glazes', perm: 'glazes', icon: 'fa-igloo', label: 'Glazes', route: '/criteria/glazes' },
        { id: 'criteria_packing_styles', perm: 'packing_styles', icon: 'fa-box', label: 'Packing Styles', route: '/criteria/packing_styles' },
        { id: 'criteria_contractors', perm: 'contractors', icon: 'fa-hard-hat', label: 'Contractors', route: '/criteria/contractors' },
        { id: 'criteria_peeling_at', perm: 'peeling_at', icon: 'fa-map-pin', label: 'Peeling At', route: '/criteria/peeling_at' },
        { id: 'criteria_peeling_rates', perm: 'peeling_rates', icon: 'fa-money-bill', label: 'Peeling Rates', route: '/criteria/peeling_rates' },
        { id: 'criteria_production_at', perm: 'production_at', icon: 'fa-industry', label: 'Production At', route: '/criteria/production_at' },
        { id: 'criteria_production_for', perm: 'production_for', icon: 'fa-building-flag', label: 'Production For', route: '/criteria/production_for' },
        { id: 'criteria_production_types', perm: 'production_types', icon: 'fa-tags', label: 'Production Types', route: '/criteria/production_types' },
        { id: 'criteria_chemicals', perm: 'chemicals', icon: 'fa-flask', label: 'Chemicals', route: '/criteria/chemicals' },
        { id: 'criteria_purposes', perm: 'purposes', icon: 'fa-bullseye', label: 'Purposes', route: '/criteria/purposes' },
        { id: 'criteria_grade_to_hoso', perm: 'grade_to_hoso', icon: 'fa-exchange-alt', label: 'Grade to HOSO', route: '/criteria/grade_to_hoso' },
        { id: 'criteria_hoso_hlso', perm: 'hoso_hlso', icon: 'fa-ruler-combined', label: 'HOSO & HLSO', route: '/criteria/hoso_hlso' }
      ]
    },
    {
      title: "Inv & Fin Masters",
      items: [
        { id: 'criteria_cold_storage', perm: 'cold_storage', icon: 'fa-igloo', label: 'Cold Storage Master', route: '/inventory/cold_storage' },
        { id: 'criteria_coldstore_locations', perm: 'coldstore_locations', icon: 'fa-map-location-dot', label: 'Coldstore Locations', route: '/criteria/coldstore_locations' },
        { id: 'criteria_vehicle_numbers', perm: 'vehicle_numbers', icon: 'fa-truck', label: 'Vehicle Numbers', route: '/criteria/vehicle_numbers' },
        { id: 'criteria_hsn_codes', perm: 'hsn_codes', icon: 'fa-barcode', label: 'HSN Codes', route: '/criteria/hsn_codes' },
        { id: 'criteria_general_store_items', perm: 'general_store_items', icon: 'fa-cubes', label: 'General Store Items', route: '/general_stock/items' }
      ]
    },
    {
      title: "Admin & Support",
      items: [
        { id: 'admin_add_user', perm: 'add_user', icon: 'fa-user-gear', label: 'User Configuration', route: '/admin/add_user' },
        { id: 'admin_shifts', perm: 'shifts', icon: 'fa-business-time', label: 'Shifts', route: '/attendance/shifts' },
        { id: 'admin_data_management', perm: 'data_management', icon: 'fa-database', label: 'Data Management', route: '/data-management' },
        { id: 'admin_system_settings', perm: 'system_settings', icon: 'fa-sliders', label: 'System & Pipeline', route: '/admin/system_settings' },
        { id: 'admin_raise_ticket', perm: 'raise_ticket', icon: 'fa-headset', label: 'My Complaints', route: '/support/my_tickets' },
        { id: 'admin_helpdesk', perm: 'admin_helpdesk', icon: 'fa-ticket', label: 'Helpdesk', route: '/admin/all_tickets' },
        { id: 'admin_manage_support', perm: 'manage_support', icon: 'fa-users-gear', label: 'Support Team', route: '/admin/support_team' },
        { id: 'admin_user_activity', perm: 'user_activity', icon: 'fa-clock-rotate-left', label: 'User Activity Logs', route: '/admin/activities' }
      ]
    }
  ];

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
          width: 650px;
          gap: 16px;
        }

        .mega-menu-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          max-height: 390px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .dropdown-pillar-block {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dropdown-pillar-title {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border-light);
          padding-bottom: 6px;
          margin-bottom: 4px;
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

        /* 🌟 PANELS (QUICK ACTIONS & COMPLAINTS) 🌟 */
        .quick-action-panel {
          position: fixed; top: 0; right: -320px; width: 320px; height: 100vh;
          background: var(--surface-panel); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          box-shadow: none; border-left: 1px solid var(--border-light);
          z-index: 99999999; transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column;
        }
        .quick-action-panel.open { right: 0 !important; }
        
        .qa-header { height: 70px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;}
        .qa-title { font-size: 14px; font-weight: 800; color: var(--text-primary); }
        .qa-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .qa-btn {
          background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px;
          padding: 12px 16px; display: flex; align-items: center; gap: 12px; color: var(--text-primary); font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s;
          text-align: left;
        }
        [data-theme="light"] .qa-btn { background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
        .qa-btn:hover { border-color: var(--corp-dash); transform: translateY(-2px); }
        .qa-btn i { color: var(--corp-dash); font-size: 16px; }

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

        {/* Right side actions */}
        <div className="header-right-actions">
          
          {/* Quick Actions Trigger */}
          <div 
            className="icon-action-btn" 
            onClick={() => setQaPanelOpen(true)} 
            title="Quick Actions"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-plus"></i>
          </div>

          <div
            className="icon-action-btn"
            onClick={() => setActivePage('admin_raise_ticket', '/support/my_tickets')}
            title="Support & Helpdesk"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-headset" style={{ color: 'var(--corp-dash)' }}></i>
          </div>

          {/* Notifications Trigger */}
          <div 
            className="icon-action-btn" 
            onClick={() => { setNotifOpen(!notifOpen); setDropdownOpen(false); setColorOpen(false); }}
            title="Notifications"
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            <i className="fa-solid fa-bell"></i>
            {notifications.length > 0 && <div className="notification-dot"></div>}
          </div>

          {/* Theme switch button */}
          <div 
            className="icon-action-btn" 
            onClick={toggleTheme} 
            title="Switch Mode"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-circle-half-stroke"></i>
          </div>

          {/* Customize Colors Trigger */}
          <div 
            className="icon-action-btn" 
            onClick={() => { setColorOpen(!colorOpen); setDropdownOpen(false); setNotifOpen(false); }}
            title="Customize Colors"
            style={{ cursor: 'pointer' }}
          >
            <i className="fa-solid fa-palette"></i>
          </div>

          {/* User profile dropdown button */}
          <div 
            className={`corp-profile-btn ${dropdownOpen ? 'active' : ''}`} 
            onClick={() => { setDropdownOpen(!dropdownOpen); setNotifOpen(false); setColorOpen(false); }}
          >
            <div className="corp-avatar">
              {userName.trim() ? userName.trim().charAt(0).toUpperCase() : 'U'}
            </div>
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
                      <div className="dropdown-pillar-title">{cat.title}</div>
                      {allowedItems.map((item) => (
                        <div key={item.id} className="dropdown-item-row">
                          <a 
                            className="dropdown-submenu-item" 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              setActivePage(item.id, item.route);
                              setDropdownOpen(false);
                            }}
                          >
                            <i className={`fa-solid ${item.icon}`} style={{ fontSize: '12px', marginRight: '8px', color: 'var(--corp-dash)' }}></i>
                            {item.label}
                          </a>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Profile logout at bottom */}
              <div className="profile-logout-section">
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

      {/* ── Quick Actions Sidebar Panel ── */}
      <div className={`quick-action-panel ${qaPanelOpen ? 'open' : ''}`}>
        <div className="qa-header">
          <span className="qa-title">Quick Actions</span>
          <i className="fa-solid fa-xmark" style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }} onClick={() => setQaPanelOpen(false)}></i>
        </div>
        <div className="qa-body">
          <div className="qa-btn" onClick={() => { setActivePage('raw_material_purchasing', '/processing/raw_material_purchasing'); setQaPanelOpen(false); }}><i className="fa-solid fa-truck-ramp-box"></i> RM Purchase Entry</div>
          <div className="qa-btn" onClick={() => { setActivePage('production', '/processing/production'); setQaPanelOpen(false); }}><i className="fa-solid fa-industry"></i> Production Entry</div>
          <div className="qa-btn" onClick={() => { setActivePage('finance_packaging_bills', '/api/purchase/entry'); setQaPanelOpen(false); }}><i className="fa-solid fa-file-invoice"></i> Create Invoice</div>
          <div className="qa-btn" onClick={() => { setActivePage('export_shipment', '/export_documents/export_shipment/entry'); setQaPanelOpen(false); }}><i className="fa-solid fa-ship"></i> New Shipment</div>
          <div className="qa-btn" onClick={() => { setActivePage('finance_journal_entry', '/finance_accounts/journal_entry/entry'); setQaPanelOpen(false); }}><i className="fa-solid fa-book"></i> Journal Voucher</div>
        </div>
      </div>
    </>
  );
}
