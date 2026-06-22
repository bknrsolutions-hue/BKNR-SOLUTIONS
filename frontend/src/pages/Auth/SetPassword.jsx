import React, { useState } from 'react';
import { Layers } from 'lucide-react';

export default function SetPassword({ handleSetPassword }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match. Please verify.');
      return;
    }
    handleSetPassword(password);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ textAlign: 'center' }}>
          <div style={logoWrapperStyle}>
            <Layers size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '16px', color: 'var(--text-primary)' }}>
            Establish Password
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Set a secure password for your corporate profile account
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>New Password</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Min 6 characters" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Re-enter password" 
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '42px', marginTop: '8px' }}>
            Complete Setup & Login
          </button>
        </form>
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
