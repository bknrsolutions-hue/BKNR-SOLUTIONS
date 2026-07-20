import React, { useState, useEffect, useMemo } from 'react';
import './bknr-masters.css';

export default function GradeToHoso() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = () => {
    setLoading(true);
    fetch('/criteria/api/grade_to_hoso')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const uniqueGrades = useMemo(() => {
    const grades = data.map(item => item.grade_name).filter(Boolean);
    return [...new Set(grades)].sort();
  }, [data]);

  const filteredData = useMemo(() => {
    let result = [...data];
    if (gradeFilter) {
      result = result.filter(item => item.grade_name === gradeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        String(r.species || '').toLowerCase().includes(q) ||
        String(r.grade_name || '').toLowerCase().includes(q) ||
        String(r.variety_name || '').toLowerCase().includes(q) ||
        String(r.glaze_name || '').toLowerCase().includes(q) ||
        String(r.hlso_count || '').toLowerCase().includes(q) ||
        String(r.hoso_count || '').toLowerCase().includes(q) ||
        String(r.nw_grade || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, gradeFilter, searchQuery]);

  return (
    <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="master-header">
        <div className="master-header-titles">
          <h2><i className="fa-solid fa-calculator"></i> Grade → HOSO / HLSO</h2>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          REPORT VIEW
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-filter"></i> Filter by Grade:
            </label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                height: '34px',
                outline: 'none'
              }}
            >
              <option value="">All Grades</option>
              {uniqueGrades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative', width: '220px' }}>
            <input
              type="text"
              placeholder="Search matrix records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '32px',
                paddingRight: '10px',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                fontSize: '12px',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
            <i className="fa-solid fa-magnify" style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-tertiary)', fontSize: '12px' }}></i>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700 }}>
          <span style={{ color: 'var(--corp-dash)', fontWeight: 900 }}>{filteredData.length}</span> records found
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>Retrieving report data...</div>
      ) : filteredData.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--surface-panel)', border: '1px solid var(--border-light)', borderRadius: '12px', fontWeight: 700 }}>
          No Grade to HOSO conversion ratios configured.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="bknr-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th className="text-left">Species</th>
                <th className="text-left">Grade</th>
                <th className="text-left">Variety</th>
                <th className="text-left">Glaze</th>
                <th className="text-center">HLSO Count</th>
                <th className="text-center">HOSO Count</th>
                <th className="text-center">NW Grade</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((r, idx) => (
                <tr key={r.id || idx}>
                  <td className="text-left" style={{ fontWeight: '800', color: 'var(--text-primary)' }}>{r.species}</td>
                  <td className="text-left" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{r.grade_name}</td>
                  <td className="text-left" style={{ fontWeight: '600' }}>{r.variety_name}</td>
                  <td className="text-left" style={{ fontWeight: '600' }}>{r.glaze_name}</td>
                  <td className="text-center">
                    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: '11px', fontWeight: 900 }}>
                      {r.hlso_count}
                    </span>
                  </td>
                  <td className="text-center">
                    {r.hoso_count ? (
                      <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '6px', backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '11px', fontWeight: 900 }}>
                        {r.hoso_count}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600 }}>Not Set</span>
                    )}
                  </td>
                  <td className="text-center" style={{ fontWeight: '900', color: '#d97706' }}>{r.nw_grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
