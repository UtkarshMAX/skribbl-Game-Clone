import PropTypes from 'prop-types';

export const labelClass = 'text-sm font-extrabold text-slate-600';

const fieldClass =
  'h-12 w-full rounded-control bg-slate-100 px-4 font-bold text-ink ring-1 ring-transparent ' +
  'placeholder:font-semibold placeholder:text-slate-400 hover:bg-slate-200/60 ' +
  'focus:bg-white focus:ring-slate-200 transition-all duration-150';

function Field({ label, children }) {
  if (!label) return children;
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function Input({ label, className = '', ...props }) {
  return (
    <Field label={label}>
      <input className={`${fieldClass} ${className}`} {...props} />
    </Field>
  );
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <Field label={label}>
      <select className={`${fieldClass} cursor-pointer ${className}`} {...props}>
        {children}
      </select>
    </Field>
  );
}

Field.propTypes = { label: PropTypes.string, children: PropTypes.node };
Input.propTypes = { label: PropTypes.string, className: PropTypes.string };
Select.propTypes = { label: PropTypes.string, className: PropTypes.string, children: PropTypes.node };
