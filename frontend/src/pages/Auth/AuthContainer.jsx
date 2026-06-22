import React, { useState } from 'react';

export default function AuthContainer({ handleLoginSuccess }) {
  const [box, setBox] = useState('login'); // 'login' | 'register' | 'otp' | 'password' | 'forgot'
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [password, setPassword] = useState('');

  // Register Fields
  const [regCompany, setRegCompany] = useState('');
  const [regName, setRegName] = useState('');
  const [regDesignation, setRegDesignation] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regEmailSuccess, setRegEmailSuccess] = useState('');

  // OTP Field
  const [otp, setOtp] = useState('');

  // Password Fields
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');

  // Forgot Password Field
  const [forgotEmail, setForgotEmail] = useState('');

  // Messages and Loader States
  const [regError, setRegError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passError, setPassError] = useState('');
  const [passOk, setPassOk] = useState('');
  const [loginError, setLoginError] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotOk, setForgotOk] = useState('');
  const [loading, setLoading] = useState(false);

  const showBox = (boxName) => {
    setBox(boxName);
    // Clear all errors and successes on box transition
    setRegError('');
    setOtpError('');
    setPassError('');
    setPassOk('');
    setLoginError('');
    setForgotError('');
    setForgotOk('');
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!companyId || !email || !password) {
      setLoginError('Please fill out all credentials.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId.trim(),
          email: email.trim().toLowerCase(),
          password: password.substring(0, 20)
        })
      });
      const data = await res.json();
      if (res.ok) {
        handleLoginSuccess();
      } else {
        setLoginError(data.detail || 'Invalid Credentials');
      }
    } catch (err) {
      setLoginError('Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setRegError('');
    if (!regCompany || !regName || !regEmail || !regPhone) {
      setRegError('Please fill out all required fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: regCompany.trim(),
          user_name: regName.trim(),
          designation: regDesignation.trim(),
          address: regAddress.trim(),
          mobile: regPhone.trim(),
          email: regEmail.trim().toLowerCase()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setRegEmailSuccess(regEmail.trim().toLowerCase());
        showBox('otp');
      } else {
        let errorMsg = 'Registration failed';
        if (data.detail) {
          errorMsg = Array.isArray(data.detail) ? data.detail[0].msg : data.detail;
        }
        setRegError(errorMsg);
      }
    } catch (err) {
      setRegError('Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setOtpError('');
    if (otp.length !== 4) {
      setOtpError('Enter 4-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmailSuccess,
          otp: otp.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        showBox('password');
      } else {
        setOtpError(data.detail || 'Invalid OTP');
      }
    } catch (err) {
      setOtpError('Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassOk('');
    if (!pass1 || pass1 !== pass2) {
      setPassError('Passwords do not match!');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmailSuccess,
          password: pass1.substring(0, 20)
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPassOk(`Account created! Company ID: <b>${data.company_id}</b><br>Please use this ID to Login.`);
        setTimeout(() => {
          showBox('login');
        }, 5000);
      } else {
        setPassError(data.detail || 'Failed to set password');
      }
    } catch (err) {
      setPassError('Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotOk('');
    if (!forgotEmail) {
      setForgotError('Please enter registered email.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setForgotOk('Reset link sent to your email.');
      } else {
        setForgotError(data.detail || 'Failed to send reset link');
      }
    } catch (err) {
      setForgotError('Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={wrapperStyle}>
      {/* Left Column: Premium Executive Value Proposition (CEO Facing) */}
      <div style={brandingSideStyle}>
        <h1 style={titleStyle}>BKNR ERP</h1>
        <div style={subtitleStyle}>Next-Gen Operational Intelligence for Seafood Enterprises</div>
        
        <p style={descStyle}>
          BKNR ERP transforms traditional seafood processing facilities into data-driven, highly optimized enterprise ecosystems. Engineered specifically to meet the high-stakes demands of enterprise executives and CEOs, the platform unifies production tracking, integrated HRMS protocols, cold storage metrics, and deep economic analytics into a single pane of glass.
        </p>

        <div style={gridStyle}>
          <div style={gridCardStyle}>
            <h4 style={cardHeaderStyle}>Centralized Oversight</h4>
            <p style={cardDescStyle}>Monitor multi-plant performance, live floor balances, and inventory margins in real-time.</p>
          </div>
          <div style={gridCardStyle}>
            <h4 style={cardHeaderStyle}>Leakage Elimination</h4>
            <p style={cardDescStyle}>Enforce end-to-end auditability over grading yields, workforce overheads, and process conversions.</p>
          </div>
          <div style={gridCardStyle}>
            <h4 style={cardHeaderStyle}>Manpower Intelligence</h4>
            <p style={cardDescStyle}>Track floor operations dynamically with integrated live-workforce attendance metrics.</p>
          </div>
          <div style={gridCardStyle}>
            <h4 style={cardHeaderStyle}>Enterprise Control</h4>
            <p style={cardDescStyle}>Scale effortlessly with automated multi-company filters and rigorous asset security models.</p>
          </div>
        </div>

        <div style={dividerStyle}></div>

        <div style={featureTitleStyle}>1. Multi-Company Command Architecture</div>
        <p style={descStyle}>
          Manage your entire corporate footprint from a single centralized database environment. Perfect for enterprise groups operating across multiple processing facilities or geographical branches.
        </p>
        <ul style={featureListStyle}>
          <li style={listItemStyle}>
            <strong>Company-Wise Data Insulation:</strong> Global backend filtering layers automatically scope and restrict data matrices by authenticated firm payload, ensuring total multi-tenant security.
          </li>
          <li style={listItemStyle}>
            <strong>Isolated Enterprise Routing:</strong> Secure structural separation maps specific database queries dynamically per enterprise entity to avoid visibility overlap.
          </li>
          <li style={listItemStyle}>
            <strong>Role-Based Delegation:</strong> Empower managers with plant-specific credentials while maintaining complete executive access at the group level.
          </li>
        </ul>

        <div style={commitmentStyle}>
          <h4 style={commitHeaderStyle}>Our Core Commitment</h4>
          <p style={commitDescStyle}>"visualising a shared path of technological progress and collective operational excellence."</p>
        </div>

        <div style={brandingFooterStyle}>BKNR ERP – Enterprise Security Ecosystem</div>
      </div>

      {/* Right Column: Ultra-Compact Premium Authentication Gate Matrix */}
      <div style={formSideStyle}>
        <div style={formContainerStyle}>
          
          {/* 1. Register Card */}
          {box === 'register' && (
            <div style={cardStyle}>
              <h2 style={formTitleStyle}>Company Registration</h2>
              <p style={formSubtitleStyle}>Provide your firm parameters to fetch unique activation keys.</p>
              <form onSubmit={submitRegister}>
                <div style={groupStyle}>
                  <label style={labelStyle}>Company Name</label>
                  <input type="text" style={inputStyle} value={regCompany} onChange={e => setRegCompany(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Your Name</label>
                  <input type="text" style={inputStyle} value={regName} onChange={e => setRegName(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Designation</label>
                  <input type="text" style={inputStyle} value={regDesignation} onChange={e => setRegDesignation(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Phone Number</label>
                  <input type="tel" pattern="[0-9]{10}" title="Must be exactly 10 digits" style={inputStyle} value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="10-digit number" required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" style={inputStyle} value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Company Address</label>
                  <textarea rows="2" style={textStyle} value={regAddress} onChange={e => setRegAddress(e.target.value)} required />
                </div>
                <button type="submit" style={btnStyle} disabled={loading}>
                  {loading ? 'Processing...' : 'Send OTP'}
                </button>
              </form>
              {regError && <div style={errorStyle}>{regError}</div>}
              <div style={linkStyle}>
                Already Registered? <span onClick={() => showBox('login')} style={linkItemStyle}>Login</span>
              </div>
            </div>
          )}

          {/* 2. OTP Verification Card */}
          {box === 'otp' && (
            <div style={cardStyle}>
              <h2 style={formTitleStyle}>OTP Verification</h2>
              <p style={formSubtitleStyle}>A 4-digit token handshake has been deployed to your corporate inbox.</p>
              <form onSubmit={submitOtp}>
                <div style={groupStyle}>
                  <label style={labelStyle}>Enter OTP</label>
                  <input 
                    type="text" 
                    maxLength="4" 
                    style={otpInputStyle} 
                    value={otp} 
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    required 
                  />
                </div>
                <button type="submit" style={btnStyle} disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>
              </form>
              {otpError && <div style={errorStyle}>{otpError}</div>}
            </div>
          )}

          {/* 3. Set Login Password Card */}
          {box === 'password' && (
            <div style={cardStyle}>
              <h2 style={formTitleStyle}>Set Login Password</h2>
              <p style={formSubtitleStyle}>Establish structural encryption keys to guard corporate ledgers.</p>
              <form onSubmit={submitPassword}>
                <div style={groupStyle}>
                  <label style={labelStyle}>Password (max 20 chars)</label>
                  <input type="password" maxLength="20" style={inputStyle} value={pass1} onChange={e => setPass1(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Confirm Password</label>
                  <input type="password" maxLength="20" style={inputStyle} value={pass2} onChange={e => setPass2(e.target.value)} required />
                </div>
                <button type="submit" style={btnStyle} disabled={loading}>
                  {loading ? 'Saving...' : 'Save Password'}
                </button>
              </form>
              {passError && <div style={errorStyle}>{passError}</div>}
              {passOk && <div style={successStyle} dangerouslySetInnerHTML={{ __html: passOk }}></div>}
            </div>
          )}

          {/* 4. Login Card (Gateway Authentication) */}
          {box === 'login' && (
            <div style={cardStyle}>
              <h2 style={formTitleStyle}>Gateway Authentication</h2>
              <p style={formSubtitleStyle}>Provide secure credentials to hook into BKNR architecture pools.</p>
              <form onSubmit={submitLogin}>
                <div style={groupStyle}>
                  <label style={labelStyle}>Company ID</label>
                  <input type="text" style={inputStyle} value={companyId} onChange={e => setCompanyId(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Password</label>
                  <input type="password" maxLength="20" style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <button type="submit" style={btnStyle} disabled={loading}>
                  {loading ? 'Authenticating...' : 'Login'}
                </button>
              </form>
              {loginError && <div style={errorStyle}>{loginError}</div>}
              <div style={linkStyle}>
                <span onClick={() => showBox('register')} style={linkItemStyle}>Register</span> |{' '}
                <span onClick={() => showBox('forgot')} style={linkItemStyle}>Forgot Password?</span>
              </div>
            </div>
          )}

          {/* 5. Password Recovery Card */}
          {box === 'forgot' && (
            <div style={cardStyle}>
              <h2 style={formTitleStyle}>Password Recovery</h2>
              <p style={formSubtitleStyle}>Enter your registered email to request a secure password configuration asset.</p>
              <form onSubmit={submitForgot}>
                <div style={groupStyle}>
                  <label style={labelStyle}>Registered Email</label>
                  <input type="email" style={inputStyle} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                </div>
                <button type="submit" style={btnStyle} disabled={loading}>
                  {loading ? 'Processing...' : 'Send Reset Link'}
                </button>
              </form>
              {forgotError && <div style={errorStyle}>{forgotError}</div>}
              {forgotOk && <div style={successStyle}>{forgotOk}</div>}
              <div style={linkStyle}>
                <span onClick={() => showBox('login')} style={linkItemStyle}>Back to Login</span>
              </div>
            </div>
          )}

        </div>

        {/* Legal Disclaimer Box */}
        <div style={disclaimerBoxStyle}>
          <strong>⚠️ SECURE WORKSPACE DISCLAIMER:</strong> This enterprise portal is guarded by strict institutional access control mechanisms. All ecosystem interactions are recorded in live ledger contexts. Unauthorized traversal attempts trigger instant endpoint lockouts and network blocklisting. For information security compliance, idle sessions automatically self-terminate after 30 minutes of inactivity to protect localized state data.
        </div>
      </div>
    </div>
  );
}

// Strategic Styling Constants mapping login.html exactly
const wrapperStyle = {
  display: 'flex',
  width: '100vw',
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 75%, #cbd5e1 100%)',
  color: '#0f172a'
};

const brandingSideStyle = {
  flex: 1.6,
  background: 'rgba(255, 255, 255, 0.4)',
  backdropFilter: 'blur(20px)',
  padding: '4rem 4.5rem',
  overflowY: 'auto',
  height: '100vh',
  borderRight: '1px solid rgba(15, 23, 42, 0.06)'
};

const formSideStyle = {
  width: '440px',
  background: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(10px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '3.5rem 2.5rem 2rem 2.5rem',
  height: '100vh',
  overflowY: 'auto',
  borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
  boxShadow: '-15px 0 50px rgba(15, 23, 42, 0.04)',
  flexShrink: 0
};

const titleStyle = {
  fontSize: '2.6rem',
  fontWeight: 800,
  marginBottom: '0.25rem',
  letterSpacing: '-0.04em',
  lineHeight: 1.1
};

const subtitleStyle = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#004b93',
  marginBottom: '2rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em'
};

const descStyle = {
  fontSize: '0.85rem',
  color: '#475569',
  lineHeight: 1.65,
  marginBottom: '1.2rem',
  textAlign: 'justify'
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '1rem',
  marginTop: '1.25rem',
  marginBottom: '1.25rem'
};

const gridCardStyle = {
  background: 'rgba(255, 255, 255, 0.6)',
  border: '1px solid rgba(15, 23, 42, 0.05)',
  padding: '1.1rem',
  borderRadius: '8px'
};

const cardHeaderStyle = {
  margin: '0 0 0.3rem 0',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#004b93',
  textTransform: 'uppercase'
};

const cardDescStyle = {
  margin: 0,
  fontSize: '0.75rem',
  color: '#475569',
  lineHeight: '1.45'
};

const dividerStyle = {
  height: '1px',
  background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0) 100%)',
  margin: '1.75rem 0'
};

const featureTitleStyle = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#0f172a',
  marginTop: '1.75rem',
  marginBottom: '0.6rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderLeft: '3px solid #004b93',
  paddingLeft: '10px'
};

const featureListStyle = {
  listStyle: 'none',
  paddingLeft: 0,
  margin: '0 0 1.2rem 0'
};

const listItemStyle = {
  fontSize: '0.8rem',
  color: '#475569',
  marginBottom: '0.5rem',
  lineHeight: 1.55,
  display: 'flex',
  alignItems: 'flex-start'
};

const commitmentStyle = {
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  color: '#ffffff',
  padding: '1.25rem',
  borderRadius: '8px',
  marginTop: '2rem',
  textAlign: 'center'
};

const commitHeaderStyle = {
  margin: '0 0 0.3rem 0',
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#38bdf8'
};

const commitDescStyle = {
  margin: 0,
  fontSize: '0.78rem',
  lineHeight: 1.5,
  color: '#cbd5e1',
  fontStyle: 'italic',
  fontWeight: 300
};

const brandingFooterStyle = {
  fontSize: '0.68rem',
  fontWeight: 600,
  color: '#94a3b8',
  marginTop: '2.5rem',
  textAlign: 'center',
  paddingTop: '1.25rem',
  borderTop: '1px dashed rgba(15, 23, 42, 0.08)',
  letterSpacing: '1.5px',
  textTransform: 'uppercase'
};

const formContainerStyle = {
  width: '100%',
  margin: 'auto 0'
};

const cardStyle = {
  width: '100%'
};

const formTitleStyle = {
  fontSize: '1.35rem',
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: '0.3rem',
  textAlign: 'center',
  letterSpacing: '-0.03em'
};

const formSubtitleStyle = {
  fontSize: '0.8rem',
  color: '#475569',
  marginBottom: '1.75rem',
  textAlign: 'center',
  lineHeight: 1.4,
  fontWeight: 400
};

const groupStyle = {
  marginBottom: '1.1rem',
  display: 'flex',
  flexDirection: 'column'
};

const labelStyle = {
  fontSize: '0.75rem',
  color: '#0f172a',
  fontWeight: 600,
  marginBottom: '0.35rem',
  display: 'block'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  fontSize: '0.88rem',
  color: '#0f172a',
  background: '#f8fafc',
  outline: 'none',
  boxSizing: 'border-box'
};

const otpInputStyle = {
  ...inputStyle,
  textAlign: 'center',
  fontSize: '1.4rem',
  letterSpacing: '0.3rem'
};

const textStyle = {
  ...inputStyle,
  resize: 'none',
  height: '60px'
};

const btnStyle = {
  background: '#002b5c',
  color: '#fff',
  width: '100%',
  marginTop: '0.5rem',
  padding: '11px',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.88rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0, 43, 92, 0.1)',
  transition: 'all 0.2s ease'
};

const linkStyle = {
  marginTop: '1.25rem',
  textAlign: 'center',
  fontSize: '0.78rem',
  color: '#475569'
};

const linkItemStyle = {
  cursor: 'pointer',
  color: '#004b93',
  fontWeight: 600
};

const disclaimerBoxStyle = {
  marginTop: '2rem',
  paddingTop: '1rem',
  borderTop: '1px solid rgba(15, 23, 42, 0.05)',
  fontSize: '0.65rem',
  color: '#94a3b8',
  lineHeight: 1.5,
  textAlign: 'justify'
};

const msgStyle = {
  padding: '10px',
  marginTop: '12px',
  borderRadius: '6px',
  textAlign: 'center',
  fontSize: '0.78rem',
  lineHeight: '1.4',
  fontWeight: '600',
  boxSizing: 'border-box'
};

const errorStyle = {
  ...msgStyle,
  background: '#fef2f2',
  color: '#991b1b',
  border: '1px solid rgba(153, 27, 27, 0.08)'
};

const successStyle = {
  ...msgStyle,
  background: '#f0fdf4',
  color: '#166534',
  border: '1px solid rgba(22, 101, 52, 0.08)'
};
