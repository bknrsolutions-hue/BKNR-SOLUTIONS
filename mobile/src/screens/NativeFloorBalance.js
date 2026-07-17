import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiRequest } from '../services/api';
import { ErrorState, Loading, number, Screen, SectionTitle } from '../components/NativeScreenKit';
import { useERPTheme } from '../theme/ERPThemeContext';

const columns = [
  ['serial', '#', 28],
  ['location', 'Location', 74],
  ['production_for', 'Production For', 90],
  ['batch', 'Batch', 74],
  ['source', 'Source', 54],
  ['species', 'Species', 66],
  ['variety', 'Variety', 84],
  ['count', 'Count', 54],
  ['available_qty', 'Available KG', 76],
];
const tableWidth = columns.reduce((sum, column) => sum + column[2], 0);

export default function NativeFloorBalance({ onBack, filters = {} }) {
  const { theme } = useERPTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ format: 'json' });
      if (filters.productionFor) query.set('production_for', filters.productionFor);
      if (filters.location) query.set('location', filters.location);
      setData(await apiRequest(`/reports/floor_balance_report?${query.toString()}`));
    } catch (requestError) {
      setError(requestError.message || 'Floor balance is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [filters.location, filters.productionFor]);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows_batch || [];
  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.available_qty || 0), 0), [rows]);
  const groupedRows = useMemo(() => {
    const locations = new Map();
    rows.forEach(row => {
      const location = String(row.location || 'Unassigned');
      const company = String(row.production_for || 'General Stock');
      const batch = String(row.batch || 'No Batch');
      if (!locations.has(location)) locations.set(location, new Map());
      const companies = locations.get(location);
      if (!companies.has(company)) companies.set(company, new Map());
      const batches = companies.get(company);
      if (!batches.has(batch)) batches.set(batch, []);
      batches.get(batch).push(row);
    });

    const output = [];
    let serial = 1;
    [...locations.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([location, companies]) => {
      let locationTotal = 0;
      output.push({ type: 'locationHeader', label: location });
      [...companies.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([company, batches]) => {
        let companyTotal = 0;
        output.push({ type: 'companyHeader', label: company });
        [...batches.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([batch, batchRows]) => {
          const batchTotal = batchRows.reduce((sum, row) => sum + Number(row.available_qty || 0), 0);
          batchRows.forEach(row => output.push({ type: 'data', row: { ...row, serial: serial++ } }));
          output.push({ type: 'batchSubtotal', label: `Batch [${batch}] subtotal`, total: batchTotal });
          companyTotal += batchTotal;
        });
        output.push({ type: 'companySubtotal', label: `${company} subtotal`, total: companyTotal });
        locationTotal += companyTotal;
      });
      output.push({ type: 'locationSubtotal', label: `${location} subtotal`, total: locationTotal });
    });
    return output;
  }, [rows]);

  return <Screen title="Floor Balance" subtitle={`${rows.length} rows`} globalFilters={filters} onBack={onBack} onRefresh={load}>
    {loading ? <Loading text="Loading floor balance…" /> : error ? <ErrorState message={error} onRetry={load} /> : <>
      <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.totalLabel, { color: theme.muted }]}>GRAND NET BALANCE</Text>
        <Text style={[styles.totalValue, { color: theme.text }]}>{number(total)} KG</Text>
        {data?.snapshot_time ? <Text style={[styles.totalMeta, { color: theme.muted }]}>{data.snapshot_time}</Text> : null}
      </View>
      <SectionTitle>Floor Balance Stock Register</SectionTitle>
      <View style={[styles.tableShell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[styles.row, styles.header, { backgroundColor: theme.tableHead }]}>
              {columns.map(([key, label, width]) => <Text key={key} style={[styles.headerCell, { width }]}>{label}</Text>)}
            </View>
            <ScrollView style={styles.body} nestedScrollEnabled>
              {groupedRows.map((item, index) => item.type === 'data'
                ? <View key={`data-${item.row.serial}`} style={[styles.row, { borderTopColor: theme.border }]}>
                    {columns.map(([key, , width]) => <Text key={key} numberOfLines={2} style={[styles.cell, { width }, key === 'available_qty' && styles.qty]}>{key === 'available_qty' ? number(item.row[key]) : String(item.row[key] ?? '—')}</Text>)}
                  </View>
                : item.type === 'locationHeader'
                  ? <View key={`location-${item.label}`} style={[styles.groupRow, styles.locationHeader, { width: tableWidth }]}><Text style={styles.locationHeaderText}>{item.label.toUpperCase()}</Text></View>
                  : item.type === 'companyHeader'
                    ? <View key={`company-${item.label}-${index}`} style={[styles.groupRow, styles.companyHeader, { width: tableWidth }]}><Text style={styles.companyHeaderText}>COMPANY • {item.label}</Text></View>
                    : <View key={`${item.type}-${item.label}-${index}`} style={[styles.subtotalRow, item.type === 'companySubtotal' && styles.companySubtotal, item.type === 'locationSubtotal' && styles.locationSubtotal, { width: tableWidth }]}>
                        <Text style={styles.subtotalLabel}>{item.label}</Text><Text style={styles.subtotalValue}>{number(item.total)} KG</Text>
                      </View>)}
              {!rows.length ? <Text style={[styles.empty, { color: theme.muted }]}>No floor balance rows found.</Text> : null}
            </ScrollView>
            {rows.length ? <View style={[styles.grandRow, { width: tableWidth }]}><Text style={styles.grandLabel}>GRAND TOTAL</Text><Text style={styles.grandValue}>{number(total)} KG</Text></View> : null}
          </View>
        </ScrollView>
      </View>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  totalCard: { padding: 15, borderWidth: 1, borderRadius: 15 },
  totalLabel: { fontSize: 10, fontWeight: '900', letterSpacing: .6 },
  totalValue: { marginTop: 5, fontSize: 24, fontWeight: '900' },
  totalMeta: { marginTop: 3, fontSize: 9.5, fontWeight: '700' },
  tableShell: { overflow: 'hidden', borderWidth: 1, borderRadius: 12 },
  body: { maxHeight: 560 },
  row: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  header: { borderTopWidth: 0 },
  headerCell: { paddingHorizontal: 4, paddingVertical: 6, color: '#1e3a5f', fontSize: 7.5, lineHeight: 9, fontWeight: '900', textTransform: 'uppercase' },
  cell: { minHeight: 32, paddingHorizontal: 4, paddingVertical: 5, color: '#334155', fontSize: 8.5, lineHeight: 10, fontWeight: '650' },
  qty: { color: '#0f766e', fontWeight: '900', textAlign: 'right' },
  groupRow: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth },
  locationHeader: { borderLeftWidth: 4, borderLeftColor: '#2563eb', backgroundColor: '#dbeafe' },
  locationHeaderText: { color: '#1e3a5f', fontSize: 9, fontWeight: '900', letterSpacing: .4 },
  companyHeader: { paddingLeft: 14, backgroundColor: '#eef2ff' },
  companyHeaderText: { color: '#4338ca', fontSize: 8, fontWeight: '900', letterSpacing: .3 },
  subtotalRow: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbe3ef', backgroundColor: '#fff' },
  companySubtotal: { backgroundColor: '#f5f3ff' },
  locationSubtotal: { borderTopWidth: 1, borderTopColor: '#93c5fd', backgroundColor: '#eff6ff' },
  subtotalLabel: { color: '#64748b', fontSize: 7.5, fontWeight: '900', textTransform: 'uppercase' },
  subtotalValue: { minWidth: 76, color: '#0f766e', fontSize: 9, fontWeight: '900', textAlign: 'right' },
  grandRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 11, paddingHorizontal: 8, borderTopWidth: 2, borderTopColor: '#1d4ed8', backgroundColor: '#dbeafe' },
  grandLabel: { color: '#1e3a5f', fontSize: 9, fontWeight: '900' },
  grandValue: { minWidth: 86, color: '#1d4ed8', fontSize: 10, fontWeight: '900', textAlign: 'right' },
  empty: { width: tableWidth, padding: 22, fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
