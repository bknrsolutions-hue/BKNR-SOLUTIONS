// ============================================================
// BKNR ERP — Raw Material Purchasing Screen
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

export default function RMPScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, liveBatches, loading } = useDropdowns();

  const [batch, setBatch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [variety, setVariety] = useState('');
  const [species, setSpecies] = useState('SHRIMP');
  const [count, setCount] = useState('');
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState('');
  const [peelingAt, setPeelingAt] = useState('');
  const [prodFor, setProdFor] = useState('');

  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const uniqueBatches = [...new Set(liveBatches.map(b => b.batch))];

  const openPicker = (title, data, key) => setPicker({ visible: true, title, data, key });

  const handlePickerSelect = (val) => {
    if (picker.key === 'batch') {
      setBatch(val);
      const match = liveBatches.find(b => b.batch === val);
      if (match) { setProdFor(match.production_for); }
    }
    else if (picker.key === 'supplier') setSupplier(val);
    else if (picker.key === 'variety') setVariety(val);
    else if (picker.key === 'count') setCount(val);
    else if (picker.key === 'peelingAt') setPeelingAt(val);
    else if (picker.key === 'prodFor') setProdFor(val);
    setPicker({ ...picker, visible: false });
  };

  const amount = weight && rate ? (parseFloat(weight) * parseFloat(rate)).toFixed(2) : '';

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Please select a Batch Number.');
    if (!weight || !rate) return Alert.alert('Validation', 'Weight and Rate are required.');
    setConfirmData({
      batch_number: batch,
      supplier_name: supplier,
      variety_name: variety,
      species,
      count,
      received_qty: weight,
      rate_per_kg: rate,
      amount: (parseFloat(weight) * parseFloat(rate)).toString(),
      peeling_at: peelingAt || dropdowns.locations[0] || 'PLANT',
      production_for: prodFor || dropdowns.companies[0] || 'GENERAL',
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/raw_material_purchasing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'RMP Entry saved successfully!');
        setBatch(''); setSupplier(''); setVariety(''); setCount('');
        setWeight(''); setRate(''); setPeelingAt(''); setProdFor('');
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
      <SectionHeader title="Raw Material Purchasing" onBack={() => navigation.goBack()} isDark={isDark} />

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
          <DropdownField label="Gate Entry Batch" value={batch} placeholder="Select Active Batch" onPress={() => openPicker('Select Batch', uniqueBatches, 'batch')} isDark={isDark} />
          <DropdownField label="Supplier Name" value={supplier} placeholder="Select Supplier" onPress={() => openPicker('Supplier Name', dropdowns.suppliers, 'supplier')} isDark={isDark} />
          <DropdownField label="Variety Name" value={variety} placeholder="Select Variety" onPress={() => openPicker('Variety', dropdowns.varieties, 'variety')} isDark={isDark} />
          <InputField label="Species" value={species} onChangeText={setSpecies} placeholder="e.g. SHRIMP" isDark={isDark} />
          <DropdownField label="Grade / Count" value={count} placeholder="Select Grade" onPress={() => openPicker('Grade / Count', dropdowns.grades, 'count')} isDark={isDark} />
          <InputField label="Received Weight (kg)" value={weight} onChangeText={setWeight} placeholder="Enter Weight" keyboardType="numeric" isDark={isDark} />
          <InputField label="Rate per kg (₹)" value={rate} onChangeText={setRate} placeholder="Enter Rate" keyboardType="numeric" isDark={isDark} />

          {!!amount && (
            <CalcRow label="Total Amount:" value={`₹ ${parseFloat(amount).toLocaleString('en-IN')}`} isDark={isDark} />
          )}

          <DropdownField label="Peeling At Plant" value={peelingAt} placeholder="Select Target Plant" onPress={() => openPicker('Peeling At', dropdowns.locations, 'peelingAt')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Target Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save Purchase Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
