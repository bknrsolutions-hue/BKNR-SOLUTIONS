import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Animated, Dimensions,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const { login, loading, error, setError } = useAuth();

  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const emailRef = useRef();
  const passRef = useRef();

  // Shake animation for errors
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    setError('');
    if (!companyId.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.');
      shake();
      return;
    }
    const success = await login(companyId, email, password);
    if (!success) shake();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#060913" />

      {/* Background blobs */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── LOGO ── */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Feather name="layers" size={34} color="#2563eb" />
            </View>
            <Text style={styles.brandTitle}>BKNR ERP</Text>
            <Text style={styles.brandSub}>ENTERPRISE RESOURCE PLANNING</Text>
          </View>

          {/* ── CARD ── */}
          <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSub}>Sign in to your workspace</Text>

            {/* Company ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>COMPANY ID</Text>
              <View style={styles.inputRow}>
                <Feather name="briefcase" size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. BKNR1234"
                  placeholderTextColor="#334155"
                  value={companyId}
                  onChangeText={setCompanyId}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <View style={styles.inputRow}>
                <Feather name="mail" size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor="#334155"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.inputRow}>
                <Feather name="lock" size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  ref={passRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor="#334155"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Feather name={showPass ? 'eye-off' : 'eye'} size={16} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Sign In</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* ── FOOTER ── */}
          <Text style={styles.footer}>
            Precision in every process  ·  BKNR ERP 3.0
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060913',
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },

  // Background blobs
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.15,
  },
  blob1: {
    width: 280,
    height: 280,
    backgroundColor: '#2563eb',
    top: -80,
    right: -80,
  },
  blob2: {
    width: 220,
    height: 220,
    backgroundColor: '#8b5cf6',
    bottom: -60,
    left: -60,
  },

  // Logo
  logoArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 3,
    marginTop: 4,
  },

  // Card
  card: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 28,
    fontWeight: '500',
  },

  // Fields
  fieldGroup: { marginBottom: 18 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 8,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Login button
  loginBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Footer
  footer: {
    textAlign: 'center',
    color: '#1e293b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 32,
  },
});
