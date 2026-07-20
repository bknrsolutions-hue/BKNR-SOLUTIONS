import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import NativeDropdown from '../components/NativeDropdown';
import { Empty, Loading, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';

const emptyHeader = filters => ({
  movement_type: 'IN',
  production_for: filters.productionFor || '',
  plant_location: filters.location || '',
  party_name: '',
  source_destination: '',
  po_number: '',
  challan_number: '',
  invoice_number: '',
  vehicle_number: '',
  driver_name: '',
  department: '',
  purpose: '',
  authorized_received_by: '',
  is_returnable: false,
  expected_return_date: '',
  linked_movement_id: '',
  remarks: '',
});
const emptyItem = () => ({ item_category: '', item_name: '', description: '', quantity: '', unit: 'Nos', packages: '0', material_condition: '', remarks: '' });

export default function NativeGoodsGateMovements({ filters = {} }) {
  const [view, setView] = useState('entry');
  const [form, setForm] = useState(() => emptyHeader(filters));
  const [items, setItems] = useState([emptyItem()]);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [returnables, setReturnables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [cancelRow, setCancelRow] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest('/processing/gate_entry/goods');
      setRows(payload.rows || []);
      setCategories(payload.categories || []);
      setUnits(payload.units || []);
      setReturnables(payload.returnable_movements || []);
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Unable to load goods movements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setForm(current => ({ ...current, production_for: filters.productionFor || current.production_for, plant_location: filters.location || current.plant_location }));
    void load();
  }, [filters.location, filters.productionFor, load]);

  const linked = useMemo(() => returnables.find(row => String(row.id) === String(form.linked_movement_id)), [form.linked_movement_id, returnables]);
  const change = (name, value) => setForm(current => ({ ...current, [name]: value }));
  const changeItem = (index, name, value) => setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [name]: value } : item));
  const reset = () => { setForm(emptyHeader(filters)); setItems([emptyItem()]); };

  const chooseLinked = value => {
    const source = returnables.find(row => String(row.id) === String(value));
    if (!source) { change('linked_movement_id', ''); return; }
    setForm(current => ({
      ...current,
      linked_movement_id: String(source.id),
      movement_type: source.movement_type === 'IN' ? 'OUT' : 'IN',
      party_name: source.party_name || '',
      production_for: source.production_for || current.production_for,
      plant_location: source.plant_location || current.plant_location,
      purpose: `Return against ${source.movement_number}`,
      is_returnable: false,
      expected_return_date: '',
    }));
    setItems((source.items || []).filter(item => Number(item.balance_quantity || 0) > 0).map(item => ({
      ...emptyItem(),
      item_category: item.item_category || '',
      item_name: item.item_name || '',
      quantity: String(item.balance_quantity || ''),
      unit: item.unit || 'Nos',
      description: `Return against ${source.movement_number}`,
    })));
  };

  const save = async () => {
    if (!form.production_for || !form.plant_location || !form.party_name.trim() || !form.purpose.trim()) {
      setMessage('Production For, Plant Location, Party and Purpose are required.');
      return;
    }
    if (!items.length || items.some(item => !item.item_category || !item.item_name.trim() || Number(item.quantity || 0) <= 0 || !item.unit)) {
      setMessage('Complete Category, Item Name, Quantity and Unit for every item.');
      return;
    }
    if (form.is_returnable && form.movement_type === 'OUT' && !form.expected_return_date) {
      setMessage('Expected Return Date is required.');
      return;
    }
    setSaving(true); setMessage('');
    try {
      const payload = await apiRequest('/processing/gate_entry/goods', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          linked_movement_id: form.linked_movement_id ? Number(form.linked_movement_id) : null,
          expected_return_date: form.expected_return_date || null,
          items: items.map(item => ({ ...item, quantity: Number(item.quantity), packages: Number(item.packages || 0) })),
        }),
      });
      setSuccess(payload.message || 'Goods movement saved successfully.');
      reset();
      await load();
    } catch (error) {
      setMessage(error.message || 'Unable to save goods movement.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!cancelRow || !cancelReason.trim()) { setMessage('Cancellation reason is required.'); return; }
    try {
      const payload = await apiRequest(`/processing/gate_entry/goods/${cancelRow.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setSuccess(payload.message);
      setCancelRow(null); setCancelReason('');
      await load();
    } catch (error) { setMessage(error.message || 'Unable to cancel movement.'); }
  };

  return (
    <View>
      <View style={styles.tabs}>
        <Pressable onPress={() => setView('entry')} style={[styles.tab, view === 'entry' && styles.tabActive]}><Text style={[styles.tabText, view === 'entry' && styles.tabTextActive]}>ENTRY</Text></Pressable>
        <Pressable onPress={() => setView('register')} style={[styles.tab, view === 'register' && styles.tabActive]}><Text style={[styles.tabText, view === 'register' && styles.tabTextActive]}>REGISTER ({rows.length})</Text></Pressable>
      </View>
      {message ? <Pressable onPress={() => setMessage('')} style={styles.error}><Text style={styles.errorText}>{message}</Text><Text style={styles.close}>×</Text></Pressable> : null}
      {success ? <Pressable onPress={() => setSuccess('')} style={styles.success}><Text style={styles.successText}>{success}</Text><Text style={styles.close}>×</Text></Pressable> : null}
      <View style={styles.note}><Text style={styles.noteText}>Security movement log only. No inventory or accounting posting. Raw shrimp/RMP is not allowed.</Text></View>

      {view === 'entry' ? (
        <>
          <SectionTitle>Movement Details</SectionTitle>
          <View style={styles.form}>
            <View style={styles.movementRow}>
              {['IN', 'OUT'].map(type => <Pressable key={type} disabled={Boolean(linked)} onPress={() => change('movement_type', type)} style={[styles.movementButton, form.movement_type === type && (type === 'IN' ? styles.inActive : styles.outActive)]}><Text style={[styles.movementText, form.movement_type === type && styles.movementActiveText]}>GOODS {type}</Text></Pressable>)}
            </View>
            <View style={styles.formGrid}>
              <View style={styles.formGridField}><NativeDropdown required label="Production For" values={filters.companies || []} value={form.production_for} onChange={value => change('production_for', value)} placeholder="Select company" /></View>
              <View style={styles.formGridField}><NativeDropdown required label="Plant Location" values={filters.locations || []} value={form.plant_location} onChange={value => change('plant_location', value)} placeholder="Select plant" /></View>
              <View style={styles.formGridField}><Input label="Party / Vendor *" value={form.party_name} onChangeText={value => change('party_name', value)} /></View>
              <View style={styles.formGridField}><Input label={form.movement_type === 'IN' ? 'Source / From Location' : 'Destination / To Location'} value={form.source_destination} onChangeText={value => change('source_destination', value)} /></View>
              <View style={styles.formGridField}><Input label="Purpose *" value={form.purpose} onChangeText={value => change('purpose', value)} /></View>
              <View style={styles.formGridField}><Input label={form.movement_type === 'IN' ? 'Received By' : 'Authorized By'} value={form.authorized_received_by} onChangeText={value => change('authorized_received_by', value)} /></View>
              <View style={styles.formGridField}><Input label="PO Number" value={form.po_number} onChangeText={value => change('po_number', value)} /></View>
              <View style={styles.formGridField}><Input label="Challan Number" value={form.challan_number} onChangeText={value => change('challan_number', value)} /></View>
              <View style={styles.formGridField}><Input label="Invoice Number" value={form.invoice_number} onChangeText={value => change('invoice_number', value)} /></View>
              <View style={styles.formGridField}><Input label="Vehicle Number" value={form.vehicle_number} onChangeText={value => change('vehicle_number', value)} /></View>
              <View style={styles.formGridField}><Input label="Driver Name" value={form.driver_name} onChangeText={value => change('driver_name', value)} /></View>
              <View style={styles.formGridField}><Input label="Department" value={form.department} onChangeText={value => change('department', value)} /></View>
              <View style={styles.formGridField}><NativeDropdown label="Linked Return Movement" values={returnables.map(row => `${row.id}|${row.movement_number} · ${row.party_name} · ${row.return_status}`)} value={form.linked_movement_id ? `${form.linked_movement_id}|${linked?.movement_number} · ${linked?.party_name} · ${linked?.return_status}` : ''} onChange={value => chooseLinked(String(value).split('|')[0])} placeholder="Not linked" /></View>
              <View style={styles.formGridField}><Pressable disabled={Boolean(linked)} onPress={() => change('is_returnable', !form.is_returnable)} style={[styles.check, form.is_returnable && styles.checkActive]}><Text style={[styles.checkText, form.is_returnable && styles.checkTextActive]}>{form.is_returnable ? '✓ ' : ''}RETURNABLE MOVEMENT</Text></Pressable></View>
              {form.is_returnable && form.movement_type === 'OUT' ? <View style={styles.formGridField}><Input label="Expected Return Date *" value={form.expected_return_date} onChangeText={value => change('expected_return_date', value)} placeholder="YYYY-MM-DD" /></View> : null}
              <View style={styles.formGridField}><Input label="Remarks" value={form.remarks} onChangeText={value => change('remarks', value)} /></View>
            </View>
          </View>

          <SectionTitle>Item Details</SectionTitle>
          <View style={styles.items}>{items.map((item, index) => (
            <View key={index} style={styles.itemCard}>
              <View style={styles.itemHead}><Text style={styles.itemTitle}>ITEM {index + 1}</Text>{items.length > 1 ? <Pressable onPress={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}><Text style={styles.remove}>REMOVE</Text></Pressable> : null}</View>
              <View style={styles.formGrid}>
                <View style={styles.formGridField}><NativeDropdown required label="Category" values={categories} value={item.item_category} onChange={value => changeItem(index, 'item_category', value)} placeholder="Select category" /></View>
                <View style={styles.formGridField}><Input label="Item Name *" value={item.item_name} onChangeText={value => changeItem(index, 'item_name', value)} /></View>
                <View style={styles.formGridField}><Input label="Description" value={item.description} onChangeText={value => changeItem(index, 'description', value)} /></View>
                <View style={styles.formGridField}><Input label="Quantity *" value={item.quantity} onChangeText={value => changeItem(index, 'quantity', value)} keyboardType="decimal-pad" /></View>
                <View style={styles.formGridField}><NativeDropdown required label="Unit" values={units} value={item.unit} onChange={value => changeItem(index, 'unit', value)} placeholder="Unit" /></View>
                <View style={styles.formGridField}><Input label="Packages" value={item.packages} onChangeText={value => changeItem(index, 'packages', value)} keyboardType="decimal-pad" /></View>
                <View style={styles.formGridField}><Input label="Material Condition" value={item.material_condition} onChangeText={value => changeItem(index, 'material_condition', value)} /></View>
              </View>
            </View>
          ))}</View>
          <Pressable onPress={() => setItems(current => [...current, emptyItem()])} style={styles.add}><Text style={styles.addText}>+ ADD ITEM</Text></Pressable>
          <Pressable disabled={saving} onPress={save} style={[styles.save, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>
        </>
      ) : loading ? <Loading text="Loading goods register…" /> : (
        <>
          <SectionTitle>Goods Movement Register</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableShell}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>{['Movement','Date / Time','Type','Party / Plant','Items','Qty / Packs','Return','Status','Action'].map((label, index) => <Text key={label} style={[styles.th, { width: widths[index] }]}>{label}</Text>)}</View>
              {rows.map(row => <View key={row.id} style={[styles.tableRow, row.is_cancelled && styles.cancelled]}>
                <Cell width={widths[0]} text={row.movement_number} sub={`Row #${row.id}`} bold />
                <Cell width={widths[1]} text={row.movement_date} sub={row.movement_time} />
                <Cell width={widths[2]} text={row.movement_type} bold tone={row.movement_type === 'IN' ? '#15803d' : '#c2410c'} />
                <Cell width={widths[3]} text={row.party_name} sub={row.plant_location} />
                <Cell width={widths[4]} text={row.item_summary} lines={3} />
                <Cell width={widths[5]} text={String(row.total_quantity)} sub={`${row.total_packages} packs`} />
                <Cell width={widths[6]} text={row.return_status} />
                <Cell width={widths[7]} text={row.status} />
                <View style={{ width: widths[8], alignItems: 'center', justifyContent: 'center' }}>{!row.is_cancelled ? <Pressable onPress={() => { setCancelRow(row); setCancelReason(''); }} style={styles.cancelButton}><Text style={styles.cancelButtonText}>CANCEL</Text></Pressable> : null}</View>
              </View>)}
              {!rows.length ? <Empty text="No goods movements found." /> : null}
            </View>
          </ScrollView>
          {cancelRow ? <View style={styles.cancelPanel}><Text style={styles.cancelTitle}>Cancel {cancelRow.movement_number}</Text><TextInput value={cancelReason} onChangeText={setCancelReason} placeholder="Cancellation reason" placeholderTextColor="#94a3b8" style={styles.input} /><View style={styles.cancelActions}><Pressable onPress={() => setCancelRow(null)} style={styles.keep}><Text style={styles.keepText}>Keep</Text></Pressable><Pressable onPress={cancel} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel Entry</Text></Pressable></View></View> : null}
        </>
      )}
    </View>
  );
}

