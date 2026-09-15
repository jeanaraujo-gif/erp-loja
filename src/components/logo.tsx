export function LogoIcon({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="logo-svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="goldSun" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5dc7a" />
          <stop offset="50%" stopColor="#cf9e29" />
          <stop offset="100%" stopColor="#a37611" />
        </linearGradient>
        <linearGradient id="fieldGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#256e48" />
          <stop offset="50%" stopColor="#154930" />
          <stop offset="100%" stopColor="#0d3120" />
        </linearGradient>
        <linearGradient id="leafGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3ca266" />
          <stop offset="100%" stopColor="#185c37" />
        </linearGradient>
      </defs>

      {/* Sun rays */}
      <g stroke="url(#goldSun)" strokeWidth="3" strokeLinecap="round">
        <line x1="50" y1="18" x2="50" y2="8" />
        <line x1="39" y1="21" x2="33" y2="13" />
        <line x1="61" y1="21" x2="67" y2="13" />
        <line x1="30" y1="28" x2="21" y2="23" />
        <line x1="70" y1="28" x2="79" y2="23" />
        <line x1="24" y1="38" x2="13" y2="37" />
        <line x1="76" y1="38" x2="87" y2="37" />
      </g>

      {/* Rising Sun */}
      <circle cx="50" cy="38" r="14" fill="url(#goldSun)" />

      {/* Leaves on right */}
      <path
        d="M72 32 C 77 24, 85 24, 86 32 C 86 39, 78 40, 72 32 Z"
        fill="url(#leafGreen)"
      />
      <path
        d="M67 36 C 70 28, 77 30, 76 37 C 75 42, 69 42, 67 36 Z"
        fill="url(#fieldGreen)"
      />

      {/* Rolling Hills / Crop rows */}
      <path
        d="M12 55 Q 32 46, 50 50 Q 68 54, 88 47 L 88 53 Q 68 60, 50 56 Q 32 52, 12 61 Z"
        fill="url(#fieldGreen)"
      />
      <path
        d="M10 64 Q 30 55, 50 59 Q 70 63, 90 56 L 90 62 Q 70 69, 50 65 Q 30 61, 10 70 Z"
        fill="url(#fieldGreen)"
      />
      <path
        d="M8 73 Q 30 64, 50 68 Q 70 72, 92 65 L 92 72 Q 70 79, 50 75 Q 30 71, 8 80 Z"
        fill="url(#leafGreen)"
      />
      <path
        d="M6 83 Q 30 74, 50 78 Q 70 82, 94 75 L 94 84 Q 70 91, 50 87 Q 30 83, 6 92 Z"
        fill="url(#fieldGreen)"
      />
    </svg>
  );
}

export function BrandBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-badge ${compact ? 'compact' : ''}`}>
      <div className="brand-logo-wrap">
        <img
          src="/logo.jpg"
          alt="Essência do Campo"
          className="brand-logo-thumb"
        />
      </div>
      <div className="brand-text">
        <span className="brand-name">essência</span>
        <span className="brand-sub">do campo</span>
      </div>
    </div>
  );
}
