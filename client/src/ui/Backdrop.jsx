// Shared decorative background behind every screen: dot grid, two drifting
// glows and a handful of floating doodles. Purely visual.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

const doodles = [
  { style: { top: '12%', left: '9%', color: '#f59e0b' }, d: 'M12 2l2.6 6.9L22 12l-7.4 3.1L12 22l-2.6-6.9L2 12l7.4-3.1z', size: 30 },
  { style: { top: '18%', right: '10%', color: '#3b82f6', animationDuration: '11s', animationDelay: '-3s' }, d: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3', size: 34 },
  { style: { top: '58%', left: '5%', color: '#3b82f6', animationDuration: '12s', animationDelay: '-6s' }, d: 'M2 14c3-6 5-6 7 0s4 6 7 0 4-6 6 0', size: 40 },
  { style: { bottom: '10%', left: '22%', color: '#fbbf24', animationDuration: '8s', animationDelay: '-5s' }, circle: true, size: 16 },
  { style: { bottom: '18%', right: '7%', color: '#f59e0b', animationDuration: '10s', animationDelay: '-2s' }, d: 'M4 5h16v10H10l-5 4v-4H4z', size: 32 },
  { style: { top: '42%', right: '4%', color: '#93c5fd', animationDuration: '13s', animationDelay: '-8s' }, d: 'M12 3v18M3 12h18', size: 22 },
  { style: { top: '6%', left: '46%', color: '#fcd34d', animationDuration: '9.5s', animationDelay: '-4s' }, circle: true, size: 12 },
];

export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="backdrop-blob backdrop-blob-a" />
      <span className="backdrop-blob backdrop-blob-b" />
      {doodles.map((doodle, i) => (
        <span key={i} className="doodle" style={doodle.style}>
          <svg width={doodle.size} height={doodle.size} viewBox="0 0 24 24">
            {doodle.circle
              ? <circle cx="12" cy="12" r="10" fill="currentColor" />
              : <path d={doodle.d} {...stroke} />}
          </svg>
        </span>
      ))}
    </div>
  );
}
