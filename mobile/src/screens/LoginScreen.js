// ============================================================
// BKNR ERP — Premium Login Screen
// ============================================================
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Animated, Dimensions, Easing, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Feather } from '@expo/vector-icons';
import { BASE_URL } from '../config';

const { width, height } = Dimensions.get('window');

// Animated floating particle
function Particle({ size, color, style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 3000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 3000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 0.3, 0.15] });

  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, transform: [{ translateY }], opacity }, style]} />
  );
}

export default function LoginScreen() {
  const { login, loading, error, setError } = useAuth();

  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [focusedField, setFocusedField] = useState('');

  const emailRef = useRef();
  const passRef = useRef();
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
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

  const inputStyle = (fieldName) => [
    styles.inputRow,
    focusedField === fieldName && styles.inputRowFocused,
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#030712" />

      {/* Premium background particles */}
      <Particle size={200} color="#2563eb" style={{ top: -60, right: -60 }} />
      <Particle size={150} color="#7c3aed" style={{ bottom: 80, left: -50 }} />
      <Particle size={80} color="#0ea5e9" style={{ top: height * 0.4, right: 20 }} />
      <Particle size={60} color="#6366f1" style={{ top: height * 0.2, left: 30 }} />

      {/* Grid overlay */}
      <View style={styles.gridOverlay} pointerEvents="none" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo area */}
          <Animated.View style={[styles.logoArea, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Animated badge */}
            <View style={styles.badgeRow}>
              <View style={styles.liveDot} />
              <Text style={styles.badgeText}>ENTERPRISE PLATFORM</Text>
            </View>

            <View style={styles.companyLogoWrap}>
              <Image
                source={{ uri: `${BASE_URL}/static/images/svbk-it-solutions-logo.png` }}
                style={styles.companyLogo}
                resizeMode="contain"
                accessibilityLabel="SVBK IT Solutions"
              />
            </View>

            <Text style={styles.brandTitle}>BKNR <Text style={{ color: '#3b82f6' }}>ERP</Text></Text>
            <Text style={styles.brandTagline}>Precision in every process</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {[
                { val: '7+', lbl: 'Modules' },
                { val: '99.9%', lbl: 'Uptime' },
                { val: 'v3.0', lbl: 'Version' },
              ].map((s, i) => (
                <View key={i} style={styles.statItem}>
                  <Text style={styles.statVal}>{s.val}</Text>
                  <Text style={styles.statLbl}>{s.lbl}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Login card */}
          <Animated.View style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { translateX: shakeAnim }]
            }
          ]}>
            {/* Card header */}
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Sign In</Text>
                <Text style={styles.cardSub}>Access your workspace securely</Text>
              </View>
              <View style={styles.secureChip}>
                <Feather name="shield" size={11} color="#10b981" />
                <Text style={styles.secureText}>SECURED</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Company ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>COMPANY ID</Text>
              <View style={inputStyle('company')}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                  <Feather name="briefcase" size={15} color="#3b82f6" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. BKNR1234"
                  placeholderTextColor="#1e3a5f"
                  value={companyId}
                  onChangeText={setCompanyId}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onFocus={() => setFocusedField('company')}
                  onBlur={() => setFocusedField('')}
                  onSubmitEditing={() => emailRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <View style={inputStyle('email')}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
                  <Feather name="mail" size={15} color="#8b5cf6" />
                </View>
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor="#1e3a5f"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField('')}
                  onSubmitEditing={() => passRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={inputStyle('pass')}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                  <Feather name="lock" size={15} color="#10b981" />
                </View>
                <TextInput
                  ref={passRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••••"
                  placeholderTextColor="#1e3a5f"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  returnKeyType="done"
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField('')}
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Feather name={showPass ? 'eye-off' : 'eye'} size={16} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Feather name="alert-triangle" size={14} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Login button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.65 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Sign In to Workspace</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {/* Info row */}
            <View style={styles.infoRow}>
              <Feather name="info" size={12} color="#334155" />
              <Text style={styles.infoText}>
                Contact your administrator for account access.
              </Text>
            </View>
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.footerWrap, { opacity: fadeAnim }]}>
            <Text style={styles.footerLine}>BKNR SOLUTIONS · ERP v3.0</Text>
            <Text style={styles.footerSub}>Seafood Export & Processing Management</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#030712',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    // Subtle dot grid effect via opacity layering
    opacity: 0.03,
    backgroundColor: 'transparent',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 50,
  },

  // Logo
  logoArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  companyLogoWrap: {
    width: '92%',
    maxWidth: 330,
    height: 82,
    marginBottom: 10,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  companyLogo: {
    width: '100%',
    height: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
  },
  badgeText: {
    color: '#3b82f6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  logoInner: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  statVal: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '800',
  },
  statLbl: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Card
  card: {
    backgroundColor: '#0d1424',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  secureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  secureText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 20,
  },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingRight: 14,
    height: 54,
    gap: 10,
  },
  inputRowFocused: {
    borderColor: 'rgba(59,130,246,0.5)',
    backgroundColor: 'rgba(59,130,246,0.04)',
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 6,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Button
  loginBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 15,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Info
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    justifyContent: 'center',
  },
  infoText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '500',
  },

  // Footer
  footerWrap: {
    alignItems: 'center',
    marginTop: 28,
  },
  footerLine: {
    color: '#1e293b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footerSub: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3,
  },
});
