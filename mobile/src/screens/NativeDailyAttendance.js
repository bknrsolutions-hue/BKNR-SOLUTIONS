import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { apiRequest } from '../services/api';
import { downloadAndShare } from '../services/download';
import { Empty, ErrorState, Loading, Screen } from '../components/NativeScreenKit';

const ERROR_MESSAGES = {
  GLOBAL_FILTER_REQUIRED: 'Select one plant location in the global filter.',
  INVALID_SESSION: 'Session expired. Please login again.',
  ALREADY_INSIDE: 'Employee is already inside the plant.',
  DAILY_DUTY_LIMIT_REACHED: 'Daily duty limit has been reached for this employee.',
  NO_ACTIVE_DUTY: 'No active duty was found for this employee.',
  ALREADY_ON_BREAK: 'Employee is already on break.',
};

const SHIFT_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#db2777'];

export default function NativeDailyAttendance({ onBack, filters = {} }) {
  const toastTimer = useRef(null);
  const employeeInput = useRef(null);
  const [meta, setMeta] = useState(null);
  const [location, setLocation] = useState(filters.location || '');
  const [rows, setRows] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [activeShift, setActiveShift] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audits, setAudits] = useState([]);
  const [auditTargetId, setAuditTargetId] = useState(null);

  const showToast = useCallback((kind, message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, message });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const loadRows = useCallback(async targetLocation => {
    if (!targetLocation) {
      setRows([]);
      return;
    }
    try {
      const result = await apiRequest(`/attendance/today_all?location=${encodeURIComponent(targetLocation)}`);
      setRows(Array.isArray(result) ? result : []);
      setError('');
    } catch (requestError) {
      setError(ERROR_MESSAGES[requestError.message] || requestError.message);
    }
  }, []);

  const loadPage = useCallback(async locationOverride => {
    const selectedLocation = locationOverride ?? location ?? '';
    setLoading(true);
    setError('');
    try {
      const query = selectedLocation ? `&location=${encodeURIComponent(selectedLocation)}` : '';
      const page = await apiRequest(`/attendance/daily?format=json${query}`);
      const actualLocation = page.actual_location || selectedLocation || '';
      setMeta(page);
      setLocation(actualLocation);
      await loadRows(actualLocation);
    } catch (requestError) {
      setError(ERROR_MESSAGES[requestError.message] || requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loadRows, location]);

  useEffect(() => {
    void loadPage(filters.location || '');
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const nextLocation = filters.location || '';
    if (nextLocation !== location) void loadPage(nextLocation);
  }, [filters.location]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const clockTimer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    if (!location) return undefined;
    const refreshTimer = setInterval(() => void loadRows(location), 15000);
    return () => clearInterval(refreshTimer);
  }, [loadRows, location]);

  const activeRows = useMemo(() => rows.filter(row => row.status !== 'CLOSED'), [rows]);
  const visibleRows = useMemo(() => {
    const filtered = activeShift === 'ALL'
      ? activeRows
      : activeRows.filter(row => (row.shift_name || 'GENERAL') === activeShift);
    if (!auditTargetId) return filtered;
    return [...filtered].sort((a, b) => Number(String(b.id) === String(auditTargetId)) - Number(String(a.id) === String(auditTargetId)));
  }, [activeRows, activeShift, auditTargetId]);
  const shifts = meta?.shifts || [];

  const punch = useCallback(async (action, shiftName = 'GENERAL') => {
    const id = employeeId.trim();
    if (!id) {
      showToast('error', 'Enter or scan an Employee ID.');
      employeeInput.current?.focus();
      return;
    }
    if (!location) {
      showToast('error', ERROR_MESSAGES.GLOBAL_FILTER_REQUIRED);
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiRequest('/attendance/entry', {
        method: 'POST',
        body: JSON.stringify({ employee_id: id, action, shift_name: shiftName || 'GENERAL', location }),
      });
      const label = action === 'OUT' ? 'Break started' : action === 'EXIT' ? 'Shift checked out' : 'Punch in recorded';
      const message = `${result.employee_name || id}: ${label}.`;
      showToast('success', message);
      if (voiceEnabled) {
        const speech = action === 'OUT' ? 'Break started' : action === 'EXIT' ? 'Checkout successful. Goodbye.' : `Welcome ${result.employee_name || ''}`;
        Speech.speak(speech, { rate: 1 });
      }
      setEmployeeId('');
      await loadRows(location);
    } catch (requestError) {
      showToast('error', ERROR_MESSAGES[requestError.message] || requestError.message);
    } finally {
      setSubmitting(false);
      setTimeout(() => employeeInput.current?.focus(), 0);
    }
  }, [employeeId, loadRows, location, showToast, voiceEnabled]);

  const openAudit = useCallback(async () => {
    setMenuOpen(false);
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const result = await apiRequest('/attendance/audit_all');
      setAudits(Array.isArray(result) ? result : []);
    } catch (requestError) {
      showToast('error', ERROR_MESSAGES[requestError.message] || requestError.message);
    } finally {
      setAuditLoading(false);
    }
  }, [showToast]);

  const exportList = useCallback(async () => {
    setMenuOpen(false);
    if (!location) {
      showToast('error', ERROR_MESSAGES.GLOBAL_FILTER_REQUIRED);
      return;
    }
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadAndShare(
        `/attendance/export/excel?location=${encodeURIComponent(location)}`,
        `SVBK_Daily_Attendance_${location}_${date}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (requestError) {
      showToast('error', requestError.message);
    }
  }, [location, showToast]);

  const attendanceFilters = {
    ...filters,
    location,
    onLocationChange: value => {
      filters.onLocationChange?.(value);
      setLocation(value);
      void loadPage(value);
    },
  };

  return (
    <Screen
      title="Daily Attendance"
      subtitle={location || 'Select plant location'}
      globalFilters={attendanceFilters}
      onBack={onBack}
      onRefresh={() => loadPage(location)}
    >
      {toast ? (
        <Pressable onPress={() => setToast(null)} style={[styles.toast, toast.kind === 'success' ? styles.toastSuccess : styles.toastError]}>
          <MaterialCommunityIcons name={toast.kind === 'success' ? 'check-circle-outline' : 'alert-circle-outline'} size={18} color="#fff" />
          <Text style={styles.toastText}>{toast.message}</Text>
          <MaterialCommunityIcons name="close" size={16} color="#fff" />
        </Pressable>
      ) : null}

      {loading && !meta ? <Loading text="Loading daily attendance…" /> : error && !meta ? (
        <ErrorState message={error} onRetry={() => loadPage(location)} />
      ) : (
        <>
          <View style={styles.monitorHeader}>
            <View style={styles.monitorTitleWrap}>
              <Text style={styles.monitorTitle}>ATTENDANCE MONITOR</Text>
              {location ? (
                <View style={styles.locationBadge}>
                  <MaterialCommunityIcons name="map-marker-outline" size={12} color="#2563eb" />
                  <Text numberOfLines={1} style={styles.locationText}>{location}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.monitorActions}>
              <Pressable onPress={() => setVoiceEnabled(value => !value)} style={[styles.voiceButton, !voiceEnabled && styles.voiceMuted]}>
                <MaterialCommunityIcons name={voiceEnabled ? 'volume-high' : 'volume-off'} size={17} color={voiceEnabled ? '#2563eb' : '#dc2626'} />
              </Pressable>
              <Text style={styles.clock}>{clock.toLocaleTimeString('en-GB')}</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shiftGrid}>
            {[{ shift_name: 'ALL' }, ...shifts].map((shift, index) => {
              const name = shift.shift_name || 'GENERAL';
              const shiftRows = name === 'ALL' ? activeRows : activeRows.filter(row => (row.shift_name || 'GENERAL') === name);
              return (
                <ShiftSummary
                  key={name}
                  name={name}
                  present={shiftRows.filter(row => row.status === 'OPEN').length}
                  away={shiftRows.filter(row => row.status === 'AWAY').length}
                  color={name === 'ALL' ? '#0f172a' : SHIFT_COLORS[(index - 1) % SHIFT_COLORS.length]}
                  active={activeShift === name}
                  onPress={() => setActiveShift(name)}
                />
              );
            })}
          </ScrollView>

          <View style={styles.terminalCard}>
            <Text style={styles.scanLabel}>SCAN ID BADGE</Text>
            <TextInput
              ref={employeeInput}
              style={styles.employeeInput}
              value={employeeId}
              onChangeText={setEmployeeId}
              onSubmitEditing={() => punch('IN', 'GENERAL')}
              placeholder="SCAN ID"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              returnKeyType="done"
              editable={Boolean(location) && !submitting}
            />
            <View style={styles.shiftButtons}>
              {shifts.length ? shifts.map((shift, index) => (
                <TerminalAction
                  key={shift.id || shift.shift_name}
                  label={`${shift.shift_name} In`}
                  icon="login"
                  color={SHIFT_COLORS[index % SHIFT_COLORS.length]}
                  disabled={!location || submitting}
                  onPress={() => punch('IN', shift.shift_name)}
                />
              )) : (
                <TerminalAction label="Check In (Default)" icon="login" color="#2563eb" disabled={!location || submitting} onPress={() => punch('IN', 'GENERAL')} full />
              )}
            </View>
            <View style={styles.actionRow}>
              <TerminalAction label="Break Out" icon="coffee-outline" color="#ea580c" disabled={!location || submitting} onPress={() => punch('OUT')} />
              <TerminalAction label="Break In" icon="account-check-outline" color="#0d9488" disabled={!location || submitting} onPress={() => punch('IN', 'GENERAL')} />
            </View>
            <TerminalAction label="Check Out Shift" icon="logout" color="#dc2626" disabled={!location || submitting} onPress={() => punch('EXIT')} full />
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableTitle}>{visibleRows.length} ACTIVE PERSONNEL</Text>
              <Pressable onPress={() => setMenuOpen(value => !value)} disabled={!location} style={styles.menuButton}>
                <MaterialCommunityIcons name="dots-vertical" size={20} color="#475569" />
              </Pressable>
              {menuOpen ? (
                <View style={styles.menu}>
                  <Pressable onPress={openAudit} style={styles.menuItem}>
                    <MaterialCommunityIcons name="history" size={17} color="#2563eb" />
                    <Text style={styles.menuText}>Terminal Log</Text>
                  </Pressable>
                  <Pressable onPress={exportList} style={styles.menuItem}>
                    <MaterialCommunityIcons name="file-excel-outline" size={17} color="#16a34a" />
                    <Text style={styles.menuText}>Export List</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {error ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{error}</Text>
                <Pressable onPress={() => loadPage(location)}><Text style={styles.retryText}>Retry</Text></Pressable>
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScroll}>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHead]}>
                  <Text style={[styles.th, styles.personnelCell]}>PERSONNEL INFO</Text>
                  <Text style={[styles.th, styles.shiftCell]}>ACTIVE SHIFT</Text>
                  <Text style={[styles.th, styles.movementCell]}>MOVEMENT TIMELINE</Text>
                  <Text style={[styles.th, styles.stateCell]}>CURRENT STATE</Text>
                </View>
                {visibleRows.map((row, index) => (
                  <AttendanceRow
                    key={`${row.id || row.employee_id}-${index}`}
                    row={row}
                    shiftIndex={Math.max(0, shifts.findIndex(item => item.shift_name === row.shift_name))}
                    highlighted={String(row.id) === String(auditTargetId)}
                  />
                ))}
                {!visibleRows.length ? <View style={styles.emptyRow}><Empty text="No active personnel in this view." /></View> : null}
              </View>
            </ScrollView>
          </View>
        </>
      )}

      {!location && !loading ? (
        <View style={styles.lockOverlay}>
          <MaterialCommunityIcons name="lock-outline" size={52} color="#ef4444" />
          <Text style={styles.lockTitle}>TERMINAL LOCKED</Text>
          <Text style={styles.lockText}>Select a specific Plant / Unit from the Global Filter to activate this attendance terminal.</Text>
        </View>
      ) : null}

      <Modal visible={auditOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setAuditOpen(false)}>
        <View style={styles.auditOverlay}>
          <View style={styles.auditDrawer}>
            <View style={styles.auditHeader}>
              <Text style={styles.auditTitle}>TERMINAL TELEMETRY</Text>
              <Pressable onPress={() => setAuditOpen(false)}><MaterialCommunityIcons name="close" size={23} color="#64748b" /></Pressable>
            </View>
            {auditLoading ? <Loading text="Loading audit trail…" /> : (
              <ScrollView contentContainerStyle={styles.auditList}>
                {audits.map((item, index) => (
                  <Pressable
                    key={`${item.timestamp}-${index}`}
                    onPress={() => {
                      setAuditTargetId(item.record_id);
                      setActiveShift('ALL');
                      setAuditOpen(false);
                    }}
                    style={styles.auditItem}
                  >
                    <Text style={styles.auditMain}>{item.timestamp} | {item.batch}</Text>
                    <Text style={styles.auditDetails}>{item.action}: {item.details}</Text>
                    <Text style={styles.auditUser}>By: {item.user} ({item.email})</Text>
                    <Text style={styles.auditLink}>Tap to open row ›</Text>
                  </Pressable>
                ))}
                {!audits.length ? <Empty text="No audit transactions found." /> : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ShiftSummary({ name, present, away, color, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.shiftCard, { borderLeftColor: color }, active && styles.shiftCardActive]}>
      <Text style={styles.shiftName}>{name === 'ALL' ? 'ALL ACTIVE' : name}</Text>
      <View style={styles.shiftMetrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{present}</Text><Text style={styles.metricLabel}>Present</Text></View>
        <View style={styles.metric}><Text style={[styles.metricValue, styles.awayValue]}>{away}</Text><Text style={styles.metricLabel}>On Break</Text></View>
      </View>
    </Pressable>
  );
}

function TerminalAction({ label, icon, color, onPress, disabled, full }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.terminalAction, full && styles.fullAction, { borderColor: `${color}55`, backgroundColor: `${color}12` }, disabled && styles.disabled]}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <Text style={[styles.terminalActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function AttendanceRow({ row, shiftIndex, highlighted }) {
  return (
    <View style={[styles.tableRow, highlighted && styles.highlightedRow]}>
      <View style={styles.personnelCell}>
        <Text numberOfLines={1} style={styles.personName}>{row.employee_name || '—'}</Text>
        <Text numberOfLines={1} style={styles.personId}>{row.employee_id || '—'} • Row #{row.id ?? '—'}</Text>
      </View>
      <View style={styles.shiftCell}>
        <View style={[styles.shiftPill, { backgroundColor: `${SHIFT_COLORS[shiftIndex % SHIFT_COLORS.length]}16`, borderColor: `${SHIFT_COLORS[shiftIndex % SHIFT_COLORS.length]}55` }]}>
          <Text numberOfLines={1} style={[styles.shiftPillText, { color: SHIFT_COLORS[shiftIndex % SHIFT_COLORS.length] }]}>{row.shift_name || 'GENERAL'}</Text>
        </View>
      </View>
      <View style={styles.movementCell}>
        <View style={styles.movements}>
          {(row.movements || []).map((item, index) => {
            const type = String(item.type || '').toUpperCase();
            const colors = type === 'IN' ? ['#166534', '#dcfce7'] : type === 'OUT' ? ['#9a3412', '#ffedd5'] : ['#991b1b', '#fee2e2'];
            return (
              <React.Fragment key={`${type}-${item.time}-${index}`}>
                {index ? <MaterialCommunityIcons name="chevron-right" size={12} color="#cbd5e1" /> : null}
                <View style={[styles.movementPill, { backgroundColor: colors[1] }]}><Text style={[styles.movementText, { color: colors[0] }]}>{type} {item.time}</Text></View>
              </React.Fragment>
            );
          })}
        </View>
      </View>
      <View style={styles.stateCell}>
        <View style={[styles.stateDot, { backgroundColor: row.status === 'AWAY' ? '#ea580c' : '#16a34a' }]} />
        <Text style={styles.stateText}>{row.status === 'AWAY' ? 'ON BREAK' : 'INSIDE'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { marginBottom: 8, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  toastSuccess: { backgroundColor: '#16a34a' },
  toastError: { backgroundColor: '#dc2626' },
  toastText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '850' },
  monitorHeader: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginHorizontal: -10, marginTop: -10, paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  monitorTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  monitorTitle: { color: '#0f172a', fontSize: 12.5, fontWeight: '900', letterSpacing: .35 },
  locationBadge: { maxWidth: 135, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, backgroundColor: '#eff6ff' },
  locationText: { color: '#2563eb', fontSize: 9.5, fontWeight: '850' },
  monitorActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  voiceButton: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#eff6ff' },
  voiceMuted: { backgroundColor: '#fee2e2' },
  clock: { minWidth: 71, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, color: '#fff', backgroundColor: '#0f172a', fontSize: 10.5, fontWeight: '850', letterSpacing: .7, textAlign: 'center' },
  shiftGrid: { gap: 8, paddingVertical: 11 },
  shiftCard: { width: 145, padding: 10, borderWidth: 1, borderLeftWidth: 4, borderColor: '#e2e8f0', borderRadius: 9, backgroundColor: '#fff' },
  shiftCardActive: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  shiftName: { marginBottom: 7, color: '#0f172a', fontSize: 10.5, fontWeight: '900' },
  shiftMetrics: { flexDirection: 'row', gap: 5 },
  metric: { flex: 1, alignItems: 'center', paddingVertical: 6, borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 6, backgroundColor: '#f8fafc' },
  metricValue: { color: '#16a34a', fontSize: 16, fontWeight: '900' },
  awayValue: { color: '#ea580c' },
  metricLabel: { marginTop: 1, color: '#64748b', fontSize: 8.5, fontWeight: '750' },
  terminalCard: { gap: 8, padding: 11, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff' },
  scanLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: .65 },
  employeeInput: { height: 48, paddingHorizontal: 12, borderWidth: 2, borderColor: '#cbd5e1', borderRadius: 8, color: '#0f172a', backgroundColor: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  shiftButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionRow: { flexDirection: 'row', gap: 7 },
  terminalAction: { flex: 1, minWidth: 105, height: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 7 },
  fullAction: { width: '100%', flexBasis: '100%' },
  terminalActionText: { fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase' },
  disabled: { opacity: .42 },
  tableCard: { marginTop: 11, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff', overflow: 'visible' },
  tableHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 11, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', zIndex: 5 },
  tableTitle: { color: '#0f172a', fontSize: 10.5, fontWeight: '900', letterSpacing: .4 },
  menuButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  menu: { position: 'absolute', top: 38, right: 5, width: 150, paddingVertical: 4, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#fff', zIndex: 20 },
  menuItem: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11 },
  menuText: { color: '#334155', fontSize: 11, fontWeight: '800' },
  inlineError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: 8, padding: 8, borderWidth: 1, borderColor: '#fecaca', borderRadius: 7, backgroundColor: '#fef2f2' },
  inlineErrorText: { flex: 1, color: '#dc2626', fontSize: 10, fontWeight: '750' },
  retryText: { color: '#dc2626', fontSize: 10, fontWeight: '900' },
  tableScroll: { minWidth: 680 },
  table: { width: 680 },
  tableRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  tableHead: { minHeight: 35, backgroundColor: '#f8fafc' },
  th: { color: '#64748b', fontSize: 8.5, fontWeight: '900', letterSpacing: .3 },
  personnelCell: { width: 155, paddingHorizontal: 9 },
  shiftCell: { width: 110, paddingHorizontal: 7 },
  movementCell: { width: 300, paddingHorizontal: 7 },
  stateCell: { width: 115, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingHorizontal: 10 },
  personName: { color: '#0f172a', fontSize: 10.5, fontWeight: '900' },
  personId: { marginTop: 3, color: '#64748b', fontSize: 8.5, fontWeight: '650' },
  shiftPill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderRadius: 5 },
  shiftPillText: { maxWidth: 88, fontSize: 8.5, fontWeight: '900' },
  movements: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3 },
  movementPill: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4 },
  movementText: { fontSize: 8, fontWeight: '850' },
  stateDot: { width: 7, height: 7, borderRadius: 4 },
  stateText: { color: '#334155', fontSize: 8.5, fontWeight: '900' },
  highlightedRow: { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  emptyRow: { width: 680, minHeight: 85, justifyContent: 'center' },
  lockOverlay: { position: 'absolute', top: 0, right: -10, bottom: -9, left: -10, zIndex: 50, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 8, backgroundColor: 'rgba(2,6,23,.94)' },
  lockTitle: { marginTop: 15, color: '#fff', fontSize: 20, fontWeight: '900' },
  lockText: { maxWidth: 310, marginTop: 9, color: '#cbd5e1', fontSize: 12, lineHeight: 18, fontWeight: '650', textAlign: 'center' },
  auditOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,.18)' },
  auditDrawer: { maxHeight: '82%', minHeight: '55%', borderTopLeftRadius: 17, borderTopRightRadius: 17, backgroundColor: '#fff', overflow: 'hidden' },
  auditHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  auditTitle: { color: '#0f172a', fontSize: 12, fontWeight: '900', letterSpacing: .5 },
  auditList: { padding: 11 },
  auditItem: { marginBottom: 7, padding: 10, borderLeftWidth: 3, borderLeftColor: '#2563eb', borderRadius: 6, backgroundColor: '#f8fafc' },
  auditMain: { color: '#0f172a', fontSize: 9.5, fontWeight: '900' },
  auditDetails: { marginTop: 4, color: '#334155', fontSize: 10, lineHeight: 14 },
  auditUser: { marginTop: 4, color: '#64748b', fontSize: 8.5, fontWeight: '700' },
  auditLink: { marginTop: 5, color: '#2563eb', fontSize: 8.5, fontWeight: '900' },
});
