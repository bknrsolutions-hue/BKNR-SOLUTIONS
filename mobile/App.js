import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StatusBar, StyleSheet, Text, View } from 'react-native';
import NativeAuthScreen from './src/screens/NativeAuthScreen';
import NativeHomeScreen from './src/screens/NativeHomeScreen';
import NativeResetPassword from './src/screens/NativeResetPassword';
import { apiRequest } from './src/services/api';
import { ERPThemeProvider, useERPTheme } from './src/theme/ERPThemeContext';

export default function App() {
  return <ERPThemeProvider><AppContent /></ERPThemeProvider>;
}

function AppContent() {
  const { theme } = useERPTheme();
  const [sessionState, setSessionState] = useState('checking');
  const [user, setUser] = useState(null);
  const [resetToken, setResetToken] = useState('');

  const loadSession = useCallback(async () => {
    try {
      const data = await apiRequest('/auth/session-info');
      if (data.authenticated) {
        setUser(data);
        setSessionState('authenticated');
      } else {
        setUser(null);
        setSessionState('guest');
      }
    } catch {
      setUser(null);
      setSessionState('guest');
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);
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
    return <View style={styles.loading}><StatusBar barStyle="dark-content" backgroundColor="#f4f7fb" /><Image source={require('./assets/icon.png')} style={styles.logo} /><ActivityIndicator color="#2563eb" size="large" /><Text style={styles.loadingText}>Opening secure workspace…</Text></View>;
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#f4f7fb' },
  logo: { width: 64, height: 64, borderRadius: 18 },
  loadingText: { color: '#475569', fontSize: 14, fontWeight: '700' },
});
