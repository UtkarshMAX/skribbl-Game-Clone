import PropTypes from 'prop-types';

export function Card({ as: Tag = 'div', animate = true, className = '', ...props }) {
  return <Tag className={`bg-white rounded-card shadow-card ${animate ? 'animate-rise' : ''} ${className}`} {...props} />;
}

// A card with a small titled header, used for the in-game side panels.
export function GamePanel({ title, meta, className = '', bodyClassName = '', children }) {
  return (
    <Card as="section" className={`flex flex-col overflow-hidden ${className}`} aria-label={title}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-ink">{title}</h2>
        {meta && <span className="text-xs font-bold text-slate-400">{meta}</span>}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </Card>
  );
}

Card.propTypes = {
  as: PropTypes.elementType,
  animate: PropTypes.bool,
  className: PropTypes.string,
};

GamePanel.propTypes = {
  title: PropTypes.string.isRequired,
  meta: PropTypes.node,
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
  children: PropTypes.node,
};
