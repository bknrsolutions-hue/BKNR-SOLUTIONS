import { useState } from 'react';
import ErpRigAnimation from '../../components/ErpRigAnimation';

export default function Login({ handleLogin, navigateToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await handleLogin(email.trim(), password);
    } catch (err) {
      setError(err?.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <ErpRigAnimation />
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '16px', color: 'var(--text-primary)' }}>
            SVBK IT Solutions Corporate Login
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Enter your tenant credentials to access the seafood operations workspace
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>Official Email</label>
            <input 
              type="email" 
              className="form-control" 
              placeholder="name@company.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="••••••••" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required 
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '600' }}>{error}</div>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Authenticating...' : 'SEND OTP'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <span 
            onClick={navigateToRegister} 
            style={{ color: 'var(--corp-dash)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Register Here
          </span>
        </div>
      </div>
    </div>
  );
}
