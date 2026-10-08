import { useId } from 'react';
import PropTypes from 'prop-types';
import { IconButton } from './Button.jsx';

const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };

// Without onClose the modal can't be dismissed (e.g. word choice).
export default function Modal({ title, description, onClose, size = 'sm', className = '', children }) {
  const titleId = useId();

  return (
    <div
      className="animate-fade fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose ? (event) => { if (event.target === event.currentTarget) onClose(); } : undefined}
      onKeyDown={onClose ? (event) => { if (event.key === 'Escape') onClose(); } : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`animate-pop-in relative w-full ${widths[size]} rounded-card bg-white p-6 text-ink shadow-card sm:p-7 ${className}`}
      >
        {onClose && (
          <IconButton label="Close" icon="close" tooltip={false} onClick={onClose} className="absolute top-3 right-3 text-slate-500" />
        )}
        {title && (
          <div className="mb-5 pr-10">
            <h2 id={titleId} className="text-2xl font-black">{title}</h2>
            {description && <p className="mt-1 font-semibold text-slate-500">{description}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

Modal.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  onClose: PropTypes.func,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  children: PropTypes.node,
};
