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
 * Compact high-density scrollable breakdown card supporting up to 100+ rows.
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

      {/* High-density scrollable breakdown card */}
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
            borderRadius: '8px',
            padding: '8px 12px',
            width: '230px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            textAlign: 'left'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '10px',
            fontWeight: '800',
            color: 'var(--corp-dash, #3b82f6)',
            borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.1))',
            paddingBottom: '4px',
            marginBottom: '6px',
            textTransform: 'uppercase',
          }}>
            <span>Parts Breakdown</span>
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{partsList.length} rows</span>
          </div>

          {/* Scrollable List (fits 100+ rows smoothly) */}
          {partsList.length > 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              maxHeight: '220px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}>
              {partsList.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                }}>
                  <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '10px' }}>#{idx + 1}</span>
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

          {/* Sticky Total Footer */}
          <div style={{
            borderTop: '1px solid var(--border-light, rgba(255,255,255,0.15))',
            marginTop: '6px',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            fontWeight: '800',
          }}>
            <span style={{ color: 'var(--text-primary, #e2e8f0)', fontSize: '11px' }}>Total Sum</span>
            <span style={{ color: 'var(--corp-dash, #3b82f6)' }}>{num.toFixed(2)} {unit}</span>
          </div>
        </div>
      )}
    </span>
  );
}
