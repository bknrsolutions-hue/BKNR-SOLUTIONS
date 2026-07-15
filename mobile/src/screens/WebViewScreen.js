import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { FALLBACK_URL, FRONTEND_URL } from '../config';

const normalizeUrl = (url) => (url || '').replace(/\/+$/, '');

export default function WebViewScreen() {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sourceUrl, setSourceUrl] = useState(FRONTEND_URL);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack || !webViewRef.current) return false;
      webViewRef.current.goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  const retry = useCallback(() => {
    setError('');
    setLoading(true);
    if (usingFallback) {
      webViewRef.current?.reload();
      return;
    }
    setSourceUrl(FRONTEND_URL);
    webViewRef.current?.reload();
  }, [usingFallback]);

  const openFallback = useCallback(() => {
    if (usingFallback || normalizeUrl(sourceUrl) === normalizeUrl(FALLBACK_URL)) return false;
    setError('');
    setLoading(true);
    setUsingFallback(true);
    setSourceUrl(FALLBACK_URL);
    return true;
  }, [sourceUrl, usingFallback]);

  const handleHttpError = useCallback(({ nativeEvent }) => {
    const isCurrentDocument = normalizeUrl(nativeEvent.url) === normalizeUrl(sourceUrl);
    if (!isCurrentDocument || nativeEvent.statusCode < 400) return;

    if (openFallback()) return;

    setLoading(false);
    setError(`Server error (${nativeEvent.statusCode}). Please retry.`);
  }, [openFallback, sourceUrl]);

  const handleLoadError = useCallback(({ nativeEvent }) => {
    if (openFallback()) return;
    setLoading(false);
    setError(nativeEvent.description || 'Unable to load BKNR ERP.');
  }, [openFallback]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUrl }}
        originWhitelist={['https://*', 'http://*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        userAgent="BKNR_ERP_Native_Mobile"
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => {
          setError('');
          setLoading(true);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={handleLoadError}
        onHttpError={handleHttpError}
        style={styles.webView}
      />

      {loading && !error ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Opening BKNR ERP…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>Unable to open BKNR ERP</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060913' },
  webView: { flex: 1, backgroundColor: '#060913' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#060913',
  },
  loadingText: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  error: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#060913',
  },
  errorTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  errorText: { color: '#94a3b8', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryButton: { marginTop: 22, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563eb' },
  retryText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
