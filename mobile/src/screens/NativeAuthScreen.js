import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { API_URL, IS_LIVE_API } from '../config';
import { apiRequest } from '../services/api';

const initialRegistration = {
  company_name: '',
  mpeda_registration_code: '',
  user_name: '',
  designation: '',
  address: '',
  mobile: '',
  email: '',
};

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize = 'none', right, maxLength, multiline }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={[styles.inputShell, multiline && styles.multilineShell]}><TextInput style={[styles.input, multiline && styles.multilineInput]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8391a7" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={false} maxLength={maxLength} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} />{right}</View></View>;
}

export default function NativeAuthScreen({ onAuthenticated }) {
  const [screen, setScreen] = useState('login');
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [otpPurpose, setOtpPurpose] = useState('login');
  const [registration, setRegistration] = useState(initialRegistration);
  const [createdCompanyId, setCreatedCompanyId] = useState('');

  const resetMessages = () => { setError(''); setNotice(''); };
  const goLogin = () => { setScreen('login'); setOtp(''); resetMessages(); };
  const run = async action => {
    resetMessages(); setLoading(true);
    try { await action(); } catch (requestError) { setError(requestError.message || 'Unable to connect to the server.'); }
    finally { setLoading(false); }
  };

  const login = () => run(async () => {
    if (!companyId.trim() || !email.trim() || !password) throw new Error('ERP tenant code, email and password are required.');
    let payload;
    try {
      payload = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ company_id: companyId.trim(), email: email.trim().toLowerCase(), password: password.slice(0, 20) }) });
    } catch (loginError) {
      if (String(loginError.message).toLowerCase().includes('not verified')) {
        setOtpPurpose('email'); setOtp(''); setScreen('otp'); setNotice('Email verification code sent.'); return;
      }
      throw loginError;
    }
    if (payload.status === 'otp_required') {
      setCompanyId(payload.company_id || companyId.trim()); setEmail(payload.email || email.trim().toLowerCase());
      setOtpPurpose('login'); setOtp(''); setScreen('otp'); setNotice('Login OTP sent to your email.');
    }
  });

  const verifyOtp = () => run(async () => {
    if (otp.length !== 4) throw new Error('Enter the complete 4-digit OTP.');
    if (otpPurpose === 'login') {
      await apiRequest('/auth/verify-login-otp', { method: 'POST', body: JSON.stringify({ company_id: companyId.trim(), email: email.trim().toLowerCase(), otp }) });
      await onAuthenticated();
      return;
    }
    const registrationEmail = registration.email || email;
    const result = await apiRequest('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email: registrationEmail.trim().toLowerCase(), otp }) });
    if (otpPurpose === 'registration' && !result.user_exists) {
      setPassword(''); setScreen('setPassword'); setNotice('Email verified. Create your password.');
    } else {
      setEmail(registrationEmail); goLogin(); setNotice('Email verified. Login to continue.');
    }
  });

  const forgotPassword = () => run(async () => {
    if (!email.trim()) throw new Error('Enter your registered email address.');
    const result = await apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) });
    setNotice(result.message || 'Password reset link sent to your email.');
  });

  const register = () => run(async () => {
    if (!registration.company_name.trim() || !/^[A-Z0-9]{4}$/.test(registration.mpeda_registration_code.trim().toUpperCase()) || !registration.user_name.trim() || !registration.address.trim() || !/^\d{10}$/.test(registration.mobile) || !registration.email.trim()) throw new Error('Complete all required fields. MPEDA code must contain exactly 4 letters or numbers.');
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...registration,
        mpeda_registration_code: registration.mpeda_registration_code.trim().toUpperCase().replace(/\s+/g, ''),
      }),
    });
    setOtpPurpose('registration'); setOtp(''); setScreen('otp'); setNotice('Registration OTP sent to your email.');
  });

  const createPassword = () => run(async () => {
    if (password.length < 6) throw new Error('Password must contain at least 6 characters.');
    const result = await apiRequest('/auth/set-password', { method: 'POST', body: JSON.stringify({ email: registration.email.trim().toLowerCase(), password }) });
    setCreatedCompanyId(result.company_id || ''); setScreen('created'); setNotice('Company account created successfully.');
  });

  const heading = screen === 'register' ? 'Register company' : screen === 'otp' ? 'Verify OTP' : screen === 'forgot' ? 'Reset password' : screen === 'setPassword' ? 'Create password' : screen === 'created' ? 'Account created' : 'Welcome back';
  const subheading = screen === 'login' ? 'Sign in with your ERP tenant code.' : screen === 'otp' ? 'Enter the 4-digit code sent to your email.' : screen === 'register' ? 'Tenant code is generated by ERP; MPEDA code appears on reports and prints.' : screen === 'forgot' ? 'Receive a secure password reset link.' : screen === 'setPassword' ? 'Set a secure password for your account.' : 'Save your ERP tenant code for future logins.';

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.glowOne} /><View style={styles.glowTwo} />
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.brand}><Image source={require('../../assets/icon.png')} style={styles.brandIcon} /><View><Text style={styles.brandName}>SVBK ERP</Text><Text style={styles.brandSub}>SECURE ENTERPRISE WORKSPACE</Text></View></View>
      <View style={styles.card}>
        {screen !== 'login' && <Pressable onPress={goLogin} style={styles.back}><Text style={styles.backText}>‹  Back to login</Text></Pressable>}
        <Text style={[styles.serverBadge, IS_LIVE_API ? styles.liveServer : styles.localServer]}>{IS_LIVE_API ? 'LIVE SERVER' : 'LOCAL DEVELOPMENT'} • {API_URL}</Text>
        <View style={styles.shield}><Text style={styles.shieldText}>✓</Text></View>
        <Text style={styles.title}>{heading}</Text><Text style={styles.subtitle}>{subheading}</Text>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}

        {screen === 'login' && <View style={styles.form}>
          <Field label="ERP Tenant Code" value={companyId} onChangeText={value => setCompanyId(value.toUpperCase())} placeholder="Enter tenant code" autoCapitalize="characters" />
          <Field label="Official Email" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Enter password" secureTextEntry={!showPassword} maxLength={20} right={<Pressable onPress={() => setShowPassword(value => !value)} style={styles.eye}><Text style={styles.eyeText}>{showPassword ? 'HIDE' : 'SHOW'}</Text></Pressable>} />
          <Pressable onPress={() => { setScreen('forgot'); resetMessages(); }}><Text style={styles.forgot}>Forgot password?</Text></Pressable>
          <PrimaryButton label="Continue Securely" loading={loading} onPress={login} />
          <Text style={styles.switchText}>New company? <Text style={styles.link} onPress={() => { setScreen('register'); resetMessages(); }}>Register organisation</Text></Text>
        </View>}

        {screen === 'otp' && <View style={styles.form}><TextInput style={styles.otp} value={otp} onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" placeholderTextColor="#8391a7" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={4} autoFocus /><PrimaryButton label="Verify OTP" loading={loading} onPress={verifyOtp} /></View>}
        {screen === 'forgot' && <View style={styles.form}><Field label="Registered Email" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" /><PrimaryButton label="Send Reset Link" loading={loading} onPress={forgotPassword} /></View>}
        {screen === 'register' && <View style={styles.form}>
          <Field label="Company Name *" value={registration.company_name} onChangeText={value => setRegistration(current => ({ ...current, company_name: value }))} placeholder="Company name" autoCapitalize="words" />
          <Field label="MPEDA Registration Code *" value={registration.mpeda_registration_code} onChangeText={value => setRegistration(current => ({ ...current, mpeda_registration_code: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }))} placeholder="4-character code" autoCapitalize="characters" maxLength={4} />
          <Field label="Full Name *" value={registration.user_name} onChangeText={value => setRegistration(current => ({ ...current, user_name: value }))} placeholder="Administrator name" autoCapitalize="words" />
          <Field label="Designation" value={registration.designation} onChangeText={value => setRegistration(current => ({ ...current, designation: value }))} placeholder="Designation" autoCapitalize="words" />
          <Field label="Address *" value={registration.address} onChangeText={value => setRegistration(current => ({ ...current, address: value }))} placeholder="Company address" autoCapitalize="sentences" multiline />
          <Field label="Mobile *" value={registration.mobile} onChangeText={value => setRegistration(current => ({ ...current, mobile: value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit mobile number" keyboardType="phone-pad" maxLength={10} />
          <Field label="Official Email *" value={registration.email} onChangeText={value => setRegistration(current => ({ ...current, email: value }))} placeholder="name@company.com" keyboardType="email-address" />
          <PrimaryButton label="Send Verification OTP" loading={loading} onPress={register} />
        </View>}
        {screen === 'setPassword' && <View style={styles.form}><Field label="New Password" value={password} onChangeText={setPassword} placeholder="Minimum 6 characters" secureTextEntry={!showPassword} right={<Pressable onPress={() => setShowPassword(value => !value)} style={styles.eye}><Text style={styles.eyeText}>{showPassword ? 'HIDE' : 'SHOW'}</Text></Pressable>} /><PrimaryButton label="Create Account" loading={loading} onPress={createPassword} /></View>}
        {screen === 'created' && <View style={styles.created}><Text style={styles.createdLabel}>YOUR ERP TENANT CODE</Text><Text selectable style={styles.companyCode}>{createdCompanyId}</Text><Text style={styles.createdHelp}>Use this tenant code for login. MPEDA code is reserved for reports and prints.</Text><PrimaryButton label="Go to Login" loading={false} onPress={() => { setCompanyId(createdCompanyId); setEmail(registration.email); goLogin(); }} /></View>}
      </View>
      <Text style={styles.security}>✓ Secure OTP verification  •  Native mobile access</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function PrimaryButton({ label, loading, onPress }) {
  return <Pressable disabled={loading} onPress={onPress} style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, loading && styles.primaryDisabled]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}</Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f7fb' }, scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingTop: 28, paddingBottom: 24 }, glowOne: { position: 'absolute', top: -90, right: -70, width: 230, height: 230, borderRadius: 115, backgroundColor: '#dbeafe' }, glowTwo: { position: 'absolute', bottom: -120, left: -100, width: 270, height: 270, borderRadius: 135, backgroundColor: '#e0e7ff' },
  brand: { width: '100%', maxWidth: 440, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 18 }, brandIcon: { width: 44, height: 44, borderRadius: 13 }, brandName: { color: '#0f172a', fontSize: 16, fontWeight: '900' }, brandSub: { marginTop: 2, color: '#64748b', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 21, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 24, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: .1, shadowRadius: 25, elevation: 8 }, back: { alignSelf: 'flex-start', marginBottom: 9, paddingVertical: 5 }, backText: { color: '#64748b', fontSize: 11, fontWeight: '800' }, shield: { width: 46, height: 46, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#2563eb' }, shieldText: { color: '#fff', fontSize: 22, fontWeight: '900' }, title: { marginTop: 12, color: '#0f172a', fontSize: 24, fontWeight: '900', textAlign: 'center' }, subtitle: { marginTop: 6, marginBottom: 18, color: '#64748b', fontSize: 11, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  serverBadge: { alignSelf: 'center', maxWidth: '100%', marginBottom: 12, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderRadius: 999, fontSize: 8, fontWeight: '900' }, localServer: { borderColor: '#86efac', color: '#15803d', backgroundColor: '#f0fdf4' }, liveServer: { borderColor: '#fca5a5', color: '#b91c1c', backgroundColor: '#fef2f2' },
  notice: { marginBottom: 13, padding: 10, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, color: '#15803d', backgroundColor: '#f0fdf4', fontSize: 10, lineHeight: 15, fontWeight: '700' }, error: { marginBottom: 13, padding: 10, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, color: '#dc2626', backgroundColor: '#fef2f2', fontSize: 10, lineHeight: 15, fontWeight: '700' }, form: { gap: 13 }, field: { gap: 5 }, label: { marginLeft: 2, color: '#64748b', fontSize: 12, fontWeight: '900', letterSpacing: .5 }, inputShell: { minHeight: 51, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 13, backgroundColor: '#fff' }, multilineShell: { minHeight: 88, alignItems: 'flex-start' }, input: { flex: 1, height: 50, paddingHorizontal: 13, color: '#0f172a', fontSize: 14, fontWeight: '700' }, multilineInput: { height: 86, paddingTop: 13 }, eye: { height: 49, justifyContent: 'center', paddingHorizontal: 12 }, eyeText: { color: '#2563eb', fontSize: 11, fontWeight: '900' }, forgot: { alignSelf: 'flex-end', marginTop: -4, color: '#2563eb', fontSize: 10, fontWeight: '800' }, primary: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2563eb' }, primaryPressed: { backgroundColor: '#1d4ed8' }, primaryDisabled: { opacity: .65 }, primaryText: { color: '#fff', fontSize: 13, fontWeight: '900' }, switchText: { marginTop: 3, color: '#64748b', fontSize: 10, fontWeight: '600', textAlign: 'center' }, link: { color: '#2563eb', fontWeight: '900' }, otp: { height: 62, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 13, color: '#1d4ed8', backgroundColor: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 15, textAlign: 'center' }, created: { gap: 14 }, createdLabel: { color: '#64748b', fontSize: 12, fontWeight: '900', textAlign: 'center', letterSpacing: 1 }, companyCode: { padding: 15, borderWidth: 1, borderColor: '#2563eb', borderRadius: 13, color: '#1d4ed8', backgroundColor: '#eff6ff', fontSize: 23, fontWeight: '900', textAlign: 'center', letterSpacing: 1 }, createdHelp: { color: '#64748b', fontSize: 10, lineHeight: 16, textAlign: 'center' }, security: { marginTop: 17, color: '#64748b', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
