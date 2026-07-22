import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NativeDropdown from '../components/NativeDropdown';
import { apiRequest } from '../services/api';
import NativeComplaints from './NativeComplaints';
import NativeDailyAttendance from './NativeDailyAttendance';
import NativeFloorBalance from './NativeFloorBalance';
import NativeOperationWorkspace from './NativeOperationWorkspace';
import NativeOperationsScreen from './NativeOperationsScreen';
import NativeProcessingDashboard from './NativeProcessingDashboard';
import NativeProfile from './NativeProfile';
import NativeStockStatus from './NativeStockStatus';
import NativeUserConfiguration from './NativeUserConfiguration';
import NativeWorkerManagement from './NativeWorkerManagement';
import NativeVisitorsDayWorkers from './NativeVisitorsDayWorkers';
import NativeApprovals, { NativeApprovalPrompt } from './NativeApprovals';
import { useERPTheme } from '../theme/ERPThemeContext';
import { API_URL } from '../config';

const appItems = [
  { key: 'operations_processing', tab: 'operations', icon: 'factory', label: 'Processing', note: '7 stages', color: '#f97316', anyPerm: ['gate_entry', 'raw_material_purchasing', 'de_heading', 'grading', 'peeling', 'soaking', 'production'] },
  { key: 'operations_inventory', tab: 'operations', icon: 'warehouse', label: 'Inventory', note: 'Stock actions', color: '#2563eb', anyPerm: ['stock_entry'] },
  { key: 'operation:gate_entry:processing', tab: 'operations', icon: 'gate', label: 'Gate Entry', note: 'Processing form', color: '#2563eb', perm: 'gate_entry' },
  { key: 'operation:raw_material_purchasing:processing', tab: 'operations', icon: 'truck-fast-outline', label: 'RM Purchasing', note: 'Processing form', color: '#16a34a', perm: 'raw_material_purchasing' },
  { key: 'operation:de_heading:processing', tab: 'operations', icon: 'content-cut', label: 'De-Heading', note: 'Processing form', color: '#7c3aed', perm: 'de_heading' },
  { key: 'operation:grading:processing', tab: 'operations', icon: 'scale-balance', label: 'Grading', note: 'Processing form', color: '#f59e0b', perm: 'grading' },
  { key: 'operation:peeling:processing', tab: 'operations', icon: 'layers-triple-outline', label: 'Peeling', note: 'Processing form', color: '#0891b2', perm: 'peeling' },
  { key: 'operation:soaking:processing', tab: 'operations', icon: 'water-outline', label: 'Soaking', note: 'Processing form', color: '#0d9488', perm: 'soaking' },
  { key: 'operation:production:processing', tab: 'operations', icon: 'cog-transfer-outline', label: 'Production', note: 'Processing form', color: '#dc2626', perm: 'production' },
  { key: 'operation:stock_entry:inventory', tab: 'operations', icon: 'package-variant-closed-plus', label: 'Stock Entry', note: 'Inventory form', color: '#2563eb', perm: 'stock_entry' },
  { key: 'dashboard_processing', tab: 'home', icon: 'chart-box-outline', label: 'Processing Dashboard', note: 'Output summary', color: '#7c3aed', perm: 'processing_dashboard' },
  { key: 'report_floor_balance', tab: 'reports', icon: 'scale-balance', label: 'Floor Balance', note: 'Processing stock', color: '#dc2626', perm: 'floor_balance_report' },
  { key: 'report_stock_status', tab: 'reports', icon: 'clipboard-text-outline', label: 'Stock Status', note: 'Ledger report', color: '#0891b2', perm: 'inventory_report' },
  { key: 'hrms_daily_attendance', tab: 'home', icon: 'badge-account-horizontal-outline', label: 'Daily Attendance', note: 'HR terminal', color: '#0f766e', perm: 'daily_attendance' },
  { key: 'hrms_contract_workers', tab: 'home', icon: 'account-hard-hat-outline', label: 'Contract Workers', note: 'Registration & punching', color: '#c2410c', perm: 'labour_management' },
  { key: 'hrms_kg_company_staff', tab: 'home', icon: 'weight-kilogram', label: 'KG Company Staff', note: 'Registration & punching', color: '#7c3aed', perm: 'kg_basis_labour' },
  { key: 'hrms_visitors_workers', tab: 'home', icon: 'account-arrow-right-outline', label: 'Visitors & Day Workers', note: 'Entry and register', color: '#0891b2', perm: 'visitors_day_workers' },
  { key: 'hrms_approvals', tab: 'home', icon: 'account-check-outline', label: 'Approvals', note: 'Visitors & day workers', color: '#15803d' },
  { key: 'user_profile', tab: 'profile', icon: 'account-details-outline', label: 'My Profile', note: 'Personal & work details', color: '#2563eb' },
  { key: 'admin_my_complaints', tab: 'profile', icon: 'headset', label: 'My Complaints', note: 'Support desk', color: '#be123c' },
  { key: 'admin_user_configuration', tab: 'profile', icon: 'account-cog-outline', label: 'User Configuration', note: 'Users, roles and access', color: '#7c3aed', perm: 'add_user', adminOnly: true },
];

