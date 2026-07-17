import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useERPTheme } from '../theme/ERPThemeContext';

export default function NativeDropdown({ label, values = [], value, onChange, placeholder = 'Select', required = false, style, compact = false }) {
  const { theme } = useERPTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? values.filter(item => String(item).toLowerCase().includes(query)) : values;
  }, [search, values]);

  const choose = item => {
    onChange(item);
    setSearch('');
    setOpen(false);
  };

  return <View style={[styles.field, style]}>
    <Text style={[styles.label, compact && styles.compactLabel, { color: theme.muted }]}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
    <Pressable onPress={() => setOpen(true)} style={[styles.control, compact && styles.compactControl, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text numberOfLines={1} style={[styles.value, compact && styles.compactValue, { color: theme.text }, !value && styles.placeholder]}>{value || placeholder}</Text>
      <Text style={[styles.chevron, { color: theme.primary }]}>⌄</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable onPress={() => setOpen(false)} style={styles.overlay}>
        <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}><Text style={[styles.title, { color: theme.text }]}>{label}</Text><Pressable onPress={() => setOpen(false)}><Text style={[styles.close, { color: theme.muted }]}>×</Text></Pressable></View>
          <TextInput value={search} onChangeText={setSearch} placeholder={`Search ${label.toLowerCase()}…`} placeholderTextColor="#718299" style={[styles.search, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            <Pressable onPress={() => choose('')} style={[styles.option, !value && styles.optionActive]}><Text style={[styles.optionText, !value && styles.optionTextActive]}>All</Text></Pressable>
            {options.map(item => <Pressable key={String(item)} onPress={() => choose(item)} style={[styles.option, { borderBottomColor: theme.border }, value === item && styles.optionActive]}><Text style={[styles.optionText, { color: theme.text }, value === item && styles.optionTextActive]}>{item}</Text></Pressable>)}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 0 },
  label: { marginBottom: 4, color: '#64748b', fontSize: 8.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .4 },
  required: { color: '#f87171' },
  control: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' },
  compactControl: { height: 36, paddingHorizontal: 9, borderRadius: 9 },
  value: { flex: 1, color: '#0f172a', fontSize: 10, fontWeight: '800' },
  compactValue: { fontSize: 10 },
  compactLabel: { marginBottom: 4, fontSize: 8.5 },
  placeholder: { color: '#94a3b8' },
  chevron: { color: '#2563eb', fontSize: 17, fontWeight: '900' },
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: 'rgba(2, 8, 23, .72)' },
  sheet: { maxHeight: '72%', overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, backgroundColor: '#fff' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#dbe3ef' },
  title: { color: '#0f172a', fontSize: 17, fontWeight: '900' },
  close: { color: '#64748b', fontSize: 25 },
  search: { height: 48, margin: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11, color: '#0f172a', backgroundColor: '#f8fafc', fontSize: 12, fontWeight: '750' },
  list: { paddingHorizontal: 12, marginBottom: 12 },
  option: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbe3ef', borderRadius: 9 },
  optionActive: { backgroundColor: '#1d4ed8' },
  optionText: { color: '#334155', fontSize: 12, fontWeight: '750' },
  optionTextActive: { color: '#fff', fontWeight: '900' },
});
