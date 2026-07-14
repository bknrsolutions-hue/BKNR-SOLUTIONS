import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Alert, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { BASE_URL } from '../config';
import { SectionHeader, SearchablePicker } from '../components/FormComponents';

export default function StockReportScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';

  const bg = isDark ? '#060913' : '#f8fafc';
  const cardBg = isDark ? '#0d1424' : '#ffffff';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#475569';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const inputBg = isDark ? '#111827' : '#ffffff';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ rows: [], species_list: [], varieties_list: [], grades_list: [], financial_years: [] });
  const [filteredRows, setFilteredRows] = useState([]);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selSpecies, setSelSpecies] = useState('ALL');
  const [selVariety, setSelVariety] = useState('ALL');
  const [selGrade, setSelGrade] = useState('ALL');

  // Picker States
  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });

  const fetchData = async (fyVal = '', fDate = '', tDate = '') => {
    setLoading(true);
    try {
      let url = `${BASE_URL}/inventory/stock_report?format=json`;
      if (fyVal) url += `&fy=${fyVal}`;
      if (fDate) url += `&from_date=${fDate}`;
      if (tDate) url += `&to_date=${tDate}`;

      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (!selectedFy && json.selected_fy) {
          setSelectedFy(json.selected_fy);
        }
        applyFilters(json.rows, searchQuery, selSpecies, selVariety, selGrade);
      } else {
        Alert.alert('Error', 'Failed to fetch stock report data.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Network Error', 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const applyFilters = (rowsList, search, species, variety, grade) => {
    let filtered = [...rowsList];

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r => 
        r.batch_number?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q) ||
        r.brand?.toLowerCase().includes(q)
      );
    }

    if (species !== 'ALL') {
      filtered = filtered.filter(r => r.species === species);
    }

    if (variety !== 'ALL') {
      filtered = filtered.filter(r => r.variety === variety);
    }

    if (grade !== 'ALL') {
      filtered = filtered.filter(r => r.grade === grade);
    }

    setFilteredRows(filtered);
  };

  const handleFilterChange = (key, val) => {
    let newSpecies = selSpecies;
    let newVariety = selVariety;
    let newGrade = selGrade;
    let newSearch = searchQuery;

    if (key === 'species') { setSelSpecies(val); newSpecies = val; }
    else if (key === 'variety') { setSelVariety(val); newVariety = val; }
    else if (key === 'grade') { setSelGrade(val); newGrade = val; }
    else if (key === 'search') { setSearchQuery(val); newSearch = val; }

    applyFilters(data.rows, newSearch, newSpecies, newVariety, newGrade);
  };

  const handleFySelect = (fyVal) => {
    setSelectedFy(fyVal);
    fetchData(fyVal, fromDate, toDate);
  };

  const handleDateSearch = () => {
    fetchData(selectedFy, fromDate, toDate);
  };

  const openPicker = (title, options, key) => {
    setPicker({
      visible: true,
      title,
      data: ['ALL', ...options],
      key
    });
  };

  const openFyPicker = () => {
    setPicker({
      visible: true,
      title: 'Financial Year',
      data: data.financial_years || [],
      key: 'fy'
    });
  };

  const handlePickerSelect = (val) => {
    if (picker.key === 'fy') {
      handleFySelect(val);
    } else {
      handleFilterChange(picker.key, val);
    }
  };

  const renderRowItem = ({ item }) => {
    const isOut = item.cargo_movement_type === 'OUT';
    const isCancelled = item.is_cancelled;
    const signColor = isCancelled ? '#ef4444' : (isOut ? '#ea580c' : '#10b981');
    const moveText = isCancelled ? 'CANCELLED' : (isOut ? 'STOCK OUT' : 'STOCK IN');

    return (
      <View style={[styles.itemCard, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.batchText, { color: textPrimary }]}>Batch: {item.batch_number || 'N/A'}</Text>
            <Text style={[styles.dateText, { color: textSecondary }]}>{item.date} · {item.time || ''}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: signColor + '15', borderColor: signColor + '30' }]}>
            <Text style={[styles.badgeText, { color: signColor }]}>{moveText}</Text>
          </View>
        </View>

        <View style={[styles.cardDivider, { backgroundColor: border }]} />

        <View style={styles.detailsGrid}>
          <View style={styles.gridCol}>
            <Text style={[styles.detailLabel, { color: textSecondary }]}>SPECIES / VARIETY</Text>
            <Text style={[styles.detailVal, { color: textPrimary }]} numberOfLines={1}>
              {item.species || '—'} / {item.variety || '—'}
            </Text>
          </View>
          <View style={styles.gridCol}>
            <Text style={[styles.detailLabel, { color: textSecondary }]}>GRADE / GLAZE</Text>
            <Text style={[styles.detailVal, { color: textPrimary }]}>
              {item.grade || '—'} · {item.glaze ? `${item.glaze}%` : 'NW'}
            </Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.gridCol}>
            <Text style={[styles.detailLabel, { color: textSecondary }]}>LOCATION / CHAMBER</Text>
            <Text style={[styles.detailVal, { color: textPrimary }]}>
              {item.location || '—'}
            </Text>
          </View>
          <View style={styles.gridCol}>
            <Text style={[styles.detailLabel, { color: textSecondary }]}>QUANTITY</Text>
            <Text style={[styles.qtyVal, { color: signColor }]}>
              {isOut ? '-' : ''}{item.quantity} kg
            </Text>
            <Text style={[styles.detailSubVal, { color: textSecondary }]}>
              {item.no_of_mc} MC · {item.loose} Lse
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />
      <SectionHeader title="Stock Ledger" onBack={() => navigation.goBack()} isDark={isDark} />

      <SearchablePicker
        visible={picker.visible}
        title={picker.title}
        data={picker.data}
        onSelect={handlePickerSelect}
        onClose={() => setPicker({ ...picker, visible: false })}
        isDark={isDark}
      />

      {/* ─── FILTERS PANEL ─── */}
      <View style={[styles.filterPanel, { borderBottomColor: border }]}>
        {/* Row 1: Search & FY */}
        <View style={styles.filterRow}>
          <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor: border }]}>
            <Feather name="search" size={15} color={textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              style={[styles.searchInput, { color: textPrimary }]}
              placeholder="Search Batch / Location / Brand..."
              placeholderTextColor={textSecondary}
              value={searchQuery}
              onChangeText={(text) => handleFilterChange('search', text)}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => handleFilterChange('search', '')}>
                <Feather name="x" size={14} color={textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.fyBtn, { backgroundColor: inputBg, borderColor: border }]}
            onPress={openFyPicker}
          >
            <Text style={[styles.fyBtnText, { color: textPrimary }]}>
              FY: {selectedFy || 'ALL'}
            </Text>
            <Feather name="chevron-down" size={14} color={textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Row 2: Species, Variety, Grade Dropdowns */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <TouchableOpacity
            style={[styles.filterChip, { backgroundColor: inputBg, borderColor: border }]}
            onPress={() => openPicker('Select Species', data.species_list || [], 'species')}
          >
            <Text style={[styles.chipText, { color: textPrimary }]}>Species: {selSpecies}</Text>
            <Feather name="chevron-down" size={12} color={textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, { backgroundColor: inputBg, borderColor: border }]}
            onPress={() => openPicker('Select Variety', data.varieties_list || [], 'variety')}
          >
            <Text style={[styles.chipText, { color: textPrimary }]}>Variety: {selVariety}</Text>
            <Feather name="chevron-down" size={12} color={textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, { backgroundColor: inputBg, borderColor: border }]}
            onPress={() => openPicker('Select Grade', data.grades_list || [], 'grade')}
          >
            <Text style={[styles.chipText, { color: textPrimary }]}>Grade: {selGrade}</Text>
            <Feather name="chevron-down" size={12} color={textSecondary} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ─── LEDGER LIST ─── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ color: textSecondary, marginTop: 10 }}>Loading ledger records...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          renderItem={renderRowItem}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={48} color={textSecondary} style={{ marginBottom: 10 }} />
              <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '700' }}>No Records Found</Text>
              <Text style={{ color: textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                No stock movements match the active filters.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterPanel: { padding: 12, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  fyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  fyBtnText: { fontSize: 13, fontWeight: '700' },
  chipScroll: { marginTop: 8, flexDirection: 'row', gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  listContainer: { padding: 12, gap: 10 },
  itemCard: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  batchText: { fontSize: 15, fontWeight: '800' },
  dateText: { fontSize: 11, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardDivider: { height: 1, marginVertical: 10 },
  detailsGrid: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  gridCol: { flex: 1 },
  detailLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  detailVal: { fontSize: 13, fontWeight: '700' },
  qtyVal: { fontSize: 14, fontWeight: '800' },
  detailSubVal: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 },
});
