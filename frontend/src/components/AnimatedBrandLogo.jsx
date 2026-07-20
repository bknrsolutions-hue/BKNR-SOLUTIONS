import './AnimatedBrandLogo.css';

const PARTS = ['top', 'upper', 'middle', 'lower', 'diamond'];
const BRAND_LOGO_URL = `${import.meta.env.BASE_URL}brand-dp-3d.png`;

export default function AnimatedBrandLogo({
  size = 72,
  className = '',
  loop = false,
  label = 'SVBK ERP',
}) {
  return (
    <span
      className={`brand-logo-assembly ${loop ? 'brand-logo-loop' : ''} ${className}`.trim()}
      style={{ '--brand-logo-size': `${size}px` }}
      role="img"
      aria-label={label}
    >
      <img className="brand-logo-final" src={BRAND_LOGO_URL} alt="" aria-hidden="true" />
      {PARTS.map(part => (
        <span key={part} className={`brand-logo-part brand-logo-part-${part}`} aria-hidden="true">
          <img src={BRAND_LOGO_URL} alt="" />
        </span>
      ))}
    </span>
  );
}
