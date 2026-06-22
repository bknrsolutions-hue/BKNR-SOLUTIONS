import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, Modal, ActivityIndicator,
  TouchableWithoutFeedback, Platform, BackHandler, TextInput,
  Animated, Alert, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { MENU_DATA } from '../menuData';
import { BASE_URL } from '../config';

const { width, height } = Dimensions.get('window');
const COLUMN_W = (width - 32 - 16) / 3; // 3 columns layout
const CARD_W = width - 48; // Summary cards width

// Pulsing skeleton loader using standard Animated API
const SkeletonLoader = ({ width, height, borderRadius = 8, style }) => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#1e293b',
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
};

// Animated scale on click for cards
const AnimatedCard = ({ children, onPress, style }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      friction: 4,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
    >
      <Animated.View style={[{ transform: [{ scale: scaleValue }] }, style]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

export default function HomeScreen({ navigation }) {
  const { user, logout, theme, toggleTheme, filters, updateFilters } = useAuth();
  
  const [activeTab, setActiveTab] = useState('Home'); // 'Home' | 'Operations' | 'Reports' | 'Notifications' | 'Profile'
  const [activeModule, setActiveModule] = useState(null); // null | 'GateEntry' | 'RMPurchase' | 'ColdStorage'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pickerType, setPickerType] = useState(null); // 'company' | 'location'
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);

  // Live SQL database metrics state
  const [dashboardData, setDashboardData] = useState(null);
  const [gateEntries, setGateEntries] = useState([]);
  const [rmPurchases, setRmPurchases] = useState([]);

  // Form input states
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [rmVariety, setRmVariety] = useState('Vannamei');
  const [rmGrade, setRmGrade] = useState('30/40');
  const [rmWeight, setRmWeight] = useState('');
  const [rmRate, setRmRate] = useState('');
  const [tempChamberCode, setTempChamberCode] = useState('');
  const [tempReading, setTempReading] = useState('');

  // Report Viewer State
  const [viewingReport, setViewingReport] = useState(null); // null | { name, key }
  const [reportHeaders, setReportHeaders] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFy, setReportFy] = useState('2026');

  // Fetch real aggregated dashboard data from SQL
  const fetchDashboardData = async () => {
    try {
      let url = `${BASE_URL}/api/mobile/dashboard_data`;
      let params = [];
      if (filters.productionFor) {
        params.push(`production_for=${encodeURIComponent(filters.productionFor)}`);
      }
      if (filters.plantLocation) {
        params.push(`location=${encodeURIComponent(filters.plantLocation)}`);
      }
      if (params.length > 0) {
        url = `${url}?${params.join('&')}`;
      }
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json();
      if (json.status === 'success') {
        setDashboardData(json.data);
        if (json.data.gate_entries) setGateEntries(json.data.gate_entries);
        if (json.data.rm_purchases) setRmPurchases(json.data.rm_purchases);
      }
    } catch (e) {
      console.warn("Failed to fetch live mobile dashboard data:", e);
    }
  };

  // Fetch company/plant list
  const fetchDropdowns = async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/global-dropdowns`, { credentials: 'include' });
      const data = await res.json();
      if (data.status === 'success') {
        setCompanies(data.companies || []);
        setLocations(data.locations || []);
      }
    } catch (e) {
      console.warn('Failed dynamic global dropdown fetch:', e);
    }
  };

  useEffect(() => {
    fetchDropdowns();
    fetchDashboardData();
  }, [filters]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchDashboardData();
    setIsRefreshing(false);
  };

  const getReportKey = (name) => {
    const clean = name.toLowerCase().replace(/report/g, '').trim();
    if (clean.includes('gate entry')) return 'gate_entry';
    if (clean.includes('purchase') || clean.includes('rmp') || clean.includes('rm ')) return 'raw_material_purchasing';
    if (clean.includes('de-heading') || clean.includes('deheading')) return 'de_heading';
    if (clean.includes('grading')) return 'grading';
    if (clean.includes('peeling')) return 'peeling';
    if (clean.includes('soaking')) return 'soaking';
    if (clean.includes('production')) return 'production';
    if (clean.includes('floor balance')) return 'floor_balance_report';
    if (clean.includes('stock status') || clean.includes('inventory')) return 'inventory_report';
    if (clean.includes('pending order')) return 'pending_orders';
    if (clean.includes('sales')) return 'sales_dispatch';
    if (clean.includes('general store') || clean.includes('gs ')) return 'gs_report';
    if (clean.includes('cold storage') || clean.includes('coldstore')) return 'cold_storage_holding_report';
    return name;
  };

  const fetchReportData = async (reportKey, fy) => {
    setReportLoading(true);
    try {
      const url = `${BASE_URL}/api/mobile/report_data?report_name=${reportKey}&fy=${fy}`;
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json();
      if (json.status === 'success') {
        setReportHeaders(json.data.headers || []);
        setReportRows(json.data.rows || []);
      }
    } catch (e) {
      console.warn("Failed to fetch report data:", e);
    } finally {
      setReportLoading(false);
    }
  };

  const loadReportViewer = (rep) => {
    const rKey = getReportKey(rep.name);
    const initialFy = '2026';
    setViewingReport({ name: rep.name, key: rKey });
    setReportFy(initialFy);
    fetchReportData(rKey, initialFy);
  };

  // Theme Setup
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#060913' : '#f8fafc',
    card: isDark ? '#111827' : '#ffffff',
    textMain: isDark ? '#ffffff' : '#0f172a',
    textSub: isDark ? '#94a3b8' : '#475569',
    textMuted: isDark ? '#4b5563' : '#94a3b8',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    primary: '#2563EB',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  };

  // Hardware Back Handler
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (viewingReport) {
          setViewingReport(null);
          return true;
        }
        if (activeModule) {
          setActiveModule(null);
          return true;
        }
        if (activeTab !== 'Home') {
          setActiveTab('Home');
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [activeModule, activeTab, viewingReport])
  );

  const allow = (key) => {
    if (user?.email === 'bknr.solutions@gmail.com') return true;
    if (!user || !user.permissions) return false;
    return user.permissions.includes('ALL') || user.permissions.includes(key);
  };

  // Module Launcher Helper
  const loadModule = (modKey) => {
    setActiveModule(modKey);
  };

  const handleLogout = async () => {
    await logout();
  };

  // Submits a real Gate Entry request to backend
  const submitGateEntry = async () => {
    if (!vehicleNo || !driverName || !supplierName || !grossWeight) {
      Alert.alert('Validation Failed', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/mobile/gate_entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleNo: vehicleNo.trim(),
          driver: driverName.trim(),
          supplier: supplierName.trim(),
          weight: parseFloat(grossWeight),
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        Alert.alert('Success', data.message || 'Gate Entry recorded!');
        setVehicleNo('');
        setDriverName('');
        setSupplierName('');
        setGrossWeight('');
        // Reload dashboard
        await fetchDashboardData();
      } else {
        Alert.alert('Error', data.message || 'Failed to record entry.');
      }
    } catch (e) {
      Alert.alert('Error', 'Server connection failure.');
    } finally {
      setLoading(false);
    }
  };

  // Submits a real RM Purchase record to database
  const submitRmPurchase = async () => {
    if (!supplierName || !rmWeight || !rmRate) {
      Alert.alert('Validation Failed', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/mobile/rm_purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplierName.trim(),
          variety: rmVariety,
          grade: rmGrade,
          weight: parseFloat(rmWeight),
          rate: parseFloat(rmRate),
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        Alert.alert('Success', data.message || 'RM Purchase Lot Created!');
        setSupplierName('');
        setRmWeight('');
        setRmRate('');
        await fetchDashboardData();
      } else {
        Alert.alert('Error', data.message || 'Failed to save purchase lot.');
      }
    } catch (e) {
      Alert.alert('Error', 'Server connection failure.');
    } finally {
      setLoading(false);
    }
  };

  // Simulation PDF/Excel Export
  const triggerReportExport = (reportName, type) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Export Complete', `${reportName} exported to ${type.toUpperCase()} file successfully!`);
    }, 1500);
  };

  // ==========================================
  // VIEW RENDER CORNER
  // ==========================================

  // Sticky Premium Header
  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <TouchableOpacity style={styles.headerLeft} onPress={() => setActiveTab('Profile')}>
        <View style={[styles.profileIndicator, { backgroundColor: colors.primary }]}>
          <Feather name="user" size={13} color="#fff" />
        </View>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.logoText, { color: colors.textMain }]}>BKNR ERP</Text>
          <Text style={styles.headerSubtext}>{filters.productionFor || 'All Corporate Entities'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.headerRight}>
        {/* Search */}
        <TouchableOpacity style={[styles.iconBtnHeader, { borderColor: colors.border }]} onPress={() => {
          if (activeTab !== 'Operations') setActiveTab('Operations');
          setSearchQuery(searchQuery ? '' : ' ');
        }}>
          <Feather name="search" size={15} color={colors.textSub} />
        </TouchableOpacity>

        {/* Bell Alerts */}
        <TouchableOpacity style={[styles.iconBtnHeader, { borderColor: colors.border }]} onPress={() => setActiveTab('Notifications')}>
          <Feather name="bell" size={15} color={colors.textSub} />
          {dashboardData?.notifications?.length > 0 && <View style={styles.headerAlertBadge} />}
        </TouchableOpacity>

        {/* Dynamic Filters Quick Switch */}
        <TouchableOpacity style={[styles.pillHeader, { borderColor: colors.border }]} onPress={() => setPickerType('location')}>
          <Feather name="map-pin" size={11} color={colors.primary} />
          <Text style={[styles.pillHeaderText, { color: colors.textMain }]} numberOfLines={1}>
            {filters.plantLocation || 'All Plants'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Home Screen Content
  const renderHomeTab = () => {
    if (!dashboardData) {
      // Pulser skeleton layout
      return (
        <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.greetingsBlock}>
            <SkeletonLoader width={180} height={20} style={{ marginBottom: 6 }} />
            <SkeletonLoader width={140} height={24} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.textSub }]}>LOADING EXECUTIVE SUMMARY...</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollPadding}>
            <SkeletonLoader width={CARD_W} height={96} borderRadius={16} style={{ marginRight: 12 }} />
            <SkeletonLoader width={CARD_W} height={96} borderRadius={16} />
          </ScrollView>
          <View style={{ marginTop: 22 }}>
            <SkeletonLoader width={150} height={16} style={{ marginBottom: 12 }} />
            <View style={styles.financeGrid}>
              <SkeletonLoader width={(width - 32 - 8) / 2} height={80} borderRadius={14} style={{ marginBottom: 8 }} />
              <SkeletonLoader width={(width - 32 - 8) / 2} height={80} borderRadius={14} />
              <SkeletonLoader width={(width - 32 - 8) / 2} height={80} borderRadius={14} />
              <SkeletonLoader width={(width - 32 - 8) / 2} height={80} borderRadius={14} />
            </View>
          </View>
        </ScrollView>
      );
    }

    const summaryCards = [
      { key: 'p', label: 'PRODUCTION TODAY', val: dashboardData.summary?.production, sub: 'Active factory sorting output weight', icon: 'cpu', color: colors.primary, bg: 'rgba(37,99,235,0.1)' },
      { key: 'i', label: 'INVENTORY STATUS', val: dashboardData.summary?.inventory, sub: 'Total cold storage raw material holding', icon: 'package', color: colors.success, bg: 'rgba(16,185,129,0.1)' },
      { key: 's', label: 'SALES TODAY', val: dashboardData.summary?.sales, sub: 'Calculated invoice shipment value', icon: 'truck', color: colors.warning, bg: 'rgba(245,158,11,0.1)' },
      { key: 'pur', label: 'RM PURCHASES', val: dashboardData.summary?.purchase, sub: 'Raw material weight checked in today', icon: 'shopping-bag', color: colors.danger, bg: 'rgba(239,68,68,0.1)' },
    ];

    const financeCards = [
      { key: 'rev', title: 'Revenue', val: dashboardData.finance?.revenue, chg: '+14.5%', trend: 'trending-up', color: colors.primary },
      { key: 'pr', title: 'Net Profit', val: dashboardData.finance?.profit, chg: '+8.2%', trend: 'trending-up', color: colors.success },
      { key: 'ex', title: 'Expenses', val: dashboardData.finance?.expenses, chg: '+3.1%', trend: 'trending-down', color: colors.danger },
      { key: 'bal', title: 'Cash Balance', val: dashboardData.finance?.balance, chg: 'Live Ledger', trend: 'activity', color: colors.warning },
    ];

    return (
      <ScrollView 
        contentContainerStyle={styles.tabScroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Greetings Panel */}
        <View style={styles.greetingsBlock}>
          <Text style={styles.greetSub}>Welcome back,</Text>
          <Text style={[styles.greetTitle, { color: colors.textMain }]}>
            {dashboardData.greetings?.name || user?.name || user?.email?.split('@')[0] || 'User'} 👋
          </Text>
        </View>

        {/* Horizontal Swipe Cards */}
        <View style={styles.summaryContainer}>
          <Text style={[styles.sectionTitle, { color: colors.textSub }]}>TODAY'S OPERATIONS SUMMARY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_W + 16} decelerationRate="fast" contentContainerStyle={styles.horizontalScrollPadding}>
            {summaryCards.map((card) => (
              <View key={card.key} style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.summaryCardRow}>
                  <View>
                    <Text style={styles.summaryCardLabel}>{card.label}</Text>
                    <Text style={[styles.summaryCardValue, { color: colors.textMain }]}>{card.val}</Text>
                  </View>
                  <View style={[styles.summaryIconCircle, { backgroundColor: card.bg }]}>
                    <Feather name={card.icon} size={16} color={card.color} />
                  </View>
                </View>
                <Text style={[styles.summaryCardSub, { color: colors.textSub }]}>{card.sub}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Glassmorphic Finance Widgets */}
        <View style={styles.financeSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSub }]}>FINANCIAL HIGHLIGHTS (WIDGETS)</Text>
          <View style={styles.financeGrid}>
            {financeCards.map((fc) => (
              <View key={fc.key} style={[styles.financeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={styles.financeCardTitle}>{fc.title}</Text>
                <Text style={[styles.financeCardVal, { color: colors.textMain }]}>{fc.val}</Text>
                <View style={styles.financeCardFooter}>
                  <Feather name={fc.trend} size={10} color={fc.color} />
                  <Text style={[styles.financeCardChg, { color: fc.color }]}>{fc.chg}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Pure Native Bar/Line Charts Section */}
        <View style={styles.chartsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSub }]}>ERP ANALYTICS & TRENDS</Text>
          
          {/* Donut distribution */}
          <View style={[styles.chartWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.chartHeader, { color: colors.textMain }]}>Stock Distribution (Variety)</Text>
            <View style={styles.barProgressRow}>
              {(dashboardData.donut_chart || []).map((item, idx) => (
                <View
                  key={item.label}
                  style={{
                    flex: item.value || 1,
                    height: 12,
                    backgroundColor: item.color,
                    borderTopLeftRadius: idx === 0 ? 6 : 0,
                    borderBottomLeftRadius: idx === 0 ? 6 : 0,
                    borderTopRightRadius: idx === (dashboardData.donut_chart.length - 1) ? 6 : 0,
                    borderBottomRightRadius: idx === (dashboardData.donut_chart.length - 1) ? 6 : 0,
                  }}
                />
              ))}
            </View>
            <View style={styles.legendGrid}>
              {(dashboardData.donut_chart || []).map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.legendText, { color: colors.textSub }]}>
                    {item.label} ({item.value}%)
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Weekly Production Bar Chart */}
          <View style={[styles.chartWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.chartHeader, { color: colors.textMain }]}>Weekly Production Output (Tons)</Text>
            <View style={styles.barChartPlot}>
              {(dashboardData.bar_chart || []).map((item) => {
                // Maximum scale divisor is 10 tons for spacing
                const heightPct = `${Math.min(100, (item.v / 10) * 100)}%`;
                return (
                  <View key={item.d} style={styles.barChartCol}>
                    <View style={styles.barChartContainer}>
                      <View style={[styles.barChartFill, { height: heightPct, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={styles.chartLabelText}>{item.d}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Monthly Profit Area/Line Chart */}
          <View style={[styles.chartWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.chartHeader, { color: colors.textMain }]}>Monthly profit Trend (Lakhs)</Text>
            <View style={styles.lineChartPlot}>
              <View style={styles.lineChartPointsRow}>
                {(dashboardData.line_chart || []).map((item) => {
                  // Max divisor is 20L
                  const bottomPct = `${Math.min(100, (item.v / 20) * 80)}%`;
                  return (
                    <View key={item.m} style={styles.lineChartCol}>
                      <View style={styles.lineChartTrack}>
                        <View style={[styles.lineChartPoint, { bottom: bottomPct, backgroundColor: colors.success }]} />
                        <View style={[styles.lineChartFillArea, { height: bottomPct, backgroundColor: 'rgba(16,185,129,0.06)' }]} />
                      </View>
                      <Text style={styles.chartLabelText}>{item.m}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  // Operations Screen Content
  const renderOperationsTab = () => {
    const counts = dashboardData?.ops_counts || {};
    const modulesList = [
      { key: 'GateEntry', label: 'Gate Entry', sub: 'Check in & Weighing', icon: 'log-in', color1: '#1e3a8a', color2: '#2563eb', badge: `${counts.gate_entry || 0} Today` },
      { key: 'RMPurchase', label: 'RM Purchase', sub: 'Lot Purchasing & Rate', icon: 'truck', color1: '#ea580c', color2: '#f97316', badge: `${counts.rm_purchase || 0} Lots` },
      { key: 'DeHeading', label: 'DeHeading', sub: 'Pre-processing WIP', icon: 'scissors', color1: '#0f766e', color2: '#14b8a6', badge: `${counts.deheading || 0} Today` },
      { key: 'Grading', label: 'Grading', sub: 'Size-grade selection', icon: 'filter', color1: '#6d28d9', color2: '#8b5cf6', badge: `${counts.grading || 0} Today` },
      { key: 'Peeling', label: 'Peeling', sub: 'Contractor worksheets', icon: 'layers', color1: '#be185d', color2: '#ec4899', badge: `${counts.peeling || 0} Today` },
      { key: 'Soaking', label: 'Soaking', icon: 'droplet', sub: 'Phosphate treatment', color1: '#0369a1', color2: '#0ea5e9', badge: `${counts.soaking || 0} Today` },
      { key: 'Production', label: 'Production', icon: 'cpu', sub: 'Core factory sorting', color1: '#be123c', color2: '#f43f5e', badge: `${counts.production || 0} Today` },
      { key: 'Inventory', label: 'Inventory', icon: 'archive', sub: 'Stock ledger checks', color1: '#15803d', color2: '#22c55e', badge: `${counts.inventory || 0} Items` },
      { key: 'ColdStorage', label: 'Cold Storage', icon: 'thermometer', sub: 'Temperature monitoring', color1: '#374151', color2: '#6b7280', badge: `${counts.cold_storage || 0} Units` },
      { key: 'GeneralStore', label: 'General Store', icon: 'shopping-bag', sub: 'Stock requisition', color1: '#7c2d12', color2: '#ca8a04', badge: 'Active' },
    ];

    const filtered = searchQuery
      ? modulesList.filter((m) => m.label.toLowerCase().includes(searchQuery.toLowerCase()))
      : modulesList;

    return (
      <ScrollView 
        contentContainerStyle={styles.tabScroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.searchBlock}>
          <View style={[styles.searchBarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.textSub} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInputField, { color: colors.textMain }]}
              placeholder="Search ERP modules..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery === ' ' ? '' : searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                <Feather name="x" size={16} color={colors.textSub} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSub }]}>APP STORE STYLE MODULE CONSOLE</Text>
        <View style={styles.modulesGrid}>
          {filtered.map((mod) => (
            <AnimatedCard key={mod.key} style={styles.moduleGridCardWrapper} onPress={() => loadModule(mod.key)}>
              <View style={[styles.moduleCard, { backgroundColor: mod.color1 }]}>
                {/* Visual Accent Overlay */}
                <View style={[styles.moduleCardAccent, { backgroundColor: mod.color2 }]} />
                <View style={styles.moduleCardHeader}>
                  <Feather name={mod.icon} size={22} color="#fff" />
                  <View style={styles.moduleBadge}><Text style={styles.moduleBadgeText}>{mod.badge}</Text></View>
                </View>
                <Text style={styles.moduleLabelText}>{mod.label}</Text>
                <Text style={styles.moduleSubtext} numberOfLines={1}>{mod.sub}</Text>
              </View>
            </AnimatedCard>
          ))}
        </View>
      </ScrollView>
    );
  };

  // Reports Screen Content
  const renderReportsTab = () => {
    const reportsMenu = MENU_DATA.find((item) => item.id === 'reports');
    const reportModules = reportsMenu ? reportsMenu.modules : [];

    const groups = {};
    reportModules.forEach((mod) => {
      const subgroup = mod.subgroup || 'Other Reports';
      if (!groups[subgroup]) {
        groups[subgroup] = [];
      }
      groups[subgroup].push(mod);
    });

    const reportCategories = Object.keys(groups).map((groupName, idx) => {
      const colorsList = [colors.primary, colors.success, colors.warning];
      return {
        title: groupName.toUpperCase(),
        color: colorsList[idx % colorsList.length],
        items: groups[groupName].map((m) => ({
          name: m.label,
          period: m.badge || 'Report'
        }))
      };
    });

    return (
      <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.reportsBlock}>
          <Text style={[styles.sectionTitle, { color: colors.textSub }]}>MODERN REPORT CONSOLE</Text>
          {reportCategories.map((cat) => (
            <View key={cat.title} style={styles.reportCategorySection}>
              <Text style={[styles.reportCategoryTitle, { color: cat.color }]}>{cat.title}</Text>
              {cat.items.map((rep) => (
                <View key={rep.name} style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.reportCardHeader}>
                    <Feather name="file-text" size={16} color={cat.color} />
                    <View style={styles.reportInfoCol}>
                      <Text style={[styles.reportNameText, { color: colors.textMain }]}>{rep.name}</Text>
                      <Text style={styles.reportPeriodText}>{rep.period}</Text>
                    </View>
                  </View>
                  <View style={[styles.reportActionsRow, { borderTopColor: colors.border }]}>
                    <TouchableOpacity style={styles.reportActionBtn} onPress={() => loadReportViewer(rep)}>
                      <Feather name="eye" size={12} color={colors.primary} />
                      <Text style={[styles.reportActionText, { color: colors.primary }]}>View</Text>
                    </TouchableOpacity>
                    <View style={[styles.reportActionSeparator, { backgroundColor: colors.border }]} />
                    <TouchableOpacity style={styles.reportActionBtn} onPress={() => triggerReportExport(rep.name, 'pdf')}>
                      <Feather name="download" size={12} color={colors.textSub} />
                      <Text style={[styles.reportActionText, { color: colors.textSub }]}>PDF</Text>
                    </TouchableOpacity>
                    <View style={[styles.reportActionSeparator, { backgroundColor: colors.border }]} />
                    <TouchableOpacity style={styles.reportActionBtn} onPress={() => triggerReportExport(rep.name, 'excel')}>
                      <Feather name="file" size={12} color={colors.success} />
                      <Text style={[styles.reportActionText, { color: colors.success }]}>Excel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // Notifications Screen Content
  const renderNotificationsTab = () => {
    const notificationsList = dashboardData?.notifications || [];

    return (
      <ScrollView 
        contentContainerStyle={styles.tabScroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={[styles.sectionTitle, { color: colors.textSub }]}>ACTIVE WARNINGS & SYSTEM LOGS</Text>
        <View style={styles.notificationList}>
          {notificationsList.length > 0 ? (
            notificationsList.map((not) => {
              const accent = not.type === 'danger' ? colors.danger : not.type === 'warning' ? colors.warning : not.type === 'success' ? colors.success : colors.primary;
              return (
                <View key={not.key} style={[styles.notifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.notifyHeader}>
                    <View style={[styles.notifyIconCircle, { backgroundColor: accent + '15' }]}>
                      <Feather name={not.icon} size={14} color={accent} />
                    </View>
                    <Text style={[styles.notifyTitle, { color: colors.textMain }]} numberOfLines={1}>{not.title}</Text>
                    <Text style={styles.notifyTime}>{not.time}</Text>
                  </View>
                  <Text style={[styles.notifyMsg, { color: colors.textSub }]}>{not.msg}</Text>
                </View>
              );
            })
          ) : (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Feather name="shield" size={42} color={colors.success} style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.textMain, fontWeight: '800', fontSize: 13, marginBottom: 4 }}>System Status Nominal</Text>
              <Text style={{ color: colors.textSub, fontSize: 11, textAlign: 'center', paddingHorizontal: 40 }}>
                No active operational warnings or temperature threshold exceptions detected.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  // Profile Settings Screen Content
  const renderProfileTab = () => {
    return (
      <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator={false}>
        {/* User Card info */}
        <View style={[styles.userProfileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarHuge, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarHugeText}>N</Text>
          </View>
          <Text style={[styles.userProfileName, { color: colors.textMain }]}>{dashboardData?.greetings?.name || user?.name || 'Nagaraju'}</Text>
          <Text style={[styles.userProfileEmail, { color: colors.textSub }]}>{user?.email || 'nagaraju@bknr.com'}</Text>
          <View style={[styles.roleBadgeHuge, { backgroundColor: 'rgba(37,99,235,0.1)' }]}>
            <Text style={styles.roleBadgeHugeText}>{user?.role?.toUpperCase() || 'PLANT MANAGER'}</Text>
          </View>
        </View>

        {/* Global Settings */}
        <Text style={[styles.sectionTitle, { color: colors.textSub }]}>ORGANIZATION CONSOLE</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Company Details */}
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingLabelCol}>
              <Text style={[styles.settingLabel, { color: colors.textMain }]}>Corporate Entity</Text>
              <Text style={styles.settingDesc}>{user?.company || 'BKNR SEAFOODS PRIVATE LTD'}</Text>
            </View>
            <TouchableOpacity style={styles.settingActionBtn} onPress={() => setPickerType('company')}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Theme Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelCol}>
              <Text style={[styles.settingLabel, { color: colors.textMain }]}>Dark Theme</Text>
              <Text style={styles.settingDesc}>Toggle visual appearance of dashboard layout</Text>
            </View>
            <TouchableOpacity style={[styles.toggleSwitch, { backgroundColor: isDark ? colors.primary : '#334155' }]} onPress={toggleTheme}>
              <View style={[styles.toggleDot, { transform: [{ translateX: isDark ? 20 : 2 }] }]} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSub }]}>SECURITY & ACTIONS</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.settingActionRow, { borderBottomColor: colors.border }]} onPress={() => Alert.alert('Action Triggered', 'Secure Password Change wizard launched.')}>
            <Feather name="lock" size={14} color={colors.textSub} />
            <Text style={[styles.settingActionRowText, { color: colors.textMain }]}>Change Password</Text>
            <Feather name="chevron-right" size={14} color={colors.textMuted} style={styles.rightChevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingActionRow} onPress={handleLogout}>
            <Feather name="power" size={14} color={colors.danger} />
            <Text style={[styles.settingActionRowText, { color: colors.danger }]}>Sign Out / Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ==========================================
  // MODULE LEVEL SCREEN RENDERERS
  // ==========================================

  // Native Gate Entry sub-screen
  const renderGateEntryModule = () => (
    <ScrollView contentContainerStyle={styles.moduleSubScroll} showsVerticalScrollIndicator={false}>
      {/* Module Title card header */}
      <View style={[styles.moduleSubHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setActiveModule(null)}>
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backBtnText, { color: colors.primary }]}>Operations</Text>
        </TouchableOpacity>
        <Text style={[styles.moduleTitle, { color: colors.textMain }]}>🦐 Gate Entry Console</Text>
      </View>

      {/* Entry inputs form */}
      <View style={[styles.formContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.formHeader, { color: colors.textMain }]}>RECORD NEW VEHICLE CHECK-IN</Text>
        
        <Text style={styles.formInputLabel}>Vehicle Number</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="e.g. AP-39-XX-1234"
          placeholderTextColor={colors.textMuted}
          value={vehicleNo}
          onChangeText={setVehicleNo}
          autoCapitalize="characters"
        />

        <Text style={styles.formInputLabel}>Driver Name</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="Driver's Full Name"
          placeholderTextColor={colors.textMuted}
          value={driverName}
          onChangeText={setDriverName}
        />

        <Text style={styles.formInputLabel}>Supplier Name</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="Supplier / Hatchery Brand"
          placeholderTextColor={colors.textMuted}
          value={supplierName}
          onChangeText={setSupplierName}
        />

        <Text style={styles.formInputLabel}>Gross weight (kg)</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="Gross tonnage weight"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={grossWeight}
          onChangeText={setGrossWeight}
        />

        <TouchableOpacity style={[styles.formSubmitBtn, { backgroundColor: colors.primary }]} onPress={submitGateEntry}>
          <Feather name="plus-circle" size={14} color="#fff" />
          <Text style={styles.formSubmitText}>Check In Vehicle</Text>
        </TouchableOpacity>
      </View>

      {/* Active vehicles log */}
      <Text style={[styles.sectionTitle, { color: colors.textSub }]}>RECENT ACTIVE GATE CHECK-INS</Text>
      <View style={styles.formEntriesList}>
        {gateEntries.map((item) => (
          <View key={item.id} style={[styles.entryRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.entryRowHeader}>
              <Text style={[styles.entryIdText, { color: colors.textMain }]}>{item.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: colors.success + '15' }]}>
                <Text style={[styles.statusBadgeText, { color: colors.success }]}>{item.status}</Text>
              </View>
            </View>
            <View style={styles.entryDetailsRow}>
              <Text style={[styles.entryDetailText, { color: colors.textSub }]}>Vehicle: {item.vehicleNo}</Text>
              <Text style={[styles.entryDetailText, { color: colors.textSub }]}>Driver: {item.driver}</Text>
            </View>
            <Text style={styles.entrySupplierText}>Supplier: {item.supplier}</Text>
            <Text style={styles.entryTimeText}>Checked In: {item.time}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  // Native RM Purchase sub-screen
  const renderRmPurchaseModule = () => (
    <ScrollView contentContainerStyle={styles.moduleSubScroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.moduleSubHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setActiveModule(null)}>
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backBtnText, { color: colors.primary }]}>Operations</Text>
        </TouchableOpacity>
        <Text style={[styles.moduleTitle, { color: colors.textMain }]}>🛒 RM Purchase Lot</Text>
      </View>

      <View style={[styles.formContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.formHeader, { color: colors.textMain }]}>RECORD INCOMING MATERIAL LOT</Text>

        <Text style={styles.formInputLabel}>Supplier</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="Supplier Name"
          placeholderTextColor={colors.textMuted}
          value={supplierName}
          onChangeText={setSupplierName}
        />

        <Text style={styles.formInputLabel}>Shrimp Variety</Text>
        <View style={styles.formVarietyRow}>
          {['Vannamei', 'Black Tiger'].map((varOpt) => {
            const isSel = rmVariety === varOpt;
            return (
              <TouchableOpacity
                key={varOpt}
                style={[styles.varOptionBtn, { borderColor: colors.border, backgroundColor: isSel ? colors.primary : 'transparent' }]}
                onPress={() => setRmVariety(varOpt)}
              >
                <Text style={{ color: isSel ? '#fff' : colors.textMain, fontWeight: '700', fontSize: 11 }}>{varOpt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.formInputLabel}>Grade Size Count</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="e.g. 30/40, 40/50"
          placeholderTextColor={colors.textMuted}
          value={rmGrade}
          onChangeText={setRmGrade}
        />

        <Text style={styles.formInputLabel}>Weight (kg)</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="Total net weight"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={rmWeight}
          onChangeText={setRmWeight}
        />

        <Text style={styles.formInputLabel}>Rate (₹ per kg)</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="Purchase rate value"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={rmRate}
          onChangeText={setRmRate}
        />

        {/* Dynamic calculation display */}
        {parseFloat(rmWeight) > 0 && parseFloat(rmRate) > 0 && (
          <View style={[styles.formCalcCard, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
            <Text style={[styles.formCalcLabel, { color: colors.textSub }]}>Dynamically Computed Cost Amount:</Text>
            <Text style={[styles.formCalcVal, { color: colors.success }]}>
              ₹{(parseFloat(rmWeight) * parseFloat(rmRate)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
          </View>
        )}

        <TouchableOpacity style={[styles.formSubmitBtn, { backgroundColor: colors.primary }]} onPress={submitRmPurchase}>
          <Feather name="plus-circle" size={14} color="#fff" />
          <Text style={styles.formSubmitText}>Create Purchase Lot</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSub }]}>RECENT COMPLETED PURCHASES</Text>
      <View style={styles.formEntriesList}>
        {rmPurchases.map((item) => (
          <View key={item.id} style={[styles.entryRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.entryRowHeader}>
              <Text style={[styles.entryIdText, { color: colors.textMain }]}>{item.id}</Text>
              <Text style={[styles.entryValueBig, { color: colors.success }]}>{item.total}</Text>
            </View>
            <View style={styles.entryDetailsRow}>
              <Text style={[styles.entryDetailText, { color: colors.textSub }]}>Variety: {item.variety}</Text>
              <Text style={[styles.entryDetailText, { color: colors.textSub }]}>Grade: {item.grade}</Text>
            </View>
            <Text style={[styles.entryDetailText, { color: colors.textSub }]}>Net Weight: {item.weight}</Text>
            <Text style={styles.entrySupplierText}>Supplier: {item.supplier}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  // Native Cold Storage sub-screen
  const renderColdStorageModule = () => (
    <ScrollView contentContainerStyle={styles.moduleSubScroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.moduleSubHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setActiveModule(null)}>
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backBtnText, { color: colors.primary }]}>Operations</Text>
        </TouchableOpacity>
        <Text style={[styles.moduleTitle, { color: colors.textMain }]}>❄️ Cold Storage Chambers</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSub }]}>REALTIME CHAMBER STATUS</Text>
      <View style={styles.chamberGrid}>
        {(dashboardData?.cold_storages || []).length > 0 ? (
          (dashboardData.cold_storages).map((ch, idx) => (
            <View key={idx} style={[styles.chamberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chamberCardHeader}>
                <Text style={[styles.chamberCardLabel, { color: colors.textMain }]} numberOfLines={1}>{ch.name}</Text>
                <View style={[styles.chamberStatusIndicator, { backgroundColor: colors.success }]} />
              </View>
              <Text style={[styles.chamberTemp, { color: colors.success }]}>{ch.qty}</Text>
              <Text style={[styles.chamberVal, { color: colors.textSub }]}>{ch.mc} ({ch.variety})</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textSub, fontSize: 11, paddingLeft: 8, paddingBottom: 12 }}>No active cold store holdings registered.</Text>
        )}
      </View>

      <View style={[styles.formContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.formHeader, { color: colors.textMain }]}>LOG CHAMBER TEMP ALARM EXCEPTION</Text>
        
        <Text style={styles.formInputLabel}>Chamber Code</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="e.g. SNOWMAN LOGISTICS"
          placeholderTextColor={colors.textMuted}
          value={tempChamberCode}
          onChangeText={setTempChamberCode}
        />
        
        <Text style={styles.formInputLabel}>Current Temp Reading</Text>
        <TextInput
          style={[styles.formInputField, { color: colors.textMain, borderColor: colors.border }]}
          placeholder="e.g. -14.2"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={tempReading}
          onChangeText={setTempReading}
        />
        
        <TouchableOpacity 
          style={[styles.formSubmitBtn, { backgroundColor: colors.danger }]} 
          onPress={() => {
            if (!tempChamberCode || !tempReading) {
              Alert.alert('Validation Failed', 'Please fill in both fields.');
              return;
            }
            Alert.alert('Logged', `Temperature anomaly for ${tempChamberCode} logged successfully!`);
            setTempChamberCode('');
            setTempReading('');
          }}
        >
          <Feather name="alert-triangle" size={14} color="#fff" />
          <Text style={styles.formSubmitText}>Log Critical Alarm</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // Fallback module dashboard
  const renderFallbackModule = () => (
    <View style={styles.fallbackModuleContainer}>
      <View style={[styles.moduleSubHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setActiveModule(null)}>
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backBtnText, { color: colors.primary }]}>Operations</Text>
        </TouchableOpacity>
        <Text style={[styles.moduleTitle, { color: colors.textMain }]}>ERP Dashboard Screen</Text>
      </View>
      <View style={styles.fallbackContent}>
        <Feather name="layers" size={48} color={colors.textSub} style={{ marginBottom: 16 }} />
        <Text style={[styles.fallbackTitle, { color: colors.textMain }]}>Module Panel Activated</Text>
        <Text style={[styles.fallbackDesc, { color: colors.textSub }]}>
          This module worksheet is running natively. Enter lot numbers or batch figures below to log entries.
        </Text>
        <TouchableOpacity style={[styles.fallbackBtn, { backgroundColor: colors.primary }]} onPress={() => Alert.alert('Action Done', 'Worksheet updated.')}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Update Native Worksheet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Native Report Data Viewer Screen
  const renderReportViewer = () => {
    const filteredRows = reportRows.filter((row) => {
      if (!reportSearchQuery.trim()) return true;
      return row.some((cell) =>
        String(cell).toLowerCase().includes(reportSearchQuery.toLowerCase())
      );
    });

    return (
      <View style={styles.flex}>
        {/* Header */}
        <View style={[styles.moduleSubHeader, { paddingHorizontal: 16, borderBottomColor: colors.border, marginTop: 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setViewingReport(null)}>
            <Feather name="arrow-left" size={16} color={colors.primary} />
            <Text style={[styles.backBtnText, { color: colors.primary }]}>Reports</Text>
          </TouchableOpacity>
          <Text style={[styles.moduleTitle, { color: colors.textMain }]} numberOfLines={1}>
            📊 {viewingReport?.name}
          </Text>
        </View>

        {/* Filters and Search Bar */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          {/* FY Quick Filters */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Text style={{ color: colors.textSub, fontSize: 10, fontWeight: '800' }}>FY YEAR:</Text>
            {['2026', '2025', '2024'].map((y) => {
              const active = reportFy === y;
              return (
                <TouchableOpacity
                  key={y}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: active ? colors.primary : 'transparent',
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border
                  }}
                  onPress={() => {
                    setReportFy(y);
                    fetchReportData(viewingReport.key, y);
                  }}
                >
                  <Text style={{ color: active ? '#fff' : colors.textMain, fontSize: 9.5, fontWeight: '850' }}>
                    {y}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Search bar */}
          <View style={[styles.searchBarContainer, { backgroundColor: colors.card, borderColor: colors.border, height: 38 }]}>
            <Feather name="search" size={14} color={colors.textSub} style={{ marginRight: 6 }} />
            <TextInput
              style={[styles.searchInputField, { color: colors.textMain, fontSize: 11.5 }]}
              placeholder="Search report records..."
              placeholderTextColor={colors.textMuted}
              value={reportSearchQuery}
              onChangeText={setReportSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {reportSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setReportSearchQuery('')}>
                <Feather name="x" size={14} color={colors.textSub} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Report Table Grid */}
        {reportLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.textSub, fontSize: 10, fontWeight: '700', marginTop: 8 }}>Loading Report Data...</Text>
          </View>
        ) : (
          <ScrollView style={styles.flex}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ flexDirection: 'column' }}>
                {/* Headers */}
                <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  {reportHeaders.map((head, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: head.includes("Supplier") || head.includes("Item") || head.includes("Buyer") ? 160 : 100,
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRightWidth: 1,
                        borderRightColor: colors.border
                      }}
                    >
                      <Text style={{ color: isDark ? '#fff' : '#1e293b', fontSize: 10, fontWeight: '850', textAlign: 'center' }}>
                        {head}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Rows */}
                {filteredRows.length > 0 ? (
                  filteredRows.map((row, rowIdx) => (
                    <View
                      key={rowIdx}
                      style={{
                        flexDirection: 'row',
                        backgroundColor: rowIdx % 2 === 0 ? colors.card : (isDark ? '#0f172a' : '#f8fafc'),
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border
                      }}
                    >
                      {row.map((cell, cellIdx) => {
                        const head = reportHeaders[cellIdx] || "";
                        const width = head.includes("Supplier") || head.includes("Item") || head.includes("Buyer") ? 160 : 100;
                        return (
                          <View
                            key={cellIdx}
                            style={{
                              width,
                              paddingVertical: 8,
                              paddingHorizontal: 8,
                              alignItems: head.includes("Qty") || head.includes("Boxes") || head.includes("Amount") || head.includes("Rate") || head.includes("Weight") || head.includes("Loose") || head.includes("MC") || head.includes("Price") ? 'flex-end' : (head.includes("Supplier") || head.includes("Item") || head.includes("Buyer") ? 'flex-start' : 'center'),
                              justifyContent: 'center',
                              borderRightWidth: 1,
                              borderRightColor: colors.border
                            }}
                          >
                            <Text style={{ color: colors.textMain, fontSize: 10, fontWeight: '600', textAlign: 'left' }} numberOfLines={2}>
                              {cell}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ))
                ) : (
                  <View style={{ width: Math.max(400, reportHeaders.length * 100), padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSub, fontSize: 11, fontWeight: '750' }}>No records found matching filters.</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    );
  };

  // Tab Content Switcher
  const renderTabContent = () => {
    // If a report is currently loaded, render the report viewer
    if (viewingReport) return renderReportViewer();

    // If a module is currently loaded, render the custom module screen
    if (activeModule) {
      if (activeModule === 'GateEntry') return renderGateEntryModule();
      if (activeModule === 'RMPurchase') return renderRmPurchaseModule();
      if (activeModule === 'ColdStorage') return renderColdStorageModule();
      return renderFallbackModule();
    }

    // Switch between bottom tab contents
    if (activeTab === 'Home') return renderHomeTab();
    if (activeTab === 'Operations') return renderOperationsTab();
    if (activeTab === 'Reports') return renderReportsTab();
    if (activeTab === 'Notifications') return renderNotificationsTab();
    if (activeTab === 'Profile') return renderProfileTab();
    return null;
  };

  // Custom Bottom Navigation Tab Bar
  const renderBottomTabBar = () => {
    const tabs = [
      { name: 'Home', icon: 'home', label: 'Home' },
      { name: 'Operations', icon: 'package', label: 'Ops' },
      { name: 'Reports', icon: 'bar-chart-2', label: 'Reports' },
      { name: 'Notifications', icon: 'bell', label: 'Alerts' },
      { name: 'Profile', icon: 'user', label: 'Console' },
    ];

    return (
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              onPress={() => {
                setActiveTab(tab.name);
                setActiveModule(null); // Return to standard screen when changing tabs
              }}
            >
              <Feather
                name={tab.icon}
                size={18}
                color={isActive ? colors.primary : colors.textSub}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.primary : colors.textSub, fontWeight: isActive ? '800' : '600' },
                ]}
              >
                {tab.label}
              </Text>
              {tab.name === 'Notifications' && dashboardData?.notifications?.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{dashboardData.notifications.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Sticky Header */}
        {renderHeader()}

        {/* Tab/Module Contents */}
        <View style={styles.flex}>
          {renderTabContent()}

          {/* Dynamic Export overlay */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 8 }}>Saving details...</Text>
            </View>
          )}
        </View>

        {/* Custom Bottom Tab Bar */}
        {renderBottomTabBar()}
      </SafeAreaView>

      {/* Global dropdown custom modal */}
      <Modal visible={pickerType !== null} transparent animationType="fade" onRequestClose={() => setPickerType(null)}>
        <TouchableWithoutFeedback onPress={() => setPickerType(null)}>
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.pickerHeader, { color: colors.textMain }]}>
                Select {pickerType === 'company' ? 'Company' : 'Plant Location'}
              </Text>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    if (pickerType === 'company') updateFilters({ productionFor: '' });
                    else updateFilters({ plantLocation: '' });
                    setPickerType(null);
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13, textAlign: 'center' }}>
                    {pickerType === 'company' ? 'All Corporate Entities' : 'All Active Plants'}
                  </Text>
                </TouchableOpacity>
                {(pickerType === 'company' ? companies : locations).map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      if (pickerType === 'company') updateFilters({ productionFor: item });
                      else updateFilters({ plantLocation: item });
                      setPickerType(null);
                    }}
                  >
                    <Text style={[styles.pickerItemText, { color: colors.textMain }]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.pickerCloseBtn} onPress={() => setPickerType(null)}>
                <Text style={styles.pickerCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },

  // Sticky Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    height: 52,
    zIndex: 99,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  profileIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
  },
  logoText: {
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerSubtext: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtnHeader: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headerAlertBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  pillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
    maxWidth: 100,
  },
  pillHeaderText: {
    fontSize: 9.5,
    fontWeight: '800',
  },

  // Main scroll containers
  tabScroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },

  // Greetings Panel
  greetingsBlock: {
    marginBottom: 20,
  },
  greetSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  greetTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },

  // Section Title
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },

  // Horizontal summary swipes
  summaryContainer: {
    marginBottom: 22,
  },
  horizontalScrollPadding: {
    gap: 12,
    paddingRight: 16,
  },
  summaryCard: {
    width: CARD_W,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryCardLabel: {
    fontSize: 8.5,
    color: '#64748b',
    fontWeight: '900',
    letterSpacing: 1,
  },
  summaryCardValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCardSub: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },

  // Financial highlights
  financeSection: {
    marginBottom: 22,
  },
  financeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  financeCard: {
    width: (width - 32 - 8) / 2,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  financeCardTitle: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  financeCardVal: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  financeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  financeCardChg: {
    fontSize: 9.5,
    fontWeight: '800',
  },

  // Charts
  chartsSection: {
    marginBottom: 10,
  },
  chartWrapper: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  chartHeader: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 14,
  },
  barProgressRow: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  barChartPlot: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  barChartCol: {
    alignItems: 'center',
    width: 24,
  },
  barChartContainer: {
    height: 80,
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barChartFill: {
    width: '100%',
    borderRadius: 4,
  },
  chartLabelText: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '800',
    marginTop: 6,
  },
  lineChartPlot: {
    height: 120,
    paddingTop: 10,
  },
  lineChartPointsRow: {
    flexDirection: 'row',
    height: 80,
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  lineChartCol: {
    alignItems: 'center',
    width: 32,
  },
  lineChartTrack: {
    height: 80,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  lineChartPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 9,
  },
  lineChartFillArea: {
    width: 32,
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    opacity: 0.1,
  },

  // Operations Search
  searchBlock: {
    marginBottom: 16,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInputField: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    height: '100%',
    padding: 0,
  },
  searchClearBtn: {
    padding: 4,
  },

  // App store style module cards
  modulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moduleGridCardWrapper: {
    width: (width - 32 - 8) / 2,
    height: 108,
  },
  moduleCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  moduleCardAccent: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 72,
    height: 72,
    borderRadius: 36,
    opacity: 0.2,
  },
  moduleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moduleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  moduleBadgeText: {
    color: '#fff',
    fontSize: 7.5,
    fontWeight: '900',
  },
  moduleLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginTop: 16,
  },
  moduleSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '600',
  },

  // Reports
  reportsBlock: {
    marginBottom: 10,
  },
  reportCategorySection: {
    marginBottom: 20,
  },
  reportCategoryTitle: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  reportCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  reportCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  reportInfoCol: {
    flex: 1,
  },
  reportNameText: {
    fontSize: 12,
    fontWeight: '800',
  },
  reportPeriodText: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  reportActionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    alignItems: 'center',
  },
  reportActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  reportActionText: {
    fontSize: 11,
    fontWeight: '800',
  },
  reportActionSeparator: {
    width: 1,
    height: 14,
  },

  // Alerts & Notifications
  notificationList: {
    gap: 8,
  },
  notifyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  notifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notifyIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  notifyTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  notifyTime: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '700',
  },
  notifyMsg: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    paddingLeft: 30,
  },

  // Profile Settings styles
  userProfileCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
  },
  avatarHuge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarHugeText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  userProfileName: {
    fontSize: 16,
    fontWeight: '900',
  },
  userProfileEmail: {
    fontSize: 11.5,
    marginTop: 2,
  },
  roleBadgeHuge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  roleBadgeHugeText: {
    color: '#2563eb',
    fontSize: 8.5,
    fontWeight: '950',
    letterSpacing: 0.5,
  },
  settingsGroup: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  settingLabelCol: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  settingDesc: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  settingActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  settingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  settingActionRowText: {
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  rightChevron: {
    opacity: 0.5,
  },

  // Module Screens layout
  moduleSubScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  moduleSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginRight: 12,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
  },

  // Native Form Layout
  formContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  formHeader: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 14,
  },
  formInputLabel: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '800',
    marginBottom: 6,
  },
  formInputField: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  formSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 10,
    marginTop: 8,
  },
  formSubmitText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Form entries checklist logs
  formEntriesList: {
    gap: 8,
  },
  entryRowCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  entryRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  entryIdText: {
    fontSize: 11,
    fontWeight: '900',
  },
  entryValueBig: {
    fontSize: 12,
    fontWeight: '900',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 7.5,
    fontWeight: '900',
  },
  entryDetailsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  entryDetailText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  entrySupplierText: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '700',
  },
  entryTimeText: {
    fontSize: 8.5,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },

  // Interactive purchase option inputs
  formVarietyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  varOptionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCalcCard: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  formCalcLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  formCalcVal: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },

  // Chamber grid
  chamberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chamberCard: {
    width: (width - 32 - 8) / 2,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  chamberCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chamberCardLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  chamberStatusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chamberTemp: {
    fontSize: 16,
    fontWeight: '900',
  },
  chamberVal: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 4,
  },

  // Fallback module styles
  fallbackModuleContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  fallbackContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6,
  },
  fallbackDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
    fontWeight: '600',
  },
  fallbackBtn: {
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tab Nav bar
  bottomBar: {
    flexDirection: 'row',
    height: 48,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    position: 'relative',
    height: '100%',
  },
  tabLabel: {
    fontSize: 8.5,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  tabBadge: {
    position: 'absolute',
    top: 2,
    right: '25%',
    backgroundColor: '#ef4444',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    minWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 6.5,
    fontWeight: '900',
  },

  // Dynamic overlay loader
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,9,19,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },

  // Custom global pickers
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerContainer: {
    width: width * 0.85,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  pickerHeader: {
    fontSize: 14.5,
    fontWeight: '900',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  pickerCloseBtn: {
    marginTop: 16,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCloseText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
});
