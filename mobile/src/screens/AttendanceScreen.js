// ============================================================
// BKNR ERP — Daily Attendance Screen
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, TextInput, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { BASE_URL } from '../config';
import { SectionHeader, SearchablePicker } from '../components/FormComponents';

const SHIFTS = ['GENERAL', 'SHIFT-A', 'SHIFT-B', 'SHIFT-C'];

export default function AttendanceScreen({ navigation }) {
  const { theme, filters } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';
  const textMain = isDark ? '#ffffff' : '#0f172a';
  const textSub = isDark ? '#94a3b8' : '#475569';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const [scanId, setScanId] = useState('');
  const [shift, setShift] = useState('GENERAL');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shiftPicker, setShiftPicker] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/attendance/today_all`, { credentials: 'include' });
      const json = await res.json();
      if (Array.isArray(json)) setLogs(json);
    } catch (e) {
      console.warn('Attendance logs fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const handlePunch = async (action) => {
    if (!scanId.trim()) return Alert.alert('Validation', 'Please enter Employee ID first.');
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/attendance/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: scanId.trim(),
          action,
          shift_name: shift,
          location: filters.plantLocation || 'PLANT',
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert('✓ Authorized', `${action === 'IN' ? 'Welcome' : action === 'OUT' ? 'Break started,' : 'Goodbye,'} ${data.employee_name}`);
        setScanId('');
        fetchLogs();
      } else {
        Alert.alert('Access Denied', data.error || 'Validation failed');
      }
    } catch {
      Alert.alert('Network Error', 'Cannot reach attendance service.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status) => {
    if (status === 'OPEN') return '#10b981';
    if (status === 'AWAY') return '#f59e0b';
    return '#64748b';
  };

  const statusLabel = (status) => {
    if (status === 'OPEN') return 'INSIDE';
    if (status === 'AWAY') return 'BREAK';
    return 'CLOSED';
  };

  const liveCounts = {
    total: logs.filter(l => l.status !== 'CLOSED').length,
    open: logs.filter(l => l.status === 'OPEN').length,
    away: logs.filter(l => l.status === 'AWAY').length,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <SectionHeader title="Daily Attendance Terminal" onBack={() => navigation.goBack()} isDark={isDark} />

      <SearchablePicker
        visible={shiftPicker}
        title="Select Shift"
        data={SHIFTS}
        onSelect={(val) => { setShift(val); setShiftPicker(false); }}
        onClose={() => setShiftPicker(false)}
        isDark={isDark}
      />

      <ScrollView style={{ flex: 1 }}>
        {/* Live Stats Row */}
        <View style={[styles.statsRow, { margin: 16, marginBottom: 0 }]}>
          {[
            { label: 'Active', value: liveCounts.total, color: '#3b82f6' },
            { label: 'Inside', value: liveCounts.open, color: '#10b981' },
            { label: 'Break', value: liveCounts.away, color: '#f59e0b' },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: card, borderColor: border }]}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 11, color: textSub, fontWeight: '600', marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Punch Panel */}
        <View style={[styles.punchCard, { backgroundColor: card, borderColor: border }]}>
          {/* Shift Selector */}
          <TouchableOpacity
            style={[styles.shiftBadge, { backgroundColor: isDark ? '#1f2937' : '#eff6ff', borderColor: '#3b82f6' }]}
            onPress={() => setShiftPicker(true)}
          >
            <Feather name="clock" size={14} color="#3b82f6" />
            <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>{shift}</Text>
            <Feather name="chevron-down" size={14} color="#3b82f6" style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TextInput
            style={[styles.scanInput, {
              backgroundColor: isDark ? '#1f2937' : '#f8fafc',
              color: textMain,
              borderColor: isDark ? '#374151' : '#cbd5e1',
            }]}
            value={scanId}
            onChangeText={setScanId}
            placeholder="Scan / Enter Employee ID"
            placeholderTextColor="#64748b"
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={() => handlePunch('IN')}
          />

          {submitting ? (
            <ActivityIndicator color="#3b82f6" size="large" style={{ marginTop: 12 }} />
          ) : (
            <View style={styles.punchBtns}>
              <TouchableOpacity style={[styles.punchBtn, { backgroundColor: '#10b981' }]} onPress={() => handlePunch('IN')}>
                <Feather name="log-in" size={16} color="#fff" />
                <Text style={styles.punchBtnText}>IN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.punchBtn, { backgroundColor: '#f59e0b' }]} onPress={() => handlePunch('OUT')}>
                <Feather name="coffee" size={16} color="#fff" />
                <Text style={styles.punchBtnText}>BREAK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.punchBtn, { backgroundColor: '#ef4444' }]} onPress={() => handlePunch('EXIT')}>
                <Feather name="power" size={16} color="#fff" />
                <Text style={styles.punchBtnText}>EXIT</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Live Log List */}
        <View style={{ paddingHorizontal: 16, marginBottom: 30 }}>
          <View style={styles.listHeader}>
            <Text style={[styles.listTitle, { color: textMain }]}>Active Personnel Today</Text>
            <TouchableOpacity onPress={fetchLogs} style={[styles.refreshBtn, { borderColor: border }]}>
              <Feather name="refresh-cw" size={14} color={textSub} />
            </TouchableOpacity>
          </View>

          {loading && logs.length === 0 ? (
            <ActivityIndicator color="#3b82f6" style={{ marginTop: 20 }} />
          ) : logs.filter(l => l.status !== 'CLOSED').length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: card, borderColor: border }]}>
              <Feather name="users" size={28} color={textSub} />
              <Text style={{ color: textSub, marginTop: 8 }}>No active personnel on shift.</Text>
            </View>
          ) : (
            logs.filter(l => l.status !== 'CLOSED').map((log, idx) => (
              <View key={idx} style={[styles.logItem, { backgroundColor: card, borderColor: border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textMain, fontWeight: '700', fontSize: 14 }}>{log.employee_name}</Text>
                  <Text style={{ color: textSub, fontSize: 12, marginTop: 2 }}>
                    {log.employee_id} · {log.department || 'GENERAL'} · {log.shift_name || 'GENERAL'}
                  </Text>
                  {/* Movement timeline */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {(log.movements || []).map((m, mi) => (
                      <View key={mi} style={[styles.movChip, {
                        backgroundColor: m.type === 'IN' ? 'rgba(16,185,129,0.12)' : m.type === 'OUT' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                      }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: m.type === 'IN' ? '#10b981' : m.type === 'OUT' ? '#f59e0b' : '#ef4444' }}>
                          {m.type} {m.time}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={[styles.statusDot, { backgroundColor: statusColor(log.status) }]}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{statusLabel(log.status)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, padding: 14, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, elevation: 1,
  },
  punchCard: {
    margin: 16, padding: 16, borderRadius: 16, borderWidth: 1,
  },
  shiftBadge: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  scanInput: {
    height: 52, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 16, fontSize: 18, fontWeight: '800',
    textAlign: 'center', letterSpacing: 2, marginBottom: 14,
  },
  punchBtns: { flexDirection: 'row', gap: 8 },
  punchBtn: {
    flex: 1, height: 48, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  punchBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 8 },
  listTitle: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase' },
  refreshBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { padding: 30, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  logItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  movChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' },
});
