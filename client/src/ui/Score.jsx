import PropTypes from 'prop-types';

// Re-keyed on every change so the pop animation replays when the score updates.
export default function Score({ value = 0, suffix = 'pts', className = '' }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-black text-ink ${className}`}>
      <span key={value} className="animate-score inline-block tabular-nums">{value}</span>
      {suffix && <span className="text-xs font-bold text-slate-400">{suffix}</span>}
    </span>
  );
}

Score.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  suffix: PropTypes.string,
  className: PropTypes.string,
};
