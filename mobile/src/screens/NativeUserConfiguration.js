import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Empty, ErrorState, Loading, Screen, SectionTitle } from '../components/NativeScreenKit';
import { apiRequest } from '../services/api';

const emptyForm = {
  full_name: '', designation: '', email: '', mobile: '', password: '',
  role: 'user', data_management_access: false, access: [],
};

export default function NativeUserConfiguration({ onBack }) {
  const [config, setConfig] = useState(null);
  const [search, setSearch] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({ Dashboards: true });
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setConfig(await apiRequest('/admin/user-configuration'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const users = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (config?.users || []).filter(user => !query || `${user.id} ${user.name} ${user.email} ${user.mobile} ${user.designation}`.toLowerCase().includes(query));
  }, [config?.users, search]);
  const groups = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    return Object.entries((config?.permissions || []).reduce((result, permission) => {
      if (query && !`${permission.label} ${permission.group}`.toLowerCase().includes(query)) return result;
      if (!result[permission.group]) result[permission.group] = [];
      result[permission.group].push(permission);
      return result;
    }, {}));
  }, [config?.permissions, permissionSearch]);

  const startAdd = () => {
    setEditingId(null); setForm(emptyForm); setPermissionSearch(''); setError(''); setMessage(''); setFormOpen(true);
  };
  const startEdit = user => {
    setEditingId(user.id);
    setForm({
      full_name: user.name, designation: user.designation, email: user.email,
      mobile: user.mobile, password: '', role: user.role || 'user',
      data_management_access: !!user.data_management_access, access: user.permissions || [],
    });
    setPermissionSearch(''); setError(''); setMessage(''); setFormOpen(true);
  };
  const togglePermission = value => setForm(current => ({
    ...current,
    access: current.access.includes(value) ? current.access.filter(item => item !== value) : [...current.access, value],
  }));
  const toggleGroup = permissions => setForm(current => {
    const values = permissions.map(item => item.value);
    const allSelected = values.every(value => current.access.includes(value));
    return { ...current, access: allSelected ? current.access.filter(value => !values.includes(value)) : [...new Set([...current.access, ...values])] };
  });
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'access') value.forEach(permission => body.append('access', permission));
      else if (key === 'data_management_access') body.append(key, value ? 'true' : 'false');
      else body.append(key, value);
    });
    try {
      const payload = await apiRequest(editingId ? `/admin/edit_user/${editingId}?format=json` : '/admin/add_user', { method: 'POST', body });
      if (payload.status === 'error') throw new Error(payload.msg || 'Unable to save user.');
      if (payload.status === 'otp_required') {
        setOtpEmail(payload.email); setOtp(''); setMessage(payload.msg);
      } else {
        setFormOpen(false); setEditingId(null); setMessage(payload.msg || 'User updated successfully.'); await load();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const verifyOtp = async () => {
    if (!otp.trim()) { setError('Enter the verification OTP.'); return; }
    setSaving(true); setError('');
    const body = new FormData(); body.append('email', otpEmail); body.append('otp', otp.trim());
    try {
      const payload = await apiRequest('/admin/verify_add_user_otp', { method: 'POST', body });
      if (payload.status !== 'success') throw new Error(payload.msg || 'OTP verification failed.');
      setOtpEmail(''); setOtp(''); setFormOpen(false); setMessage(payload.msg); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  const resendOtp = async () => {
    setSaving(true); setError('');
    const body = new FormData(); body.append('email', otpEmail);
    try {
      const payload = await apiRequest('/admin/resend_add_user_otp', { method: 'POST', body });
      setMessage(payload.msg || 'OTP resent.');
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  const requestToggle = user => Alert.alert(
    `${user.is_active ? 'Deactivate' : 'Activate'} User`,
    `${user.is_active ? 'Deactivate' : 'Activate'} ${user.name}?`,
    [{ text: 'Cancel', style: 'cancel' }, {
      text: user.is_active ? 'Deactivate' : 'Activate',
      style: user.is_active ? 'destructive' : 'default',
      onPress: async () => {
        try {
          const payload = await apiRequest(`/admin/toggle_user/${user.id}?format=json`, { method: 'POST' });
          setMessage(payload.msg); await load();
        } catch (requestError) { setError(requestError.message); }
      },
    }],
  );

  return <Screen title="User Configuration" subtitle={config?.company?.name || 'Users, roles and permissions'} onBack={onBack} onRefresh={load} scroll={false}>
    {loading ? <Loading text="Loading user configuration…" /> : error && !config ? <ErrorState message={error} onRetry={load} /> : <View style={styles.pageBody}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}
      <View style={styles.toolbar}><TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search users…" placeholderTextColor="#718299" /><Pressable style={styles.add} onPress={startAdd}><MaterialCommunityIcons name="account-plus-outline" size={19} color="#fff" /><Text style={styles.addText}>Add User</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.users} showsVerticalScrollIndicator={false}>
        <SectionTitle>Configured User Accounts</SectionTitle>
        {users.map(user => <View style={styles.userCard} key={user.id}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{user.name?.slice(0, 1)?.toUpperCase() || 'U'}</Text></View>
          <View style={styles.userCopy}><View style={styles.nameRow}><Text numberOfLines={1} style={styles.userName}>{user.name}</Text><Text style={[styles.status, user.is_active ? styles.active : styles.inactive]}>{user.is_active ? 'Active' : 'Inactive'}</Text></View><Text numberOfLines={1} style={styles.userEmail}>{user.email}</Text><Text style={styles.userMeta}>ID {user.id} • {user.designation} • {user.role === 'admin' ? 'Administrator' : 'Operational User'}</Text><Text style={styles.userMeta}>{user.permissions.length} permissions{user.data_management_access ? ' • Data Management' : ''}</Text></View>
          <View style={styles.actions}><Pressable onPress={() => startEdit(user)} style={styles.iconButton}><MaterialCommunityIcons name="pencil-outline" size={18} color="#2563eb" /></Pressable><Pressable onPress={() => requestToggle(user)} style={styles.iconButton}><MaterialCommunityIcons name={user.is_active ? 'account-off-outline' : 'account-check-outline'} size={18} color={user.is_active ? '#dc2626' : '#16a34a'} /></Pressable></View>
        </View>)}
        {!users.length ? <Empty text="No matching users." /> : null}
      </ScrollView>
    </View>}

    <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
      <View style={styles.modalPage}>
        <View style={styles.modalHeader}><Pressable onPress={() => setFormOpen(false)} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={21} color="#2563eb" /></Pressable><View style={styles.modalTitleCopy}><Text style={styles.modalTitle}>{editingId ? 'Edit User Profile' : 'Create User Profile'}</Text><Text style={styles.modalSubtitle}>{config?.company?.code}</Text></View><Pressable disabled={saving} onPress={save} style={styles.save}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          <View style={styles.fieldRow}><Field label="Full Name" value={form.full_name} onChangeText={value => setForm(current => ({ ...current, full_name: value }))}/><Field label="Designation" value={form.designation} onChangeText={value => setForm(current => ({ ...current, designation: value }))}/></View>
          <View style={styles.fieldRow}><Field label="Email Address" value={form.email} keyboardType="email-address" autoCapitalize="none" onChangeText={value => setForm(current => ({ ...current, email: value }))}/><Field label="Mobile Reference" value={form.mobile} keyboardType="phone-pad" onChangeText={value => setForm(current => ({ ...current, mobile: value }))}/></View>
          <View style={styles.fieldRow}><Field label={editingId ? 'New Password (optional)' : 'Access Password'} value={form.password} secureTextEntry onChangeText={value => setForm(current => ({ ...current, password: value }))}/><Pressable style={[styles.checkRow, styles.fieldRowControl]} onPress={() => setForm(current => ({ ...current, data_management_access: !current.data_management_access }))}><MaterialCommunityIcons name={form.data_management_access ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={form.data_management_access ? '#2563eb' : '#64748b'} /><Text style={styles.checkText}>Data Management</Text></Pressable></View>
          <Text style={styles.label}>System Role</Text><View style={styles.roleRow}>{(config?.roles || []).map(role => <Pressable key={role.value} onPress={() => setForm(current => ({ ...current, role: role.value }))} style={[styles.role, form.role === role.value && styles.roleActive]}><Text style={[styles.roleText, form.role === role.value && styles.roleTextActive]}>{role.label}</Text></Pressable>)}</View>
          <SectionTitle>Ecosystem Access Matrix</SectionTitle>
          <TextInput style={styles.permissionSearch} value={permissionSearch} onChangeText={setPermissionSearch} placeholder="Search permissions…" placeholderTextColor="#718299" />
          {groups.map(([group, permissions]) => {
            const isOpen = !!openGroups[group] || !!permissionSearch;
            const selected = permissions.filter(permission => form.access.includes(permission.value)).length;
            return <View style={styles.group} key={group}><View style={styles.groupHeader}><Pressable style={styles.groupNameButton} onPress={() => setOpenGroups(current => ({ ...current, [group]: !current[group] }))}><MaterialCommunityIcons name={isOpen ? 'folder-open-outline' : 'folder-outline'} size={19} color="#2563eb" /><Text style={styles.groupName}>{group}</Text></Pressable><Pressable onPress={() => toggleGroup(permissions)}><Text style={styles.groupCount}>{selected}/{permissions.length} • {selected === permissions.length ? 'Clear' : 'Select all'}</Text></Pressable></View>{isOpen ? permissions.map(permission => <Pressable key={permission.value} style={styles.permission} onPress={() => togglePermission(permission.value)}><MaterialCommunityIcons name={form.access.includes(permission.value) ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={form.access.includes(permission.value) ? '#2563eb' : '#94a3b8'} /><Text style={styles.permissionText}>{permission.label}</Text></Pressable>) : null}</View>;
          })}
          <Pressable disabled={saving} onPress={save} style={styles.bottomSave}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>

    <Modal visible={Boolean(otpEmail)} transparent animationType="fade" onRequestClose={() => setOtpEmail('')}>
      <View style={styles.otpOverlay}><View style={styles.otpCard}><Text style={styles.otpTitle}>Verify New User</Text><Text style={styles.otpCopy}>Enter the OTP sent to {otpEmail}. It expires in {config?.otp_expiry_minutes || 10} minutes.</Text><TextInput autoFocus keyboardType="number-pad" maxLength={6} style={styles.otpInput} value={otp} onChangeText={value => setOtp(value.replace(/\D/g, ''))}/>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={saving} onPress={verifyOtp} style={styles.bottomSave}><Text style={styles.saveText}>Verify & Save</Text></Pressable><View style={styles.otpActions}><Pressable disabled={saving} onPress={resendOtp}><Text style={styles.link}>Resend OTP</Text></Pressable><Pressable onPress={() => { setOtpEmail(''); setOtp(''); }}><Text style={styles.cancelLink}>Cancel</Text></Pressable></View></View></View>
    </Modal>
  </Screen>;
}

function Field({ label, ...props }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#718299" /></View>;
}

const styles = StyleSheet.create({
  pageBody: { flex: 1 }, toolbar: { flexDirection: 'row', gap: 8 }, search: { flex: 1, height: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, color: '#0f172a', backgroundColor: '#fff', fontSize: 12, fontWeight: '700' }, add: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#2563eb' }, addText: { color: '#fff', fontSize: 12, fontWeight: '900' }, users: { paddingBottom: 12 }, userCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' }, avatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#dbeafe' }, avatarText: { color: '#1d4ed8', fontSize: 17, fontWeight: '900' }, userCopy: { flex: 1, minWidth: 0 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, userName: { flex: 1, color: '#0f172a', fontSize: 13, fontWeight: '900' }, userEmail: { marginTop: 3, color: '#334155', fontSize: 11.5, fontWeight: '750' }, userMeta: { marginTop: 3, color: '#64748b', fontSize: 10.5, fontWeight: '700' }, status: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, fontSize: 9.5, fontWeight: '900' }, active: { color: '#15803d', backgroundColor: '#dcfce7' }, inactive: { color: '#b91c1c', backgroundColor: '#fee2e2' }, actions: { gap: 6 }, iconButton: { width: 33, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 9, backgroundColor: '#fff' }, error: { marginBottom: 8, padding: 9, borderRadius: 9, color: '#b91c1c', backgroundColor: '#fee2e2', fontSize: 11, fontWeight: '800' }, success: { marginBottom: 8, padding: 9, borderRadius: 9, color: '#15803d', backgroundColor: '#dcfce7', fontSize: 11, fontWeight: '800' },
  modalPage: { flex: 1, backgroundColor: '#f4f7fb' }, modalHeader: { minHeight: 86, paddingTop: 27, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#dbe3ef' }, back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#eff6ff' }, modalTitleCopy: { flex: 1 }, modalTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' }, modalSubtitle: { marginTop: 2, color: '#64748b', fontSize: 10, fontWeight: '800' }, save: { height: 36, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 9, backgroundColor: '#2563eb' }, saveText: { color: '#fff', fontSize: 12, fontWeight: '900' }, form: { padding: 12, paddingBottom: 30 }, fieldRow: { flexDirection: 'row', gap: 8 }, field: { flex: 1, marginBottom: 10 }, fieldRowControl: { flex: 1, marginBottom: 10 }, label: { marginBottom: 5, color: '#475569', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, input: { height: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, color: '#0f172a', backgroundColor: '#fff', fontSize: 12, fontWeight: '700' }, roleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 }, role: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, roleActive: { borderColor: '#2563eb', backgroundColor: '#dbeafe' }, roleText: { color: '#475569', fontSize: 11, fontWeight: '850' }, roleTextActive: { color: '#1d4ed8' }, checkRow: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' }, checkText: { color: '#334155', fontSize: 11.5, fontWeight: '850' }, permissionSearch: { height: 40, marginBottom: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, color: '#0f172a', backgroundColor: '#fff', fontSize: 11.5 }, group: { marginBottom: 7, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }, groupHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, backgroundColor: '#f8fafc' }, groupNameButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }, groupName: { color: '#1e293b', fontSize: 11.5, fontWeight: '900' }, groupCount: { color: '#2563eb', fontSize: 10, fontWeight: '900' }, permission: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' }, permissionText: { flex: 1, color: '#334155', fontSize: 11, fontWeight: '750' }, bottomSave: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6, borderRadius: 10, backgroundColor: '#2563eb' },
  otpOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#02061799' }, otpCard: { width: '100%', maxWidth: 420, padding: 18, borderRadius: 18, backgroundColor: '#fff' }, otpTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900' }, otpCopy: { marginTop: 7, color: '#64748b', fontSize: 12, lineHeight: 18, fontWeight: '700' }, otpInput: { height: 52, marginTop: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 10, color: '#0f172a', backgroundColor: '#eff6ff', fontSize: 22, fontWeight: '900', letterSpacing: 6, textAlign: 'center' }, otpActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }, link: { color: '#2563eb', fontSize: 12, fontWeight: '900' }, cancelLink: { color: '#dc2626', fontSize: 12, fontWeight: '900' },
});
