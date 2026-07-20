import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Linking, StatusBar, StyleSheet, Text, View } from 'react-native';
import AnimatedBrandLogo from './src/components/AnimatedBrandLogo';
import NativeAuthScreen from './src/screens/NativeAuthScreen';
import NativeHomeScreen from './src/screens/NativeHomeScreen';
import NativeResetPassword from './src/screens/NativeResetPassword';
import { apiRequest, setSessionExpiredHandler } from './src/services/api';
import { API_URL } from './src/config';
import { ERPThemeProvider, useERPTheme } from './src/theme/ERPThemeContext';

export default function App() {
  return <ERPThemeProvider><AppContent /></ERPThemeProvider>;
}

function AppContent() {
  const { theme } = useERPTheme();
  const [sessionState, setSessionState] = useState('checking');
  const [user, setUser] = useState(null);
  const [resetToken, setResetToken] = useState('');

  const loadSession = useCallback(async ({ preserveOnError = false } = {}) => {
    try {
      const data = await apiRequest('/auth/session-info');
      if (data.authenticated) {
        setUser(data);
        await new Promise(resolve => setTimeout(resolve, 450));
        setSessionState('authenticated');
      } else {
        setUser(null);
        setSessionState('guest');
      }
    } catch {
      if (!preserveOnError) {
        setUser(null);
        setSessionState('guest');
      }
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => setSessionExpiredHandler(() => {
    setUser(null);
    setResetToken('');
    setSessionState('guest');
  }), []);
  useEffect(() => {
    if (sessionState !== 'authenticated') return undefined;
    const checkSession = () => { void loadSession({ preserveOnError: true }); };
    const interval = setInterval(checkSession, 15000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') checkSession();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadSession, sessionState]);
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (!url) return;
      const match = url.match(/[?&]token=([^&]+)/);
      if (url.startsWith('bknrerp://reset-password') && match) setResetToken(decodeURIComponent(match[1]));
    };
    Linking.getInitialURL().then(url => handleUrl({ url })).catch(() => {});
    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, []);

  const logout = async () => {
    try { await apiRequest('/auth/logout', { parseResponse: false }); } catch { /* Clear local state regardless. */ }
    setUser(null);
    setSessionState('guest');
  };

  if (sessionState === 'checking') {
    const companyName = user?.company_name || 'SVBK ERP';
    const companyLogo = user?.company_logo_url
      ? (/^https?:\/\//i.test(user.company_logo_url) ? user.company_logo_url : `${API_URL}${user.company_logo_url}`)
      : '';
    return <View style={styles.loading}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7fbff" />
      {companyLogo
        ? <Image source={{ uri: companyLogo }} resizeMode="contain" style={styles.tenantLogo} />
        : <AnimatedBrandLogo size={160} />}
      <View style={styles.loadingCopy}>
        <Text style={styles.loadingTitle}>{companyName}</Text>
        <Text style={styles.loadingText}>Opening secure workspace…</Text>
      </View>
    </View>;
  }
  if (resetToken) return <><StatusBar barStyle="dark-content" backgroundColor="#f4f7fb" /><NativeResetPassword token={resetToken} onComplete={() => { setResetToken(''); setSessionState('guest'); }} /></>;

  return <>
    <StatusBar
      barStyle={sessionState === 'authenticated' && theme.header !== '#ffffff' ? 'light-content' : 'dark-content'}
      backgroundColor={sessionState === 'authenticated' ? theme.header : '#f4f7fb'}
    />
    {sessionState === 'authenticated'
      ? <NativeHomeScreen
          user={user}
          onUserUpdated={profile => setUser(current => current ? { ...current, ...profile } : current)}
          onLogout={logout}
        />
      : <NativeAuthScreen onAuthenticated={loadSession} />}
  </>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f7fbff' },
  loadingCopy: { alignItems: 'center', marginTop: -4 },
  tenantLogo: { width: 150, height: 150, marginBottom: 4, borderRadius: 20 },
  loadingTitle: { color: '#075985', fontSize: 18, fontWeight: '900', letterSpacing: 1.8 },
  loadingText: { marginTop: 6, color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});
