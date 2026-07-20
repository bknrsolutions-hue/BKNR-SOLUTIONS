import { useEffect, useRef } from 'react';

export default function AuthContainer({ handleLoginSuccess }) {
  const completedRef = useRef(false);
  const iframeRef = useRef(null);

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
      style={{ display: 'block', width: '100vw', height: '100vh', border: 0, background: '#060913' }}
    />
  );
}
