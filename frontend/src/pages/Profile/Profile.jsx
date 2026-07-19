import React, { useEffect, useState } from 'react';
import './Profile.css';

const emptyProfile = {
  name: '',
  employee_id: '',
  email: '',
  designation: '',
  date_of_birth: '',
  blood_group: '',
  working_location: '',
  address: '',
  company_name: '',
  role: '',
};

export default function Profile() {
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/auth/profile?format=json', { credentials: 'include', headers: { Accept: 'application/json' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Unable to load profile');
      setProfile({ ...emptyProfile, ...(result.profile || {}) });
    } catch (requestError) {
      setError(requestError.message || 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="user-profile-state">Loading profile…</div>;

  return <div className="user-profile-page">
    <section className="user-profile-hero">
      <div className="user-profile-avatar">{(profile.name || 'U').charAt(0).toUpperCase()}</div>
      <div><h1>{profile.name || 'My Profile'}</h1><p>{profile.email}</p><span>{profile.company_name} · {profile.role}</span></div>
    </section>
    <section className="user-profile-card">
      <div className="user-profile-title">Personal & Work Details</div>
      {error && <div className="user-profile-message error">{error}</div>}
      <div className="user-profile-list">
        <ProfileRow label="Name" icon="fa-user" value={profile.name} />
        <ProfileRow label="Employee ID" icon="fa-id-card" value={profile.employee_id} />
        <ProfileRow label="Login Email" icon="fa-envelope" value={profile.email} />
        <ProfileRow label="Designation" icon="fa-id-badge" value={profile.designation} />
        <ProfileRow label="Date of Birth" icon="fa-calendar" value={profile.date_of_birth} />
        <ProfileRow label="Blood Group" icon="fa-droplet" value={profile.blood_group} />
        <ProfileRow label="Working Location" icon="fa-location-dot" value={profile.working_location} />
        <ProfileRow label="Address" icon="fa-house" value={profile.address || 'Please update'} attention={!profile.address} />
      </div>
    </section>
  </div>;
}

function ProfileRow({ label, icon, value, attention = false }) {
  return <div className="user-profile-row"><span className="user-profile-row-icon"><i className={`fa-solid ${icon}`}></i></span><div><span>{label}</span><strong className={attention ? 'attention' : ''}>{value || '—'}</strong></div></div>;
}
