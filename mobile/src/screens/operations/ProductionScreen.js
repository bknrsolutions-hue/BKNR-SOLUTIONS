// ============================================================
// BKNR ERP — Production Screen
// ============================================================
import React, { useState } from 'react';
import { View, ScrollView, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useDropdowns } from '../../hooks/useDropdowns';
import { BASE_URL } from '../../config';
import {
  SearchablePicker, ConfirmationModal,
  DropdownField, InputField, CalcRow, SubmitButton, SectionHeader
} from '../../components/FormComponents';

const PRODUCTION_TYPES = ['IQF', 'Block Frozen', 'Semi IQF'];

export default function ProductionScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, liveBatches } = useDropdowns();

  const [at, setAt] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [batch, setBatch] = useState('');
  const [varietyType, setVarietyType] = useState('');
  const [grade, setGrade] = useState('');
  const [species, setSpecies] = useState('SHRIMP');
  const [brand, setBrand] = useState('');
  const [glaze, setGlaze] = useState('');
  const [freezer, setFreezer] = useState('');
  const [mc, setMc] = useState('');
  const [loose, setLoose] = useState('');
  const [prodType, setProdType] = useState('IQF');

  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const uniqueBatches = [...new Set(liveBatches.map(b => b.batch))];

  const openPicker = (title, data, key) => setPicker({ visible: true, title, data, key });

  const handlePickerSelect = (val) => {
    const key = picker.key;
    setPicker({ ...picker, visible: false });

    if (key === 'at') setAt(val);
    else if (key === 'prodFor') setProdFor(val);
    else if (key === 'batch') {
      setBatch(val);
      const bList = liveBatches.filter(b => b.batch === val);
      if (bList.length > 0) {
        setProdFor(bList[0].production_for);
        const vars = [...new Set(bList.map(b => b.variety))];
        setTimeout(() => openPicker('Select Variety', vars, 'variety'), 300);
      }
    }
    else if (key === 'variety') {
      setVarietyType(val);
      const match = liveBatches.find(b => b.batch === batch && b.variety === val);
      if (match) {
        setGrade(match.count);
        setSpecies(match.species);
      }
    }
    else if (key === 'grade') setGrade(val);
    else if (key === 'freezer') setFreezer(val);
    else if (key === 'prodType') setProdType(val);
  };

  // Total production qty: MC * 10kg (default) + loose
  const totalQty = mc || loose
    ? ((parseFloat(mc || 0) * 10) + parseFloat(loose || 0)).toFixed(2)
    : '';

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Please select a Batch.');
    if (!mc && !loose) return Alert.alert('Validation', 'Enter MC or Loose quantity.');
    setConfirmData({
      production_at: at,
      production_for: prodFor,
      batch_number: batch,
      variety_name: varietyType,
      grade,
      species,
      brand,
      glaze: glaze || '0',
      freezer,
      no_of_mc: mc || '0',
      loose: loose || '0',
      production_qty: totalQty,
      production_type: prodType,
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'Production entry saved!');
        setAt(''); setProdFor(''); setBatch('');
        setVarietyType(''); setGrade(''); setBrand('');
        setGlaze(''); setFreezer(''); setMc(''); setLoose('');
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
      <SectionHeader title="Production" onBack={() => navigation.goBack()} isDark={isDark} />

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
        <View style={[styles.card, { backgroundColor: card }]}>
          <DropdownField label="Production Plant" value={at} placeholder="Select Plant Unit" onPress={() => openPicker('Production Plant', dropdowns.locations, 'at')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <DropdownField label="Batch Number" value={batch} placeholder="Select Batch" onPress={() => openPicker('Batch', uniqueBatches, 'batch')} isDark={isDark} />
          <DropdownField label="Variety Type" value={varietyType} placeholder="Select Variety" onPress={() => {
            const vars = [...new Set(liveBatches.filter(b => b.batch === batch).map(b => b.variety))];
            openPicker('Variety', vars, 'variety');
          }} isDark={isDark} />
          <DropdownField label="Grade / Count" value={grade} placeholder="Select Grade" onPress={() => openPicker('Grade', dropdowns.grades, 'grade')} isDark={isDark} />
          <InputField label="Species" value={species} onChangeText={setSpecies} placeholder="e.g. SHRIMP" isDark={isDark} />
          <InputField label="Brand Name" value={brand} onChangeText={setBrand} placeholder="Enter Brand" isDark={isDark} />
          <InputField label="Glaze %" value={glaze} onChangeText={setGlaze} placeholder="Enter Glaze %" keyboardType="numeric" isDark={isDark} />
          <DropdownField label="Freezer Unit" value={freezer} placeholder="Select Freezer" onPress={() => openPicker('Freezer', dropdowns.freezers, 'freezer')} isDark={isDark} />
          <InputField label="No. of Master Cartons (MC)" value={mc} onChangeText={setMc} placeholder="Enter MC Count" keyboardType="numeric" isDark={isDark} />
          <InputField label="Loose Weight (kg)" value={loose} onChangeText={setLoose} placeholder="Enter Loose kg" keyboardType="numeric" isDark={isDark} />

          {!!totalQty && <CalcRow label="Total Production Qty:" value={`${totalQty} kg`} color="#10b981" isDark={isDark} />}

          <DropdownField label="Production Type" value={prodType} placeholder="Select Type" onPress={() => openPicker('Production Type', PRODUCTION_TYPES, 'prodType')} isDark={isDark} />

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save Production Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
