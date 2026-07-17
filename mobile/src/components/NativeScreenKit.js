import React from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import NativeDropdown from './NativeDropdown';
import { useERPTheme } from '../theme/ERPThemeContext';

export const number = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const currency = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Screen({ title, subtitle, onBack, onRefresh, children, scroll = true, globalFilters }) {
  const { theme, cycleHeaderColor } = useERPTheme();
  const body = <View style={styles.body}>{children}</View>;
  const showFilters = globalFilters && (globalFilters.companies?.length || globalFilters.locations?.length);
  return <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}><View style={[styles.header, styles.headerTopSpace, { backgroundColor: theme.header, borderBottomColor: theme.headerBorder }]}><HeaderTool label="Back" icon="arrow-left" onPress={onBack} theme={theme} /><View style={styles.headerCopy}>{globalFilters?.companyName ? <Text numberOfLines={1} style={[styles.companyName, { color: theme.headerAccent }]}>{globalFilters.companyName}</Text> : null}<Text numberOfLines={1} style={[styles.title, { color: theme.headerText }]}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={[styles.subtitle, { color: theme.headerMuted }]}>{subtitle}</Text> : null}</View><HeaderTool label="Theme" icon="palette-outline" onPress={cycleHeaderColor} theme={theme} />{globalFilters?.onSupport ? <HeaderTool label="Support" icon="headset" onPress={globalFilters.onSupport} theme={theme} /> : null}{onRefresh ? <HeaderTool label="Refresh" icon="refresh" onPress={onRefresh} theme={theme} /> : null}</View>{showFilters ? <View style={[styles.globalFilters, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}><NativeDropdown compact label="Production For" values={globalFilters.companies || []} value={globalFilters.productionFor || ''} onChange={globalFilters.onProductionForChange || (() => {})} placeholder="All companies" /><NativeDropdown compact label="Plant Location" values={globalFilters.locations || []} value={globalFilters.location || ''} onChange={globalFilters.onLocationChange || (() => {})} placeholder="All locations" /></View> : null}{scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}</SafeAreaView>;
}

function HeaderTool({ label, icon, onPress, theme }) {
  return <Pressable accessibilityLabel={label} hitSlop={5} onPress={onPress} style={styles.headerTool}><View style={[styles.headerToolIcon, { backgroundColor: theme.headerAlt }]}><MaterialCommunityIcons name={icon} size={16} color={theme.headerAccent} /></View><Text numberOfLines={1} style={[styles.headerToolLabel, { color: theme.headerMuted }]}>{label}</Text></Pressable>;
}

export function Loading({ text = 'Loading…' }) { return <View style={styles.center}><ActivityIndicator color="#60a5fa" /><Text style={styles.centerText}>{text}</Text></View>; }
export function ErrorState({ message, onRetry }) { return <View style={styles.center}><Text style={styles.errorTitle}>Unable to load</Text><Text style={styles.centerText}>{message}</Text>{onRetry ? <Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable> : null}</View>; }
export function Kpi({ label, value, color = '#2563eb', icon, onPress }) {
  const { theme } = useERPTheme();
  const card = <LinearGradient colors={[`${color}1F`, `${color}0D`, theme.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.kpi, { borderColor: `${color}30` }]}>
    <View style={styles.kpiHeader}><Text style={[styles.kpiLabel, { color: theme.muted }]}>{label}</Text>{icon ? <Text style={styles.kpiIcon}>{icon}</Text> : null}</View>
    <Text numberOfLines={1} style={[styles.kpiValue, { color: theme.text }]}>{value}</Text>
    {onPress ? <Text style={[styles.kpiLink, { color: theme.primary }]}>View source ›</Text> : null}
  </LinearGradient>;
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => [styles.kpiWrap, pressed && { opacity: .72 }]}>{card}</Pressable>
    : <View style={styles.kpiWrap}>{card}</View>;
}
export function SectionTitle({ children }) {
  const { theme } = useERPTheme();
  return <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>;
}
export function Empty({ text = 'No records found.' }) {
  const { theme } = useERPTheme();
  return <Text style={[styles.empty, { color: theme.muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  headerTopSpace: { paddingTop: 30, paddingBottom: 7, minHeight: 92 },
  page: { flex: 1, backgroundColor: '#f4f7fb' },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: '#31577d', backgroundColor: '#0b2345', shadowColor: '#061426', shadowOpacity: .24, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 7, zIndex: 2 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: '#0f172a', fontSize: 17, fontWeight: '900' },
  companyName: { marginBottom: 1, fontSize: 8, fontWeight: '900', letterSpacing: .45, textTransform: 'uppercase' },
  subtitle: { marginTop: 2, color: '#64748b', fontSize: 10.5, fontWeight: '700' },
  headerTool: { width: 36, alignItems: 'center', justifyContent: 'center' },
  headerToolIcon: { width: 30, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerToolLabel: { marginTop: 2, fontSize: 5.8, fontWeight: '900' },
  globalFilters: { minHeight: 50, flexDirection: 'row', gap: 7, paddingHorizontal: 9, paddingTop: 5, paddingBottom: 6, borderBottomWidth: 1 },
  scroll: { paddingBottom: 0 },
  body: { flexGrow: 1, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 9 },
  center: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 22 },
  centerText: { maxWidth: 310, color: '#64748b', fontSize: 12, lineHeight: 18, fontWeight: '650', textAlign: 'center' },
  errorTitle: { color: '#dc2626', fontSize: 16, fontWeight: '900' },
  retry: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  kpiWrap: { width: '48.5%' },
  kpi: { width: '100%', minHeight: 96, justifyContent: 'center', padding: 13, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 14, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: .06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiIcon: { fontSize: 20 },
  kpiLabel: { color: '#64748b', fontSize: 10, fontWeight: '900', letterSpacing: .3, textTransform: 'uppercase' },
  kpiValue: { marginTop: 5, color: '#0f172a', fontSize: 18, fontWeight: '900' },
  kpiLink: { marginTop: 4, color: '#2563eb', fontSize: 9, fontWeight: '850' },
  sectionTitle: { marginTop: 17, marginBottom: 9, color: '#1e3a5f', fontSize: 13, fontWeight: '900', letterSpacing: .45, textTransform: 'uppercase' },
  empty: { padding: 18, color: '#64748b', fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
