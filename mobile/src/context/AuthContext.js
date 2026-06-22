import React, { createContext, useContext, useState, useCallback } from 'react';
import { BASE_URL } from '../config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { name, email, company, role }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [theme, setTheme] = useState('dark');
  const [filters, setFilters] = useState({ productionFor: '', plantLocation: '' });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const updateFilters = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // ── LOGIN ──────────────────────────────────────────────────
  const login = useCallback(async (companyId, email, password) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId.trim().toUpperCase(),
          email: email.trim(),
          password,
        }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Login failed. Check credentials.');
        return false;
      }

      setUser({
        name: data.name || email.split('@')[0],
        email,
        company: companyId.trim().toUpperCase(),
        role: data.role || 'user',
        setupCompleted: data.setup_completed,
        nextPage: data.next_page,
      });

      // Dynamically fetch and parse permissions & roles from /home
      try {
        const homeRes = await fetch(`${BASE_URL}/home`, {
          credentials: 'include',
        });
        const html = await homeRes.text();
        
        const permissionsMatch = html.match(/const permissions = (\[.*?\]);/);
        const roleMatch = html.match(/const currentUserRole = "(.*?)";/);
        
        let parsedPermissions = [];
        let parsedRole = 'user';
        
        if (permissionsMatch) {
          try {
            parsedPermissions = JSON.parse(permissionsMatch[1]);
          } catch (_) {}
        }
        if (roleMatch) {
          parsedRole = roleMatch[1];
        }

        setUser((prev) => prev ? {
          ...prev,
          role: parsedRole,
          permissions: parsedPermissions,
        } : null);
      } catch (e) {
        console.warn('Failed to parse user permissions:', e);
      }

      return true;
    } catch (err) {
      setError('Cannot reach server. Check network / IP address.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── LOGOUT ─────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        credentials: 'include',
      });
    } catch (_) {}
    setUser(null);
    setFilters({ productionFor: '', plantLocation: '' }); // Reset filters on logout
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        setError,
        login,
        logout,
        theme,
        toggleTheme,
        filters,
        updateFilters,
      }}
    >
      {children}
    </AuthContext.Provider>

  );
}

export function useAuth() {
  return useContext(AuthContext);
}
