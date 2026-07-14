import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { FRONTEND_URL } from '../config';

export default function WebViewScreen() {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState('');

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
    webViewRef.current?.reload();
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: FRONTEND_URL }}
        originWhitelist={['https://*', 'http://*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        userAgent="BKNR_ERP_Native_Mobile"
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => setError('')}
        onError={({ nativeEvent }) => {
          setError(nativeEvent.description || 'Unable to load BKNR ERP.');
        }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) {
            setError(`Server error (${nativeEvent.statusCode}). Please retry.`);
          }
        }}
        style={styles.webView}
      />

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
