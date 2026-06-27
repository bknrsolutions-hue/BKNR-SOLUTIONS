// ============================================================
// BKNR ERP — De-Heading Screen
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

export default function DeheadingScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, liveBatches, fetchContractorRate } = useDropdowns();

  const [at, setAt] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [species, setSpecies] = useState('SHRIMP');
  const [batch, setBatch] = useState('');
  const [hosoCount, setHosoCount] = useState('');
  const [hosoQty, setHosoQty] = useState('');
  const [hlsoQty, setHlsoQty] = useState('');
  const [contractor, setContractor] = useState('');
  const [rate, setRate] = useState('');

  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const hosoBatches = [...new Set(liveBatches.filter(b => b.variety === 'HOSO').map(b => b.batch))];

  const openPicker = (title, data, key) => setPicker({ visible: true, title, data, key });

  const handlePickerSelect = async (val) => {
    const key = picker.key;
    setPicker({ ...picker, visible: false });

    if (key === 'at') setAt(val);
    else if (key === 'prodFor') setProdFor(val);
    else if (key === 'batch') {
      setBatch(val);
      const bList = liveBatches.filter(b => b.batch === val && b.variety === 'HOSO');
      if (bList.length > 0) {
        setProdFor(bList[0].production_for);
        setSpecies(bList[0].species);
        const counts = bList.map(b => b.count);
        setTimeout(() => openPicker('Select HOSO Count', counts, 'hosoCount'), 300);
      }
    }
    else if (key === 'hosoCount') {
      setHosoCount(val);
      const match = liveBatches.find(b => b.batch === batch && b.count === val && b.variety === 'HOSO');
      if (match) setHosoQty(match.qty.toString());
    }
    else if (key === 'contractor') {
      setContractor(val);
      const r = await fetchContractorRate(val, 'HOSO');
      setRate(r);
    }
  };

  const yieldPct = hosoQty && hlsoQty
    ? ((parseFloat(hlsoQty) / parseFloat(hosoQty)) * 100).toFixed(2)
    : '';
  const amount = hlsoQty && rate
    ? (parseFloat(hlsoQty) * parseFloat(rate)).toFixed(2)
    : '';

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Please select a Batch.');
    if (!hosoQty || !hlsoQty) return Alert.alert('Validation', 'HOSO & HLSO quantities are required.');
    setConfirmData({
      production_for: prodFor,
      deheading_at: at,
      species,
      batch_number: batch,
      hoso_count: hosoCount,
      hoso_qty: hosoQty,
      hlso_qty: hlsoQty,
      yield_percent: yieldPct,
      contractor,
      rate_per_kg: rate,
      amount,
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/de_heading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'De-Heading entry saved!');
        setAt(''); setProdFor(''); setBatch('');
        setHosoCount(''); setHosoQty(''); setHlsoQty('');
        setContractor(''); setRate('');
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
      <SectionHeader title="De-Heading" onBack={() => navigation.goBack()} isDark={isDark} />

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
          <DropdownField label="Deheading Plant" value={at} placeholder="Select Plant Unit" onPress={() => openPicker('Deheading Plant', dropdowns.locations, 'at')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Target Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <InputField label="Species" value={species} onChangeText={setSpecies} placeholder="e.g. SHRIMP" isDark={isDark} />
          <DropdownField label="HOSO Batch" value={batch} placeholder="Select HOSO Batch" onPress={() => openPicker('HOSO Batch', hosoBatches, 'batch')} isDark={isDark} />
          <DropdownField label="HOSO Count" value={hosoCount} placeholder="Select Count" onPress={() => {
            const counts = liveBatches.filter(b => b.batch === batch && b.variety === 'HOSO').map(b => b.count);
            openPicker('HOSO Count', counts, 'hosoCount');
          }} isDark={isDark} />

          {!!hosoQty && <CalcRow label="Available HOSO Balance:" value={`${hosoQty} kg`} isDark={isDark} />}

          <InputField label="HOSO Qty Used (kg)" value={hosoQty} onChangeText={setHosoQty} placeholder="Enter weight used" keyboardType="numeric" isDark={isDark} />
          <InputField label="HLSO Qty Generated (kg)" value={hlsoQty} onChangeText={setHlsoQty} placeholder="Enter HLSO generated" keyboardType="numeric" isDark={isDark} />

          {!!yieldPct && <CalcRow label="Yield Percent:" value={`${yieldPct}%`} color="#10b981" isDark={isDark} />}

          <DropdownField label="Contractor" value={contractor} placeholder="Select Contractor" onPress={() => openPicker('Contractor', dropdowns.contractors, 'contractor')} isDark={isDark} />
          <InputField label="Rate per kg (₹)" value={rate} onChangeText={setRate} placeholder="Enter Rate" keyboardType="numeric" isDark={isDark} />

          {!!amount && <CalcRow label="Total Amount:" value={`₹ ${parseFloat(amount).toLocaleString('en-IN')}`} isDark={isDark} />}

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save De-Heading Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
