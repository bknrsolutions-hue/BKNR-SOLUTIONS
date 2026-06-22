import React, { useState } from 'react';
import { Layers } from 'lucide-react';

export default function Register({ handleRegister, navigateToLogin }) {
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!companyName || !fullName || !email || !phone) {
      alert('Please fill in all required fields.');
      return;
    }
    handleRegister({ companyName, fullName, designation, email, phone });
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: '460px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={logoWrapperStyle}>
            <Layers size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '16px', color: 'var(--text-primary)' }}>
            Register Your Corporate Entity
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Set up credentials for your plants and centers
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label>Company Name *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. BKNR Seafoods" 
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label>Full Name *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. Nagaraju" 
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label>Designation</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. Plant Manager" 
              value={designation}
              onChange={e => setDesignation(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Official Email *</label>
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
            <label>Phone Number *</label>
            <input 
              type="tel" 
              className="form-control" 
              placeholder="e.g. 9876543210" 
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '42px', marginTop: '10px' }}>
            Send Verification OTP
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Already registered?{' '}
          <span 
            onClick={navigateToLogin} 
            style={{ color: 'var(--corp-dash)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Login here
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
