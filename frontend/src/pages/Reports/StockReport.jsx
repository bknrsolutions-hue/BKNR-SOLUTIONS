/**
 * StockReport.jsx – Stock Status Report (Inventory)
 */
import { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

const AGE_RANGES = [
  { key: '30', label: '0 - 30 Days', min: 0, max: 30, color: '#16a34a' },
  { key: '90', label: '31 - 90 Days', min: 31, max: 90, color: '#eab308' },
  { key: '150', label: '91 - 150 Days', min: 91, max: 150, color: '#ea580c' },
  { key: '300', label: '151 - 300 Days', min: 151, max: 300, color: '#ef4444' },
  { key: 'above', label: '300+ Days', min: 301, max: Number.POSITIVE_INFINITY, color: '#7f1d1d' },
];

function stockAgeDays(value) {
  if (!value) return 0;
  const recordDate = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(recordDate.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - recordDate.getTime()) / 86400000));
}

function summaryNode() {
  return { gradeQty: {}, totalQty: 0, children: new Map() };
}

function addSummaryQty(node, grade, quantity) {
  node.gradeQty[grade] = Number(node.gradeQty[grade] || 0) + quantity;
  node.totalQty += quantity;
}

function signedMovement(row, field) {
  let direction = String(row.cargo_movement_type || '').toUpperCase() === 'OUT' ? -1 : 1;
  if (row.is_cancelled === true) direction *= -1;
  return direction * Number(row[field] || 0);
}