function Input({ label, ...props }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#94a3b8" style={styles.input} {...props} /></View>;
}
function Cell({ width, text, sub, bold, tone, lines = 2 }) {
  return <View style={[styles.cell, { width }]}><Text numberOfLines={lines} style={[styles.cellText, bold && styles.bold, tone && { color: tone }]}>{text || '—'}</Text>{sub ? <Text numberOfLines={1} style={styles.cellSub}>{sub}</Text> : null}</View>;
}
const widths = [125, 95, 55, 145, 260, 90, 110, 80, 70];

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginTop: 9 },
  tab: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' },
  tabActive: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  tabText: { color: '#64748b', fontSize: 9.5, fontWeight: '900' }, tabTextActive: { color: '#fff' },
  note: { marginTop: 9, padding: 9, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 9, backgroundColor: '#eff6ff' },
  noteText: { color: '#1d4ed8', fontSize: 10, lineHeight: 14, fontWeight: '750' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, padding: 10, borderWidth: 1, borderColor: '#fecaca', borderRadius: 9, backgroundColor: '#fef2f2' },
  errorText: { flex: 1, color: '#dc2626', fontSize: 11, fontWeight: '800' },
  success: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, padding: 10, borderWidth: 1, borderColor: '#86efac', borderRadius: 9, backgroundColor: '#f0fdf4' },
  successText: { flex: 1, color: '#15803d', fontSize: 11, fontWeight: '800' }, close: { color: '#64748b', fontSize: 18 },
  form: { gap: 8, padding: 9, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 12, backgroundColor: '#fff' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 7, rowGap: 8 },
  formGridField: { width: '48.8%', minWidth: 0 },
  movementRow: { flexDirection: 'row', gap: 7 }, movementButton: { flex: 1, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9 },
  inActive: { borderColor: '#86efac', backgroundColor: '#dcfce7' }, outActive: { borderColor: '#fdba74', backgroundColor: '#ffedd5' },
  movementText: { color: '#64748b', fontSize: 10, fontWeight: '900' }, movementActiveText: { color: '#0f172a' },
  field: { width: '100%' }, label: { marginBottom: 4, color: '#64748b', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  input: { height: 41, paddingHorizontal: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, color: '#0f172a', backgroundColor: '#fff', fontSize: 11.5, fontWeight: '700' },
  check: { height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9 },
  checkActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, checkText: { color: '#64748b', fontSize: 10, fontWeight: '900' }, checkTextActive: { color: '#1d4ed8' },
  items: { gap: 8 }, itemCard: { gap: 8, padding: 9, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 11, backgroundColor: '#fff' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between' }, itemTitle: { color: '#1d4ed8', fontSize: 10, fontWeight: '900' }, remove: { color: '#dc2626', fontSize: 9, fontWeight: '900' },
  inline: { flexDirection: 'row', gap: 7 }, inlineField: { flex: 1 }, add: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 9, backgroundColor: '#eff6ff' },
  addText: { color: '#1d4ed8', fontSize: 10, fontWeight: '900' }, save: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '900' }, disabled: { opacity: .5 },
  tableShell: { borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 10, backgroundColor: '#fff' }, table: { width: widths.reduce((sum, width) => sum + width, 0) },
  tableRow: { minHeight: 48, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbe3ef' }, tableHeader: { minHeight: 30, backgroundColor: '#eaf1fb' },
  th: { padding: 5, color: '#1e3a5f', fontSize: 8, fontWeight: '900', textTransform: 'uppercase' }, cell: { justifyContent: 'center', padding: 5 },
  cellText: { color: '#334155', fontSize: 9.5, lineHeight: 12, fontWeight: '650' }, bold: { color: '#0f172a', fontWeight: '900' }, cellSub: { marginTop: 2, color: '#64748b', fontSize: 8 },
  cancelled: { opacity: .48, backgroundColor: '#fef2f2' }, cancelButton: { paddingHorizontal: 5, paddingVertical: 5, borderRadius: 5, backgroundColor: '#fee2e2' }, cancelButtonText: { color: '#dc2626', fontSize: 7.5, fontWeight: '900' },
  cancelPanel: { gap: 8, marginTop: 10, padding: 11, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, backgroundColor: '#fff' }, cancelTitle: { color: '#dc2626', fontSize: 13, fontWeight: '900' },
  cancelActions: { flexDirection: 'row', gap: 7 }, keep: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9 }, keepText: { color: '#475569', fontWeight: '900' },
  confirmCancel: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#dc2626' }, confirmCancelText: { color: '#fff', fontWeight: '900' },
});
