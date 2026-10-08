import { useState } from 'react';
import PropTypes from 'prop-types';

const R = 20;
const C = 2 * Math.PI * R;

// Circular countdown. The full length is taken from the largest time seen,
// so it works without knowing the room's draw time.
export default function Timer({ time = 0 }) {
  const [max, setMax] = useState(time || 1);
  if (time > max) setMax(time);

  const fraction = Math.max(0, Math.min(1, time / max));
  const color = fraction > 0.5 ? '#3b82f6' : fraction > 0.2 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="relative size-14 shrink-0" role="timer" aria-label={`${time} seconds left`}>
      <svg viewBox="0 0 48 48" className="size-full -rotate-90">
        <circle cx="24" cy="24" r={R} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx="24" cy="24" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-black tabular-nums text-ink">{time}</span>
    </div>
  );
}

Timer.propTypes = { time: PropTypes.number };
