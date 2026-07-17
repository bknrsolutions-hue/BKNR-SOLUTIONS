import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NativeDropdown from '../components/NativeDropdown';
import { apiRequest } from '../services/api';
import { Empty, ErrorState, Kpi, Loading, number, Screen, SectionTitle } from '../components/NativeScreenKit';

const signed = (row, field) => (row.is_cancelled ? -1 : 1) * (String(row.cargo_movement_type || '').toUpperCase() === 'OUT' ? -1 : 1) * Number(row[field] || 0);
const ageDays = value => value ? Math.max(0, Math.floor((Date.now() - new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime()) / 86400000)) : 0;
const ageCards = [[0, 30, '0–30'], [31, 90, '31–90'], [91, 150, '91–150'], [151, 300, '151–300'], [301, 999999, '300+']];
const ledgerColumns = [
  ['serial', '#', 34], ['date', 'Date', 68], ['batch_number', 'Batch #', 76], ['type_of_production', 'Production Type', 92],
  ['cargo_movement_type', 'Type', 48], ['brand', 'Brand', 72], ['species', 'Species', 68], ['location', 'Location', 72],
  ['po_number', 'PO #', 66], ['production_for', 'Production For', 90], ['production_at', 'Unit', 76], ['freezer', 'Freezer', 62],
  ['packing_style', 'Pack Style', 84], ['variety', 'Variety', 84], ['glaze', 'Glaze', 56], ['grade', 'Grade', 58],
  ['no_of_mc', 'MC', 50], ['loose', 'Loose', 50], ['quantity', 'Qty KG', 68], ['purpose', 'Purpose', 76], ['email', 'User', 76],
];
const locationColumns = ledgerColumns.filter(([key]) => !['cargo_movement_type', 'purpose'].includes(key));
const numericKeys = new Set(['no_of_mc', 'loose', 'quantity']);

