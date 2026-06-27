// ============================================================
// BKNR ERP — Gate Entry Screen
// ============================================================
import React, { useState } from 'react';
import { View, ScrollView, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useDropdowns } from '../../hooks/useDropdowns';
import { BASE_URL } from '../../config';
import {
  SearchablePicker, ConfirmationModal,
  DropdownField, InputField, SubmitButton, SectionHeader
} from '../../components/FormComponents';

export default function GateEntryScreen({ navigation }) {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const bg = isDark ? '#060913' : '#f8fafc';
  const card = isDark ? '#111827' : '#ffffff';

  const { dropdowns, loading } = useDropdowns();

  const [challan, setChallan] = useState('');
  const [gatePass, setGatePass] = useState('');
  const [receivingCenter, setReceivingCenter] = useState('');
  const [supplier, setSupplier] = useState('');
  const [purchasingLoc, setPurchasingLoc] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [matBoxes, setMatBoxes] = useState('');
  const [emptyBoxes, setEmptyBoxes] = useState('');
  const [iceBoxes, setIceBoxes] = useState('');

  const [picker, setPicker] = useState({ visible: false, title: '', data: [], key: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const openPicker = (title, data, key) => setPicker({ visible: true, title, data, key });

  const handlePickerSelect = (val) => {
    if (picker.key === 'receivingCenter') setReceivingCenter(val);
    else if (picker.key === 'supplier') setSupplier(val);
    else if (picker.key === 'purchasingLoc') setPurchasingLoc(val);
    else if (picker.key === 'vehicle') setVehicle(val);
    else if (picker.key === 'prodFor') setProdFor(val);
    setPicker({ ...picker, visible: false });
  };

  const handleSubmit = () => {
    if (!supplier) return Alert.alert('Validation', 'Supplier Name is required.');
    const now = new Date();
    const batch = `GE${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    setConfirmData({
      batch_number: batch,
      challan_number: challan || `CH-${now.getTime()}`,
      gate_pass_number: gatePass || `GP-${now.getTime()}`,
      receiving_center: receivingCenter || dropdowns.locations[0] || 'PLANT',
      supplier_name: supplier,
      purchasing_location: purchasingLoc || dropdowns.locations[0] || 'PLANT',
      vehicle_number: vehicle,
      production_for: prodFor || dropdowns.companies[0] || 'GENERAL',
      no_of_material_boxes: matBoxes || '0',
      no_of_empty_boxes: emptyBoxes || '0',
      no_of_ice_boxes: iceBoxes || '0',
    });
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setConfirmData(null);
    try {
      const body = Object.entries(confirmData || {})
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const res = await fetch(`${BASE_URL}/processing/gate_entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include',
      });
      if (res.ok) {
        Alert.alert('Success ✓', 'Gate Entry saved successfully!');
        setChallan(''); setGatePass(''); setReceivingCenter('');
        setSupplier(''); setPurchasingLoc(''); setVehicle('');
        setProdFor(''); setMatBoxes(''); setEmptyBoxes(''); setIceBoxes('');
      } else {
        const txt = await res.text();
        Alert.alert('Error', txt || 'Failed to save.');
      }
    } catch {
      Alert.alert('Network Error', 'Cannot reach server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <SectionHeader title="Gate Entry" onBack={() => navigation.goBack()} isDark={isDark} />

      <SearchablePicker
        visible={picker.visible}
        title={picker.title}
        data={picker.data}
        onSelect={handlePickerSelect}
        onClose={() => setPicker({ ...picker, visible: false })}
        isDark={isDark}
      />
      <ConfirmationModal
        visible={!!confirmData}
        data={confirmData || {}}
        onConfirm={executeSubmit}
        onCancel={() => setConfirmData(null)}
        isDark={isDark}
      />

      <ScrollView style={{ padding: 16 }}>
        <View style={[styles.card, { backgroundColor: card }]}>
          <InputField label="Challan Number" value={challan} onChangeText={setChallan} placeholder="Enter Challan No" isDark={isDark} />
          <InputField label="Gate Pass Number" value={gatePass} onChangeText={setGatePass} placeholder="Enter Gate Pass No" isDark={isDark} />
          <DropdownField label="Receiving Center" value={receivingCenter} placeholder="Select Plant / Unit" onPress={() => openPicker('Receiving Center', dropdowns.locations, 'receivingCenter')} isDark={isDark} />
          <DropdownField label="Supplier Name" value={supplier} placeholder="Select Supplier" onPress={() => openPicker('Supplier Name', dropdowns.suppliers, 'supplier')} isDark={isDark} />
          <DropdownField label="Purchasing Location" value={purchasingLoc} placeholder="Select Purchase Center" onPress={() => openPicker('Purchasing Location', dropdowns.locations, 'purchasingLoc')} isDark={isDark} />
          <DropdownField label="Vehicle Number" value={vehicle} placeholder="Select Vehicle" onPress={() => openPicker('Vehicle Number', dropdowns.vehicles, 'vehicle')} isDark={isDark} />
          <DropdownField label="Production For" value={prodFor} placeholder="Select Target Company" onPress={() => openPicker('Production For', dropdowns.companies, 'prodFor')} isDark={isDark} />
          <InputField label="Material Boxes" value={matBoxes} onChangeText={setMatBoxes} placeholder="Enter Count" keyboardType="numeric" isDark={isDark} />
          <InputField label="Empty Boxes" value={emptyBoxes} onChangeText={setEmptyBoxes} placeholder="Enter Count" keyboardType="numeric" isDark={isDark} />
          <InputField label="Ice Boxes" value={iceBoxes} onChangeText={setIceBoxes} placeholder="Enter Count" keyboardType="numeric" isDark={isDark} />

          {submitting
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#2563eb" size="large" />
            : <SubmitButton label="Save Gate Entry" onPress={handleSubmit} />
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
});
