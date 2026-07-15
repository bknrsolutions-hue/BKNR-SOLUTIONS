import { useCallback, useEffect, useRef } from 'react';

export default function AuthContainer({ handleLoginSuccess }) {
  const completedRef = useRef(false);

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
    const checkSession = async () => {
      if (completedRef.current || document.hidden) return;
      try {
        const response = await fetch('/auth/session-info', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json();
        if (data.authenticated) {
          completedRef.current = true;
          await handleLoginSuccess();
        }
      } catch {
        // Keep the embedded website usable while the backend reconnects.
      }
    };

    const timer = window.setInterval(checkSession, 1200);
    return () => window.clearInterval(timer);
  }, [handleLoginSuccess]);

  return (
    <iframe
      title="SVBK ERP Website and Login"
      src="/auth/login"
      onLoad={simplifyLoginPage}
      style={{ display: 'block', width: '100vw', height: '100vh', border: 0, background: '#060913' }}
    />
  );
}