export default function NativeStockStatus({ onBack, filters = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fy, setFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [movement, setMovement] = useState('');
  const [batch, setBatch] = useState('');
  const [brand, setBrand] = useState('');
  const [species, setSpecies] = useState('');
  const [variety, setVariety] = useState('');
  const [location, setLocation] = useState('');
  const [age, setAge] = useState(null);
  const [tab, setTab] = useState('summary');
  const [audits, setAudits] = useState([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditTargetId, setAuditTargetId] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ format: 'json' });
      if (fy) query.set('fy', fy);
      if (fromDate) query.set('from_date', fromDate);
      if (toDate) query.set('to_date', toDate);
      if (filters.productionFor) query.set('production_for', filters.productionFor);
      if (filters.location) query.set('location', filters.location);
      setData(await apiRequest(`/inventory/stock_report?${query.toString()}`));
    }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [filters.location, filters.productionFor, fromDate, fy, toDate]);
  useEffect(() => { void load(); }, [load]);

  const report = useMemo(() => {
    const generalRows = (data?.rows || []).filter(row =>
      (!movement || row.cargo_movement_type === movement)
      && (!batch || row.batch_number === batch)
      && (!brand || row.brand === brand)
      && (!species || row.species === species)
      && (!variety || row.variety === variety)
      && (!location || row.production_at === location)
      && (!search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))
    );
    const ageQuantities = ageCards.map(([min, max]) => generalRows.filter(row => ageDays(row.date) >= min && ageDays(row.date) <= max).reduce((sum, row) => sum + signed(row, 'quantity'), 0));
    const filteredRows = age ? generalRows.filter(row => ageDays(row.date) >= age[0] && ageDays(row.date) <= age[1]) : generalRows;
    const map = new Map();
    filteredRows.forEach(row => {
      const key = [row.batch_number, row.production_for, row.production_at, row.location, row.freezer, row.packing_style, row.variety, row.glaze, row.grade].join('|');
      const item = map.get(key) || { ...row, no_of_mc: 0, loose: 0, quantity: 0 };
      item.no_of_mc += signed(row, 'no_of_mc'); item.loose += signed(row, 'loose'); item.quantity += signed(row, 'quantity');
      if (String(row.date || '') >= String(item.date || '')) { item.date = row.date; item.email = row.email; }
      map.set(key, item);
    });
    const uniqueRows = [...map.values()].filter(row => Math.abs(row.quantity) > .001 || row.no_of_mc || row.loose).sort((a, b) =>
      String(a.production_for || '').localeCompare(String(b.production_for || ''))
      || String(a.production_at || '').localeCompare(String(b.production_at || ''))
      || String(a.location || '').localeCompare(String(b.location || ''))
      || String(a.freezer || '').localeCompare(String(b.freezer || ''))
      || String(a.variety || '').localeCompare(String(b.variety || ''))
      || String(a.grade || '').localeCompare(String(b.grade || ''))
    );
    const grades = [...new Set([...(data?.grades_list || []), ...uniqueRows.map(row => row.grade).filter(Boolean)])].sort();
    const tree = new Map();
    uniqueRows.forEach(row => {
      const company = row.production_for || 'N/A'; const unit = row.production_at || 'N/A'; const freezer = row.freezer || 'N/A';
      const combo = [row.variety || 'N/A', row.glaze || 'N/A', row.packing_style || 'N/A'].join(' / ');
      if (!tree.has(company)) tree.set(company, { total: 0, grades: {}, units: new Map() });
      const companyNode = tree.get(company);
      if (!companyNode.units.has(unit)) companyNode.units.set(unit, { total: 0, grades: {}, freezers: new Map() });
      const unitNode = companyNode.units.get(unit);
      if (!unitNode.freezers.has(freezer)) unitNode.freezers.set(freezer, { total: 0, grades: {}, items: new Map() });
      const freezerNode = unitNode.freezers.get(freezer);
      if (!freezerNode.items.has(combo)) freezerNode.items.set(combo, { total: 0, grades: {} });
      [companyNode, unitNode, freezerNode, freezerNode.items.get(combo)].forEach(node => {
        node.total += Number(row.quantity || 0); node.grades[row.grade || 'N/A'] = Number(node.grades[row.grade || 'N/A'] || 0) + Number(row.quantity || 0);
      });
    });
    const summaryRows = []; let index = 1;
    [...tree.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([company, companyNode]) => {
      summaryRows.push({ type: 'company', label: `Company: ${company}`, node: companyNode });
      [...companyNode.units.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([unit, unitNode]) => {
        summaryRows.push({ type: 'unit', label: `Unit: ${unit}`, node: unitNode });
        [...unitNode.freezers.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([freezer, freezerNode]) => {
          summaryRows.push({ type: 'freezer', label: `Freezer: ${freezer}`, node: freezerNode });
          [...freezerNode.items.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([label, node]) => {
            if (Math.abs(node.total) > .01) summaryRows.push({ type: 'item', index: index++, label, node });
          });
        });
      });
    });
    const totals = filteredRows.reduce((sum, row) => ({ mc: sum.mc + signed(row, 'no_of_mc'), loose: sum.loose + signed(row, 'loose'), qty: sum.qty + signed(row, 'quantity') }), { mc: 0, loose: 0, qty: 0 });
    return { filteredRows, uniqueRows, grades, summaryRows, ageQuantities, totals };
  }, [age, batch, brand, data, location, movement, search, species, variety]);
  const balances = report.uniqueRows;
  const totals = report.totals;
  const lists = useMemo(() => ({ batches: [...new Set((data?.rows || []).map(row => row.batch_number).filter(Boolean))], brands: data?.brands_list || [], species: data?.species_list || [], varieties: data?.varieties_list || [], locations: [...new Set((data?.rows || []).map(row => row.production_at).filter(Boolean))] }), [data]);
  const financialYearOptions = useMemo(() => (data?.financial_years || []).map(year => `FY ${year}-${Number(year) + 1}`), [data]);
  const selectedFinancialYear = fy ? `FY ${fy}-${Number(fy) + 1}` : '';
  const changeFinancialYear = value => setFy(value ? (String(value).match(/\d{4}/)?.[0] || '') : '');
  const openAudit = async () => { setAuditOpen(true); try { const result = await apiRequest('/inventory/stock_report/audit_all'); setAudits(Array.isArray(result) ? result : []); } catch { setAudits([]); } };
  const openAuditRow = recordId => {
    if (recordId === null || recordId === undefined || recordId === '') return;
    setAuditTargetId(String(recordId));
    setAuditOpen(false);
    setTab('ledger');
    setFy(''); setFromDate(''); setToDate('');
    setSearch(''); setMovement(''); setBatch(''); setBrand(''); setSpecies(''); setVariety(''); setLocation(''); setAge(null);
  };
  const resetReportFilters = () => {
    setFy(''); setFromDate(''); setToDate('');
    setSearch(''); setMovement(''); setBatch(''); setBrand(''); setSpecies(''); setVariety(''); setLocation(''); setAge(null);
  };

  return <Screen title="Stock Status" subtitle={`${balances.length} stock balances`} globalFilters={filters} onBack={onBack} onRefresh={load}>
    {loading ? <Loading text="Loading stock status…" /> : error ? <ErrorState message={error} onRetry={load} /> : <>
      <View style={styles.kpis}><Kpi label="Net MC" value={number(totals.mc)} color="#2563eb" /><Kpi label="Net Quantity" value={`${number(totals.qty)} KG`} color="#16a34a" /></View>
      <View style={styles.filterPanel}>
        <View style={styles.filterPanelHead}><View><Text style={styles.filterEyebrow}>INVENTORY REPORT</Text><Text style={styles.filterTitle}>Report Filters</Text></View><Pressable onPress={resetReportFilters} style={styles.resetButton}><MaterialCommunityIcons name="filter-remove-outline" size={15} color="#2563eb" /><Text style={styles.resetText}>Reset</Text></Pressable></View>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={18} color="#2563eb" /><TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search batch, variety, grade, location…" placeholderTextColor="#718299" />{search ? <Pressable onPress={() => setSearch('')}><MaterialCommunityIcons name="close-circle" size={17} color="#94a3b8" /></Pressable> : null}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
          <NativeDropdown compact style={styles.filterColumn} label="Financial Year" values={financialYearOptions} value={selectedFinancialYear} onChange={changeFinancialYear} placeholder="All financial years" />
          <View style={styles.filterColumn}><Text style={styles.filterLabel}>From Date</Text><TextInput style={styles.dateInput} value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.filterColumn}><Text style={styles.filterLabel}>To Date</Text><TextInput style={styles.dateInput} value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" keyboardType="numbers-and-punctuation" /></View>
          <NativeDropdown compact style={styles.filterColumn} label="Movement" values={['IN', 'OUT']} value={movement} onChange={setMovement} placeholder="All movements" />
          <NativeDropdown compact style={styles.filterColumn} label="Batch" values={lists.batches} value={batch} onChange={setBatch} placeholder="All batches" />
          <NativeDropdown compact style={styles.filterColumn} label="Brand" values={lists.brands} value={brand} onChange={setBrand} placeholder="All brands" />
          <NativeDropdown compact style={styles.filterColumn} label="Species" values={lists.species} value={species} onChange={setSpecies} placeholder="All species" />
          <NativeDropdown compact style={styles.filterColumn} label="Variety" values={lists.varieties} value={variety} onChange={setVariety} placeholder="All varieties" />
          <NativeDropdown compact style={styles.filterColumn} label="Location" values={lists.locations} value={location} onChange={setLocation} placeholder="All locations" />
        </ScrollView>
      </View>
      <SectionTitle>Stock Ageing</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageRow}>{ageCards.map((card, index) => <Pressable key={card[2]} onPress={() => setAge(age?.[0] === card[0] ? null : [card[0], card[1]])} style={[styles.ageCard, age?.[0] === card[0] && styles.ageActive]}><Text style={styles.ageLabel}>{card[2]} Days</Text><Text style={styles.ageQty}>{number(report.ageQuantities[index])} KG</Text></Pressable>)}</ScrollView>
      <View style={styles.tabs}><Tab label="Grouped Summary" active={tab === 'summary'} onPress={() => setTab('summary')} /><Tab label="Detailed Ledger" active={tab === 'ledger'} onPress={() => setTab('ledger')} /><Tab label="Location Wise" active={tab === 'location'} onPress={() => setTab('location')} /></View>
      <View style={styles.reportHeading}><View><Text style={styles.reportEyebrow}>STOCK REGISTER</Text><Text style={styles.reportTitle}>{tab === 'summary' ? 'Grouped Summary' : tab === 'ledger' ? 'Detailed Ledger' : 'Location Wise Data'}</Text></View><Pressable onPress={openAudit} style={styles.auditButton}><MaterialCommunityIcons name="history" size={16} color="#2563eb" /><Text style={styles.auditText}>Audit History</Text></Pressable></View>
      {tab === 'summary'
        ? <SummaryMatrix rows={report.summaryRows} grades={report.grades} total={totals.qty} />
        : tab === 'ledger'
          ? <StockTable rows={report.filteredRows.map((row, index) => ({ ...row, serial: report.filteredRows.length - index }))} columns={ledgerColumns} totals={totals} ledger highlightId={auditTargetId} />
          : <StockTable rows={report.uniqueRows.map((row, index) => ({ ...row, serial: index + 1 }))} columns={locationColumns} totals={totals} />}
    </>}
    <Modal visible={auditOpen} animationType="slide" onRequestClose={() => setAuditOpen(false)}><View style={styles.auditPage}><View style={styles.auditHeader}><Text style={styles.auditTitle}>Stock Audit History</Text><Pressable onPress={() => setAuditOpen(false)}><Text style={styles.auditClose}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.auditList}>{audits.map((item, index) => <Pressable key={item.id || index} onPress={() => openAuditRow(item.record_id)} style={styles.auditItem}><View style={styles.auditItemHead}><Text style={styles.auditMain}>{item.field_name || item.action || 'Stock Change'}</Text><Text style={styles.auditRowId}>ROW ID #{item.record_id ?? '—'}</Text></View><Text style={styles.auditSub}>{item.edited_by || item.email || '—'} • {item.edited_at || item.timestamp || item.date || ''}</Text><Text style={styles.auditValue}>{item.new_value || item.details || ''}</Text><Text style={styles.auditLink}>Tap to open register row ›</Text></Pressable>)}{!audits.length ? <Empty text="No audit records found." /> : null}</ScrollView></View></Modal>
  </Screen>;
}

function Tab({ label, active, onPress }) { return <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>; }
function SummaryMatrix({ rows, grades, total }) {
  const fixedBodyRef = useRef(null);
  const { width: screenWidth } = useWindowDimensions();
  const descriptionWidth = Math.round(screenWidth * .35);
  const rightWidth = Math.max(76, grades.length * 62 + 76);
  const rowStyle = row => [styles.tableLine, styles.summaryLine, row.type === 'company' && styles.summaryCompany, row.type === 'unit' && styles.summaryUnit, row.type === 'freezer' && styles.summaryFreezer];
  const descriptionRowStyle = row => [styles.descriptionRow, row.type === 'company' && styles.descriptionCompanyRow, row.type === 'unit' && styles.descriptionUnitRow, row.type === 'freezer' && styles.descriptionFreezerRow, row.type === 'item' && styles.descriptionItemRow];
  const descriptionTextStyle = row => [styles.descriptionCell, row.type === 'company' && styles.companyText, row.type === 'unit' && styles.unitText, row.type === 'freezer' && styles.freezerText, row.type === 'item' && styles.itemText];
  const subtotalTextStyle = row => [row.type !== 'item' && styles.subtotalValue, row.type === 'company' && styles.companyValue, row.type === 'unit' && styles.unitValue, row.type === 'freezer' && styles.freezerValue];
  const description = row => `${row.label}${row.type !== 'item' ? ` (${number(row.node.total)} KG)` : ''}`;
  const syncFixedRows = event => fixedBodyRef.current?.scrollTo({ y: event.nativeEvent.contentOffset.y, animated: false });

  return <View style={[styles.tableShell, styles.summaryShell]}>
    <View style={[styles.summaryFixedPane, { width: descriptionWidth }]}>
      <View style={styles.tableHead}><Text style={[styles.th, styles.descriptionHead, { width: descriptionWidth }]}>Product Description</Text></View>
      <ScrollView ref={fixedBodyRef} style={styles.tableBody} scrollEnabled={false} showsVerticalScrollIndicator={false}>
        {rows.length ? rows.map((row, index) => <View key={`fixed-${row.type}-${row.label}-${index}`} style={[rowStyle(row), descriptionRowStyle(row)]}><Text numberOfLines={2} style={[styles.td, descriptionTextStyle(row), { width: descriptionWidth }]}>{description(row)}</Text></View>) : <Text style={styles.noData}>No balances</Text>}
      </ScrollView>
      <View style={[styles.tableTotal, styles.summaryFixedTotal]}><Text style={styles.totalLabel}>GRAND TOTAL</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.summaryScrollable}>
      <View style={{ width: rightWidth }}>
        <View style={styles.tableHead}>{grades.map(grade => <Text key={grade} style={[styles.th, styles.numericCell, { width: 62 }]}>{grade}</Text>)}<Text style={[styles.th, styles.numericCell, { width: 76 }]}>Total Qty KG</Text></View>
        <ScrollView style={styles.tableBody} nestedScrollEnabled scrollEventThrottle={16} onScroll={syncFixedRows}>
          {rows.length ? rows.map((row, index) => <View key={`values-${row.type}-${row.label}-${index}`} style={rowStyle(row)}>{grades.map(grade => <Text key={grade} style={[styles.td, styles.numericCell, subtotalTextStyle(row), { width: 62 }]}>{Math.abs(Number(row.node.grades[grade] || 0)) > .001 ? number(row.node.grades[grade]) : ''}</Text>)}<Text style={[styles.td, styles.totalCell, subtotalTextStyle(row), { width: 76 }]}>{number(row.node.total)}</Text></View>) : <Text style={styles.noData}>No stock balances found.</Text>}
        </ScrollView>
        <View style={styles.tableTotal}><Text style={styles.totalNumber}>{number(total)} KG</Text></View>
      </View>
    </ScrollView>
  </View>;
}

