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
 * Renders a table cell value with clickable expression breakdown list (+ and - parts).
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
          gap: '4px',
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
          borderRadius: '4px',
          padding: '1px 5px',
          fontWeight: '700',
          letterSpacing: '0.3px',
        }}>
          {partsList.length > 0 ? `${partsList.length} parts` : '∑'}
        </span>
      </button>

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
            border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
            borderRadius: '8px',
            padding: '12px 16px',
            minWidth: '220px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            textAlign: 'left'
          }}
        >
          <div style={{
            fontSize: '11px',
            fontWeight: '800',
            color: 'var(--corp-dash, #3b82f6)',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Weight Breakdown List
          </div>

          {partsList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {partsList.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '12px', padding: '3px 0', borderBottom: '1px dashed rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>Part {idx + 1}</span>
                  <span style={{ fontWeight: '700', color: item.sign === '-' ? '#ef4444' : '#16a34a' }}>
                    {item.sign} {item.val.toFixed(2)} {unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              color: 'var(--text-primary, #e2e8f0)',
              marginBottom: '8px',
              wordBreak: 'break-all',
            }}>
              {expr.trim()}
            </div>
          )}

          <div style={{
            borderTop: '1px solid var(--border-light, rgba(255,255,255,0.1))',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            fontWeight: '800',
          }}>
            <span style={{ color: 'var(--corp-dash, #3b82f6)' }}>Total Sum</span>
            <span style={{ color: 'var(--corp-dash, #3b82f6)' }}>{num.toFixed(2)} {unit}</span>
          </div>
        </div>
      )}
    </span>
  );
}
