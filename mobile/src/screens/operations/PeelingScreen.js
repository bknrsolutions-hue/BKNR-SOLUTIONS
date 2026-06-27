// ============================================================
// BKNR ERP — Peeling Screen
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

export default function PeelingScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, liveBatches, fetchContractorRate } = useDropdowns();

  const [at, setAt] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [species, setSpecies] = useState('SHRIMP');
  const [variety, setVariety] = useState('');
  const [batch, setBatch] = useState('');
  const [hlsoCount, setHlsoCount] = useState('');
  const [hlsoQty, setHlsoQty] = useState('');
  const [peeledQty, setPeeledQty] = useState('');
  const [contractor, setContractor] = useState('');
  const [rate, setRate] = useState('');

  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const hlsoBatches = [...new Set(liveBatches.filter(b => b.variety === 'HLSO').map(b => b.batch))];

  const openPicker = (title, data, key) => setPicker({ visible: true, title, data, key });

  const handlePickerSelect = async (val) => {
    const key = picker.key;
    setPicker({ ...picker, visible: false });

    if (key === 'at') setAt(val);
    else if (key === 'prodFor') setProdFor(val);
    else if (key === 'variety') setVariety(val);
    else if (key === 'batch') {
      setBatch(val);
      const bList = liveBatches.filter(b => b.batch === val && b.variety === 'HLSO');
      if (bList.length > 0) {
        setProdFor(bList[0].production_for);
        setSpecies(bList[0].species);
        const counts = bList.map(b => b.count);
        setTimeout(() => openPicker('HLSO Count', counts, 'hlsoCount'), 300);
      }
    }
    else if (key === 'hlsoCount') {
      setHlsoCount(val);
      const match = liveBatches.find(b => b.batch === batch && b.count === val && b.variety === 'HLSO');
      if (match) setHlsoQty(match.qty.toString());
    }
    else if (key === 'contractor') {
      setContractor(val);
      const r = await fetchContractorRate(val, variety || 'HLSO');
      setRate(r);
    }
  };

  const yieldPct = hlsoQty && peeledQty
    ? ((parseFloat(peeledQty) / parseFloat(hlsoQty)) * 100).toFixed(2)
    : '';
  const amount = peeledQty && rate
    ? (parseFloat(peeledQty) * parseFloat(rate)).toFixed(2)
    : '';

  const handleSubmit = () => {
    if (!batch) return Alert.alert('Validation', 'Please select a Batch.');
    if (!hlsoQty || !peeledQty) return Alert.alert('Validation', 'HLSO & Peeled quantities are required.');
    setConfirmData({
      peeling_at: at,
      production_for: prodFor,
      species,
      batch_number: batch,
      hlso_count: hlsoCount,
      hlso_qty: hlsoQty,
      peeled_qty: peeledQty,
      yield_percent: yieldPct,
      contractor_name: contractor,
      rate,
      amount,
      variety_name: variety,
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/peeling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'Peeling entry saved!');
        setAt(''); setProdFor(''); setBatch('');
        setHlsoCount(''); setHlsoQty(''); setPeeledQty('');
        setContractor(''); setRate(''); setVariety('');
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
      <SectionHeader title="Peeling" onBack={() => navigation.goBack()} isDark={isDark} />

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
          <DropdownField label="Peeling Plant" value={at} placeholder="Select Plant Unit" onPress={() => openPicker('Peeling Plant', dropdowns.locations, 'at')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <DropdownField label="Output Variety (PD/PUD etc)" value={variety} placeholder="Select Output Variety" onPress={() => openPicker('Variety', dropdowns.varieties, 'variety')} isDark={isDark} />
          <InputField label="Species" value={species} onChangeText={setSpecies} placeholder="e.g. SHRIMP" isDark={isDark} />
          <DropdownField label="HLSO Batch" value={batch} placeholder="Select HLSO Batch" onPress={() => openPicker('HLSO Batch', hlsoBatches, 'batch')} isDark={isDark} />
          <DropdownField label="HLSO Count" value={hlsoCount} placeholder="Select Count" onPress={() => {
            const counts = liveBatches.filter(b => b.batch === batch && b.variety === 'HLSO').map(b => b.count);
            openPicker('HLSO Count', counts, 'hlsoCount');
          }} isDark={isDark} />

          {!!hlsoQty && <CalcRow label="Available HLSO Balance:" value={`${hlsoQty} kg`} isDark={isDark} />}

          <InputField label="HLSO Qty Used (kg)" value={hlsoQty} onChangeText={setHlsoQty} placeholder="Enter HLSO weight used" keyboardType="numeric" isDark={isDark} />
          <InputField label="Peeled Qty Generated (kg)" value={peeledQty} onChangeText={setPeeledQty} placeholder="Enter peeled weight" keyboardType="numeric" isDark={isDark} />

          {!!yieldPct && <CalcRow label="Yield Percent:" value={`${yieldPct}%`} color="#10b981" isDark={isDark} />}

          <DropdownField label="Contractor" value={contractor} placeholder="Select Contractor" onPress={() => openPicker('Contractor', dropdowns.contractors, 'contractor')} isDark={isDark} />
          <InputField label="Rate per kg (₹)" value={rate} onChangeText={setRate} placeholder="Enter Rate" keyboardType="numeric" isDark={isDark} />

          {!!amount && <CalcRow label="Total Amount:" value={`₹ ${parseFloat(amount).toLocaleString('en-IN')}`} isDark={isDark} />}

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save Peeling Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
