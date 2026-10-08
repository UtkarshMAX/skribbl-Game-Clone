import PropTypes from 'prop-types';

const sizes = { sm: 'text-2xl', lg: 'text-5xl' };

export default function Logo({ size = 'lg', className = '' }) {
  return (
    <span className={`font-black tracking-tight text-ink ${sizes[size]} ${className}`}>
      scribble<span className="text-amber-400">.</span>
    </span>
  );
}

Logo.propTypes = { size: PropTypes.oneOf(['sm', 'lg']), className: PropTypes.string };
