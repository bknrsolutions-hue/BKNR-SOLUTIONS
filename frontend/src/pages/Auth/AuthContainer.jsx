import { useEffect, useRef } from 'react';

export default function AuthContainer({ handleLoginSuccess }) {
  const completedRef = useRef(false);

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
      src="/auth/landing"
      style={{ display: 'block', width: '100vw', height: '100vh', border: 0, background: '#060913' }}
    />
  );
}
