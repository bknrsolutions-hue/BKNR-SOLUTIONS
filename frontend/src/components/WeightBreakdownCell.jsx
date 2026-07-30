import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

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
 * BreakdownModal
 * Rendered in document.body via Portal to prevent table clipping or overflow hidden cutoff.
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
        background: 'rgba(0, 0, 0, 0.68)',
        backdropFilter: 'blur(5px)',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #1e2433)',
          border: '1px solid var(--border-light, rgba(255,255,255,0.18))',
          borderRadius: '14px',
          width: '100%',
          maxWidth: partsList.length > 10 ? '540px' : '400px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.12))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--corp-dash, #3b82f6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {title}
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px' }}>
              {partsList.length} Total Parts Breakdown Entry List
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              color: 'var(--text-primary, #fff)',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Filter Search (for 15+ entries) */}
        {partsList.length > 15 && (
          <div style={{ padding: '10px 20px 0 20px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search part value or #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ fontSize: '12px', height: '34px', background: 'rgba(0,0,0,0.2)' }}
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
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', fontWeight: '600' }}>
                    Part #{idx + 1}
                  </span>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: '800',
                    fontFamily: 'monospace',
                    color: item.sign === '-' ? '#ef4444' : '#16a34a',
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
              color: 'var(--text-primary)',
              padding: '16px',
              background: 'rgba(0,0,0,0.2)',
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
          borderTop: '1px solid var(--border-light, rgba(255,255,255,0.12))',
          background: 'rgba(37,99,235,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Formula</span>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary, #fff)', fontWeight: '700' }}>
              {rawExpr}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Total Calculated Sum</span>
            <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--corp-dash, #3b82f6)' }}>
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
 * WeightBreakdownCell
 * Renders a table cell value with clickable Center Modal Popup Dialog.
 */
export default function WeightBreakdownCell({ value, expr, unit = 'KG', style = {} }) {
  const [showModal, setShowModal] = useState(false);
  const num = parseFloat(value) || 0;
  const hasExpr = expr && expr.trim() && /[+\-*/()]/.test(expr.trim());

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
        onClick={() => setShowModal(true)}
        title={`Click to view breakdown: ${expr}`}
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
          background: 'rgba(37,99,235,0.18)',
          color: 'var(--corp-dash)',
          borderRadius: '4px',
          padding: '1px 5px',
          fontWeight: '700',
          letterSpacing: '0.2px',
        }}>
          {partsList.length > 0 ? `${partsList.length} parts` : '∑'}
        </span>
      </button>

      {/* Center Modal Popup Portal */}
      <BreakdownModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        partsList={partsList}
        rawExpr={expr}
        totalSum={num.toFixed(2)}
        unit={unit}
      />
    </span>
  );
}
