import React, { useState, useEffect, useRef } from 'react';

export default function Header({ theme, toggleTheme, user, handleLogout, sidebarOpen, setSidebarOpen, setActivePage }) {
  const companyName = user?.company || 'BKNR SOLUTIONS PRIVATE LTD';
  const userName = user?.name || 'Administrator';
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [prodForFilter, setProdForFilter] = useState('');
  const [plantLocFilter, setPlantLocFilter] = useState('');
  const dropdownRef = useRef(null);

  // Accordion states inside dropdown console
  const [openSections, setOpenSections] = useState({
    'Business Masters': false,
    'Production Masters': false,
    'Inventory Masters': false,
    'Finance Masters': false
  });

  const toggleSection = (sectionName) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch dropdown options on load
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
  }, []);

  // Sync filters to localstorage / session (similar to broadcastUniversalFilters)
  const handleProdForChange = (val) => {
    setProdForFilter(val);
    localStorage.setItem('production_for_filter', val);
    // Dispatch custom event so iframe or other parts of layout can update if necessary
    window.dispatchEvent(new CustomEvent('filter_change', { detail: { production_for: val, location: plantLocFilter } }));
  };

  const handlePlantLocChange = (val) => {
    setPlantLocFilter(val);
    localStorage.setItem('plant_location_filter', val);
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('filter_change', { detail: { production_for: prodForFilter, location: val } }));
  };

  // Permission pipe matching allow() helper
  const permissions = user?.permissions || [];
  const isDefaultSuperAdmin = user?.email === "bknr.solutions@gmail.com";

  const allow = (key) => {
    if (isDefaultSuperAdmin) return true;
    if (!permissions) return false;
    if (typeof permissions === 'string') {
      return permissions === 'ALL' || permissions.split(',').includes(key);
    }
    return permissions.includes("ALL") || permissions.includes(key);
  };

  // Dropdown Console menu items layout
  const dropdownConsoleMenuConfig = [
    {
      title: "MASTERS",
      subgroups: [
        {
          name: "Business Masters",
          items: [
            { id: 'criteria_buyers', perm: 'buyers', icon: 'fa-circle-chevron-right', label: 'Buyers', badge: 'Mstr' },
            { id: 'criteria_buyer_agents', perm: 'buyer_agents', icon: 'fa-circle-chevron-right', label: 'Buyer Agents', badge: 'Mstr' },
            { id: 'criteria_suppliers', perm: 'suppliers', icon: 'fa-circle-chevron-right', label: 'Suppliers', badge: 'Mstr' },
            { id: 'criteria_vendors', perm: 'vendors', icon: 'fa-circle-chevron-right', label: 'Vendors', badge: 'Mstr' },
            { id: 'criteria_countries', perm: 'countries', icon: 'fa-circle-chevron-right', label: 'Countries', badge: 'Mstr' },
            { id: 'criteria_brands', perm: 'brands', icon: 'fa-circle-chevron-right', label: 'Brands', badge: 'Mstr' },
            { id: 'criteria_purchasing_locations', perm: 'purchasing_locations', icon: 'fa-circle-chevron-right', label: 'Purchasing Locations', badge: 'Mstr' }
          ]
        },
        {
          name: "Production Masters",
          items: [
            { id: 'criteria_species', perm: 'species', icon: 'fa-circle-chevron-right', label: 'Species', badge: 'Prod' },
            { id: 'criteria_varieties', perm: 'varieties', icon: 'fa-circle-chevron-right', label: 'Varieties', badge: 'Prod' },
            { id: 'criteria_grades', perm: 'grades', icon: 'fa-circle-chevron-right', label: 'Grades', badge: 'Prod' },
            { id: 'criteria_freezers', perm: 'freezers', icon: 'fa-circle-chevron-right', label: 'Freezers', badge: 'Prod' },
            { id: 'criteria_glazes', perm: 'glazes', icon: 'fa-circle-chevron-right', label: 'Glazes', badge: 'Prod' },
            { id: 'criteria_packing_styles', perm: 'packing_styles', icon: 'fa-circle-chevron-right', label: 'Packing Styles', badge: 'Prod' },
            { id: 'criteria_contractors', perm: 'contractors', icon: 'fa-circle-chevron-right', label: 'Contractors', badge: 'Prod' },
            { id: 'criteria_peeling_at', perm: 'peeling_at', icon: 'fa-circle-chevron-right', label: 'Peeling At', badge: 'Prod' },
            { id: 'criteria_peeling_rates', perm: 'peeling_rates', icon: 'fa-circle-chevron-right', label: 'Peeling Rates', badge: 'Prod' },
            { id: 'criteria_production_at', perm: 'production_at', icon: 'fa-circle-chevron-right', label: 'Production At', badge: 'Prod' },
            { id: 'criteria_production_for', perm: 'production_for', icon: 'fa-circle-chevron-right', label: 'Production For', badge: 'Prod' },
            { id: 'criteria_production_types', perm: 'production_types', icon: 'fa-circle-chevron-right', label: 'Production Types', badge: 'Prod' },
            { id: 'criteria_chemicals', perm: 'chemicals', icon: 'fa-circle-chevron-right', label: 'Chemicals', badge: 'Prod' },
            { id: 'criteria_purposes', perm: 'purposes', icon: 'fa-circle-chevron-right', label: 'Purposes', badge: 'Prod' },
            { id: 'criteria_grade_to_hoso', perm: 'grade_to_hoso', icon: 'fa-circle-chevron-right', label: 'Grade to HOSO', badge: 'Prod' },
            { id: 'criteria_hoso_hlso', perm: 'hoso_hlso', icon: 'fa-circle-chevron-right', label: 'HOSO & HLSO', badge: 'Prod' }
          ]
        },
        {
          name: "Inventory Masters",
          items: [
            { id: 'criteria_cold_storage', perm: 'cold_storage', icon: 'fa-warehouse', label: 'Cold Storage Master', badge: 'InvM' },
            { id: 'criteria_coldstore_locations', perm: 'coldstore_locations', icon: 'fa-circle-chevron-right', label: 'Coldstore Locations', badge: 'InvM' },
            { id: 'criteria_vehicle_numbers', perm: 'vehicle_numbers', icon: 'fa-circle-chevron-right', label: 'Vehicle Numbers', badge: 'InvM' }
          ]
        },
        {
          name: "Finance Masters",
          items: [
            { id: 'criteria_hsn_codes', perm: 'hsn_codes', icon: 'fa-circle-chevron-right', label: 'HSN Codes', badge: 'FinM' }
          ]
        }
      ]
    },
    {
      title: "ADMIN",
      items: [
        { id: 'admin_add_user', perm: 'add_user', icon: 'fa-user-gear', label: 'User Configuration', badge: 'Admin' },
        { id: 'admin_shifts', perm: 'shifts', icon: 'fa-user-gear', label: 'Shifts', badge: 'Admin' },
        { id: 'admin_data_management', perm: 'data_management', icon: 'fa-database', label: 'Data Management', badge: 'Admin' }
      ]
    },
    {
      title: "HELP & SUPPORT",
      items: [
        { id: 'admin_raise_ticket', perm: 'raise_ticket', icon: 'fa-ticket', label: 'My Complaints', badge: 'Help' }
      ]
    },
    {
      title: "SUPER ADMIN PANEL",
      roleRequired: "Super Admin",
      items: [
        { id: 'admin_helpdesk', perm: 'admin_helpdesk', icon: 'fa-headset', label: 'User Complaints (Helpdesk)', badge: 'Live' },
        { id: 'admin_manage_support', perm: 'manage_support', icon: 'fa-user-shield', label: 'Add Support Team', badge: 'Config' },
        { id: 'admin_user_activity', perm: 'user_activity', icon: 'fa-user-clock', label: 'User Activity Logs', badge: 'Logs' }
      ]
    }
  ];

  return (
    <header className="app-header">
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
          onClick={() => setDropdownOpen(!dropdownOpen)} 
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
        </div>
      </div>

      {/* Right side actions */}
      <div className="header-right-actions" ref={dropdownRef}>
        
        {/* Support Button */}
        <div 
          className="header-support-btn" 
          onClick={() => setActivePage('admin_raise_ticket')} 
          title="Help & Support"
        >
          <i className="fa-solid fa-headset"></i>
        </div>

        {/* Theme switch button */}
        <div 
          className="theme-toggle-btn" 
          onClick={toggleTheme} 
          title="Switch Mode"
        >
          <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
        </div>

        {/* User profile dropdown button */}
        <div 
          className={`user-profile ${dropdownOpen ? 'active' : ''}`} 
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <div className="avatar">
            <i className="fa-solid fa-user-astronaut"></i>
          </div>
          <span>{userName}</span>
          <i className="fa-solid fa-chevron-down chevron-down-icon"></i>
        </div>

        {/* Profile Dropdown Console Modal */}
        <div className={`profile-dropdown-console ${dropdownOpen ? 'show' : ''}`} style={{ display: dropdownOpen ? 'flex' : 'none' }}>
          
          {/* Universal Filters */}
          <div className="dropdown-filter-section">
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

          {/* Dropdown Menu Scroll Box */}
          <div className="dropdown-menu-scroll-box">
            {dropdownConsoleMenuConfig.map((cat, idx) => {
              if (cat.roleRequired) {
                const hasRoleAccess = (user?.role === cat.roleRequired) || isDefaultSuperAdmin;
                if (!hasRoleAccess) return null;
              }

              // Check permissions
              let hasVisible = false;
              if (cat.items) {
                hasVisible = cat.items.some(item => allow(item.perm));
              } else if (cat.subgroups) {
                hasVisible = cat.subgroups.some(sub => sub.items.some(item => allow(item.perm)));
              }
              if (!hasVisible) return null;

              const titleClass = cat.roleRequired ? "dropdown-pillar-title super-admin-title" : "dropdown-pillar-title";
              const catClass = `cat-${cat.title.split(' ')[0]}`;

              return (
                <div key={idx} className="dropdown-pillar-block">
                  <div className={titleClass}>{cat.title}</div>
                  <div className="dropdown-submenu-list">
                    
                    {/* Direct Items */}
                    {cat.items && cat.items.map((item) => {
                      if (!allow(item.perm)) return null;
                      const isSuperBadge = cat.roleRequired ? "super-badge" : "";

                      return (
                        <div key={item.id} className="dropdown-item-row">
                          <a 
                            className={`dropdown-submenu-item ${catClass}`} 
                            href="javascript:void(0)" 
                            onClick={() => {
                              setActivePage(item.id);
                              setDropdownOpen(false);
                            }}
                          >
                            <div>
                              <i className={`fa-solid ${item.icon}`}></i> 
                              {item.label}
                            </div>
                            <span className={`kpi-badge ${isSuperBadge}`}>{item.badge}</span>
                          </a>
                        </div>
                      );
                    })}

                    {/* Subgroup Accordions */}
                    {cat.subgroups && cat.subgroups.map((sub, sIdx) => {
                      let allowedSubItems = sub.items.filter(item => allow(item.perm));
                      if (allowedSubItems.length === 0) return null;
                      const isSubgroupOpen = !!openSections[sub.name];

                      return (
                        <div key={sIdx} className={`submenu-heading-block ${isSubgroupOpen ? 'open' : ''}`}>
                          <div 
                            className="submenu-heading-text" 
                            style={{ margin: 0, padding: '8px 6px' }} 
                            onClick={() => toggleSection(sub.name)}
                          >
                            <i className="fa-solid fa-chevron-right sub-chevron"></i>
                            <span>{sub.name}</span>
                          </div>
                          
                          <div className="reports-container">
                            {allowedSubItems.map((item) => (
                              <div key={item.id} className="dropdown-item-row" style={{ margin: '2px 0 2px 14px' }}>
                                <a 
                                  className={`dropdown-submenu-item ${catClass}`} 
                                  href="javascript:void(0)" 
                                  onClick={() => {
                                    setActivePage(item.id);
                                    setDropdownOpen(false);
                                  }}
                                >
                                  <div>
                                    <i className={`fa-solid ${item.icon}`}></i> 
                                    {item.label}
                                  </div>
                                  <span className="kpi-badge">{item.badge}</span>
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
            })}
          </div>

          {/* Dropdown logout at bottom */}
          <div className="dropdown-logout-wrapper">
            <button className="dropdown-logout-btn" onClick={handleLogout}>
              <i className="fa-solid fa-power-off"></i> sign out
            </button>
          </div>

        </div>

      </div>
    </header>
  );
}
