import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiRequest } from '../services/api';
import { ErrorState, Kpi, Loading, number, Screen, SectionTitle } from '../components/NativeScreenKit';

const toDateValue = value => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const today = () => toDateValue(new Date());

export default function NativeProcessingDashboard({ onBack, title = 'Processing Dashboard', filters = {}, onOpenSource }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(today());
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [company, setCompany] = useState(filters.productionFor || '');
  const [location, setLocation] = useState(filters.location || '');
  const [dateOpen, setDateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ format: 'json', from_date: date, to_date: date, hour_date: date });
      if (company) query.set('production_for', company);
      if (location) query.set('location', location);
      const floorQuery = new URLSearchParams({ format: 'json' });
      if (company) floorQuery.set('production_for', company);
      if (location) floorQuery.set('location', location);
      const [payload, floorReport] = await Promise.all([
        apiRequest(`/dashboard/processing_dashboard?${query.toString()}`),
        apiRequest(`/reports/floor_balance_report?${floorQuery.toString()}`),
      ]);
      if (payload.status !== 'success') throw new Error(payload.message || 'Processing data is unavailable.');
      const floorTotal = (floorReport.rows_batch || []).reduce((sum, row) => sum + Number(row.available_qty || 0), 0);
      setData({ ...payload, floor_total: floorTotal });
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [company, date, location]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { apiRequest('/auth/global-dropdowns').then(payload => { setCompanies(payload.companies || []); setLocations(payload.locations || []); }).catch(() => {}); }, []);

  const dashboardFilters = {
    ...filters,
    companies: companies.length ? companies : (filters.companies || []),
    locations: locations.length ? locations : (filters.locations || []),
    productionFor: company,
    location,
    onProductionForChange: value => { setCompany(value); filters.onProductionForChange?.(value); },
    onLocationChange: value => { setLocation(value); filters.onLocationChange?.(value); },
  };

  return <Screen title={title} subtitle={date} globalFilters={dashboardFilters} onBack={onBack} onRefresh={load}>
    {loading ? <Loading text="Loading processing metrics…" /> : error ? <ErrorState message={error} onRetry={load} /> : <>
      <View style={styles.dateRow}><Text style={styles.dateLabel}>Dashboard Date</Text><Pressable onPress={() => setDateOpen(true)} style={styles.dateButton}><Text style={styles.dateButtonText}>▣  {date}</Text><Text style={styles.dateHint}>Tap to select</Text></Pressable></View>
      <View style={styles.kpis}>
        <Kpi label="Gate Entries" value={number(data.gate_today)} icon="🚪" color="#2563eb" onPress={() => onOpenSource?.('gate_entry')} /><Kpi label="RM Purchase" value={`${number(data.rmp_today)} KG`} icon="🚚" color="#16a34a" onPress={() => onOpenSource?.('raw_material_purchasing')} />
        <Kpi label="De-Heading" value={`${number(data.dh_today)} KG`} icon="✂️" color="#7c3aed" onPress={() => onOpenSource?.('de_heading')} /><Kpi label="Grading" value={`${number(data.grading_today)} KG`} icon="⚖️" color="#f59e0b" onPress={() => onOpenSource?.('grading')} />
        <Kpi label="Peeling" value={`${number(data.peeling_today)} KG`} icon="🧤" color="#0891b2" onPress={() => onOpenSource?.('peeling')} /><Kpi label="Soaking" value={`${number(data.soaking_today)} KG`} icon="💧" color="#0d9488" onPress={() => onOpenSource?.('soaking')} />
        <Kpi label="Production" value={`${number(data.production_today)} KG`} icon="🏭" color="#4f46e5" onPress={() => onOpenSource?.('production')} /><Kpi label="Floor Balance" value={`${number(data.floor_total)} KG`} icon="📦" color="#0284c7" onPress={() => onOpenSource?.('floor_balance_report')} />
      </View>
      <SectionTitle>Shift KPIs & Attendance</SectionTitle>
      {data.shift_kpis && data.shift_kpis.length > 0 && (
        <View style={styles.summary}>
          {data.shift_kpis.map((sk, idx) => (
            <View key={sk.name || idx} style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryMain}>{sk.name}</Text>
                <Text style={styles.summarySub}>
                  Inside: {sk.inside}  •  Break: {sk.break}  •  Vs Yest: {sk.diff}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.present}>P {number(sk.present)} / {number(sk.expected)}</Text>
                <Text style={[styles.absent, { fontSize: 11, fontWeight: '800' }]}>Absent: {number(sk.absent)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <SectionTitle>Raw Material Summary</SectionTitle><View style={styles.summary}>{(data.rm_summary || []).map((row, index) => <View key={`${row.species}-${row.variety}-${index}`} style={styles.summaryRow}><View><Text style={styles.summaryMain}>{row.species || '—'} • {row.variety || '—'}</Text><Text style={styles.summarySub}>Count: {row.count || '—'}</Text></View><Text style={styles.summaryValue}>{number(row.qty)} KG</Text></View>)}</View>
      <SectionTitle>Attendance Summary</SectionTitle>
      <View style={styles.summary}>{Object.entries(data.att_stats || {}).map(([key, value]) => <View key={key} style={styles.summaryRow}><Text style={styles.summaryLabel}>{key.replaceAll('_', ' ')}</Text><Text style={styles.summaryValue}>{number(value)}</Text></View>)}</View>
      <SectionTitle>Department Staff Summary</SectionTitle><SummaryGroups data={data.dept_summary} />
      <SectionTitle>Job Role Summary</SectionTitle><SummaryGroups data={data.desg_summary} />
    </>}
    <DatePicker visible={dateOpen} value={date} onClose={() => setDateOpen(false)} onChange={value => { setDate(value); setDateOpen(false); }} />
  </Screen>;
}

function DatePicker({ visible, value, onClose, onChange }) {
  const selected = new Date(`${value}T12:00:00`);
  const [month, setMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  useEffect(() => {
    if (visible) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [visible, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const cells = useMemo(() => {
    const firstDay = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  }, [month]);
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.calendarOverlay}><View style={styles.calendarCard}>
    <View style={styles.calendarHead}><Pressable onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable><Text style={styles.monthTitle}>{monthLabel}</Text><Pressable onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable></View>
    <View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>)}</View>
    <View style={styles.days}>{cells.map((day, index) => {
      if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
      const cellDate = new Date(month.getFullYear(), month.getMonth(), day);
      const dateValue = toDateValue(cellDate);
      const active = dateValue === value;
      return <Pressable key={dateValue} onPress={() => onChange(dateValue)} style={[styles.dayCell, active && styles.dayActive]}><Text style={[styles.dayText, active && styles.dayTextActive]}>{day}</Text></Pressable>;
    })}</View>
    <View style={styles.calendarActions}><Pressable onPress={() => onChange(today())} style={styles.todayButton}><Text style={styles.todayText}>Today</Text></Pressable><Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>Close</Text></Pressable></View>
  </View></View></Modal>;
}

function SummaryGroups({ data = {} }) { return <View style={styles.summary}>{Object.entries(data || {}).map(([key, value]) => <View key={key} style={styles.summaryRow}><Text style={styles.summaryMain}>{key}</Text><Text style={styles.present}>P {number(value.present)}  <Text style={styles.absent}>A {number(value.absent)}</Text></Text></View>)}</View>; }
const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 9, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 11, backgroundColor: '#fff' }, dateLabel: { color: '#64748b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, dateButton: { minWidth: 150, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#eff6ff' }, dateButtonText: { color: '#1d4ed8', fontSize: 11, fontWeight: '900' }, dateHint: { color: '#64748b', fontSize: 8.5, fontWeight: '700' },
  calendarOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#02061799' }, calendarCard: { width: '100%', maxWidth: 360, padding: 14, borderRadius: 18, backgroundColor: '#fff' }, calendarHead: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthButton: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#eff6ff' }, monthButtonText: { color: '#1d4ed8', fontSize: 25, fontWeight: '800' }, monthTitle: { color: '#0f172a', fontSize: 15, fontWeight: '900' }, weekRow: { flexDirection: 'row', marginTop: 6 }, weekDay: { width: '14.285%', color: '#64748b', fontSize: 10, fontWeight: '900', textAlign: 'center' }, days: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 }, dayCell: { width: '14.285%', height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, dayActive: { backgroundColor: '#2563eb' }, dayText: { color: '#334155', fontSize: 12, fontWeight: '800' }, dayTextActive: { color: '#fff' }, calendarActions: { flexDirection: 'row', gap: 8, marginTop: 10 }, todayButton: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#dbeafe' }, todayText: { color: '#1d4ed8', fontSize: 11, fontWeight: '900' }, closeButton: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9 }, closeText: { color: '#475569', fontSize: 11, fontWeight: '900' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, summary: { overflow: 'hidden', borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 14, backgroundColor: '#fff' }, summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef' }, summaryLabel: { color: '#64748b', fontSize: 13, fontWeight: '750', textTransform: 'capitalize' }, summaryMain: { color: '#1e3a5f', fontSize: 13, fontWeight: '850' }, summarySub: { marginTop: 3, color: '#64748b', fontSize: 9 }, summaryValue: { color: '#1e3a5f', fontSize: 11, fontWeight: '900' }, present: { color: '#16a34a', fontSize: 12, fontWeight: '900' }, absent: { color: '#dc2626' },
});
