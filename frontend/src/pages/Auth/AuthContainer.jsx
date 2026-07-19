import { useCallback, useEffect, useRef } from 'react';

export default function AuthContainer({ handleLoginSuccess }) {
  const completedRef = useRef(false);
  const iframeRef = useRef(null);

  const simplifyLoginPage = useCallback((event) => {
    const iframe = event.currentTarget;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.head) return;

      const style = doc.createElement('style');
      style.dataset.reactLoginOverrides = 'true';
      style.textContent = `
        .site-shell::before,
        .site-shell::after,
        .login-3d-carousel { display: none !important; animation: none !important; }
        .login-showcase { display: none !important; }
        .login-section {
          grid-template-columns: minmax(300px, 520px) !important;
          justify-content: center !important;
          align-items: start !important;
        }
        .auth-panel { width: 100% !important; max-width: 520px !important; }
      `;
      doc.head.querySelector('[data-react-login-overrides]')?.remove();
      doc.head.appendChild(style);
    } catch {
      // The normal login page remains usable if iframe styling is unavailable.
    }
  }, []);

  useEffect(() => {
    const onAuthMessage = async (event) => {
      if (
        event.origin !== window.location.origin
        || event.source !== iframeRef.current?.contentWindow
        || event.data?.type !== 'BKNR_AUTH_SUCCESS'
        || completedRef.current
      ) return;

      completedRef.current = true;
      try {
        await handleLoginSuccess();
      } catch {
        // Allow another login-complete event if the session refresh failed.
        completedRef.current = false;
      }
    };

    window.addEventListener('message', onAuthMessage);
    return () => window.removeEventListener('message', onAuthMessage);
  }, [handleLoginSuccess]);

  return (
    <iframe
      ref={iframeRef}
      title="SVBK ERP Website and Login"
      src="/auth/login"
      onLoad={simplifyLoginPage}
      style={{ display: 'block', width: '100vw', height: '100vh', border: 0, background: '#060913' }}
    />
  );
}
