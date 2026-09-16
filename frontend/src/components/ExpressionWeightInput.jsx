import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

export function parsePartsList(expr) {
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
 * BreakdownModal - Dual Mode (Light & Dark Theme Compatible)
 */
function BreakdownModal({ isOpen, onClose, partsList, rawExpr, totalSum, title = "Weight Expression Breakdown", unit = "KG" }) {
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredParts = partsList.filter((item, idx) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const strVal = `${item.sign}${item.val}`;
    const idxStr = `${idx + 1}`;
    return strVal.includes(term) || idxStr.includes(term);
  });

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(5px)',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, var(--bg-surface, #ffffff))',
          color: 'var(--text-primary, #0f172a)',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: partsList.length > 10 ? '540px' : '400px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-subtle, rgba(37,99,235,0.04))',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--corp-dash, #2563eb)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {title}
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
              {partsList.length} Total Parts Breakdown Entry List
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-hover, rgba(0,0,0,0.06))',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              color: 'var(--text-primary, #0f172a)',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        {partsList.length > 15 && (
          <div style={{ padding: '10px 20px 0 20px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search part value or #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ fontSize: '12px', height: '34px' }}
            />
          </div>
        )}

        {/* Modal Body - Multi Column Grid */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
        }}>
          {partsList.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: partsList.length > 10 ? 'repeat(2, 1fr)' : '1fr',
              gap: '6px 12px',
            }}>
              {filteredParts.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: item.sign === '-' ? 'rgba(239,68,68,0.08)' : 'rgba(22,163,74,0.08)',
                    border: `1px solid ${item.sign === '-' ? 'rgba(239,68,68,0.25)' : 'rgba(22,163,74,0.25)'}`,
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', fontWeight: '600' }}>
                    Part #{idx + 1}
                  </span>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: '800',
                    fontFamily: 'monospace',
                    color: item.sign === '-' ? '#dc2626' : '#16a34a',
                  }}>
                    {item.sign} {item.val.toFixed(2)} {unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              fontFamily: 'monospace',
              fontSize: '14px',
              color: 'var(--text-primary, #0f172a)',
              padding: '16px',
              background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
              borderRadius: '8px',
              wordBreak: 'break-all'
            }}>
              {rawExpr}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-light, #e2e8f0)',
          background: 'var(--bg-subtle, rgba(37,99,235,0.05))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase' }}>Formula</span>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary, #0f172a)', fontWeight: '700' }}>
              {rawExpr}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase' }}>Total Calculated Sum</span>
            <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--corp-dash, #2563eb)' }}>
              {totalSum} {unit}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}

/**
 * ExpressionWeightInput
 */
export default function ExpressionWeightInput({
  value,           // numeric string saved to parent state
  onChange,        // (numericString) => void
  onExprChange,    // (rawExpr) => void - optional
  placeholder = '0.00 or 25+30-5',
  required = false,
  className = 'form-control',
  style = {},
}) {
  const [raw, setRaw] = useState('');
  const [locked, setLocked] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

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
      setShowModal(false);
      setError('');
      if (onExprChange) onExprChange('');
    }
  }, [value]);

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
    setShowModal(false);
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
            padding: '5px 8px',
            background: 'rgba(37,99,235,0.08)',
            border: '1px solid rgba(37,99,235,0.35)',
            borderRadius: '6px',
            cursor: hasExpr ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          onClick={() => hasExpr && setShowModal(true)}
        >
          <span style={{ fontWeight: '800', color: 'var(--corp-dash, #2563eb)', fontSize: '13px' }}>
            {parseFloat(value).toFixed(2)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary, #64748b)' }}>KG</span>
          {hasExpr && (
            <span style={{
              fontSize: '10px',
              background: 'rgba(37,99,235,0.18)',
              padding: '1px 6px',
              borderRadius: '10px',
              color: 'var(--corp-dash, #2563eb)',
              fontWeight: '700',
            }}>
              {partsList.length > 0 ? `${partsList.length} parts` : '= expr'}
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
              color: 'var(--text-secondary, #64748b)',
              fontSize: '12px',
              lineHeight: 1,
              padding: '0 2px',
            }}
          >✕</button>
        </div>

        <BreakdownModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          partsList={partsList}
          rawExpr={raw}
          totalSum={parseFloat(value).toFixed(2)}
          unit="KG"
        />
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
          let cleaned = e.target.value.replace(/[^0-9+\-*/().\s]/g, '');
          cleaned = cleaned.replace(/([+\-*/])\s*([+\-*/])/g, '$2');
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
          <span style={{ color: 'var(--text-secondary, #64748b)' }}>=</span>
          <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '12px' }}>
            {liveResult.toFixed(2)} KG
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary, #64748b)' }}>
            (Enter to confirm)
          </span>
        </div>
      )}
      {error && (
        <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '3px' }}>{error}</div>
      )}
    </div>
  );
}
