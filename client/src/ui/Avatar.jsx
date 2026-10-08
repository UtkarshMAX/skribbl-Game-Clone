import PropTypes from 'prop-types';

const sizes = {
  sm: 'size-9 text-xl',
  md: 'size-11 text-2xl',
  lg: 'size-16 text-4xl',
  xl: 'size-28 text-6xl',
};

export default function Avatar({ emoji = '😀', size = 'md', highlight = false, className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`avatar shrink-0 grid place-items-center rounded-full bg-blue-50 select-none ${sizes[size]}
        ${highlight ? 'ring-2 ring-amber-400 ring-offset-2' : ''} ${className}`}
    >
      {emoji}
    </div>
  );
}

Avatar.propTypes = {
  emoji: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  highlight: PropTypes.bool,
  className: PropTypes.string,
};
