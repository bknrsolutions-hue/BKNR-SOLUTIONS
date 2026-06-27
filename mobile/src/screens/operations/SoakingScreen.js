// ============================================================
// BKNR ERP — Soaking Screen
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

const CHEMICAL_OPTIONS = ['M12', 'S15', 'NONE', 'TRIPOLYPHOSPHATE', 'EDTA'];
const STATUS_OPTIONS = ['Soaking', 'Completed', 'On Hold'];

export default function SoakingScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, liveBatches } = useDropdowns();

  const [at, setAt] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [batch, setBatch] = useState('');
  const [varietyType, setVarietyType] = useState('');
  const [inQty, setInQty] = useState('');
  const [inCount, setInCount] = useState('');
  const [sintex, setSintex] = useState('');
  const [chemical, setChemical] = useState('');
  const [chemPct, setChemPct] = useState('');
  const [saltPct, setSaltPct] = useState('');
  const [rejection, setRejection] = useState('');
  const [status, setStatus] = useState('Soaking');

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
        setInQty(match.qty.toString());
        setInCount(match.count.toString());
      }
    }
    else if (key === 'chemical') setChemical(val);
    else if (key === 'status') setStatus(val);
  };

  const chemQty = inQty && chemPct ? (parseFloat(inQty) * parseFloat(chemPct) / 100).toFixed(2) : '';
  const saltQty = inQty && saltPct ? (parseFloat(inQty) * parseFloat(saltPct) / 100).toFixed(2) : '';

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Please select a Batch.');
    if (!inQty) return Alert.alert('Validation', 'Soaking quantity is required.');
    setConfirmData({
      production_at: at,
      production_for: prodFor,
      batch_number: batch,
      variety_name: varietyType,
      in_qty: inQty,
      in_count: inCount,
      sintex_number: sintex,
      chemical_name: chemical,
      chemical_percent: chemPct || '0',
      chemical_qty: chemQty || '0',
      salt_percent: saltPct || '0',
      salt_qty: saltQty || '0',
      rejection_qty: rejection || '0',
      status,
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/soaking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'Soaking entry saved!');
        setAt(''); setProdFor(''); setBatch('');
        setVarietyType(''); setInQty(''); setInCount('');
        setSintex(''); setChemical(''); setChemPct('');
        setSaltPct(''); setRejection('');
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
      <SectionHeader title="Soaking" onBack={() => navigation.goBack()} isDark={isDark} />

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
          <DropdownField label="Soaking Plant" value={at} placeholder="Select Plant Unit" onPress={() => openPicker('Soaking Plant', dropdowns.locations, 'at')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <DropdownField label="Peeled Batch" value={batch} placeholder="Select Batch" onPress={() => openPicker('Select Batch', uniqueBatches, 'batch')} isDark={isDark} />
          <DropdownField label="Variety Type" value={varietyType} placeholder="Select Variety" onPress={() => {
            const vars = [...new Set(liveBatches.filter(b => b.batch === batch).map(b => b.variety))];
            openPicker('Variety', vars, 'variety');
          }} isDark={isDark} />

          {!!inQty && <CalcRow label="Available Balance:" value={`${inQty} kg`} isDark={isDark} />}

          <InputField label="Soaking Weight (kg)" value={inQty} onChangeText={setInQty} placeholder="Enter Weight" keyboardType="numeric" isDark={isDark} />
          <InputField label="Count" value={inCount} onChangeText={setInCount} placeholder="Enter Count" keyboardType="numeric" isDark={isDark} />
          <InputField label="Sintex Box Number" value={sintex} onChangeText={setSintex} placeholder="Enter Sintex No" isDark={isDark} />
          <DropdownField label="Chemical Name" value={chemical} placeholder="Select Chemical" onPress={() => openPicker('Chemical', CHEMICAL_OPTIONS, 'chemical')} isDark={isDark} />
          <InputField label="Chemical Percent (%)" value={chemPct} onChangeText={setChemPct} placeholder="Enter %" keyboardType="numeric" isDark={isDark} />
          {!!chemQty && <CalcRow label="Chemical Qty (kg):" value={`${chemQty} kg`} isDark={isDark} />}

          <InputField label="Salt Percent (%)" value={saltPct} onChangeText={setSaltPct} placeholder="Enter %" keyboardType="numeric" isDark={isDark} />
          {!!saltQty && <CalcRow label="Salt Qty (kg):" value={`${saltQty} kg`} isDark={isDark} />}

          <InputField label="Rejection Weight (kg)" value={rejection} onChangeText={setRejection} placeholder="Enter Rejection" keyboardType="numeric" isDark={isDark} />
          <DropdownField label="Soaking Status" value={status} placeholder="Select Status" onPress={() => openPicker('Status', STATUS_OPTIONS, 'status')} isDark={isDark} />

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save Soaking Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