function StockTable({ rows, columns, totals, ledger = false, highlightId = null }) {
  const width = columns.reduce((sum, column) => sum + column[2], 0);
  const orderedRows = highlightId ? [...rows].sort((a, b) => Number(String(b.id) === String(highlightId)) - Number(String(a.id) === String(highlightId))) : rows;
  const value = (row, key) => {
    if (key === 'email') return row.email ? String(row.email).split('@')[0] : '—';
    if (numericKeys.has(key)) return number(row[key]);
    return String(row[key] ?? '—');
  };
  return <View style={styles.tableShell}><ScrollView horizontal showsHorizontalScrollIndicator><View style={{ width }}><View style={styles.tableHead}>{columns.map(([key, label, cellWidth]) => <Text key={key} style={[styles.th, { width: cellWidth }, numericKeys.has(key) && styles.numericCell]}>{label}</Text>)}</View><ScrollView style={styles.tableBody} nestedScrollEnabled>{orderedRows.length ? orderedRows.slice(0, 250).map((row, index) => <View key={row.id || `${row.batch_number}-${index}`} style={[styles.tableLine, index % 2 === 1 && styles.alternateLine, ledger && String(row.cargo_movement_type).toUpperCase() === 'OUT' && styles.outLine, row.is_cancelled && styles.cancelledLine, String(row.id) === String(highlightId) && styles.auditTargetRow]}>{columns.map(([key, , cellWidth]) => <Text key={key} numberOfLines={2} style={[styles.td, { width: cellWidth }, numericKeys.has(key) && styles.numericCell, key === 'cargo_movement_type' && (String(row[key]).toUpperCase() === 'OUT' ? styles.outText : styles.inText)]}>{value(row, key)}</Text>)}</View>) : <Text style={styles.noData}>No stock data found.</Text>}</ScrollView><View style={styles.tableTotal}><Text style={styles.totalLabel}>{ledger ? 'GRAND TOTALS' : 'TOTAL STOCK IN HAND'}</Text><Text style={styles.totalNumber}>{number(totals.mc)} MC  •  {number(totals.loose)} Loose  •  {number(totals.qty)} KG</Text></View></View></ScrollView></View>;
}
const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  filterPanel: { marginTop: 10, padding: 9, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 12, backgroundColor: '#f8fafc' },
  filterPanelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  filterEyebrow: { color: '#2563eb', fontSize: 7.5, fontWeight: '900', letterSpacing: .7 },
  filterTitle: { marginTop: 1, color: '#0f172a', fontSize: 12, fontWeight: '900' },
  resetButton: { height: 29, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, backgroundColor: '#eff6ff' },
  resetText: { color: '#2563eb', fontSize: 8.5, fontWeight: '900' },
  searchBox: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' },
  search: { flex: 1, height: 34, padding: 0, color: '#0f172a', fontSize: 9.5, fontWeight: '700' },
  filterStrip: { gap: 6, paddingBottom: 1 },
  filterColumn: { width: 112, flex: 0 },
  dateInput: { height: 36, paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, color: '#0f172a', backgroundColor: '#fff', fontSize: 9.5, fontWeight: '750' },
  filterLabel: { marginBottom: 4, color: '#64748b', fontSize: 8.5, fontWeight: '900', letterSpacing: .4, textTransform: 'uppercase' },
  ageRow: { gap: 6 },
  ageCard: { minWidth: 105, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderLeftWidth: 4, borderColor: '#dbe3ef', borderLeftColor: '#f59e0b', borderRadius: 9, backgroundColor: '#fff' },
  ageActive: { borderColor: '#2563eb', backgroundColor: '#dbeafe' },
  ageLabel: { color: '#64748b', fontSize: 8.5, fontWeight: '900' },
  ageQty: { marginTop: 3, color: '#1e3a5f', fontSize: 10, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 5, marginTop: 12 },
  tab: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', padding: 3, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#fff' },
  tabActive: { borderColor: '#0b2345', backgroundColor: '#0b2345' },
  tabText: { color: '#64748b', fontSize: 8.5, fontWeight: '900', textAlign: 'center' },
  tabTextActive: { color: '#fff' },
  reportHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  reportEyebrow: { color: '#64748b', fontSize: 7.5, fontWeight: '900', letterSpacing: .65 },
  reportTitle: { marginTop: 2, color: '#0f172a', fontSize: 13, fontWeight: '900' },
  auditButton: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, backgroundColor: '#eff6ff' },
  auditText: { color: '#2563eb', fontSize: 9, fontWeight: '900' },
  tableShell: { overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: .07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  summaryShell: { flexDirection: 'row' },
  summaryFixedPane: { zIndex: 2, borderRightWidth: 1, borderRightColor: '#dbe3ef', backgroundColor: '#fff' },
  summaryScrollable: { flex: 1 },
  summaryLine: { height: 26, minHeight: 26, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  summaryFixedTotal: { justifyContent: 'flex-start' },
  tableHead: { minHeight: 21, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0b2345' },
  tableBody: { maxHeight: 520 },
  tableLine: { minHeight: 19, flexDirection: 'row', alignItems: 'center', borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' },
  alternateLine: { backgroundColor: '#f8fafc' },
  th: { paddingHorizontal: 3, paddingVertical: 2, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#31577d', color: '#ffffff', fontSize: 7.8, lineHeight: 8.3, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center', textTransform: 'uppercase' },
  td: { minHeight: 19, paddingHorizontal: 3, paddingVertical: 1.5, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#e2e8f0', color: '#1f2f43', fontSize: 8.6, lineHeight: 9, fontWeight: '850', textAlign: 'center', textAlignVertical: 'center' },
  numericCell: { textAlign: 'right' },
  centerCell: { textAlign: 'center' },
  descriptionHead: { paddingLeft: 7, textAlign: 'left' },
  descriptionRow: { backgroundColor: '#fff' },
  descriptionCompanyRow: { backgroundColor: '#fff' },
  descriptionUnitRow: { backgroundColor: '#fff' },
  descriptionFreezerRow: { backgroundColor: '#fff' },
  descriptionItemRow: { backgroundColor: '#fff' },
  descriptionCell: { paddingLeft: 4, paddingRight: 2, paddingVertical: 1.5, lineHeight: 9, fontWeight: '900', textAlign: 'left', flexWrap: 'wrap' },
  companyText: { color: '#1d4ed8', fontWeight: '900' },
  unitText: { paddingLeft: 8, color: '#6d28d9', fontWeight: '900' },
  freezerText: { paddingLeft: 12, color: '#0f766e', fontWeight: '900' },
  itemText: { paddingLeft: 16, color: '#334155', fontWeight: '850' },
  subtotalValue: { fontWeight: '900' },
  companyValue: { color: '#1d4ed8' },
  unitValue: { color: '#6d28d9' },
  freezerValue: { color: '#0f766e' },
  totalCell: { color: '#1d4ed8', fontWeight: '900', textAlign: 'right' },
  summaryCompany: { backgroundColor: '#fff' },
  summaryUnit: { backgroundColor: '#fff' },
  summaryFreezer: { backgroundColor: '#fff' },
  outLine: { backgroundColor: '#fef2f2' },
  cancelledLine: { opacity: .55, backgroundColor: '#f1f5f9' },
  auditTargetRow: { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fef3c7' },
  outText: { color: '#dc2626', fontWeight: '900' },
  inText: { color: '#15803d', fontWeight: '900' },
  tableTotal: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 8, borderTopWidth: 2, borderTopColor: '#67e8f9', backgroundColor: '#0b2345' },
  totalLabel: { color: '#ffffff', fontSize: 8, fontWeight: '900' },
  totalNumber: { color: '#67e8f9', fontSize: 9.5, fontWeight: '900', textAlign: 'right' },
  noData: { padding: 22, color: '#64748b', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  auditPage: { flex: 1, backgroundColor: '#f4f7fb' },
  auditHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' },
  auditTitle: { color: '#0f172a', fontSize: 14, fontWeight: '900' },
  auditClose: { color: '#64748b', fontSize: 26 },
  auditList: { padding: 14 },
  auditItem: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' },
  auditItemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  auditMain: { color: '#2563eb', fontSize: 12, fontWeight: '900' },
  auditRowId: { color: '#b45309', fontSize: 9, fontWeight: '900' },
  auditSub: { marginTop: 4, color: '#64748b', fontSize: 7 },
  auditValue: { marginTop: 5, color: '#1e3a5f', fontSize: 11, lineHeight: 13 },
  auditLink: { marginTop: 7, color: '#2563eb', fontSize: 8.5, fontWeight: '900' },
});
