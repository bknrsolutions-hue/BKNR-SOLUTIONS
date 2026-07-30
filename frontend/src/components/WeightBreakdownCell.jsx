import React, { useState, useRef, useEffect } from 'react';

function parsePartsList(expr) {
  const cleaned = String(expr || '').replace(/\s+/g, '');
  if (!cleaned) return [];
  
  const tokens = cleaned.replace(/-/g, '+-').split('+').filter(Boolean);
  const parts = [];
  
  for (const tok of tokens) {
    const num = parseFloat(tok);
    if (!isNaN(num)) {
      parts.push({
        val: Math.abs(num),
        sign: num < 0 ? '-' : '+',
        rawNum: num
      });
    }
  }
  return parts;
}

/**
 * WeightBreakdownCell
 * Multi-column grid breakdown card showing 25-30+ rows visible at once.
 */
export default function WeightBreakdownCell({ value, expr, unit = 'KG', style = {} }) {
  const [show, setShow] = useState(false);
  const popupRef = useRef(null);
  const num = parseFloat(value) || 0;
  const hasExpr = expr && expr.trim() && /[+\-*/()]/.test(expr.trim());

  useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  if (!hasExpr) {
    return (
      <span style={style}>
        {num.toFixed(2)}
      </span>
    );
  }

  const partsList = parsePartsList(expr);

  return (
    <span style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        title={`Expression: ${expr}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          color: 'inherit',
          fontWeight: 'inherit',
          fontSize: 'inherit',
        }}
      >
        <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: '3px', color: 'var(--corp-dash)' }}>
          {num.toFixed(2)}
        </span>
        <span style={{
          fontSize: '9px',
          background: 'rgba(37,99,235,0.15)',
          color: 'var(--corp-dash)',
          borderRadius: '3px',
          padding: '0 4px',
          fontWeight: '700',
          letterSpacing: '0.2px',
        }}>
          {partsList.length > 0 ? `${partsList.length}p` : '∑'}
        </span>
      </button>

      {/* Multi-Column Grid Breakdown Popup Card */}
      {show && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--bg-card, #1e2433)',
            border: '1px solid var(--border-light, rgba(255,255,255,0.15))',
            borderRadius: '10px',
            padding: '10px 14px',
            width: partsList.length > 15 ? '380px' : '260px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            whiteSpace: 'nowrap',
            textAlign: 'left'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: '800',
            color: 'var(--corp-dash, #3b82f6)',
            borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.1))',
            paddingBottom: '6px',
            marginBottom: '8px',
            textTransform: 'uppercase',
          }}>
            <span>Parts Breakdown</span>
            <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '10px' }}>{partsList.length} total entries</span>
          </div>

          {/* 2-Column Grid for high visibility (up to 30 rows visible at once) */}
          {partsList.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: partsList.length > 15 ? 'repeat(2, 1fr)' : '1fr',
              gap: '4px 10px',
              maxHeight: '340px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}>
              {partsList.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                  padding: '3px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '10px', fontWeight: '600' }}>#{idx + 1}</span>
                  <span style={{
                    fontWeight: '700',
                    fontFamily: 'monospace',
                    color: item.sign === '-' ? '#ef4444' : '#16a34a',
                  }}>
                    {item.sign}{item.val.toFixed(2)} {unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: 'var(--text-primary, #e2e8f0)',
              marginBottom: '6px',
              wordBreak: 'break-all',
            }}>
              {expr.trim()}
            </div>
          )}

          {/* Total Footer */}
          <div style={{
            borderTop: '1px solid var(--border-light, rgba(255,255,255,0.15))',
            marginTop: '8px',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            fontWeight: '800',
          }}>
            <span style={{ color: 'var(--text-primary, #e2e8f0)', fontSize: '11px' }}>Total Sum</span>
            <span style={{ color: 'var(--corp-dash, #3b82f6)', fontSize: '13px' }}>{num.toFixed(2)} {unit}</span>
          </div>
        </div>
      )}
    </span>
  );
}
