import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { BASE_URL } from '../config';
import { Feather } from '@expo/vector-icons';

function ERPSkeleton() {
  const shimmer = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({ inputRange: [-1, 1], outputRange: [-320, 320] });
  const Block = ({ style }) => (
    <View style={[styles.skeletonBlock, style]}>
      <Animated.View style={[styles.skeletonShine, { transform: [{ translateX }] }]} />
    </View>
  );

  return (
    <View style={styles.skeletonCard} accessibilityRole="progressbar" accessibilityLabel="Loading workspace">
      <View style={styles.skeletonHeader}><Block style={styles.skeletonLogo} /><Block style={styles.skeletonTitle} /></View>
      <View style={styles.skeletonFilters}><Block style={styles.skeletonFilter} /><Block style={styles.skeletonFilter} /></View>
      <View style={styles.skeletonMetrics}><Block style={styles.skeletonMetric} /><Block style={styles.skeletonMetric} /><Block style={styles.skeletonMetric} /></View>
      <View style={styles.skeletonTable}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={[styles.skeletonRow, row === 3 && styles.skeletonLastRow]}>
            <Block style={styles.skeletonCellWide} /><Block style={styles.skeletonCell} /><Block style={styles.skeletonCellSmall} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function WebViewScreen({ navigation, route }) {
  const { logout } = useAuth();
  const webViewRef = useRef(null);
  
  // Support both: direct URL open (from HomeScreen) or fallback to /home
  const paramUrl = route?.params?.url;
  const paramTitle = route?.params?.title;

  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(paramUrl || `${BASE_URL}/home`);
  const [pageTitle, setPageTitle] = useState(paramTitle || 'BKNR ERP');
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');

  // Share session cookies: WKWebView (iOS) & CookieManager (Android) sync automatically
  // when sharedCookiesEnabled={true} is set on the WebView component.

  // Handle Android Hardware Back Button
  useEffect(() => {
    const handleBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // prevent default back behavior (exit app)
      }
      return false; // use default back behavior
    };

    if (Platform.OS === 'android') {
      BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    }
    return () => {
      if (Platform.OS === 'android') {
        BackHandler.removeEventListener('hardwareBackPress', handleBackPress);
      }
    };
  }, [canGoBack]);

  // Intercept navigation & check session state/logout redirect
  const handleNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);

    // If webview redirects to "/" or login screen or logout endpoint,
    // sync and clear auth context natively to display native login.
    const url = navState.url.toLowerCase();
    const serverUrl = BASE_URL.toLowerCase();

    // Match root login redirects or explicit logout
    if (
      url === `${serverUrl}/` ||
      url === `${serverUrl}/auth/login` ||
      url.includes('/auth/logout') ||
      (url.startsWith(serverUrl) && !navState.loading && url.includes('login'))
    ) {
      console.log('WebView redirect to login/logout detected. Syncing auth context...');
      logout();
    }
  }, [logout]);

  // Handle errors
  const handleError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    setHasError(true);
    setErrorDetails(nativeEvent.description || 'Connection refused or server offline.');
    setLoading(false);
  };

  const handleRetry = () => {
    setHasError(false);
    setLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const injectedJS = `
    (function() {
      const style = document.createElement('style');
      style.type = 'text/css';
      style.innerHTML = 'html, body, * { overscroll-behavior: none !important; overscroll-behavior-y: none !important; }';
      document.head.appendChild(style);
    })();
    true;
  `;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#060913" />

      {/* Main WebView or Error Fallback */}
      {!hasError ? (
        <WebView
          ref={webViewRef}
          source={{ uri: `${BASE_URL}/home` }}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          domStorageEnabled={true}
          javaScriptEnabled={true}
          bounces={false}
          overScrollMode="never"
          injectedJavaScript={injectedJS}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => {
            setLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => {
            setLoading(false);
          }}
          onError={handleError}
          onHttpError={handleError}
          style={styles.webview}
          // Optional: User-agent customization if server expects mobile header
          userAgent="BKNR_ERP_Mobile_App_WebView"
        />
      ) : (
        <View style={styles.errorContainer}>
          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <Feather name="wifi-off" size={40} color="#ef4444" />
            </View>
            <Text style={styles.errorTitle}>Connection Failed</Text>
            <Text style={styles.errorText}>
              Unable to connect to BKNR ERP. Please check if the server is running at {BASE_URL} and your device has internet/LAN access.
            </Text>
            {!!errorDetails && (
              <Text style={styles.errorDetailText}>Details: {errorDetails}</Text>
            )}
            
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Feather name="refresh-cw" size={16} color="#ffffff" />
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <Feather name="log-out" size={16} color="#94a3b8" />
              <Text style={styles.logoutBtnText}>Return to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading Overlay */}
      {loading && !hasError && (
        <View style={styles.loadingContainer}>
          <ERPSkeleton />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060913',
  },
  webview: {
    flex: 1,
    backgroundColor: '#060913',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 9, 19, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  skeletonCard: {
    width: '88%', maxWidth: 380, padding: 14, gap: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#263247', backgroundColor: '#111827',
  },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#263247' },
  skeletonFilters: { flexDirection: 'row', gap: 7 },
  skeletonFilter: { flex: 1, height: 32, borderRadius: 7 },
  skeletonMetrics: { flexDirection: 'row', gap: 7 },
  skeletonBlock: { overflow: 'hidden', backgroundColor: '#263247', borderRadius: 6 },
  skeletonShine: { position: 'absolute', top: 0, bottom: 0, width: 90, backgroundColor: 'rgba(100, 116, 139, 0.28)' },
  skeletonLogo: { width: 28, height: 28, borderRadius: 7 },
  skeletonTitle: { width: '38%', height: 10, borderRadius: 5 },
  skeletonMetric: { flex: 1, height: 40, borderRadius: 7 },
  skeletonTable: { borderWidth: 1, borderColor: '#263247', borderRadius: 7, overflow: 'hidden' },
  skeletonRow: { minHeight: 27, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#263247' },
  skeletonLastRow: { borderBottomWidth: 0 },
  skeletonCellWide: { flex: 1.5, height: 6, borderRadius: 4 },
  skeletonCell: { flex: 0.9, height: 6, borderRadius: 4 },
  skeletonCellSmall: { flex: 0.55, height: 6, borderRadius: 4 },
  errorContainer: {
    flex: 1,
    backgroundColor: '#060913',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  errorTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  errorDetailText: {
    color: '#ef4444',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    padding: 8,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 12,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 44,
  },
  logoutBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
});
