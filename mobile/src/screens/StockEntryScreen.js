// ============================================================
// BKNR ERP — Stock Entry Screen
// ============================================================
import React, { useState } from 'react';
import { View, ScrollView, Alert, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDropdowns } from '../hooks/useDropdowns';
import { BASE_URL } from '../config';
import {
  SearchablePicker, ConfirmationModal,
  DropdownField, InputField, SubmitButton, SectionHeader
} from '../components/FormComponents';

const MOVEMENT_TYPES = ['IN', 'OUT'];

export default function StockEntryScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns } = useDropdowns();

  const [movementType, setMovementType] = useState('IN');
  const [at, setAt] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [batch, setBatch] = useState('');
  const [variety, setVariety] = useState('');
  const [grade, setGrade] = useState('');
  const [glaze, setGlaze] = useState('');
  const [freezer, setFreezer] = useState('');
  const [mc, setMc] = useState('');
  const [loose, setLoose] = useState('');
  const [weight, setWeight] = useState('');
  const [packStyle, setPackStyle] = useState('');
  const [location, setLocation] = useState('');

  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const openPicker = (title, data, key) => setPicker({ visible: true, title, data, key });

  const handlePickerSelect = (val) => {
    const key = picker.key;
    setPicker({ ...picker, visible: false });
    if (key === 'at') setAt(val);
    else if (key === 'prodFor') setProdFor(val);
    else if (key === 'variety') setVariety(val);
    else if (key === 'grade') setGrade(val);
    else if (key === 'freezer') setFreezer(val);
    else if (key === 'packStyle') setPackStyle(val);
  };

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Batch Number is required.');
    if (!weight) return Alert.alert('Validation', 'Weight/Quantity is required.');
    setConfirmData({
      cargo_movement_type: movementType,
      production_at: at,
      production_for: prodFor,
      batch_number: batch,
      variety,
      grade,
      glaze: glaze || '0',
      freezer,
      no_of_mc: mc || '0',
      loose: loose || '0',
      quantity: weight,
      packing_style: packStyle,
      location,
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/inventory/cargo_entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', `Stock ${movementType} entry saved!`);
        setAt(''); setProdFor(''); setBatch(''); setVariety('');
        setGrade(''); setGlaze(''); setFreezer(''); setMc('');
        setLoose(''); setWeight(''); setPackStyle(''); setLocation('');
      } else {
        Alert.alert('Error', await res.text());
      }
    } catch {
      Alert.alert('Network Error', 'Cannot reach server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <SectionHeader title="Stock Entry" onBack={() => navigation.goBack()} isDark={isDark} />

      <SearchablePicker
        visible={picker.visible} title={picker.title} data={picker.data}
        onSelect={handlePickerSelect} onClose={() => setPicker({ ...picker, visible: false })}
        isDark={isDark}
      />
      <ConfirmationModal
        visible={!!confirmData} data={confirmData || {}}
        onConfirm={executeSubmit} onCancel={() => setConfirmData(null)}
        isDark={isDark}
      />

      <ScrollView style={{ padding: 16 }}>
        {/* Movement Type Toggle */}
        <View style={styles.toggleRow}>
          {MOVEMENT_TYPES.map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.toggleBtn, {
                backgroundColor: movementType === type
                  ? (type === 'IN' ? '#10b981' : '#ef4444')
                  : (isDark ? '#1f2937' : '#f1f5f9'),
              }]}
              onPress={() => setMovementType(type)}
            >
              <Text style={{
                color: movementType === type ? '#ffffff' : (isDark ? '#94a3b8' : '#475569'),
                fontWeight: '800', fontSize: 15,
              }}>
                {type === 'IN' ? '⬇ STOCK IN' : '⬆ STOCK OUT'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: card }]}>
          <DropdownField label="Plant / Location" value={at} placeholder="Select Plant" onPress={() => openPicker('Plant', dropdowns.locations, 'at')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <InputField label="Batch Number" value={batch} onChangeText={setBatch} placeholder="Enter Batch No" isDark={isDark} />
          <DropdownField label="Variety" value={variety} placeholder="Select Variety" onPress={() => openPicker('Variety', dropdowns.varieties, 'variety')} isDark={isDark} />
          <DropdownField label="Grade / Count" value={grade} placeholder="Select Grade" onPress={() => openPicker('Grade', dropdowns.grades, 'grade')} isDark={isDark} />
          <InputField label="Glaze %" value={glaze} onChangeText={setGlaze} placeholder="Enter Glaze %" keyboardType="numeric" isDark={isDark} />
          <DropdownField label="Freezer Unit" value={freezer} placeholder="Select Freezer" onPress={() => openPicker('Freezer', dropdowns.freezers, 'freezer')} isDark={isDark} />
          <InputField label="No. of MC (Master Cartons)" value={mc} onChangeText={setMc} placeholder="Enter MC Count" keyboardType="numeric" isDark={isDark} />
          <InputField label="Loose Weight (kg)" value={loose} onChangeText={setLoose} placeholder="Enter Loose kg" keyboardType="numeric" isDark={isDark} />
          <InputField label="Total Weight / Quantity (kg)" value={weight} onChangeText={setWeight} placeholder="Enter Total Qty" keyboardType="numeric" isDark={isDark} />
          <DropdownField label="Packing Style" value={packStyle} placeholder="Select Packing Style" onPress={() => openPicker('Packing Style', dropdowns.packing_styles, 'packStyle')} isDark={isDark} />
          <InputField label="Cold Storage Room / Chamber" value={location} onChangeText={setLocation} placeholder="Enter Room / Location" isDark={isDark} />

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton
                label={`Register Stock ${movementType}`}
                color={movementType === 'IN' ? '#10b981' : '#ef4444'}
                onPress={handleSubmit}
              />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
