// ============================================================
// BKNR ERP — Home Dashboard Screen
// Mobile launcher: only approved operational modules are visible.
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, TextInput, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { MENU_DATA } from '../menuData';
import { BASE_URL } from '../config';

// Native screens that have dedicated React Native implementations
const NATIVE_ROUTES = {
  '/processing/gate_entry':           'GateEntry',
  '/processing/raw_material_purchasing': 'RMP',
  '/processing/de_heading':           'Deheading',
  '/processing/grading':              'Grading',
  '/processing/peeling':              'Peeling',
  '/processing/soaking':              'Soaking',
  '/processing/production':           'Production',
  '/inventory/stock_entry':           'StockEntry',
  '/inventory/cargo_entry':           'StockEntry',
  '/attendance/daily':                'Attendance',
};

export default function HomeScreen({ navigation }) {
  const { user, logout, theme, toggleTheme } = useAuth();
  const isDark = theme === 'dark';
  const [search, setSearch] = useState('');
  const [expandedSection, setExpandedSection] = useState(null);

  const c = {
    bg:       isDark ? '#030712' : '#f1f5f9',
    card:     isDark ? '#0d1424' : '#ffffff',
    cardAlt:  isDark ? '#111827' : '#f8fafc',
    text:     isDark ? '#f8fafc' : '#0f172a',
    sub:      isDark ? '#64748b' : '#64748b',
    border:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    input:    isDark ? '#111827' : '#ffffff',
  };

  // Navigate: native screen OR WebView
  const openModule = (route) => {
    const nativeRoute = NATIVE_ROUTES[route];
    if (nativeRoute) {
      navigation.navigate(nativeRoute);
    } else {
      navigation.navigate('WebView', { url: `${BASE_URL}${route}`, title: '' });
    }
  };

  // Keep the native mobile launcher intentionally compact. Dedicated native
  // screens open directly; dashboard/report/inventory companions open inside
  // the authenticated in-app workspace until dedicated screens are available.
  const ALLOWED_MODULE_IDS = [
    'processing_dashboard',
    'inventory_dashboard',
    'gate_entry',
    'raw_material_purchasing',
    'de_heading',
    'grading',
    'peeling',
    'soaking',
    'production',
    'stock_entry',
    'pending_orders',
    'cold_storage_holding',
    'general_store_entry',
    'inventory_report',
    'daily_attendance',
  ];

  const processedMenu = MENU_DATA.map(section => {
    return {
      ...section,
      modules: section.modules.filter(m => ALLOWED_MODULE_IDS.includes(m.id)),
    };
  }).filter(section => section.modules.length > 0 || section.id === 'admin');

  // Filtered menu based on search
  const filteredMenu = search.trim()
    ? processedMenu.map(section => ({
        ...section,
        modules: section.modules.filter(m =>
          m.label.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.modules.length > 0)
    : processedMenu;

  const toggleSection = (id) =>
    setExpandedSection(prev => (prev === id ? null : id));

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />

      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{(user?.name || 'A')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={[styles.headerName, { color: c.text }]}>{user?.name || 'Administrator'}</Text>
            <Text style={[styles.headerComp, { color: c.sub }]}>{user?.company || '—'} · {user?.role || 'user'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: c.border }]} onPress={toggleTheme}>
            <Feather name={isDark ? 'sun' : 'moon'} size={17} color={c.sub} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: c.border }]} onPress={logout}>
            <Feather name="log-out" size={17} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ── WELCOME BANNER ── */}
        <View style={styles.bannerWrap}>
          <View style={styles.banner}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerHi}>Good day,</Text>
              <Text style={styles.bannerName}>{user?.name?.split(' ')[0] || 'Admin'} 👋</Text>
              <Text style={styles.bannerSub}>BKNR ERP v3.0 · Seafood ERP Platform</Text>
            </View>
            <View style={styles.bannerIcon}>
              <Feather name="layers" size={28} color="rgba(255,255,255,0.4)" />
            </View>
          </View>
        </View>

        {/* ── SEARCH ── */}
        <View style={styles.searchWrap}>
          <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Feather name="search" size={16} color={c.sub} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Search modules..."
              placeholderTextColor={c.sub}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x" size={15} color={c.sub} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── QUICK ACCESS — Native Ops ── */}
        {!search && (
          <View style={styles.quickWrap}>
            <Text style={[styles.sectionTitle, { color: c.sub }]}>⚡ QUICK ACCESS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {[
                { label: 'Gate Entry', icon: 'log-in', route: '/processing/gate_entry', color: '#3b82f6' },
                { label: 'RM Purchase', icon: 'truck', route: '/processing/raw_material_purchasing', color: '#8b5cf6' },
                { label: 'De-Heading', icon: 'scissors', route: '/processing/de_heading', color: '#ec4899' },
                { label: 'Grading', icon: 'filter', route: '/processing/grading', color: '#f59e0b' },
                { label: 'Peeling', icon: 'layers', route: '/processing/peeling', color: '#10b981' },
                { label: 'Soaking', icon: 'droplet', route: '/processing/soaking', color: '#06b6d4' },
                { label: 'Production', icon: 'cpu', route: '/processing/production', color: '#ef4444' },
                { label: 'Stock IN/OUT', icon: 'archive', route: '/inventory/stock_entry', color: '#22c55e' },
                { label: 'Attendance', icon: 'clock', route: '/attendance/daily', color: '#f97316' },
              ].map((q) => (
                <TouchableOpacity
                  key={q.route}
                  style={[styles.quickChip, { backgroundColor: q.color + '18', borderColor: q.color + '40' }]}
                  onPress={() => openModule(q.route)}
                >
                  <Feather name={q.icon} size={14} color={q.color} />
                  <Text style={[styles.quickLabel, { color: q.color }]}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── ALL MENU SECTIONS ── */}
        <View style={styles.menuWrap}>
          {filteredMenu.map((section) => {
            const isExpanded = expandedSection === section.id || !!search;
            const isAdmin = section.id === 'admin';
            // Group modules by subgroup
            const subgroups = {};
            section.modules.forEach(m => {
              const key = m.subgroup || '_default';
              if (!subgroups[key]) subgroups[key] = [];
              subgroups[key].push(m);
            });

            return (
              <View key={section.id} style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
                {/* Section Header (tap to expand) */}
                <TouchableOpacity
                  style={styles.sectionHeader}
                  onPress={() => !search && toggleSection(section.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.sectionIconWrap, { backgroundColor: section.bgColor }]}>
                    <Feather name={section.icon} size={18} color={section.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionName, { color: c.text }]}>{section.title}</Text>
                    <Text style={[styles.sectionCount, { color: c.sub }]}>
                      {isAdmin ? '1 module · Logout' : `${section.modules.length} modules`}
                    </Text>
                  </View>
                  {!search && (
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={c.sub}
                    />
                  )}
                </TouchableOpacity>

                {/* Modules grid */}
                {isExpanded && (
                  <View style={styles.modulesContainer}>
                    {Object.entries(subgroups).map(([group, mods]) => (
                      <View key={group}>
                        {group !== '_default' && (
                          <View style={[styles.subgroupRow, { borderTopColor: c.border }]}>
                            <Text style={[styles.subgroupLabel, { color: section.color }]}>{group}</Text>
                          </View>
                        )}
                        <View style={styles.moduleGrid}>
                          {mods.map((mod) => {
                            const isNative = !!NATIVE_ROUTES[mod.route];
                            return (
                              <TouchableOpacity
                                key={mod.id}
                                style={[
                                  styles.moduleCard,
                                  { backgroundColor: c.cardAlt, borderColor: c.border }
                                ]}
                                onPress={() => openModule(mod.route)}
                                activeOpacity={0.7}
                              >
                                <View style={[styles.modIconWrap, { backgroundColor: section.bgColor }]}>
                                  <Feather name={mod.icon} size={16} color={section.color} />
                                </View>
                                <Text style={[styles.modLabel, { color: c.text }]} numberOfLines={2}>
                                  {mod.label}
                                </Text>
                                <View style={styles.modFooter}>
                                  <View style={[styles.modBadge, { backgroundColor: section.bgColor }]}>
                                    <Text style={[styles.modBadgeText, { color: section.color }]}>{mod.badge}</Text>
                                  </View>
                                  {isNative && (
                                    <View style={styles.nativePill}>
                                      <Text style={styles.nativePillText}>NATIVE</Text>
                                    </View>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}

                    {/* Logout button — shown only in Admin section */}
                    {isAdmin && (
                      <TouchableOpacity
                        style={[styles.logoutRow, { borderTopColor: c.border }]}
                        onPress={handleLogout}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.modIconWrap, { backgroundColor: 'rgba(239,68,68,0.1)', marginBottom: 0 }]}>
                          <Feather name="log-out" size={16} color="#ef4444" />
                        </View>
                        <Text style={styles.logoutLabel}>Sign Out</Text>
                        <Feather name="chevron-right" size={15} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerName: { fontSize: 14, fontWeight: '800' },
  headerComp: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Banner
  bannerWrap: { padding: 16, paddingBottom: 0 },
  banner: {
    backgroundColor: '#1d4ed8',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  bannerLeft: { flex: 1 },
  bannerHi: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' },
  bannerName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  bannerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 5, fontWeight: '500' },
  bannerIcon: {
    width: 56,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchWrap: { padding: 16, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  // Quick chips
  quickWrap: { paddingHorizontal: 16, marginBottom: 12 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  quickLabel: { fontSize: 12, fontWeight: '700' },

  // Section cards
  menuWrap: { paddingHorizontal: 16, gap: 10 },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  sectionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionName: { fontSize: 15, fontWeight: '800' },
  sectionCount: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Modules
  modulesContainer: { paddingHorizontal: 12, paddingBottom: 12 },
  subgroupRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 6,
    marginBottom: 4,
  },
  subgroupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moduleCard: {
    width: '30.5%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
    minHeight: 100,
  },
  modIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modLabel: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    lineHeight: 15,
  },
  modFooter: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  modBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  modBadgeText: { fontSize: 8, fontWeight: '800' },
  nativePill: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  nativePillText: { fontSize: 7, fontWeight: '800', color: '#10b981' },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 14,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  logoutLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  },
});
