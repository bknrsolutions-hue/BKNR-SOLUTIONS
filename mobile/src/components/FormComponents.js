// ============================================================
// BKNR ERP — Shared Form Components
// Used across all operation screens
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  FlatList, ScrollView, StyleSheet
} from 'react-native';
import { Feather } from '@expo/vector-icons';

// ─── Searchable Picker Modal ─────────────────────────────────
export function SearchablePicker({ visible, title, data, onSelect, onClose, isDark }) {
  const [search, setSearch] = useState('');
  const filtered = (data || []).filter(
    item => item && item.toString().toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[pickerStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
        <View style={[pickerStyles.container, { backgroundColor: isDark ? '#111827' : '#ffffff' }]}>
          <View style={pickerStyles.header}>
            <Text style={[pickerStyles.title, { color: isDark ? '#ffffff' : '#0f172a' }]}>{title}</Text>
            <TouchableOpacity onPress={() => { setSearch(''); onClose(); }}>
              <Feather name="x" size={20} color={isDark ? '#94a3b8' : '#475569'} />
            </TouchableOpacity>
          </View>
          <TextInput
            placeholder="Search..."
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            style={[pickerStyles.searchInput, {
              backgroundColor: isDark ? '#1f2937' : '#f1f5f9',
              color: isDark ? '#ffffff' : '#0f172a',
              borderColor: isDark ? '#374151' : '#cbd5e1',
            }]}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[pickerStyles.item, { borderBottomColor: isDark ? '#1f2937' : '#f1f5f9' }]}
                onPress={() => { onSelect(item); setSearch(''); onClose(); }}
              >
                <Text style={{ color: isDark ? '#f1f5f9' : '#1e293b', fontSize: 15 }}>{item}</Text>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 300 }}
            ListEmptyComponent={
              <Text style={{ color: isDark ? '#64748b' : '#94a3b8', textAlign: 'center', padding: 20 }}>
                No options found
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Confirmation Data Card Modal ────────────────────────────
export function ConfirmationModal({ visible, data, onConfirm, onCancel, isDark }) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[pickerStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
        <View style={[pickerStyles.confirmCard, { backgroundColor: isDark ? '#111827' : '#ffffff' }]}>
          <Feather name="help-circle" size={44} color="#3b82f6" style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={[pickerStyles.confirmTitle, { color: isDark ? '#ffffff' : '#0f172a' }]}>
            Confirm Submission
          </Text>
          <Text style={{ color: isDark ? '#94a3b8' : '#475569', textAlign: 'center', marginBottom: 14, fontSize: 13 }}>
            Please verify the details before saving:
          </Text>

          <ScrollView style={{ maxHeight: 260, marginBottom: 16 }}>
            {Object.entries(data || {}).map(([key, value]) => (
              <View key={key} style={[pickerStyles.confirmRow, { borderBottomColor: isDark ? '#1f2937' : '#f1f5f9' }]}>
                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: '700', flex: 1 }}>
                  {key.replace(/_/g, ' ').toUpperCase()}
                </Text>
                <Text style={{ color: isDark ? '#ffffff' : '#0f172a', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}>
                  {value?.toString() || '—'}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={[pickerStyles.confirmBtn, { backgroundColor: '#64748b' }]}
              onPress={onCancel}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pickerStyles.confirmBtn, { backgroundColor: '#2563eb' }]}
              onPress={onConfirm}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Yes, Save!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Reusable Field Renderers ─────────────────────────────────
export function DropdownField({ label, value, placeholder, onPress, isDark }) {
  return (
    <View style={fieldStyles.group}>
      <Text style={[fieldStyles.label, { color: isDark ? '#94a3b8' : '#475569' }]}>{label}</Text>
      <TouchableOpacity
        style={[fieldStyles.picker, {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }]}
        onPress={onPress}
      >
        <Text style={{ color: value ? (isDark ? '#ffffff' : '#0f172a') : '#64748b', fontSize: 14 }}>
          {value || placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color={isDark ? '#64748b' : '#94a3b8'} />
      </TouchableOpacity>
    </View>
  );
}

export function InputField({ label, value, onChangeText, placeholder, keyboardType = 'default', isDark, editable = true }) {
  return (
    <View style={fieldStyles.group}>
      <Text style={[fieldStyles.label, { color: isDark ? '#94a3b8' : '#475569' }]}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          color: isDark ? '#ffffff' : '#0f172a',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          opacity: editable ? 1 : 0.6,
        }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        keyboardType={keyboardType}
        editable={editable}
      />
    </View>
  );
}

export function CalcRow({ label, value, color = '#3b82f6', isDark }) {
  return (
    <View style={[fieldStyles.calcRow, { backgroundColor: isDark ? '#1f2937' : 'rgba(59,130,246,0.05)' }]}>
      <Text style={{ color: isDark ? '#94a3b8' : '#475569', fontSize: 13 }}>{label}</Text>
      <Text style={{ color, fontWeight: '800', fontSize: 15 }}>{value}</Text>
    </View>
  );
}

export function SubmitButton({ label, onPress, color = '#2563eb' }) {
  return (
    <TouchableOpacity style={[fieldStyles.submitBtn, { backgroundColor: color }]} onPress={onPress}>
      <Feather name="save" size={16} color="#fff" style={{ marginRight: 8 }} />
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SectionHeader({ title, onBack, isDark }) {
  return (
    <View style={[fieldStyles.screenHeader, {
      backgroundColor: isDark ? '#111827' : '#ffffff',
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    }]}>
      <TouchableOpacity onPress={onBack} style={fieldStyles.backBtn}>
        <Feather name="arrow-left" size={20} color={isDark ? '#94a3b8' : '#475569'} />
      </TouchableOpacity>
      <Text style={[fieldStyles.screenTitle, { color: isDark ? '#ffffff' : '#0f172a' }]}>{title}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  searchInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 10,
    fontSize: 14,
  },
  item: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  confirmCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    maxWidth: 420,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const fieldStyles = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
  },
  submitBtn: {
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    elevation: 2,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
