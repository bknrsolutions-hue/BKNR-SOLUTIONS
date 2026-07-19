import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ErrorState, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';
import { useERPTheme } from '../theme/ERPThemeContext';

const emptyProfile = {
  name: '',
  employee_id: '',
  email: '',
  designation: '',
  date_of_birth: '',
  blood_group: '',
  working_location: '',
  address: '',
  company_name: '',
  role: '',
};

export default function NativeProfile({ filters = {}, onBack }) {
  const { theme } = useERPTheme();
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/auth/profile?format=json');
      setProfile({ ...emptyProfile, ...(result.profile || {}) });
    } catch (requestError) {
      setError(requestError.message || 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const profileHeader = {
    companyName: profile.company_name || filters.companyName,
    onSupport: filters.onSupport,
  };

  return <Screen title="My Profile" subtitle="Personal & work details" globalFilters={profileHeader} onBack={onBack} onRefresh={load}>
    {loading ? <Loading text="Loading profile…" /> : error && !profile.email ? <ErrorState message={error} onRetry={load} /> : <>
      <SectionTitle>Account Details</SectionTitle>
      {error ? <View style={styles.errorBanner}><MaterialCommunityIcons name="alert-circle-outline" size={17} color="#dc2626" /><Text style={styles.errorText}>{error}</Text></View> : null}

      <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.formHeader}><View style={[styles.formHeaderIcon, { backgroundColor: theme.primarySoft }]}><MaterialCommunityIcons name="account-details-outline" size={18} color={theme.primary} /></View><View><Text style={[styles.formTitle, { color: theme.text }]}>Personal & work information</Text><Text style={[styles.formHint, { color: theme.muted }]}>Details linked to your login account</Text></View></View>
        <ProfileRow label="Name" icon="account-outline" theme={theme} value={profile.name} />
        <ProfileRow label="Employee ID" icon="identifier" theme={theme} value={profile.employee_id} />
        <ProfileRow label="Login Email" icon="email-outline" theme={theme} value={profile.email} />
        <ProfileRow label="Designation" icon="badge-account-outline" theme={theme} value={profile.designation} />
        <ProfileRow label="Date of Birth" icon="calendar-blank-outline" theme={theme} value={profile.date_of_birth} />
        <ProfileRow label="Blood Group" icon="water-outline" theme={theme} value={profile.blood_group} />
        <ProfileRow label="Working Location" icon="map-marker-outline" theme={theme} value={profile.working_location} />
        <ProfileRow label="Address" icon="home-map-marker" theme={theme} value={profile.address || 'Please update'} attention={!profile.address} last />
      </View>
    </>}
  </Screen>;
}

function ProfileRow({ label, theme, icon, value, attention = false, last = false }) {
  return <View style={[styles.profileRow, { borderBottomColor: theme.border }, last && styles.profileRowLast]}>
    <View style={[styles.rowIcon, { backgroundColor: theme.primarySoft }]}><MaterialCommunityIcons name={icon} size={17} color={theme.primary} /></View>
    <View style={styles.rowCopy}>
      <Text style={[styles.rowLabel, { color: theme.muted }]}>{label}</Text>
      <Text selectable numberOfLines={2} style={[styles.rowValue, { color: attention ? '#b45309' : theme.text }]}>{value || '—'}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  form: { padding: 13, borderWidth: 1, borderRadius: 17, shadowColor: '#0f172a', shadowOpacity: .05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 2, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef' },
  formHeaderIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  formTitle: { fontSize: 12.5, fontWeight: '900' },
  formHint: { marginTop: 2, fontSize: 9.5, fontWeight: '700' },
  profileRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  profileRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  rowIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 9, fontWeight: '900', letterSpacing: .55, textTransform: 'uppercase' },
  rowValue: { marginTop: 3, fontSize: 12.5, lineHeight: 17, fontWeight: '850' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9, padding: 10, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, backgroundColor: '#fef2f2' },
  errorText: { flex: 1, color: '#dc2626', fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
});
