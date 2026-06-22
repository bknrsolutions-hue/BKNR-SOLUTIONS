import React, { useState, useEffect } from 'react';

export default function GradeToHoso() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('');

  useEffect(() => {
    fetch('/criteria/api/grade_to_hoso')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const uniqueGrades = React.useMemo(() => {
    const grades = data.map(item => item.grade_name).filter(Boolean);
    return [...new Set(grades)].sort();
  }, [data]);

  const filteredData = React.useMemo(() => {
    if (!gradeFilter) return data;
    return data.filter(item => item.grade_name === gradeFilter);
  }, [data, gradeFilter]);

  return (
    <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="master-header">
        <div className="master-header-titles">
          <h2><i className="fa-solid fa-calculator"></i> Grade → HOSO / HLSO</h2>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>REPORT VIEW</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-solid fa-filter"></i> Filter by Grade:
          </label>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              fontSize: '12px',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              height: '32px',
              outline: 'none'
            }}
          >
            <option value="">All Grades</option>
            {uniqueGrades.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          <span>{filteredData.length}</span> records found
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Retrieving report data...</div>
      ) : filteredData.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--surface-panel)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          No Grade to HOSO conversion ratios configured.
        </div>
      ) : (
        <div className="master-table-wrap">
          <table className="master-table">
            <thead>
              <tr>
                <th className="master-th">Species</th>
                <th className="master-th">Grade</th>
                <th className="master-th">Variety</th>
                <th className="master-th">Glaze</th>
                <th className="master-th">HLSO Count</th>
                <th className="master-th">HOSO Count</th>
                <th className="master-th">NW Grade</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((r, idx) => (
                <tr key={idx} className="master-tr">
                  <td style={{ fontWeight: '600', padding: '10px 12px' }}>{r.species}</td>
                  <td style={{ padding: '10px 12px' }}>{r.grade_name}</td>
                  <td style={{ padding: '10px 12px' }}>{r.variety_name}</td>
                  <td style={{ padding: '10px 12px' }}>{r.glaze_name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: 'var(--corp-dash)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      {r.hlso_count}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {r.hoso_count ? (
                      <span style={{ background: 'var(--corp-ops)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                        {r.hoso_count}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Not Set</span>
                    )}
                  </td>
                  <td style={{ fontWeight: '700', color: 'var(--corp-fin)', padding: '10px 12px' }}>{r.nw_grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
