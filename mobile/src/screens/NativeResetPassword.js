import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiRequest } from '../services/api';

export default function NativeResetPassword({ token, onComplete }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (password.length < 6) { setError('Password must contain at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const form = new FormData(); form.append('token', token); form.append('password', password);
      await apiRequest('/auth/reset-password', { method: 'POST', body: form, parseResponse: false });
      onComplete();
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.card}><View style={styles.icon}><Text style={styles.iconText}>✓</Text></View><Text style={styles.title}>Reset Password</Text><Text style={styles.subtitle}>Create a secure new password for your SVBK ERP account.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor="#718299" secureTextEntry /><TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="Confirm password" placeholderTextColor="#718299" secureTextEntry /><Pressable disabled={loading} onPress={submit} style={styles.button}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update Password</Text>}</Pressable></View></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#f4f7fb' }, card: { width: '100%', maxWidth: 430, padding: 22, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 22, backgroundColor: '#fff' }, icon: { width: 46, height: 46, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#2563eb' }, iconText: { color: '#fff', fontSize: 21, fontWeight: '900' }, title: { marginTop: 12, color: '#0f172a', fontSize: 22, fontWeight: '900', textAlign: 'center' }, subtitle: { margin: 7, marginBottom: 18, color: '#64748b', fontSize: 10, lineHeight: 16, textAlign: 'center' }, error: { marginBottom: 10, padding: 10, borderRadius: 10, color: '#dc2626', backgroundColor: '#fef2f2', fontSize: 9 }, input: { height: 50, marginBottom: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, color: '#0f172a', backgroundColor: '#fff' }, button: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#2563eb' }, buttonText: { color: '#fff', fontSize: 11, fontWeight: '900' } });
