import PropTypes from 'prop-types';
import Tooltip from './Tooltip.jsx';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-extrabold cursor-pointer select-none ' +
  'transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none';

const variants = {
  primary:
    'bg-amber-400 text-ink shadow-[0_4px_0_var(--color-amber-600)] hover:bg-amber-300 hover:-translate-y-0.5 ' +
    'hover:shadow-[0_6px_0_var(--color-amber-600)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-amber-600)]',
  secondary:
    'bg-white text-ink shadow-soft ring-1 ring-slate-200/80 hover:-translate-y-0.5 hover:bg-blue-50 ' +
    'hover:ring-blue-200 active:translate-y-0 active:scale-[0.98]',
  ghost: 'text-ink hover:bg-slate-100 active:scale-95',
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-8 text-xl',
};

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }) {
  return <button type={type} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

export const PrimaryButton = (props) => <Button variant="primary" {...props} />;
export const SecondaryButton = (props) => <Button variant="secondary" {...props} />;

export function IconButton({ label, icon, active, tooltip = true, className = '', ...props }) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={`size-11 shrink-0 grid place-items-center rounded-control cursor-pointer transition-all duration-150 active:scale-90
        ${active ? 'bg-ink text-white shadow-soft' : 'text-ink hover:bg-slate-100 hover:-translate-y-0.5'} ${className}`}
      {...props}
    >
      {typeof icon === 'string' ? <span className="material-symbols-outlined" aria-hidden="true">{icon}</span> : icon}
    </button>
  );
  return tooltip ? <Tooltip text={label}>{button}</Tooltip> : button;
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  type: PropTypes.string,
};

IconButton.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  active: PropTypes.bool,
  tooltip: PropTypes.bool,
  className: PropTypes.string,
};
