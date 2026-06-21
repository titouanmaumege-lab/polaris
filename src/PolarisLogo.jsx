// Logo POLARIS — étoile polaire / rose des vents, SVG vectoriel stylisé.
// Facettes lit/ombre pour relief 3D, halo néon cyan. Scalable + themable.
export default function PolarisLogo({ size = 52, glow = true, style }) {
  const uid = "plr"; // ids gradients/filtre (unique suffisant ici)
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      role="img" aria-label="Polaris"
      style={{ display: "block", overflow: "visible", ...style }}
    >
      <defs>
        <linearGradient id={`${uid}-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="0.55" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={`${uid}-dark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="0.6" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#0b1e54" />
        </linearGradient>
        <radialGradient id={`${uid}-ring`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.78" stopColor="#38bdf8" stopOpacity="0" />
          <stop offset="0.92" stopColor="#7dd3fc" stopOpacity="0.9" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        {glow && (
          <filter id={`${uid}-blur`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        )}
      </defs>

      {/* halo néon */}
      {glow && <circle cx="50" cy="50" r="46" fill={`url(#${uid}-ring)`} filter={`url(#${uid}-blur)`} />}
      <circle cx="50" cy="50" r="45.5" fill="none" stroke="#7dd3fc" strokeWidth="1" strokeOpacity="0.55" />

      {/* rose des vents : 4 branches cardinales (longues) + 4 diagonales (courtes) */}
      {/* chaque branche = 2 facettes (lit / ombre) pour le relief */}
      <g>
        {[0, 90, 180, 270].map(a => (
          <g key={`c${a}`} transform={`rotate(${a} 50 50)`}>
            <path d="M50 4 L46 46 L50 50 Z" fill={`url(#${uid}-lit)`} />
            <path d="M50 4 L54 46 L50 50 Z" fill={`url(#${uid}-dark)`} />
          </g>
        ))}
        {[45, 135, 225, 315].map(a => (
          <g key={`d${a}`} transform={`rotate(${a} 50 50)`}>
            <path d="M50 24 L47.5 47.5 L50 50 Z" fill={`url(#${uid}-lit)`} fillOpacity="0.85" />
            <path d="M50 24 L52.5 47.5 L50 50 Z" fill={`url(#${uid}-dark)`} fillOpacity="0.85" />
          </g>
        ))}
      </g>

      {/* moyeu central */}
      <circle cx="50" cy="50" r="3.4" fill="#e0f2fe" />
      <circle cx="50" cy="50" r="1.6" fill="#0ea5e9" />
    </svg>
  );
}
