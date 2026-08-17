import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Vibration, ActivityIndicator, Animated, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { apiRequest } from '../services/api';
import { downloadAndShare } from '../services/download';
import { Empty, ErrorState, Loading, Screen } from '../components/NativeScreenKit';

import { CameraView, Camera, useCameraPermissions } from 'expo-camera';

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

  // 📱 MOBILE QR CAMERA SCANNER & SHIFT SELECTION STATES
  const [permission, requestPermission] = useCameraPermissions();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facing, setFacing] = useState('back');
  const [scannedEmpId, setScannedEmpId] = useState('');
  const [scannedEmpName, setScannedEmpName] = useState('');
  const [shiftSelectOpen, setShiftSelectOpen] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState(null);

  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (qrModalOpen) {
      scanAnim.setValue(0);
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 215,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [qrModalOpen, scanAnim]);

  useEffect(() => {
    if (qrModalOpen && (!permission || !permission.granted) && requestPermission) {
      void requestPermission();
    }
  }, [qrModalOpen, permission, requestPermission]);

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
      const actualLocation = page.actual_location || (page.locations && page.locations.length > 0 ? page.locations[0] : '') || selectedLocation || '';
      setMeta(page);
      setLocation(actualLocation);
      if (actualLocation) {
        await loadRows(actualLocation);
      }
    } catch (requestError) {
      setError(ERROR_MESSAGES[requestError.message] || requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loadRows, location]);

  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    apiRequest('/auth/global-dropdowns')
      .then(payload => {
        setCompanies(payload.companies || []);
        setLocations(payload.locations || []);
      })
      .catch(() => {});
  }, []);

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

  const punch = useCallback(async (action, shiftName = 'GENERAL', overrideId = null) => {
    const id = (overrideId || employeeId || '').trim();
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

  const openQrScanner = useCallback(async () => {
    let activeLoc = location || meta?.locations?.[0] || (locations?.[0]?.company_name || locations?.[0]) || 'PLANT TERMINAL';
    if (!location) {
      setLocation(activeLoc);
    }
    scannedRef.current = false;
    setScanned(false);
    setQrModalOpen(true);

    if (!permission?.granted && requestPermission) {
      try {
        await requestPermission();
      } catch (e) {}
    }
  }, [location, meta, locations, permission, requestPermission]);

  const onBarcodeScanned = useCallback(res => {
    if (scannedRef.current) return;
    const rawVal = String(res?.data || res?.nativeEvent?.data || (typeof res === 'string' ? res : '') || '').trim();
    if (!rawVal) return;
    scannedRef.current = true;
    setScanned(true);
    try { Vibration.vibrate(100); } catch (e) {}

    let extractedId = rawVal;
    let extractedName = '';

    // 1. JSON Payload Parsing
    try {
      const parsed = JSON.parse(rawVal);
      if (parsed && (parsed.employee_id || parsed.id || parsed.code)) {
        extractedId = String(parsed.employee_id || parsed.id || parsed.code).trim();
        extractedName = parsed.employee_name || parsed.name || '';
      }
    } catch (e) {}

    // 2. URL Payload Parsing & Clean Employee ID Extraction (e.g. https://domain.com/emp/VNBK2162000006)
    if (extractedId.includes('http://') || extractedId.includes('https://') || extractedId.includes('/') || extractedId.includes('?')) {
      try {
        const matchVnbk = extractedId.match(/[A-Za-z]{2,6}\d{5,12}/);
        if (matchVnbk) {
          extractedId = matchVnbk[0].toUpperCase();
        } else {
          const matchDigits = extractedId.match(/\d{5,12}/);
          if (matchDigits) {
            extractedId = matchDigits[0];
          } else if (extractedId.includes('id=')) {
            extractedId = extractedId.split('id=')[1].split('&')[0];
          } else {
            const pathParts = extractedId.split('?')[0].split('/').filter(Boolean);
            if (pathParts.length > 0) {
              extractedId = pathParts[pathParts.length - 1];
            }
          }
        }
      } catch (e) {}
    }

    // Clean final ID
    extractedId = String(extractedId || '').trim();

    if (!extractedId) {
      showToast('error', 'Invalid QR Code scanned.');
      setTimeout(() => {
        scannedRef.current = false;
        setScanned(false);
      }, 1800);
      return;
    }

    // 3. Strict & Full Employee ID Database Validation (Session & Master Registered Employees)
    const cleanSearchId = extractedId.trim().toUpperCase();
    const numericSuffix = cleanSearchId.replace(/[^0-9]/g, '');

    const allEmps = [
      ...(meta?.employees || []),
      ...rows
    ];

    // Priority 1: Exact Full ID Match (e.g. VNBK2162000006)
    let matchedEmp = allEmps.find(e => {
      const empId = String(e.employee_id || e.id || e.code || '').trim().toUpperCase();
      return empId === cleanSearchId;
    });

    // Priority 2: Fallback Suffix / Numeric ID Match
    if (!matchedEmp) {
      matchedEmp = allEmps.find(e => {
        const empId = String(e.employee_id || e.id || e.code || '').trim().toUpperCase();
        if (!empId) return false;
        if (numericSuffix && numericSuffix.length >= 4) {
          const empNumeric = empId.replace(/[^0-9]/g, '');
          return empNumeric && (empNumeric.endsWith(numericSuffix) || numericSuffix.endsWith(empNumeric));
        }
        return false;
      });
    }

    if (matchedEmp) {
      extractedId = String(matchedEmp.employee_id || matchedEmp.id || extractedId).trim();
      extractedName = matchedEmp.employee_name || matchedEmp.name || extractedName;
    }

    // If QR code does not belong to any registered employee in session/plant database -> SHOW ERROR & BLOCK!
    if (!matchedEmp && !extractedName) {
      const errorMsg = `QR Code (${extractedId}) is not registered for ${location || 'this plant'}.`;
      showToast('error', errorMsg);
      try { Vibration.vibrate([0, 120, 80, 120]); } catch (e) {}
      if (voiceEnabled) {
        Speech.speak('Unrecognized employee QR code', { rate: 1 });
      }
      setTimeout(() => {
        scannedRef.current = false;
        setScanned(false);
      }, 2200);
      return;
    }

    setScannedEmpId(extractedId);
    setScannedEmpName(extractedName || `Employee #${extractedId}`);
    setEmployeeId(extractedId);
    setShiftSelectOpen(true);
  }, [showToast, rows, meta]);

  const confirmSaveShiftEntry = useCallback(async (action, shiftName) => {
    const id = scannedEmpId || employeeId;
    if (!id || !location) return;

    setSubmitting(true);
    try {
      const result = await apiRequest('/attendance/entry', {
        method: 'POST',
        body: JSON.stringify({ employee_id: id, action, shift_name: shiftName || 'GENERAL', location }),
      });

      const empName = result.employee_name || scannedEmpName || id;
      const actionLabel = action === 'OUT' ? 'Break Out' : action === 'EXIT' ? 'Shift Check-Out' : `${shiftName} Check-In`;
      const confirmText = `✅ Saved! ${empName} → ${actionLabel}`;

      setSaveConfirmation(confirmText);
      showToast('success', confirmText);

      if (voiceEnabled) {
        const speech = action === 'OUT' ? `Break recorded for ${empName}` : action === 'EXIT' ? `Goodbye ${empName}` : `Welcome ${empName}, ${shiftName} recorded`;
        Speech.speak(speech, { rate: 1 });
      }

      setEmployeeId('');
      setScannedEmpId('');
      setScannedEmpName('');
      setShiftSelectOpen(false);
      await loadRows(location);

      // Save confirmation auto-clears and scanner becomes IMMEDIATELY AVAILABLE FOR NEXT SCAN!
      setTimeout(() => {
        setSaveConfirmation(null);
        scannedRef.current = false;
        setScanned(false);
      }, 700);

    } catch (requestError) {
      showToast('error', ERROR_MESSAGES[requestError.message] || requestError.message);
      setScannedEmpId('');
      setScannedEmpName('');
      scannedRef.current = false;
      setScanned(false);
    } finally {
      setSubmitting(false);
    }
  }, [scannedEmpId, employeeId, location, scannedEmpName, showToast, voiceEnabled, loadRows]);

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

  const availableLocations = meta?.locations?.length
    ? meta.locations
    : locations.length
    ? locations
    : (filters.locations || []);

  const availableCompanies = companies.length ? companies : (filters.companies || []);

  const attendanceFilters = {
    ...filters,
    companies: undefined,
    locations: availableLocations,
    location,
    onLocationChange: value => {
      filters.onLocationChange?.(value);
      setLocation(value);
      void loadPage(value);
    },
    onProductionForChange: value => {
      filters.onProductionForChange?.(value);
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.scanLabel}>SCAN ID BADGE / QR CODE</Text>
              <Pressable
                disabled={submitting}
                onPress={openQrScanner}
                style={[styles.qrHeaderBtn, submitting && styles.disabled]}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={15} color="#ffffff" />
                <Text style={styles.qrHeaderBtnText}>SCAN QR CODE</Text>
              </Pressable>
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                ref={employeeInput}
                style={styles.employeeInput}
                value={employeeId}
                onChangeText={setEmployeeId}
                onSubmitEditing={() => punch('IN', 'GENERAL')}
                placeholder="SCAN ID / ENTER EMP ID"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                returnKeyType="done"
                editable={!submitting}
              />
              {employeeId ? (
                <Pressable onPress={() => { setEmployeeId(''); employeeInput.current?.focus(); }} style={styles.clearInputBtn}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#94a3b8" />
                </Pressable>
              ) : null}
            </View>
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

      {/* 📱 MOBILE CAMERA QR SCANNER MODAL */}
      <Modal visible={qrModalOpen} animationType="slide" statusBarTranslucent onRequestClose={() => setQrModalOpen(false)}>
        <View style={styles.qrScannerContainer}>
          <View style={styles.qrScannerHeader}>
            <Pressable onPress={() => setQrModalOpen(false)} style={styles.qrCloseBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#ffffff" />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.qrHeaderTitle}>MOBILE QR SCANNER</Text>
              <Text style={styles.qrHeaderSub}>{location || 'Plant Terminal'} • {facing.toUpperCase()} CAMERA</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setFacing(prev => prev === 'back' ? 'front' : 'back')} style={styles.torchBtn}>
                <MaterialCommunityIcons name="camera-flip-outline" size={22} color="#ffffff" />
              </Pressable>
              <Pressable onPress={() => setTorchOn(prev => !prev)} style={styles.torchBtn}>
                <MaterialCommunityIcons name={torchOn ? 'flashlight' : 'flashlight-off'} size={22} color={torchOn ? '#f59e0b' : '#ffffff'} />
              </Pressable>
            </View>
          </View>

          <View style={styles.cameraViewfinderBox}>
            {permission?.granted ? (
              <CameraView
                style={styles.cameraSurface}
                facing={facing}
                enableTorch={torchOn}
                onBarcodeScanned={onBarcodeScanned}
              />
            ) : (
              <View style={styles.cameraFallbackBox}>
                <MaterialCommunityIcons name="camera-outline" size={52} color="#38bdf8" />
                <Text style={styles.cameraFallbackText}>
                  {permission === null ? 'Requesting Camera Access…' : 'Camera access is required to scan QR code badges.'}
                </Text>
                <Pressable onPress={requestPermission} style={styles.grantCameraBtn}>
                  <Text style={styles.grantCameraBtnText}>ENABLE CAMERA PERMISSION</Text>
                </Pressable>
              </View>
            )}

            {/* Viewfinder Target Overlay Frame */}
            <View style={styles.targetFrame}>
              <View style={[styles.targetCorner, styles.cornerTL]} />
              <View style={[styles.targetCorner, styles.cornerTR]} />
              <View style={[styles.targetCorner, styles.cornerBL]} />
              <View style={[styles.targetCorner, styles.cornerBR]} />
              
              {/* ANIMATED LASER SCANNER SWEEPING LINE */}
              <Animated.View
                style={[
                  styles.laserLine,
                  {
                    transform: [{ translateY: scanAnim }],
                  },
                ]}
              />
              
              {/* LIVE SCANNED QR PREVIEW BADGE */}
              <View style={styles.liveDetectedBadge}>
                <MaterialCommunityIcons name={scannedEmpId ? "qrcode-scan" : "radar"} size={16} color={scannedEmpId ? "#10b981" : "#38bdf8"} />
                <Text style={styles.liveDetectedText}>
                  {scannedEmpId ? `EMPLOYEE ID: ${scannedEmpId}` : 'READY TO SCAN QR CODE'}
                </Text>
              </View>
            </View>

            {/* SAVE CONFIRMATION BANNER */}
            {saveConfirmation ? (
              <View style={styles.saveConfirmationBanner}>
                <MaterialCommunityIcons name="check-circle" size={24} color="#10b981" />
                <Text style={styles.saveConfirmationText}>{saveConfirmation}</Text>
              </View>
            ) : null}

            {/* SCANNED SHIFT SELECTION CARD OVERLAY */}
            {shiftSelectOpen ? (() => {
              const activeDuty = rows.find(r => 
                String(r.employee_id || '').trim().toUpperCase() === String(scannedEmpId || '').trim().toUpperCase()
              );
              const statusTag = activeDuty
                ? (activeDuty.status === 'AWAY' ? 'ON BREAK' : activeDuty.status === 'CLOSED' ? 'SHIFT CLOSED' : 'INSIDE')
                : 'FRESH ENTRY';
              const statusColor = activeDuty
                ? (activeDuty.status === 'AWAY' ? '#f97316' : activeDuty.status === 'CLOSED' ? '#94a3b8' : '#10b981')
                : '#38bdf8';
              const lastMvt = activeDuty?.movements && activeDuty.movements.length > 0
                ? activeDuty.movements[activeDuty.movements.length - 1]
                : null;
              const lastMvtTime = lastMvt ? ` (${lastMvt.type} ${lastMvt.time})` : '';

              return (
                <View style={styles.shiftCardSheetOverlay}>
                  <View style={styles.scannedEmpHeaderCard}>
                    <MaterialCommunityIcons name="card-account-details" size={24} color="#38bdf8" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scannedEmpName}>{scannedEmpName || 'Employee'}</Text>
                      <Text style={styles.scannedEmpSub}>
                        ID: {scannedEmpId} • Plant: {location} • <Text style={{ fontWeight: '900', color: statusColor }}>{statusTag}{lastMvtTime}</Text>
                      </Text>
                    </View>
                    <Pressable onPress={() => { setShiftSelectOpen(false); setScannedEmpId(''); setScannedEmpName(''); scannedRef.current = false; setScanned(false); }} style={styles.closeCardBtn}>
                      <MaterialCommunityIcons name="close" size={18} color="#94a3b8" />
                    </Pressable>
                  </View>

                  <Text style={styles.selectShiftTitle}>TAP SHIFT CARD TO SAVE ENTRY:</Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scannedShiftGrid}>
                  {shifts.length ? shifts.map((shift, idx) => (
                    <Pressable
                      key={shift.id || shift.shift_name}
                      onPress={() => confirmSaveShiftEntry('IN', shift.shift_name)}
                      style={[styles.scannedShiftCard, { borderColor: SHIFT_COLORS[idx % SHIFT_COLORS.length] }]}
                    >
                      <MaterialCommunityIcons name="clock-outline" size={20} color={SHIFT_COLORS[idx % SHIFT_COLORS.length]} />
                      <Text style={[styles.scannedShiftName, { color: SHIFT_COLORS[idx % SHIFT_COLORS.length] }]}>{shift.shift_name}</Text>
                      <Text style={styles.scannedShiftLabel}>Check In</Text>
                    </Pressable>
                  )) : (
                    <Pressable
                      onPress={() => confirmSaveShiftEntry('IN', 'GENERAL')}
                      style={[styles.scannedShiftCard, { borderColor: '#2563eb' }]}
                    >
                      <MaterialCommunityIcons name="login" size={20} color="#2563eb" />
                      <Text style={[styles.scannedShiftName, { color: '#2563eb' }]}>GENERAL</Text>
                      <Text style={styles.scannedShiftLabel}>Check In</Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => confirmSaveShiftEntry('OUT', 'BREAK')}
                    style={[styles.scannedShiftCard, { borderColor: '#ea580c' }]}
                  >
                    <MaterialCommunityIcons name="coffee-outline" size={20} color="#ea580c" />
                    <Text style={[styles.scannedShiftName, { color: '#ea580c' }]}>BREAK OUT</Text>
                    <Text style={styles.scannedShiftLabel}>Pause Duty</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => confirmSaveShiftEntry('IN', 'RESUME_BREAK')}
                    style={[styles.scannedShiftCard, { borderColor: '#10b981' }]}
                  >
                    <MaterialCommunityIcons name="play-circle-outline" size={20} color="#10b981" />
                    <Text style={[styles.scannedShiftName, { color: '#10b981' }]}>BREAK IN</Text>
                    <Text style={styles.scannedShiftLabel}>Resume Duty</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => confirmSaveShiftEntry('EXIT', 'EXIT')}
                    style={[styles.scannedShiftCard, { borderColor: '#dc2626' }]}
                  >
                    <MaterialCommunityIcons name="logout" size={20} color="#dc2626" />
                    <Text style={[styles.scannedShiftName, { color: '#dc2626' }]}>CHECK OUT</Text>
                    <Text style={styles.scannedShiftLabel}>Shift Exit</Text>
                  </Pressable>
                </ScrollView>
              </View>
            );
          })() : null}
          </View>

          <View style={styles.qrScannerFooter}>
            <Text style={styles.qrInstructionText}>
              Align Employee ID QR code inside the viewfinder frame to scan.
            </Text>
            <Pressable onPress={() => setQrModalOpen(false)} style={styles.qrCancelBtn}>
              <Text style={styles.qrCancelBtnText}>CLOSE SCANNER</Text>
            </Pressable>
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
      <View style={[styles.personnelCell, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        {row.photo_path ? (
          <Image source={{ uri: row.photo_path }} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5e1' }} />
        ) : (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#38bdf8', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{(row.employee_name || 'E').charAt(0)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.personName}>{row.employee_name || '—'}</Text>
          <Text numberOfLines={1} style={styles.personId}>{row.employee_id || '—'} • Row #{row.id ?? '—'}</Text>
        </View>
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
  inputWrap: { position: 'relative', justifyContent: 'center' },
  clearInputBtn: { position: 'absolute', right: 12, top: 14, zIndex: 10 },
  employeeInput: { height: 48, paddingLeft: 12, paddingRight: 36, borderWidth: 2, borderColor: '#cbd5e1', borderRadius: 8, color: '#0f172a', backgroundColor: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
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

  // 📱 MOBILE QR SCANNER STYLES
  qrHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: '#2563eb' },
  qrHeaderBtnText: { color: '#ffffff', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.3 },
  qrScannerContainer: { flex: 1, backgroundColor: '#090d16' },
  qrScannerHeader: { paddingTop: 48, paddingBottom: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  qrCloseBtn: { padding: 6 },
  qrHeaderTitle: { color: '#ffffff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  qrHeaderSub: { color: '#38bdf8', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  torchBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  cameraViewfinderBox: { flex: 1, width: '100%', minHeight: 380, backgroundColor: '#000000', position: 'relative', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  cameraSurface: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cameraFallbackBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 14 },
  cameraFallbackText: { color: '#94a3b8', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  grantCameraBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2563eb' },
  grantCameraBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  targetFrame: { width: 250, height: 250, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  targetCorner: { position: 'absolute', width: 28, height: 28, borderColor: '#38bdf8' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  laserLine: { position: 'absolute', top: 12, left: '5%', width: '90%', height: 3, backgroundColor: '#38bdf8', borderRadius: 2, shadowColor: '#38bdf8', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.95, shadowRadius: 8, elevation: 6 },
  qrScannerFooter: { padding: 20, backgroundColor: '#0f172a', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: '#1e293b' },
  qrInstructionText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  simScanBtn: { flex: 1, height: 44, borderRadius: 8, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#38bdf8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  simScanBtnText: { color: '#38bdf8', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  qrCancelBtn: { width: '100%', height: 44, borderRadius: 8, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  qrCancelBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },

  // 📱 SAVE CONFIRMATION & SCANNED SHIFT SELECTION CARD STYLES
  saveConfirmationBanner: { position: 'absolute', top: 20, left: 16, right: 16, padding: 14, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.95)', flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
  saveConfirmationText: { flex: 1, color: '#ffffff', fontSize: 13, fontWeight: '900' },
  shiftCardSheetOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: 'rgba(15, 23, 42, 0.96)', borderTopWidth: 2, borderTopColor: '#38bdf8', zIndex: 40, gap: 10 },
  scannedEmpHeaderCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, backgroundColor: '#1e293b' },
  scannedEmpName: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  scannedEmpSub: { color: '#94a3b8', fontSize: 10, fontWeight: '700', marginTop: 2 },
  closeCardBtn: { padding: 4 },
  selectShiftTitle: { color: '#38bdf8', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  scannedShiftGrid: { gap: 10, paddingVertical: 4 },
  scannedShiftCard: { width: 105, height: 82, borderRadius: 10, backgroundColor: '#0f172a', borderWidth: 2, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 3 },
  scannedShiftName: { fontSize: 11, fontWeight: '900', textAlign: 'center' },
  scannedShiftLabel: { color: '#94a3b8', fontSize: 8.5, fontWeight: '700' },
  liveDetectedBadge: { position: 'absolute', bottom: -48, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(15, 23, 42, 0.92)', borderWidth: 1, borderColor: '#38bdf8', flexDirection: 'row', alignItems: 'center', gap: 7, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  liveDetectedText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
});
