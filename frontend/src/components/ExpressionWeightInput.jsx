import React, { useState, useRef, useEffect } from 'react';

/**
 * ExpressionWeightInput
 * - Type "25+30+45" → shows live "= 100.00" preview
 * - Press Enter or blur → locks the field, saves numeric sum via onChange
 * - Click the locked sum chip → shows breakdown tooltip
 * - Once locked, field is readonly; click the ✕ chip to unlock
 */
export default function ExpressionWeightInput({
  value,           // numeric string saved to parent state
  onChange,        // (numericString) => void
  placeholder = '0.00 or 25+30+45',
  label = '',
  required = false,
  className = 'form-control',
  style = {},
}) {
  const [raw, setRaw] = useState('');       // raw expression while typing
  const [locked, setLocked] = useState(false); // locked after Enter/blur
  const [showBreakdown, setShowBreakdown] = useState(false);
  const inputRef = useRef(null);
  const popupRef = useRef(null);

  // Parse expression: only digits, dots, spaces, + signs
  const parseExpr = (expr) => {
    const clean = String(expr || '').replace(/[^0-9.+]/g, '');
    if (!clean) return { parts: [], sum: 0, valid: false };
    const parts = clean.split('+').map(p => parseFloat(p) || 0);
    const sum = parts.reduce((a, b) => a + b, 0);
    return { parts, sum, valid: parts.length > 0 };
  };

  const { parts, sum: liveSum, valid } = parseExpr(raw);
  const isExpression = raw.includes('+');

  // Sync from parent value when it changes externally (e.g. form clear)
  useEffect(() => {
    if (!value || value === '0' || value === '') {
      setRaw('');
      setLocked(false);
      setShowBreakdown(false);
    }
  }, [value]);

  // Close breakdown on outside click
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
    const { sum } = parseExpr(raw);
    const numStr = sum.toFixed(2);
    onChange(numStr);
    setLocked(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
    }
  };

  const handleUnlock = () => {
    setLocked(false);
    setShowBreakdown(false);
    setRaw(value && value !== '0' ? value : '');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ---- LOCKED STATE: show chip with sum, click = breakdown ----
  if (locked && value && parseFloat(value) > 0) {
    const breakdownParts = raw.includes('+') ? parts : [parseFloat(value)];
    return (
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: 'rgba(37,99,235,0.1)',
            border: '1px solid rgba(37,99,235,0.4)',
            borderRadius: '6px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setShowBreakdown(v => !v)}
        >
          <span style={{ fontWeight: '800', color: 'var(--corp-dash)', fontSize: '14px' }}>
            {parseFloat(value).toFixed(2)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>KG</span>
          {raw.includes('+') && (
            <span style={{
              fontSize: '10px',
              background: 'rgba(37,99,235,0.2)',
              padding: '1px 6px',
              borderRadius: '10px',
              color: 'var(--corp-dash)',
              fontWeight: '700',
            }}>
              {breakdownParts.length} parts
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleUnlock(); }}
            title="Edit weight"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              lineHeight: 1,
              padding: '0 2px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Breakdown Tooltip */}
        {showBreakdown && raw.includes('+') && (
          <div
            ref={popupRef}
            style={{
              position: 'absolute',
              top: '110%',
              left: 0,
              zIndex: 9999,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '10px 14px',
              minWidth: '160px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Weight Breakdown
            </div>
            {breakdownParts.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '12px', padding: '2px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Part {i + 1}</span>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{p.toFixed(2)} KG</span>
              </div>
            ))}
            <div style={{
              borderTop: '1px solid var(--border-light)',
              marginTop: '6px',
              paddingTop: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              fontWeight: '800',
            }}>
              <span style={{ color: 'var(--corp-dash)' }}>Total</span>
              <span style={{ color: 'var(--corp-dash)' }}>{parseFloat(value).toFixed(2)} KG</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- EDITING STATE ----
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className={className}
        style={style}
        placeholder={placeholder}
        value={raw}
        required={required}
        onChange={e => {
          // allow digits, dots, +, spaces only
          const cleaned = e.target.value.replace(/[^0-9.+\s]/g, '');
          setRaw(cleaned);
          if (!cleaned.includes('+')) {
            // Direct number — pass to parent immediately
            onChange(cleaned);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (raw.includes('+') && valid) {
            commitValue();
          }
        }}
      />
      {/* Live preview for expression */}
      {isExpression && valid && (
        <div style={{
          fontSize: '11px',
          marginTop: '3px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>=</span>
          <span style={{ fontWeight: '800', color: '#16a34a' }}>{liveSum.toFixed(2)} KG</span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            ({parts.length} parts — press Enter to confirm)
          </span>
        </div>
      )}
    </div>
  );
}
