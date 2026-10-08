import PropTypes from 'prop-types';

const tones = {
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-rose-100 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
};

export default function Badge({ tone = 'slate', caps = true, className = '', children }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-badge px-2 text-[11px] font-black ${caps ? 'uppercase tracking-wide' : ''} ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

Badge.propTypes = {
  tone: PropTypes.oneOf(['amber', 'blue', 'green', 'red', 'slate']),
  caps: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};
