import React, { useState } from 'react';
import { Layers } from 'lucide-react';

export default function VerifyOtp({ email, handleVerify, navigateToRegister }) {
  const [otp, setOtp] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      alert('Please enter a valid 6-digit OTP code.');
      return;
    }
    handleVerify(otp);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ textAlign: 'center' }}>
          <div style={logoWrapperStyle}>
            <Layers size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '16px', color: 'var(--text-primary)' }}>
            Enter OTP Code
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            We've sent a 6-digit validation OTP to <strong>{email || 'your email'}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>OTP Code</label>
            <input 
              type="text" 
              maxLength="6"
              className="form-control" 
              placeholder="e.g. 123456" 
              style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '8px', fontWeight: '800' }}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              required 
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '42px', marginTop: '8px' }}>
            Verify OTP Code
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Entered wrong details?{' '}
          <span 
            onClick={navigateToRegister} 
            style={{ color: 'var(--corp-dash)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Go Back
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
