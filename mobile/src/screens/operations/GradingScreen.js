// ============================================================
// BKNR ERP — Grading Screen
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

export default function GradingScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, liveBatches } = useDropdowns();

  const [at, setAt] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [species, setSpecies] = useState('SHRIMP');
  const [batch, setBatch] = useState('');
  const [varietyType, setVarietyType] = useState('');
  const [sourceCount, setSourceCount] = useState('');
  const [qty, setQty] = useState('');
  const [gradedCount, setGradedCount] = useState('');
  const [gradedQty, setGradedQty] = useState('');

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
        setSpecies(bList[0].species);
        const vars = [...new Set(bList.map(b => b.variety))];
        setTimeout(() => openPicker('Select Variety', vars, 'variety'), 300);
      }
    }
    else if (key === 'variety') {
      setVarietyType(val);
      const counts = liveBatches.filter(b => b.batch === batch && b.variety === val).map(b => b.count);
      setTimeout(() => openPicker('Select Source Count', counts, 'sourceCount'), 300);
    }
    else if (key === 'sourceCount') {
      setSourceCount(val);
      const match = liveBatches.find(b => b.batch === batch && b.variety === varietyType && b.count === val);
      if (match) setQty(match.qty.toString());
    }
    else if (key === 'gradedCount') setGradedCount(val);
  };

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Please select a Batch.');
    setConfirmData({
      grading_at: at,
      production_for: prodFor,
      species,
      batch_number: batch,
      variety_name: varietyType,
      hoso_count: sourceCount,
      quantity: qty,
      graded_count: gradedCount,
      graded_qty: gradedQty,
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/grading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'Grading entry saved!');
        setAt(''); setProdFor(''); setBatch('');
        setVarietyType(''); setSourceCount(''); setQty('');
        setGradedCount(''); setGradedQty('');
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
      <SectionHeader title="Grading" onBack={() => navigation.goBack()} isDark={isDark} />

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
          <DropdownField label="Grading Plant" value={at} placeholder="Select Plant Unit" onPress={() => openPicker('Grading Plant', dropdowns.locations, 'at')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <InputField label="Species" value={species} onChangeText={setSpecies} placeholder="e.g. SHRIMP" isDark={isDark} />
          <DropdownField label="Batch Number" value={batch} placeholder="Select Batch" onPress={() => openPicker('Batch Number', uniqueBatches, 'batch')} isDark={isDark} />
          <DropdownField label="Variety Type" value={varietyType} placeholder="Select Variety" onPress={() => {
            const vars = [...new Set(liveBatches.filter(b => b.batch === batch).map(b => b.variety))];
            openPicker('Variety', vars, 'variety');
          }} isDark={isDark} />
          <DropdownField label="Source Count / Grade" value={sourceCount} placeholder="Select Source Count" onPress={() => {
            const counts = liveBatches.filter(b => b.batch === batch && b.variety === varietyType).map(b => b.count);
            openPicker('Source Count', counts, 'sourceCount');
          }} isDark={isDark} />

          {!!qty && <CalcRow label="Available Balance:" value={`${qty} kg`} isDark={isDark} />}

          <InputField label="Quantity Graded (kg)" value={qty} onChangeText={setQty} placeholder="Enter Qty" keyboardType="numeric" isDark={isDark} />
          <DropdownField label="Target Graded Count" value={gradedCount} placeholder="Select Output Grade" onPress={() => openPicker('Target Grade', dropdowns.grades, 'gradedCount')} isDark={isDark} />
          <InputField label="Graded Quantity (kg)" value={gradedQty} onChangeText={setGradedQty} placeholder="Enter Output Qty" keyboardType="numeric" isDark={isDark} />

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save Grading Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
