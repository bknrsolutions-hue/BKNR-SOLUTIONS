import './AnimatedBrandLogo.css';

const BRAND_LOGO_URL = `${import.meta.env.BASE_URL || '/'}svbk-it-solutions-logo-3d-transparent.png`.replace(/\/+/g, '/');

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
      <img className="brand-logo-single" src={BRAND_LOGO_URL} alt={label} />
    </span>
  );
}
