import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import NativeDropdown from '../components/NativeDropdown';
import { apiRequest } from '../services/api';
import { Empty, ErrorState, Loading, number, Screen, SectionTitle } from '../components/NativeScreenKit';

const errorLabels = { GLOBAL_FILTER_REQUIRED: 'Select a plant location.', INVALID_SESSION: 'Session expired.', ALREADY_INSIDE: 'Employee is already inside.', DAILY_DUTY_LIMIT_REACHED: 'Daily duty limit reached.', NO_ACTIVE_DUTY: 'No active duty found.', ALREADY_ON_BREAK: 'Employee is already on break.' };

export default function NativeDailyAttendance({ onBack, filters = {} }) {
  const [meta, setMeta] = useState(null);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [rows, setRows] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [shift, setShift] = useState('GENERAL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filterShift, setFilterShift] = useState('ALL');
  const [audits, setAudits] = useState([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditTargetId, setAuditTargetId] = useState(null);
  const [voice, setVoice] = useState(true);

  const loadRows = useCallback(async target => {
    if (!target) { setRows([]); return; }
    const result = await apiRequest(`/attendance/today_all?location=${encodeURIComponent(target)}`);
    setRows(Array.isArray(result) ? result : []);
  }, []);

  const load = useCallback(async selected => {
    setLoading(true); setError('');
    try {
      const dropdowns = await apiRequest('/auth/global-dropdowns');
      setLocations(dropdowns.locations || []);
      const query = selected ? `&location=${encodeURIComponent(selected)}` : '';
      const page = await apiRequest(`/attendance/daily?format=json${query}`);
      setMeta(page);
      const actual = selected || page.actual_location || '';
      setLocation(actual);
      if (page.shifts?.length && shift === 'GENERAL') setShift(page.shifts[0].shift_name || 'GENERAL');
      await loadRows(actual);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [loadRows, shift]);

  useEffect(() => { void load(filters.location || ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectLocation = value => { setLocation(value); void load(value); };
  const activeRows = rows.filter(row => row.status !== 'CLOSED');
  const shiftOptions = meta?.shifts?.length ? meta.shifts : [{ shift_name: 'GENERAL', start_time: '', end_time: '', is_night_shift: false }];
  const filteredRows = filterShift === 'ALL' ? activeRows : activeRows.filter(row => (row.shift_name || 'GENERAL') === filterShift);
  const visibleRows = auditTargetId ? [...filteredRows].sort((a, b) => Number(String(b.id) === String(auditTargetId)) - Number(String(a.id) === String(auditTargetId))) : filteredRows;
  const showAudit = async () => { setAuditOpen(true); try { const result = await apiRequest('/attendance/audit_all'); setAudits(Array.isArray(result) ? result : (result.rows || [])); } catch { setAudits([]); } };
  const openAuditRow = recordId => {
    if (recordId === null || recordId === undefined || recordId === '') return;
    setAuditTargetId(String(recordId));
    setFilterShift('ALL');
    setAuditOpen(false);
  };
  const attendanceFilters = {
    ...filters,
    location,
    onLocationChange: value => { filters.onLocationChange?.(value); selectLocation(value); },
  };
  const punch = action => {
    if (!employeeId.trim()) { setError('Enter employee ID.'); return; }
    if (!location) { setError('Select a plant location.'); return; }
    setSubmitting(true); setError(''); setNotice('');
    apiRequest('/attendance/entry', { method: 'POST', body: JSON.stringify({ employee_id: employeeId.trim(), action, shift_name: shift || 'GENERAL', location }) })
      .then(result => { const text = `${result.employee_name || 'Employee'} ${action === 'IN' ? 'entry' : action === 'OUT' ? 'break out' : 'shift exit'} completed`; setNotice(result.message || text); if (voice) Speech.speak(text, { rate: .95 }); setEmployeeId(''); return loadRows(location); })
      .catch(requestError => setError(errorLabels[requestError.message] || requestError.message))
      .finally(() => setSubmitting(false));
  };

  return <Screen title="Daily Attendance" subtitle={location || 'Select location'} globalFilters={attendanceFilters} onBack={onBack} onRefresh={() => load(location)}>
    {loading ? <Loading text="Loading attendance terminal…" /> : error && !meta ? <ErrorState message={error} onRetry={() => load(location)} /> : <>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
      <SectionTitle>Attendance Filters</SectionTitle><NativeDropdown required label="Plant Location" values={locations} value={location} onChange={selectLocation} placeholder="Select location" /><Text style={styles.shiftFieldLabel}>SHIFT FILTER</Text><ShiftIcons shifts={shiftOptions} value={filterShift} onChange={setFilterShift} includeAll />
      <SectionTitle>Shift Summary</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}><Stat label="All Active" value={activeRows.length} active={filterShift === 'ALL'} onPress={() => setFilterShift('ALL')} /><Stat label="Present" value={activeRows.filter(row => row.status === 'OPEN').length} color="#16a34a" /><Stat label="On Break" value={activeRows.filter(row => row.status === 'AWAY').length} color="#f59e0b" /></ScrollView>
      <SectionTitle>Attendance Punch</SectionTitle><View style={styles.terminal}><TextInput style={styles.employeeInput} value={employeeId} onChangeText={setEmployeeId} placeholder="Employee ID" placeholderTextColor="#94a3b8" autoCapitalize="characters" /><Text style={styles.shiftFieldLabel}>WORK SHIFT *</Text><ShiftIcons shifts={shiftOptions} value={shift} onChange={setShift} /><View style={styles.actions}><Action label="SHIFT IN" color="#16a34a" disabled={submitting} onPress={() => punch('IN')} /><Action label="BREAK OUT" color="#f59e0b" disabled={submitting} onPress={() => punch('OUT')} /></View><View style={styles.actions}><Action label="BREAK IN" color="#0d9488" disabled={submitting} onPress={() => punch('IN')} /><Action label="CHECK OUT" color="#dc2626" disabled={submitting} onPress={() => punch('EXIT')} /></View></View>
      <View style={styles.tools}><Pressable onPress={() => setVoice(value => !value)} style={styles.auditButton}><Text style={styles.auditText}>{voice ? 'Voice On' : 'Voice Off'}</Text></Pressable><Pressable onPress={showAudit} style={styles.auditButton}><Text style={styles.auditText}>Terminal Log</Text></Pressable></View>
      <SectionTitle>Active Staff ({visibleRows.length})</SectionTitle>{visibleRows.length ? visibleRows.map((row, index) => <View key={`${row.employee_id}-${index}`} style={[styles.row, String(row.id) === String(auditTargetId) && styles.auditTargetRow]}><View style={styles.avatar}><Text style={styles.avatarText}>{String(row.employee_name || 'S').charAt(0)}</Text></View><View style={styles.rowCopy}><Text style={styles.name}>{row.employee_name}</Text><Text style={styles.meta}>Row ID #{row.id ?? '—'} • {row.employee_id} • {row.department} • {row.shift_name || 'GENERAL'}</Text><Text style={styles.movements}>{(row.movements || []).map(item => `${item.type} ${item.time}`).join('  •  ')}</Text></View><View><Text style={[styles.status, row.status === 'AWAY' && styles.away]}>{row.status}</Text><Text style={styles.hours}>{number(row.working_hours)} Hrs</Text></View></View>) : <Empty text="No active attendance records." />}
    </>}
    <Modal visible={auditOpen} animationType="slide" onRequestClose={() => setAuditOpen(false)}><View style={styles.auditPage}><View style={styles.auditHeader}><Text style={styles.auditTitle}>Terminal Log</Text><Pressable onPress={() => setAuditOpen(false)}><Text style={styles.auditClose}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.auditList}>{audits.map((item, index) => <Pressable key={item.id || index} onPress={() => openAuditRow(item.record_id)} style={styles.auditItem}><View style={styles.auditItemHead}><Text style={styles.auditMain}>{item.field_name || item.action || 'Attendance Action'}</Text><Text style={styles.auditRowId}>ROW ID #{item.record_id ?? '—'}</Text></View><Text style={styles.auditSub}>{item.edited_by || item.user || '—'} • {item.edited_at || item.timestamp || ''}</Text><Text style={styles.auditValue}>{item.new_value || item.details || ''}</Text><Text style={styles.auditLink}>Tap to open row ›</Text></Pressable>)}{!audits.length ? <Empty text="No terminal logs found." /> : null}</ScrollView></View></Modal>
  </Screen>;
}

function Action({ label, color, onPress, disabled }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, { backgroundColor: color }, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>; }
function Stat({ label, value, color = '#2563eb', active, onPress }) { return <Pressable onPress={onPress} style={[styles.stat, { borderLeftColor: color }, active && styles.statActive]}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></Pressable>; }

function ShiftIcons({ shifts, value, onChange, includeAll = false }) {
  const options = includeAll ? [{ shift_name: 'ALL', start_time: '', end_time: '', is_all: true }, ...shifts] : shifts;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shiftIcons}>{options.map(item => {
    const name = item.shift_name || 'GENERAL';
    const selected = value === name;
    const night = item.is_night_shift || /night/i.test(name);
    const icon = item.is_all ? 'account-group-outline' : night ? 'weather-night' : 'clock-time-four-outline';
    const timing = item.is_all ? 'All shifts' : item.start_time || item.end_time ? `${item.start_time || '—'}–${item.end_time || '—'}` : 'Work shift';
    return <Pressable key={name} onPress={() => onChange(name)} style={[styles.shiftIcon, selected && styles.shiftIconActive]}><View style={[styles.shiftIconCircle, selected && styles.shiftIconCircleActive]}><MaterialCommunityIcons name={icon} size={22} color={selected ? '#fff' : '#2563eb'} /></View><Text numberOfLines={1} style={[styles.shiftIconName, selected && styles.shiftIconNameActive]}>{name}</Text><Text numberOfLines={1} style={[styles.shiftIconTime, selected && styles.shiftIconTimeActive]}>{timing}</Text></Pressable>;
  })}</ScrollView>;
}

const styles = StyleSheet.create({ notice: { marginBottom: 10, padding: 10, borderWidth: 1, borderColor: '#86efac', borderRadius: 10, color: '#166534', backgroundColor: '#f0fdf4', fontSize: 12, fontWeight: '800' }, error: { marginBottom: 10, padding: 10, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, color: '#dc2626', backgroundColor: '#fef2f2', fontSize: 12, fontWeight: '800' }, shiftFieldLabel: { marginTop: 9, marginBottom: 5, color: '#64748b', fontSize: 8.5, fontWeight: '900', letterSpacing: .4 }, shiftIcons: { gap: 7, paddingBottom: 2 }, shiftIcon: { minWidth: 96, minHeight: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 12, backgroundColor: '#fff' }, shiftIconActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, shiftIconCircle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#dbeafe' }, shiftIconCircleActive: { backgroundColor: '#2563eb' }, shiftIconName: { maxWidth: 90, marginTop: 4, color: '#1e3a5f', fontSize: 9, fontWeight: '900' }, shiftIconNameActive: { color: '#1d4ed8' }, shiftIconTime: { maxWidth: 90, marginTop: 2, color: '#64748b', fontSize: 7.5, fontWeight: '700' }, shiftIconTimeActive: { color: '#2563eb' }, statsRow: { gap: 7 }, stat: { minWidth: 105, minHeight: 63, justifyContent: 'center', padding: 10, borderWidth: 1, borderLeftWidth: 4, borderColor: '#dbe3ef', borderRadius: 11, backgroundColor: '#fff' }, statActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, statLabel: { color: '#64748b', fontSize: 10, fontWeight: '900' }, statValue: { marginTop: 4, color: '#0f172a', fontSize: 16, fontWeight: '900' }, terminal: { gap: 11, padding: 13, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 15, backgroundColor: '#fff' }, employeeInput: { height: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 14, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 7 }, action: { flex: 1, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, actionText: { color: '#fff', fontSize: 12, fontWeight: '900' }, disabled: { opacity: .5 }, tools: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7 }, auditButton: { marginTop: 10, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, auditText: { color: '#2563eb', fontSize: 11, fontWeight: '900' }, row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' }, auditTargetRow: { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fef3c7' }, avatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#2563eb' }, avatarText: { color: '#fff', fontSize: 14, fontWeight: '900' }, rowCopy: { flex: 1, minWidth: 0 }, name: { color: '#0f172a', fontSize: 10, fontWeight: '900' }, meta: { marginTop: 3, color: '#64748b', fontSize: 10, fontWeight: '700' }, movements: { marginTop: 4, color: '#2563eb', fontSize: 9.5, fontWeight: '650' }, status: { color: '#16a34a', fontSize: 11, fontWeight: '900', textAlign: 'right' }, away: { color: '#d97706' }, hours: { marginTop: 3, color: '#2563eb', fontSize: 10, fontWeight: '800', textAlign: 'right' }, auditPage: { flex: 1, backgroundColor: '#f4f7fb' }, auditHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' }, auditTitle: { color: '#0f172a', fontSize: 14, fontWeight: '900' }, auditClose: { color: '#64748b', fontSize: 26 }, auditList: { padding: 14 }, auditItem: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef', backgroundColor: '#fff' }, auditItemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, auditMain: { color: '#2563eb', fontSize: 12, fontWeight: '900' }, auditRowId: { color: '#b45309', fontSize: 9, fontWeight: '900' }, auditSub: { marginTop: 4, color: '#64748b', fontSize: 7 }, auditValue: { marginTop: 5, color: '#1e3a5f', fontSize: 11, lineHeight: 13 }, auditLink: { marginTop: 7, color: '#2563eb', fontSize: 8.5, fontWeight: '900' } });