export default function StockReport({ activeRoute, user }) {
  const routeBase = activeRoute?.split('?')[0] || activeRoute;
  const [fy, setFy]                     = useState('');
  const [fromDate, setFrom]             = useState('');
  const [toDate, setTo]                 = useState('');
  const [movFilter, setMov]             = useState('');
  const [batchFilter, setBatchFilter]   = useState('');
  const [brandFilter, setBrandFilter]   = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [varietyFilter, setVarietyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [activeTab, setActiveTab]       = useState('summary');
  const [ageFilter, setAgeFilter]       = useState(null);

  // Editing state
  const [selectedRow, setSelectedRow] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [auditOpen, setAuditOpen] = useState(false);

  const params = {};
  if (fy) params.fy = fy;
  if (fromDate) params.from_date = fromDate;
  if (toDate)   params.to_date   = toDate;

  const { data, loading, error, reload } = useReport({
    url: activeRoute, params, deps: [fy, fromDate, toDate],
  });

  const rawRows = data?.rows || [];
  const userPermissions = Array.isArray(user?.permissions)
    ? user.permissions
    : String(user?.permissions || '').split(',').map(value => value.trim()).filter(Boolean);
  const canEdit = Boolean(
    data?.is_admin
    || ['admin', 'super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase())
    || userPermissions.includes('ALL')
  );

  // Client-side filtering
  const generalRows = rawRows.filter(r => {
    if (movFilter && r.cargo_movement_type !== movFilter) return false;
    if (batchFilter && r.batch_number !== batchFilter) return false;
    if (brandFilter && r.brand !== brandFilter) return false;
    if (speciesFilter && r.species !== speciesFilter) return false;
    if (varietyFilter && r.variety !== varietyFilter) return false;
    if (locationFilter && r.production_at !== locationFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const ageQuantities = Object.fromEntries(AGE_RANGES.map(range => [range.key, 0]));
  generalRows.forEach(row => {
    const age = stockAgeDays(row.date);
    const range = AGE_RANGES.find(item => age >= item.min && age <= item.max);
    if (range) ageQuantities[range.key] += signedMovement(row, 'quantity');
  });
  const selectedAgeRange = AGE_RANGES.find(range => range.key === ageFilter);
  const rows = selectedAgeRange
    ? generalRows.filter(row => {
      const age = stockAgeDays(row.date);
      return age >= selectedAgeRange.min && age <= selectedAgeRange.max;
    })
    : generalRows;

  // Calculate unique filters lists
  const batchesList = [...new Set(rawRows.map(r => r.batch_number).filter(Boolean))].sort();
  const brandsList = data?.brands_list || [];
  const speciesList = data?.species_list || [];
  const varietiesList = data?.varieties_list || [];
  const locationsList = [...new Set(rawRows.map(r => r.production_at).filter(Boolean))].sort();

  // Grand totals
  const netStock = rows.reduce((sum, row) => sum + signedMovement(row, 'quantity'), 0);
  const netMc = rows.reduce((sum, row) => sum + signedMovement(row, 'no_of_mc'), 0);
  const netLoose = rows.reduce((sum, row) => sum + signedMovement(row, 'loose'), 0);
  const totalVal = rows.reduce((sum, row) => sum + Number(row.inventory_value || 0), 0);

  // The backend template treats stock status as signed IN/OUT balances.
  // Keep this presentation logic in React only; source records/formulas remain untouched.
  const uniqueKeyFields = [
    'batch_number', 'production_for', 'production_at', 'location', 'freezer',
    'packing_style', 'variety', 'glaze', 'grade'
  ];
  const uniqueMap = new Map();
  rows.forEach(row => {
    const key = uniqueKeyFields.map(field => String(row[field] ?? '').trim()).join('\u001f');
    const existing = uniqueMap.get(key) || { ...row, no_of_mc: 0, loose: 0, quantity: 0 };
    existing.no_of_mc += signedMovement(row, 'no_of_mc');
    existing.loose += signedMovement(row, 'loose');
    existing.quantity += signedMovement(row, 'quantity');
    if (String(row.date || '') >= String(existing.date || '')) {
      existing.date = row.date;
      existing.email = row.email;
    }
    uniqueMap.set(key, existing);
  });
  const uniqueRows = [...uniqueMap.values()]
    .filter(row => Math.abs(Number(row.quantity || 0)) > 0.0001 || Number(row.no_of_mc || 0) !== 0 || Number(row.loose || 0) !== 0)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      || String(a.production_for || '').localeCompare(String(b.production_for || ''))
      || String(a.production_at || '').localeCompare(String(b.production_at || ''))
      || String(a.location || '').localeCompare(String(b.location || ''))
      || String(a.freezer || '').localeCompare(String(b.freezer || ''))
      || String(a.variety || '').localeCompare(String(b.variety || ''))
      || String(a.grade || '').localeCompare(String(b.grade || ''))
      || String(a.glaze || '').localeCompare(String(b.glaze || ''))
      || String(a.batch_number || '').localeCompare(String(b.batch_number || '')));

  const summaryTree = new Map();
  uniqueRows.forEach(row => {
    const company = row.production_for || 'N/A';
    const unit = row.production_at || 'N/A';
    const freezer = row.freezer || 'N/A';
    const grade = row.grade || 'N/A';
    const quantity = Number(row.quantity || 0);
    if (!summaryTree.has(company)) summaryTree.set(company, summaryNode());
    const companyNode = summaryTree.get(company);
    if (!companyNode.children.has(unit)) companyNode.children.set(unit, summaryNode());
    const unitNode = companyNode.children.get(unit);
    if (!unitNode.children.has(freezer)) unitNode.children.set(freezer, summaryNode());
    const freezerNode = unitNode.children.get(freezer);
    const comboKey = [row.variety || 'N/A', row.glaze || 'N/A', row.packing_style || 'N/A'].join('\u001f');
    if (!freezerNode.children.has(comboKey)) {
      const comboNode = summaryNode();
      comboNode.description = [row.variety, row.glaze, row.packing_style].filter(Boolean).join(' / ') || 'N/A';
      freezerNode.children.set(comboKey, comboNode);
    }
    const comboNode = freezerNode.children.get(comboKey);
    [companyNode, unitNode, freezerNode, comboNode].forEach(node => addSummaryQty(node, grade, quantity));
  });
  const gradeColumns = [...new Set([
    ...(data?.grades_list || []),
    ...uniqueRows.map(row => row.grade).filter(Boolean),
  ])].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
  const summaryRows = [];
  let summaryIndex = 1;
  [...summaryTree.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([company, companyNode]) => {
    summaryRows.push({ key: `company-${company}`, type: 'company', label: `Company: ${company}`, node: companyNode });
    [...companyNode.children.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([unit, unitNode]) => {
      summaryRows.push({ key: `unit-${company}-${unit}`, type: 'unit', label: `Unit: ${unit}`, node: unitNode });
      [...unitNode.children.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([freezer, freezerNode]) => {
        summaryRows.push({ key: `freezer-${company}-${unit}-${freezer}`, type: 'freezer', label: `Freezer: ${freezer}`, node: freezerNode });
        [...freezerNode.children.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([combo, comboNode]) => {
          if (Math.abs(comboNode.totalQty) <= 0.01) return;
          summaryRows.push({ key: `item-${company}-${unit}-${freezer}-${combo}`, type: 'item', index: summaryIndex++, label: comboNode.description, node: comboNode });
        });
      });
    });
  });

  const getExportUrl = (type) => {
    let url = `${routeBase}/export_${type}?from_date=${fromDate}&to_date=${toDate}&type=${movFilter}&batch=${encodeURIComponent(batchFilter)}&brand=${encodeURIComponent(brandFilter)}&species=${encodeURIComponent(speciesFilter)}&variety=${encodeURIComponent(varietyFilter)}&location=${encodeURIComponent(locationFilter)}`;
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
    if (pf) url += `&production_for=${encodeURIComponent(pf)}`;
    if (loc) url += `&location=${encodeURIComponent(loc)}`;
    return url;
  };

  const handleEdit = () => {
    if (!selectedRow) {
      window.alert('Detailed Ledger lo edit cheyyalsina row ni select cheyyandi.');
      return;
    }
    setEditData({ ...selectedRow });
    setIsEditing(true);
    setActiveTab('ledger');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleSave = async () => {
    if (!selectedRow || !isEditing) {
      window.alert('First Edit Selected Row option click cheyyandi.');
      return;
    }
    try {
      const response = await fetch(`${routeBase}/update`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...editData, id: selectedRow.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.message || 'Update failed');
      setIsEditing(false);
      setEditData({});
      setSelectedRow(null);
      window.alert('Stock row updated successfully.');
      reload();
    } catch (saveError) {
      window.alert(`Update Failed: ${saveError.message}`);
    }
  };

  const renderEditField = (row, field, options = [], type = 'text') => {
    const selected = selectedRow?.id === row.id;
    if (!isEditing || !selected) return row[field] ?? '';
    if (options.length) {
      return (
        <InlineSearchableSelect
          value={editData[field] || ''}
          onChange={value => setEditData(current => ({ ...current, [field]: value }))}
          options={options}
        />
      );
    }
    return (
      <input
        className="edit-input"
        type={type}
        value={editData[field] ?? ''}
        onChange={event => setEditData(current => ({
          ...current,
          [field]: type === 'number' ? Number(event.target.value) : event.target.value,
        }))}
      />
    );
  };

  const menuActions = [
    ...(canEdit ? [
      { label: 'Edit Selected Row', onClick: handleEdit },
      { label: 'Save Changes', onClick: handleSave },
      { label: 'Cancel Edit', onClick: handleCancelEdit },
      { divider: true },
    ] : []),
    { label: 'View Audit Logs', onClick: () => setAuditOpen(true) },
    { divider: true },
    { label: 'Print Native Table', onClick: () => window.print() },
    { label: 'Export PDF', onClick: () => { window.location.href = getExportUrl('pdf'); } }
  ];

  return (
    <div className="report-viewer-card stock-report-page">
      <ReportHeader
        title={`Stock Ledger Report${data?.company_name ? ` - ${data.company_name}` : ''}`}
        subtitle={`${rows.length} records loaded`}
        loading={loading}
        onReload={reload}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
        </FilterBox>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFrom} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setTo} />
        </FilterBox>
        <FilterBox label="Movement">
          <FilterSelect value={movFilter} onChange={setMov}>
            <option value="">ALL MOVEMENTS</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Batch #">
          <FilterSelect value={batchFilter} onChange={setBatchFilter}>
            <option value="">ALL BATCHES</option>
            {batchesList.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Brand">
          <FilterSelect value={brandFilter} onChange={setBrandFilter}>
            <option value="">ALL BRANDS</option>
            {brandsList.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Species">
          <FilterSelect value={speciesFilter} onChange={setSpeciesFilter}>
            <option value="">ALL SPECIES</option>
            {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={varietyFilter} onChange={setVarietyFilter}>
            <option value="">ALL VARIETIES</option>
            {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Location">
          <FilterSelect value={locationFilter} onChange={setLocationFilter}>
            <option value="">ALL LOCATIONS</option>
            {locationsList.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} placeholder="Search anything..." />
        </FilterBox>
      </FilterBar>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {rows.length} rows found
        </div>
        <RowActionMenu actions={menuActions} />
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && data && (
        <div className="stock-report-data">
          <div className="stock-age-grid">
            {AGE_RANGES.map(range => (
              <button
                type="button"
                key={range.key}
                className={`stock-age-card ${ageFilter === range.key ? 'active' : ''}`}
                style={{ borderLeftColor: range.color }}
                onClick={() => setAgeFilter(current => current === range.key ? null : range.key)}
              >
                <span>{range.label}</span>
                <strong>{fmt.number(ageQuantities[range.key])} KG</strong>
              </button>
            ))}
          </div>

          <div className="report-tabs" style={{ display: 'flex', gap: 8, margin: '8px 0', overflowX: 'auto' }}>
            {[
              ['summary', '📊 Grouped Summary'],
              ['ledger', '📋 Detailed Ledger'],
              ['unique', '📍 Location Wise Data'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`btn ${activeTab === key ? 'btn-primary' : ''}`}
                onClick={() => setActiveTab(key)}
                style={{ whiteSpace: 'nowrap' }}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && (
            <div className="table-responsive" style={{ maxHeight: 600, overflowY: 'auto' }}>
              <table className="bknr-table stock-summary-matrix" style={{ minWidth: Math.max(360, 280 + gradeColumns.length * 76), width: '100%' }}>
                <thead><tr><th style={{ width: 45 }}>#</th><th style={{ minWidth: 210 }}>Product Description</th>{gradeColumns.map(grade => <th className="text-right" key={grade}>{grade}</th>)}<th className="text-right">Total Qty (KG)</th></tr></thead>
                <tbody>
                  {summaryRows.length === 0 ? <EmptyRow cols={gradeColumns.length + 3} /> : summaryRows.map(row => (
                    <tr key={row.key} className={`stock-summary-${row.type}`}>
                      <td className="text-center">{row.type === 'item' ? row.index : ''}</td>
                      <td>{row.label} {row.type !== 'item' && <strong>({fmt.number(row.node.totalQty)} KG)</strong>}</td>
                      {gradeColumns.map(grade => <td className="text-right" key={grade}>{Math.abs(Number(row.node.gradeQty[grade] || 0)) > 0.001 ? fmt.number(row.node.gradeQty[grade]) : ''}</td>)}
                      <td className="text-right" style={{ fontWeight: 900, color: 'var(--corp-rep)' }}>{fmt.number(row.node.totalQty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2} className="text-right">GRAND TOTALS (STOCK IN HAND):</td>{gradeColumns.map(grade => <td className="text-right" key={grade}>{fmt.number([...summaryTree.values()].reduce((sum, node) => sum + Number(node.gradeQty[grade] || 0), 0))}</td>)}<td className="text-right">{fmt.number(netStock)}</td></tr></tfoot>
              </table>
            </div>
          )}

          {activeTab === 'unique' && (
            <div className="table-responsive" style={{ maxHeight: 600, overflowY: 'auto' }}>
              <table className="bknr-table" style={{ minWidth: 1950, width: '100%' }}>
                <thead><tr>
                  <th>#</th><th>Date</th><th>Batch #</th><th>Type of Production</th><th>Brand</th><th>Species</th><th>Location</th><th>PO #</th><th>Production For</th><th>Unit</th><th>Freezer</th><th>Pack Style</th><th>Variety</th><th>Glaze</th><th>Grade</th><th>No of MC</th><th>Loose Qty</th><th>Qty (KG)</th><th>System User</th>
                </tr></thead>
                <tbody>
                  {uniqueRows.length === 0 ? <EmptyRow cols={19} /> : uniqueRows.map((row, index) => (
                    <tr key={`${uniqueKeyFields.map(field => row[field] ?? '').join('-')}-${index}`}>
                      <td className="text-center">{index + 1}</td><td>{row.date}</td><td>{row.batch_number}</td><td>{row.type_of_production}</td><td>{row.brand}</td><td>{row.species}</td><td>{row.location}</td><td>{row.po_number}</td><td>{row.production_for}</td><td>{row.production_at}</td><td>{row.freezer}</td><td>{row.packing_style}</td><td>{row.variety}</td><td>{row.glaze}</td><td>{row.grade}</td><td className="text-right">{fmt.number(row.no_of_mc)}</td><td className="text-right">{fmt.number(row.loose)}</td><td className="text-right">{fmt.number(row.quantity)}</td><td>{row.email ? row.email.split('@')[0] : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={15} className="text-right">TOTAL (STOCK IN HAND):</td><td className="text-right">{fmt.number(netMc)}</td><td className="text-right">{fmt.number(netLoose)}</td><td className="text-right">{fmt.number(netStock)}</td><td /></tr></tfoot>
              </table>
            </div>
          )}

          {activeTab === 'ledger' && <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 2100, width: '100%' }}>
              <thead><tr><th>#</th><th>Date</th><th>Batch #</th><th>Type of Production</th><th>Type</th><th>Brand</th><th>Species</th><th>Location</th><th>PO #</th><th>Production For</th><th>Unit</th><th>Freezer</th><th>Pack Style</th><th>Variety</th><th>Glaze</th><th>Grade</th><th>No of MC</th><th>Loose Qty</th><th>Qty (KG)</th><th>Purpose</th><th>System User</th></tr></thead>
              <tbody>
                {rows.length === 0 ? <EmptyRow cols={21} /> : rows.map((row, index) => {
                  const selected = selectedRow?.id === row.id;
                  const outRow = String(row.cargo_movement_type).toUpperCase() === 'OUT';
                  return (
                    <tr
                      key={row.id || index}
                      onClick={() => { if (!isEditing) setSelectedRow(row); }}
                      style={{
                        background: selected ? 'rgba(139,92,246,0.12)' : (outRow ? 'rgba(239,68,68,0.05)' : undefined),
                        borderLeft: selected ? '3px solid var(--corp-rep)' : undefined,
                        cursor: isEditing ? 'default' : 'pointer',
                      }}
                    >
                      <td>{rows.length - index}</td>
                      <td>{row.date}</td>
                      <td>{renderEditField(row, 'batch_number')}</td>
                      <td>{renderEditField(row, 'type_of_production', data?.type_of_production_list || [])}</td>
                      <td style={{ color: outRow ? '#ef4444' : '#10b981', fontWeight: 800 }}>{row.cargo_movement_type}</td>
                      <td>{renderEditField(row, 'brand', data?.brands_list || [])}</td>
                      <td>{renderEditField(row, 'species', data?.species_list || [])}</td>
                      <td>{renderEditField(row, 'location')}</td>
                      <td>{row.po_number}</td>
                      <td>{row.production_for}</td>
                      <td>{row.production_at}</td>
                      <td>{renderEditField(row, 'freezer', data?.freezers_list || [])}</td>
                      <td>{renderEditField(row, 'packing_style', data?.packing_styles_list || [])}</td>
                      <td>{renderEditField(row, 'variety', data?.varieties_list || [])}</td>
                      <td>{renderEditField(row, 'glaze', data?.glazes_list || [])}</td>
                      <td>{renderEditField(row, 'grade', data?.grades_list || [])}</td>
                      <td className="text-right">{isEditing && selected ? renderEditField(row, 'no_of_mc', [], 'number') : fmt.number(row.no_of_mc)}</td>
                      <td className="text-right">{isEditing && selected ? renderEditField(row, 'loose', [], 'number') : fmt.number(row.loose)}</td>
                      <td className="text-right">{fmt.number(row.quantity)}</td>
                      <td>{renderEditField(row, 'purpose')}</td>
                      <td>{row.email ? row.email.split('@')[0] : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={16} className="text-right">GRAND TOTALS (STOCK IN HAND):</td><td className="text-right">{fmt.number(netMc)}</td><td className="text-right">{fmt.number(netLoose)}</td><td className="text-right">{fmt.number(netStock)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>}

          {activeTab === 'legacy-ledger' && <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 2300, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 70 }}>Time</th>
                  <th style={{ width: 110 }}>Batch No</th>
                  <th style={{ width: 90 }}>Movement</th>
                  <th style={{ width: 130 }}>Brand</th>
                  <th style={{ width: 120 }}>Species</th>
                  <th style={{ width: 150 }}>Variety</th>
                  <th style={{ width: 80 }}>Grade</th>
                  <th style={{ width: 80 }}>Glaze</th>
                  <th style={{ width: 100 }}>Freezer</th>
                  <th style={{ width: 130 }}>Pack Style</th>
                  <th style={{ width: 80 }} className="text-right">MC</th>
                  <th style={{ width: 80 }} className="text-right">Loose</th>
                  <th style={{ width: 100 }} className="text-right">Qty (Kg)</th>
                  <th style={{ width: 110 }}>Location</th>
                  <th style={{ width: 110 }}>PO Number</th>
                  <th style={{ width: 140 }}>Prod For</th>
                  <th style={{ width: 140 }}>Prod At</th>
                  <th style={{ width: 100 }} className="text-right">Cost/Kg</th>
                  <th style={{ width: 110 }} className="text-right">Inv Value</th>
                  <th style={{ width: 120 }}>Type</th>
                  <th style={{ width: 100 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow cols={23} />
                ) : (
                  rows.map((row, index) => {
                    const isSelected = selectedRow?.id === row.id;
                    const isOut = (row.cargo_movement_type || '').toUpperCase() === 'OUT';
                    const slNo = rows.length - index;

                    return (
                      <tr
                        key={row.id}
                        onClick={() => {
                          if (!isEditing) {
                            setSelectedRow(row);
                          }
                        }}
                        style={{
                          background: isSelected ? 'rgba(139,92,246,0.08)' : (isOut ? 'rgba(239, 68, 68, 0.05)' : undefined),
                          borderLeft: isSelected ? '3px solid var(--corp-rep)' : undefined,
                          cursor: 'pointer',
                        }}
                      >
                        <td className="text-center">{slNo}</td>
                        <td className="text-center">{row.date}</td>
                        <td className="text-center">{row.time}</td>
                        <td className="text-center" style={{ fontWeight: 700 }}>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.batch_number || ''}
                              onChange={e => setEditData({ ...editData, batch_number: e.target.value })}
                            />
                          ) : (
                            row.batch_number
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <select
                              className="edit-input"
                              value={editData.cargo_movement_type}
                              onChange={e => setEditData({ ...editData, cargo_movement_type: e.target.value })}
                            >
                              <option value="IN">IN</option>
                              <option value="OUT">OUT</option>
                            </select>
                          ) : (
                            <span className="badge" style={{
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontWeight: 800,
                              background: isOut ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isOut ? '#ef4444' : '#10b981',
                              border: isOut ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)'
                            }}>
                              {row.cargo_movement_type}
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.brand}
                              onChange={val => setEditData({ ...editData, brand: val })}
                              options={data?.brands_list || []}
                            />
                          ) : (
                            row.brand
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.species}
                              onChange={val => setEditData({ ...editData, species: val })}
                              options={data?.species_list || []}
                            />
                          ) : (
                            row.species
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.variety}
                              onChange={val => setEditData({ ...editData, variety: val })}
                              options={data?.varieties_list || []}
                            />
                          ) : (
                            row.variety
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.grade}
                              onChange={val => setEditData({ ...editData, grade: val })}
                              options={data?.grades_list || []}
                            />
                          ) : (
                            row.grade
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.glaze}
                              onChange={val => setEditData({ ...editData, glaze: val })}
                              options={data?.glazes_list || []}
                            />
                          ) : (
                            row.glaze
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.freezer}
                              onChange={val => setEditData({ ...editData, freezer: val })}
                              options={data?.freezers_list || []}
                            />
                          ) : (
                            row.freezer
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.packing_style}
                              onChange={val => setEditData({ ...editData, packing_style: val })}
                              options={data?.packing_styles_list || []}
                            />
                          ) : (
                            row.packing_style
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              type="number"
                              className="edit-input text-right"
                              value={editData.no_of_mc ?? 0}
                              onChange={e => setEditData({ ...editData, no_of_mc: Number(e.target.value) })}
                            />
                          ) : (
                            fmt.number(row.no_of_mc)
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              type="number"
                              className="edit-input text-right"
                              value={editData.loose ?? 0}
                              onChange={e => setEditData({ ...editData, loose: Number(e.target.value) })}
                            />
                          ) : (
                            fmt.number(row.loose)
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {fmt.number(row.quantity)}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.location || ''}
                              onChange={e => setEditData({ ...editData, location: e.target.value })}
                            />
                          ) : (
                            row.location
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.po_number || ''}
                              onChange={e => setEditData({ ...editData, po_number: e.target.value })}
                            />
                          ) : (
                            row.po_number
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.production_for}
                              onChange={val => setEditData({ ...editData, production_for: val })}
                              options={data?.production_for_list || []}
                            />
                          ) : (
                            row.production_for
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.production_at}
                              onChange={val => setEditData({ ...editData, production_at: val })}
                              options={data?.production_at_list || []}
                            />
                          ) : (
                            row.production_at
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              type="number"
                              className="edit-input text-right"
                              value={editData.product_kg_value ?? 0}
                              onChange={e => setEditData({ ...editData, product_kg_value: Number(e.target.value) })}
                            />
                          ) : (
                            fmt.currency(row.product_kg_value)
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {fmt.currency(row.inventory_value)}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.type_of_production}
                              onChange={val => setEditData({ ...editData, type_of_production: val })}
                              options={data?.type_of_production_list || []}
                            />
                          ) : (
                            row.type_of_production
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {row.email ? row.email.split('@')[0] : ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={12} className="text-right">PAGE TOTALS (NET = IN - OUT):</td>
                  <td className="text-right">{fmt.number(netMc)} MC</td>
                  <td className="text-right">{fmt.number(netLoose)} Lse</td>
                  <td className="text-right" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                    {fmt.number(netStock)} KG
                  </td>
                  <td colSpan={5}></td>
                  <td className="text-right" style={{ color: 'var(--accent)' }}>
                    {fmt.currency(totalVal)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>}
        </div>
      )}

      {!loading && !data && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          Select a <strong>Financial Year</strong> or date range to load Stock data.
        </div>
      )}

      {/* Audit Logs Drawer */}
      <AuditDrawer
        isOpen={auditOpen}
        onClose={() => setAuditOpen(false)}
        auditUrl={`${routeBase}/audit_all`}
      />

    </div>
  );
}
