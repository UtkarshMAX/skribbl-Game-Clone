import PropTypes from 'prop-types';

// Shows on mouse hover and on keyboard focus; positioning lives in index.css (.tooltip-bubble).
// Pass `id` to reference the text from the wrapped control via aria-describedby.
export default function Tooltip({ text, children, id, className = '' }) {
  return (
    <span className={`tooltip relative inline-flex ${className}`}>
      {children}
      <span role="tooltip" id={id} className="tooltip-bubble">{text}</span>
    </span>
  );
}

Tooltip.propTypes = {
  text: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  id: PropTypes.string,
  className: PropTypes.string,
};
