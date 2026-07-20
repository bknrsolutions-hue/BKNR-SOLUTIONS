import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/NativeScreenKit';

const processingItems = [
  { key: 'gate_entry', perm: 'gate_entry', icon: '🚪', label: 'Gate Entry', note: 'Vehicle and material arrival', color: '#f59e0b' },
  { key: 'raw_material_purchasing', perm: 'raw_material_purchasing', icon: '🚚', label: 'RM Purchasing', note: 'Raw material purchase entry', color: '#2563eb' },
  { key: 'de_heading', perm: 'de_heading', icon: '✂️', label: 'De-Heading', note: 'De-heading production entry', color: '#7c3aed' },
  { key: 'grading', perm: 'grading', icon: '⚖️', label: 'Grading', note: 'Grade and count allocation', color: '#0891b2' },
  { key: 'peeling', perm: 'peeling', icon: '🧤', label: 'Peeling', note: 'Peeling process terminal', color: '#16a34a' },
  { key: 'soaking', perm: 'soaking', icon: '💧', label: 'Soaking', note: 'Soaking batch monitoring', color: '#0d9488' },
  { key: 'production', perm: 'production', icon: '🏭', label: 'Production', note: 'Final production entry', color: '#dc2626' },
];

const inventoryItems = [
  { key: 'stock_entry', perm: 'stock_entry', icon: '📦', label: 'Stock Entry', note: 'Stock inward and outward', color: '#2563eb' },
];

export default function NativeOperationsScreen({ type, filters = {}, permissions = [], onBack, onOpenOperation, onOpenDashboard, onOpenFloorBalance, onOpenStockStatus }) {
  const isProcessing = type === 'processing';
  const granted = new Set(permissions);
  const has = permission => granted.has('ALL') || granted.has(permission);
  const items = (isProcessing ? processingItems : inventoryItems).filter(item => has(item.perm));
  const title = isProcessing ? 'Processing Operations' : 'Inventory Operations';

  return <Screen
    title={title}
    subtitle={[filters.productionFor, filters.location].filter(Boolean).join(' • ') || 'All operations'}
    globalFilters={filters}
    onBack={onBack}
  >
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Text style={styles.heroEmoji}>{isProcessing ? '🏭' : '📦'}</Text></View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle}>{isProcessing ? 'Production workflow' : 'Inventory workflow'}</Text>
        <Text style={styles.heroText}>{isProcessing ? 'Manage every stage from gate entry to final production.' : 'Manage stock inward, outward and current status.'}</Text>
      </View>
    </View>

    <Text style={styles.sectionTitle}>{isProcessing ? 'PROCESSING STAGES' : 'INVENTORY ACTIONS'}</Text>
    <View style={styles.grid}>
      {items.map((item, index) => <Pressable
        key={item.label}
        onPress={() => onOpenOperation(item.key)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={[styles.icon, { backgroundColor: `${item.color}18` }]}><Text style={styles.emoji}>{item.icon}</Text></View>
        <Text style={styles.label}>{item.label}</Text>
        <Text style={styles.note}>{item.note}</Text>
        <View style={[styles.status, { backgroundColor: `${item.color}16` }]}><Text style={[styles.statusText, { color: item.color }]}>OPEN MODULE</Text></View>
      </Pressable>)}
    </View>

    <View style={styles.quickRow}>
      {isProcessing && has('processing_dashboard') ? <Pressable onPress={onOpenDashboard} style={styles.quickButton}><Text style={styles.quickIcon}>◫</Text><Text style={styles.quickLabel}>Dashboard</Text></Pressable> : null}
      {isProcessing && has('floor_balance_report') ? <Pressable onPress={onOpenFloorBalance} style={styles.quickButton}><Text style={styles.quickIcon}>⚖</Text><Text style={styles.quickLabel}>Floor Balance</Text></Pressable> : null}
      {!isProcessing && has('inventory_report') ? <Pressable onPress={onOpenStockStatus} style={styles.quickButton}><Text style={styles.quickIcon}>▤</Text><Text style={styles.quickLabel}>Stock Status</Text></Pressable> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 18, backgroundColor: '#fff' },
  heroIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#eff6ff' },
  heroEmoji: { fontSize: 34 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  heroText: { marginTop: 4, color: '#64748b', fontSize: 13, lineHeight: 15, fontWeight: '650' },
  sectionTitle: { marginTop: 20, marginBottom: 10, color: '#64748b', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48.5%', minHeight: 164, padding: 13, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 18, backgroundColor: '#fff' },
  pressed: { opacity: .78 },
  icon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  emoji: { fontSize: 30 },
  label: { marginTop: 10, color: '#0f172a', fontSize: 12, fontWeight: '900' },
  note: { marginTop: 4, minHeight: 28, color: '#64748b', fontSize: 11.5, lineHeight: 12, fontWeight: '650' },
  status: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 13, fontWeight: '900', letterSpacing: .4 },
  selection: { marginTop: 15, padding: 15, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 17, backgroundColor: '#fff7ed' },
  selectionTitle: { color: '#1c1917', fontSize: 14, fontWeight: '900' },
  selectionText: { marginTop: 5, color: '#78716c', fontSize: 12.5, lineHeight: 15, fontWeight: '650' },
  primaryButton: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, backgroundColor: '#f97316' },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 9, marginTop: 16 },
  quickButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 14, backgroundColor: '#fff' },
  quickIcon: { color: '#2563eb', fontSize: 21, fontWeight: '900' },
  quickLabel: { color: '#1e3a5f', fontSize: 13, fontWeight: '850' },
});
