import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { ErrorState, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';
import { API_URL } from '../config';
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
  company_logo_url: '',
  role: '',
};

const resolveLogoUrl = value => value
  ? (/^https?:\/\//i.test(value) ? value : `${API_URL}${value}`)
  : '';

export default function NativeProfile({ filters = {}, onBack, onProfileUpdated }) {
  const { theme } = useERPTheme();
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');

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

  const canManageLogo = ['admin', 'super_admin', 'super admin'].includes(String(profile.role || '').trim().toLowerCase());

  const pickTenantLogo = async () => {
    const selection = await DocumentPicker.getDocumentAsync({
      type: ['image/png', 'image/jpeg', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (selection.canceled || !selection.assets?.[0]) return;
    const asset = selection.assets[0];
    setLogoSaving(true);
    setLogoMessage('');
    try {
      const lowerName = String(asset.name || '').toLowerCase();
      const inferredType = lowerName.endsWith('.webp')
        ? 'image/webp'
        : lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'image/png';
      const uploadType = asset.mimeType === 'image/jpg'
        ? 'image/jpeg'
        : ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)
          ? asset.mimeType
          : inferredType;
      const body = new FormData();
      body.append('logo', {
        uri: asset.uri,
        name: asset.name || 'tenant-logo.png',
        type: uploadType,
      });
      const result = await apiRequest('/auth/tenant-logo', { method: 'POST', body });
      const logoUrl = result.company_logo_url || '';
      setProfile(current => ({ ...current, company_logo_url: logoUrl }));
      onProfileUpdated?.({ company_logo_url: logoUrl });
      setLogoMessage('Company logo updated.');
    } catch (requestError) {
      setLogoMessage(requestError.message || 'Unable to update company logo.');
    } finally {
      setLogoSaving(false);
    }
  };

  const profileHeader = {
    companyName: profile.company_name || filters.companyName,
    onSupport: filters.onSupport,
  };

  return <Screen title="My Profile" subtitle="Personal & work details" globalFilters={profileHeader} onBack={onBack} onRefresh={load}>
    {loading ? <Loading text="Loading profile…" /> : error && !profile.email ? <ErrorState message={error} onRetry={load} /> : <>
      <SectionTitle>Account Details</SectionTitle>
      {error ? <View style={styles.errorBanner}><MaterialCommunityIcons name="alert-circle-outline" size={17} color="#dc2626" /><Text style={styles.errorText}>{error}</Text></View> : null}

      <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.formHeader}>
          <View style={[styles.formHeaderIcon, { backgroundColor: theme.primarySoft }]}>
            {profile.company_logo_url
              ? <Image source={{ uri: resolveLogoUrl(profile.company_logo_url) }} resizeMode="contain" style={styles.tenantLogoThumb} />
              : <MaterialCommunityIcons name="account-details-outline" size={18} color={theme.primary} />}
          </View>
          <View><Text style={[styles.formTitle, { color: theme.text }]}>Personal & work information</Text><Text style={[styles.formHint, { color: theme.muted }]}>Details linked to your login account</Text></View>
        </View>
        {canManageLogo ? <View style={[styles.logoTools, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <View style={styles.logoToolsCopy}><Text style={[styles.logoToolsTitle, { color: theme.text }]}>Tenant Logo</Text><Text style={[styles.logoToolsHint, { color: theme.muted }]}>PNG, JPEG or WebP · Maximum 2 MB</Text></View>
          <View style={styles.logoActions}>
            <Pressable disabled={logoSaving} onPress={pickTenantLogo} style={[styles.logoButton, { backgroundColor: theme.primary }]}>
              {logoSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.logoButtonText}>{profile.company_logo_url ? 'Change' : 'Upload'}</Text>}
            </Pressable>
          </View>
          {logoMessage ? <Text style={[styles.logoMessage, { color: theme.muted }]}>{logoMessage}</Text> : null}
        </View> : null}
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
  tenantLogoThumb: { width: 28, height: 28 },
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
  logoTools: { marginTop: 10, marginBottom: 2, padding: 10, borderWidth: 1, borderRadius: 11 },
  logoToolsCopy: { marginBottom: 8 },
  logoToolsTitle: { fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase' },
  logoToolsHint: { marginTop: 2, fontSize: 9, fontWeight: '700' },
  logoActions: { flexDirection: 'row', gap: 7 },
  logoButton: { minWidth: 82, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  logoButtonText: { color: '#fff', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  logoButtonSecondary: { borderWidth: 1, backgroundColor: 'transparent' },
  logoButtonSecondaryText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  logoMessage: { marginTop: 7, fontSize: 9.5, fontWeight: '750' },
});
