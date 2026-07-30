import React, { useState, useRef, useEffect } from 'react';

/**
 * Helper to parse addition/subtraction expressions into individual signed parts.
 * e.g. "25+30-5+10" -> [{ val: 25, sign: '+' }, { val: 30, sign: '+' }, { val: 5, sign: '-' }, { val: 10, sign: '+' }]
 */
export function parsePartsList(expr) {
  const cleaned = String(expr || '').replace(/\s+/g, '');
  if (!cleaned) return [];
  
  // Replace minus with +-, then split by +
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
 * ExpressionWeightInput
 * - Supports full math (+, -, *, /)
 * - Live preview while typing
 * - Press Enter or blur -> locks and saves numeric result
 * - Click locked chip -> shows breakdown list of parts (+, -)
 */
export default function ExpressionWeightInput({
  value,           // numeric string saved to parent state
  onChange,        // (numericString) => void
  onExprChange,    // (rawExpr) => void - optional, to store expression in DB
  placeholder = '0.00 or 25+30-5',
  required = false,
  className = 'form-control',
  style = {},
}) {
  const [raw, setRaw] = useState('');
  const [locked, setLocked] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const popupRef = useRef(null);

  const safeEval = (expr) => {
    const cleaned = String(expr || '').trim();
    if (!cleaned) return null;
    if (!/^[0-9+\-*/().\s]+$/.test(cleaned)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + cleaned + ')')();
      if (typeof result === 'number' && isFinite(result) && result >= 0) {
        return result;
      }
      return null;
    } catch {
      return null;
    }
  };

  const isExpr = (str) => /[+\-*/()]/.test(str);
  const liveResult = safeEval(raw);
  const hasLiveResult = liveResult !== null && isExpr(raw);

  useEffect(() => {
    if (!value || value === '0' || value === '') {
      setRaw('');
      setLocked(false);
      setShowBreakdown(false);
      setError('');
      if (onExprChange) onExprChange('');
    }
  }, [value]);

  useEffect(() => {
    if (!showBreakdown) return;
    const handleOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setShowBreakdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showBreakdown]);

  const commitValue = () => {
    if (!raw.trim()) return;
    if (isExpr(raw)) {
      const result = safeEval(raw);
      if (result === null) {
        setError('Invalid expression');
        return;
      }
      const numStr = result.toFixed(2);
      onChange(numStr);
      if (onExprChange) onExprChange(raw.trim());
      setError('');
      setLocked(true);
    } else {
      const num = parseFloat(raw);
      if (!isNaN(num) && num >= 0) {
        onChange(num.toFixed(2));
        if (onExprChange) onExprChange('');
        setError('');
        setLocked(true);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
    }
    if (e.key === 'Escape') {
      setRaw('');
      setError('');
    }
  };

  const handleUnlock = () => {
    setLocked(false);
    setShowBreakdown(false);
    setError('');
    if (!raw && value && value !== '0') {
      setRaw(value);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (locked && value && parseFloat(value) > 0) {
    const hasExpr = isExpr(raw);
    const partsList = hasExpr ? parsePartsList(raw) : [];

    return (
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: 'rgba(37,99,235,0.08)',
            border: '1px solid rgba(37,99,235,0.35)',
            borderRadius: '6px',
            cursor: hasExpr ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          onClick={() => hasExpr && setShowBreakdown(v => !v)}
        >
          <span style={{ fontWeight: '800', color: 'var(--corp-dash)', fontSize: '14px' }}>
            {parseFloat(value).toFixed(2)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>KG</span>
          {hasExpr && (
            <span style={{
              fontSize: '10px',
              background: 'rgba(37,99,235,0.18)',
              padding: '1px 7px',
              borderRadius: '10px',
              color: 'var(--corp-dash)',
              fontWeight: '700',
            }}>
              {partsList.length > 0 ? `${partsList.length} parts` : '= expression'}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleUnlock(); }}
            title="Edit"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              lineHeight: 1,
              padding: '0 2px',
            }}
          >✕</button>
        </div>

        {/* Breakdown popup */}
        {showBreakdown && hasExpr && (
          <div
            ref={popupRef}
            style={{
              position: 'absolute',
              top: '110%',
              left: 0,
              zIndex: 9999,
              background: 'var(--bg-card, #1e2433)',
              border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
              borderRadius: '8px',
              padding: '12px 16px',
              minWidth: '220px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--corp-dash)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Weight Breakdown Parts
            </div>
            
            {partsList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {partsList.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', borderBottom: '1px dashed rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Part {idx + 1}</span>
                    <span style={{ fontWeight: '700', color: item.sign === '-' ? '#ef4444' : '#16a34a' }}>
                      {item.sign} {item.val.toFixed(2)} KG
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px', wordBreak: 'break-all' }}>
                {raw}
              </div>
            )}

            <div style={{
              borderTop: '1px solid var(--border-light, rgba(255,255,255,0.1))',
              paddingTop: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: '800',
            }}>
              <span style={{ color: 'var(--corp-dash)' }}>Total Sum</span>
              <span style={{ color: 'var(--corp-dash)' }}>{parseFloat(value).toFixed(2)} KG</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className={className}
        style={{ ...style, borderColor: error ? '#ef4444' : undefined }}
        placeholder={placeholder}
        value={raw}
        required={required}
        onChange={e => {
          const cleaned = e.target.value.replace(/[^0-9+\-*/().\s]/g, '');
          setRaw(cleaned);
          setError('');
          if (!isExpr(cleaned)) {
            const n = parseFloat(cleaned);
            if (!isNaN(n)) onChange(n.toFixed(2));
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (raw.trim()) commitValue(); }}
      />

      {hasLiveResult && (
        <div style={{ fontSize: '11px', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>=</span>
          <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '13px' }}>
            {liveResult.toFixed(2)} KG
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            (press Enter to confirm)
          </span>
        </div>
      )}
      {error && (
        <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '3px' }}>{error}</div>
      )}
    </div>
  );
}