const tabs = [
  { key: 'home', icon: 'home-variant-outline', activeIcon: 'home-variant', label: 'Home' },
  { key: 'operations', icon: 'cog-outline', activeIcon: 'cog', label: 'Operations' },
  { key: 'reports', icon: 'file-chart-outline', activeIcon: 'file-chart', label: 'Reports' },
  { key: 'profile', icon: 'account-circle-outline', activeIcon: 'account-circle', label: 'Profile' },
];

export default function NativeHomeScreen({ user, onLogout, onUserUpdated }) {
  const { theme, cycleHeaderColor } = useERPTheme();
  const [activeItem, setActiveItem] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [productionFor, setProductionFor] = useState('');
  const [plantLocation, setPlantLocation] = useState('');
  const [filterError, setFilterError] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const displayName = user?.name || user?.email || 'User';
  const grantedPermissions = useMemo(() => {
    const values = Array.isArray(user?.permissions) ? user.permissions : String(user?.permissions || '').split(',');
    return new Set(values.map(value => String(value).trim()).filter(Boolean));
  }, [user?.permissions]);
  const allow = item => {
    if (item.adminOnly && !['admin', 'super_admin'].includes(user?.role)) return false;
    if (grantedPermissions.has('ALL')) return true;
    if (item.perm && !grantedPermissions.has(item.perm)) return false;
    if (item.anyPerm && !item.anyPerm.some(permission => grantedPermissions.has(permission))) return false;
    return true;
  };
  useEffect(() => {
    if (!activeItem) return;
    const target = appItems.find(item => item.key === activeItem);
    if (target && !allow(target)) setActiveItem(null);
  }, [activeItem, grantedPermissions, user?.role]);

  useEffect(() => {
    apiRequest('/auth/global-dropdowns')
      .then(payload => {
        setCompanies(payload.companies || []);
        setLocations(payload.locations || []);
      })
      .catch(() => {});
  }, []);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allowedItems = appItems.filter(allow);
    if (query) return allowedItems.filter(item => `${item.label} ${item.note}`.toLowerCase().includes(query));
    if (activeTab === 'home') return allowedItems.filter(item => ['dashboard_processing', 'hrms_daily_attendance', 'hrms_contract_workers', 'hrms_kg_company_staff', 'hrms_visitors_workers', 'hrms_approvals'].includes(item.key));
    return allowedItems.filter(item => item.tab === activeTab);
  }, [activeTab, search, user?.role, grantedPermissions]);

  const openItem = key => {
    if (key === 'admin_my_complaints') {
      setSupportOpen(true);
      return;
    }
    const target = appItems.find(item => item.key === key);
    if (target && !allow(target)) {
      setFilterError('This module is not assigned to your account.');
      return;
    }
    if (key === 'hrms_daily_attendance' && (!productionFor || !plantLocation)) {
      setFilterError('Select both Production For and Plant Location to open Daily Attendance.');
      return;
    }
    setFilterError('');
    setActiveItem(key);
  };

  const openProfile = () => {
    setActiveTab('profile');
    setSearch('');
    setActiveItem('user_profile');
  };

  const filters = {
    productionFor,
    location: plantLocation,
    companyName: user?.company_name || user?.company_code || 'SVBK ERP',
    companies,
    locations,
    onProductionForChange: value => { setProductionFor(value); setFilterError(''); },
    onLocationChange: value => { setPlantLocation(value); setFilterError(''); },
    onSupport: () => setSupportOpen(true),
    permissions: [...grantedPermissions],
  };

  let activeScreen = null;
  if (activeItem) {
    const back = () => setActiveItem(null);
    if (activeItem.startsWith('operation:')) {
      const parent = activeItem.split(':')[2];
      activeScreen = <NativeOperationWorkspace moduleKey={activeItem.split(':')[1]} filters={filters} onBack={() => setActiveItem(parent.startsWith('dashboard_') ? parent : parent === 'inventory' ? 'operations_inventory' : 'operations_processing')} />;
    }
    if (activeItem === 'operations_processing') activeScreen = <NativeOperationsScreen type="processing" filters={filters} permissions={[...grantedPermissions]} onBack={back} onOpenOperation={key => openItem(`operation:${key}:processing`)} onOpenDashboard={() => openItem('dashboard_processing')} onOpenFloorBalance={() => openItem('report_floor_balance')} />;
    if (activeItem === 'operations_inventory') activeScreen = <NativeOperationsScreen type="inventory" filters={filters} permissions={[...grantedPermissions]} onBack={back} onOpenOperation={key => openItem(`operation:${key}:inventory`)} onOpenStockStatus={() => openItem('report_stock_status')} />;
    if (activeItem === 'report_stock_status') activeScreen = <NativeStockStatus filters={filters} onBack={back} />;
    if (activeItem === 'report_floor_balance') activeScreen = <NativeFloorBalance filters={filters} onBack={() => setActiveItem('dashboard_processing')} />;
    if (activeItem === 'dashboard_processing') activeScreen = <NativeProcessingDashboard filters={filters} onBack={back} onOpenSource={key => setActiveItem(key === 'floor_balance_report' ? 'report_floor_balance' : `operation:${key}:dashboard_processing`)} />;
    if (activeItem === 'hrms_daily_attendance') activeScreen = <NativeDailyAttendance filters={filters} onBack={back} />;
    if (activeItem === 'hrms_contract_workers') activeScreen = <NativeWorkerManagement kind="contract" filters={filters} onBack={back} />;
    if (activeItem === 'hrms_kg_company_staff') activeScreen = <NativeWorkerManagement kind="kg" filters={filters} onBack={back} />;
    if (activeItem === 'hrms_visitors_workers') activeScreen = <NativeVisitorsDayWorkers filters={filters} onBack={back} />;
    if (activeItem === 'hrms_approvals') activeScreen = <NativeApprovals filters={filters} onBack={back} />;
    if (activeItem === 'user_profile') activeScreen = <NativeProfile user={user} filters={filters} onBack={back} onProfileUpdated={onUserUpdated} />;
    if (activeItem === 'admin_user_configuration' && ['admin', 'super_admin'].includes(user?.role) && (grantedPermissions.has('ALL') || grantedPermissions.has('add_user'))) activeScreen = <NativeUserConfiguration onBack={back} />;
  }

  const selectTab = key => {
    setActiveTab(key);
    setActiveItem(key === 'profile' ? 'user_profile' : null);
    setSearch('');
  };

  const supportDrawer = supportOpen ? (
    <View pointerEvents="box-none" style={styles.supportLayer}>
      <View style={[styles.supportDrawer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <NativeComplaints panelMode filters={filters} onBack={() => setSupportOpen(false)} />
      </View>
    </View>
  ) : null;

  if (activeScreen) return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={styles.activePage}>{activeScreen}</View>
    <BottomNavigation theme={theme} activeTab={activeTab} onSelect={selectTab} />
    {!supportOpen ? <FloatingSupportButton theme={theme} onPress={() => setSupportOpen(true)} /> : null}
    <NativeApprovalPrompt enabled={activeItem !== 'hrms_approvals'} />
    {supportDrawer}
  </View>;

  return <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={[styles.app, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.header, borderColor: theme.headerBorder }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: theme.headerAccent }]}>WELCOME BACK</Text>
          <Text style={[styles.welcome, { color: theme.headerText }]}>Hello, {displayName.split(' ')[0]}</Text>
          <View style={styles.companyRow}>
            {user?.company_logo_url
              ? <Image source={{ uri: /^https?:\/\//i.test(user.company_logo_url) ? user.company_logo_url : `${API_URL}${user.company_logo_url}` }} resizeMode="contain" style={styles.companyLogo} />
              : <MaterialCommunityIcons name="map-marker-outline" size={13} color={theme.headerMuted} />}
            <Text numberOfLines={1} style={[styles.company, { color: theme.headerMuted }]}>{user?.company_name || user?.company_code || 'SVBK ERP'}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <HeaderAction label="Theme" icon="palette-outline" theme={theme} onPress={cycleHeaderColor} />
          <HeaderAction label="Support" icon="headset" theme={theme} onPress={() => openItem('admin_my_complaints')} />
          <HeaderAction label="Profile" icon="account-circle-outline" theme={theme} onPress={openProfile} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="magnify" size={22} color={theme.primary} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search ERP services…" placeholderTextColor="#8796a8" style={[styles.searchInput, { color: theme.text }]} />
          {search ? <Pressable onPress={() => setSearch('')}><MaterialCommunityIcons name="close-circle" size={19} color={theme.muted} /></Pressable> : null}
        </View>

        <Text style={styles.heading}>Filters</Text>
        <View style={[styles.filtersCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.dropdownRow}>
            <NativeDropdown label="Production For" values={companies} value={productionFor} onChange={value => { setProductionFor(value); setFilterError(''); }} placeholder="All companies" />
            <NativeDropdown label="Plant Location" values={locations} value={plantLocation} onChange={value => { setPlantLocation(value); setFilterError(''); }} placeholder="All locations" />
          </View>
          <Text style={styles.filterHint}>Optional for all modules • Required only for Daily Attendance</Text>
          {filterError ? <Text style={styles.filterError}>{filterError}</Text> : null}
        </View>

        {activeTab === 'home' && !search ? <>
          <View style={styles.titleRow}><Text style={styles.heading}>Operations</Text><Pressable onPress={() => setActiveTab('operations')}><Text style={styles.seeAll}>See all ›</Text></Pressable></View>
          <View style={styles.featureRow}>
            {appItems.filter(item => ['operations_processing', 'operations_inventory'].includes(item.key) && allow(item)).map(item => <FeatureCard key={item.key} item={item} onPress={() => openItem(item.key)} />)}
          </View>
          <Text style={styles.heading}>Quick access</Text>
        </> : <Text style={styles.heading}>{search ? 'Search results' : tabs.find(item => item.key === activeTab)?.label}</Text>}

        <View style={styles.grid}>
          {visibleItems.map(item => <AppCard key={item.key} item={item} onPress={() => openItem(item.key)} />)}
          {activeTab === 'profile' && !search ? <Pressable onPress={onLogout} style={styles.logoutCard}><View style={styles.logoutIcon}><MaterialCommunityIcons name="logout" size={25} color="#dc2626" /></View><View style={styles.cardCopy}><Text style={styles.logoutTitle}>Logout</Text><Text style={styles.cardNote}>Securely end session</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color="#94a3b8" style={styles.arrowIcon} /></Pressable> : null}
        </View>
      </ScrollView>

      <BottomNavigation theme={theme} activeTab={activeTab} onSelect={selectTab} />
      {!supportOpen ? <FloatingSupportButton theme={theme} onPress={() => setSupportOpen(true)} /> : null}
      <NativeApprovalPrompt />
      {supportDrawer}
    </View>
  </SafeAreaView>;
}

function BottomNavigation({ theme, activeTab, onSelect }) {
  return <View style={[styles.bottomBar, { backgroundColor: theme.header }]}>
    <View pointerEvents="none" style={[styles.bottomBarTopCover, { backgroundColor: theme.header }]} />
    {tabs.map(item => <Pressable key={item.key} onPress={() => onSelect(item.key)} style={styles.bottomItem}>
      <View style={[styles.bottomIcon, activeTab === item.key && { backgroundColor: theme.headerAlt }]}><MaterialCommunityIcons name={activeTab === item.key ? item.activeIcon : item.icon} size={21} color={activeTab === item.key ? theme.headerAccent : theme.headerMuted} /></View>
      <Text style={[styles.bottomLabel, { color: theme.headerMuted }, activeTab === item.key && { color: theme.headerAccent }]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}

function HeaderAction({ label, icon, theme, onPress }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={styles.headerAction}>
    <View style={[styles.headerActionButton, { backgroundColor: theme.headerAlt }]}>
      <MaterialCommunityIcons name={icon} size={20} color={theme.headerAccent} />
    </View>
    <Text style={[styles.headerActionLabel, { color: theme.headerMuted }]}>{label}</Text>
  </Pressable>;
}

function FloatingSupportButton({ theme, onPress }) {
  const position = React.useRef(new Animated.ValueXY()).current;
  const panResponder = React.useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => position.extractOffset(),
    onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => position.flattenOffset(),
    onPanResponderTerminate: () => position.flattenOffset(),
  })).current;

  return <Animated.View style={[styles.floatingSupport, { transform: position.getTranslateTransform() }]} {...panResponder.panHandlers}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Support" onPress={onPress} style={styles.floatingSupportPressable}>
      <View style={styles.floatingSupportIcon}>
        <MaterialCommunityIcons name="headset" size={33} color="#fff" />
      </View>
    </Pressable>
  </Animated.View>;
}

function FeatureCard({ item, onPress }) {
  const { theme } = useERPTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.featureCard, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}>
    <View style={[styles.featureIcon, { backgroundColor: `${item.color}16` }]}><MaterialCommunityIcons name={item.icon} size={26} color={item.color} /></View>
    <View style={styles.featureCopy}><Text style={styles.featureTitle}>{item.label}</Text><Text style={styles.featureNote}>{item.note}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={21} color={item.color} style={styles.featureArrowIcon} />
  </Pressable>;
}

function AppCard({ item, onPress }) {
  const { theme } = useERPTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}>
    <View style={[styles.cardIcon, { backgroundColor: `${item.color}15` }]}><MaterialCommunityIcons name={item.icon} size={27} color={item.color} /></View>
    <View style={styles.cardCopy}><Text style={styles.cardTitle}>{item.label}</Text><Text style={styles.cardNote}>{item.note}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={21} color="#94a3b8" style={styles.arrowIcon} />
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f7fb' },
  app: { flex: 1, backgroundColor: '#f4f7fb' },
  activePage: { flex: 1, paddingBottom: 68 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 68 },
  header: { minHeight: 95, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 15, paddingTop: 28, paddingBottom: 11, borderBottomWidth: 1, backgroundColor: '#0b2345', shadowColor: '#061426', shadowOpacity: .24, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 7, zIndex: 2 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#67e8f9', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  welcome: { marginTop: 3, color: '#ffffff', fontSize: 24, fontWeight: '900', letterSpacing: -.5 },
  companyRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  companyLogo: { width: 18, height: 18 },
  company: { flexShrink: 1, color: '#b8c7dc', fontSize: 12, fontWeight: '750' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerAction: { width: 43, alignItems: 'center', justifyContent: 'center' },
  headerActionButton: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  headerActionLabel: { marginTop: 3, fontSize: 9, fontWeight: '900' },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 15, backgroundColor: '#fff' },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 14, fontWeight: '750' },
  heading: { marginTop: 16, marginBottom: 9, color: '#0f172a', fontSize: 16, fontWeight: '900' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { marginTop: 14, marginBottom: 8, color: '#2563eb', fontSize: 12, fontWeight: '900' },
  filtersCard: { padding: 11, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 14, backgroundColor: '#fff' },
  dropdownRow: { flexDirection: 'row', gap: 9 },
  filterHint: { marginTop: 11, color: '#64748b', fontSize: 10.5, fontWeight: '700' },
  filterError: { marginTop: 7, color: '#dc2626', fontSize: 11.5, lineHeight: 16, fontWeight: '850' },
  featureRow: { flexDirection: 'row', gap: 10 },
  featureCard: { flex: 1, minHeight: 96, padding: 11, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 15, backgroundColor: '#fff' },
  featureIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  featureCopy: { flex: 1 },
  featureTitle: { marginTop: 8, color: '#0f172a', fontSize: 13.5, fontWeight: '900' },
  featureNote: { marginTop: 3, color: '#64748b', fontSize: 10.5, fontWeight: '700' },
  featureArrowIcon: { position: 'absolute', top: 13, right: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  card: { width: '48.5%', minHeight: 112, alignItems: 'flex-start', padding: 11, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 15, backgroundColor: '#fff' },
  cardIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { marginTop: 8, color: '#0f172a', fontSize: 13, fontWeight: '900' },
  cardNote: { marginTop: 4, color: '#64748b', fontSize: 10.5, fontWeight: '700' },
  arrowIcon: { position: 'absolute', top: 12, right: 9 },
  pressed: { opacity: .72, transform: [{ scale: .99 }] },
  logoutCard: { width: '48.5%', minHeight: 112, padding: 11, borderWidth: 1, borderColor: '#fecaca', borderRadius: 15, backgroundColor: '#fff' },
  logoutIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#fef2f2' },
  logoutTitle: { marginTop: 8, color: '#dc2626', fontSize: 13, fontWeight: '900' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: -2, zIndex: 20, height: 71, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10, borderWidth: 0, borderTopWidth: 0, borderColor: 'transparent', borderTopColor: 'transparent', backgroundColor: '#fff', shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0, overflow: 'visible' },
  bottomBarTopCover: { position: 'absolute', left: 0, right: 0, top: -2, height: 4, borderWidth: 0 },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  bottomLabel: { color: '#64748b', fontSize: 10, fontWeight: '850' },
  floatingSupport: { position: 'absolute', right: 14, bottom: 79, zIndex: 30, alignItems: 'center', justifyContent: 'center' },
  floatingSupportPressable: { alignItems: 'center', justifyContent: 'center' },
  floatingSupportIcon: { width: 69, height: 69, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#60a5fa', borderRadius: 35, backgroundColor: '#2563eb' },
  supportLayer: { ...StyleSheet.absoluteFillObject, zIndex: 50, alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: 10, paddingBottom: 78 },
  supportDrawer: { width: '92%', maxWidth: 380, height: '64%', maxHeight: 540, minHeight: 360, overflow: 'hidden', borderWidth: 1, borderRadius: 18, backgroundColor: '#fff' },
});
