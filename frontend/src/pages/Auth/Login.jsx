import React, { useState } from 'react';
import { Layers } from 'lucide-react';

export default function Login({ handleLogin, navigateToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      alert('Please enter email and password.');
      return;
    }
    handleLogin(email, password);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ textAlign: 'center' }}>
          <div style={logoWrapperStyle}>
            <Layers size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '16px', color: 'var(--text-primary)' }}>
            BKNR ERP Corporate Login
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Enter credentials to access plant worksheets
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

          <button type="submit" className="btn btn-primary" style={{ height: '42px', marginTop: '8px' }}>
            Access Portal
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Don't have a registered entity?{' '}
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

const logoWrapperStyle = {
  width: '50px',
  height: '50px',
  borderRadius: '12px',
  background: 'var(--corp-dash)',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto'
};
