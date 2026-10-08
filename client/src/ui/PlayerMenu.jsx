import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { IconButton } from './Button.jsx';

/**
 * Small "⋯" menu on a player card (kick, ban, vote kick, report).
 * Closes on outside click, Escape, or after choosing an action.
 */
export default function PlayerMenu({ playerName, actions }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;
        const onDown = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!actions.length) return null;

    return (
        <div ref={ref} className="relative shrink-0">
            <IconButton label={`Actions for ${playerName}`} icon="more_horiz" tooltip={false}
                aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
                className="size-9 text-slate-500" onClick={() => setOpen((v) => !v)} />
            {open && (
                <div id={menuId} role="menu" className="animate-pop-in absolute right-0 top-10 z-30 min-w-40 rounded-control bg-white p-1 shadow-card ring-1 ring-slate-200">
                    {actions.map(({ label, icon, onClick, danger }) => (
                        <button key={label} type="button" role="menuitem"
                            onClick={() => { setOpen(false); onClick(); }}
                            className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-bold cursor-pointer
                                ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-ink hover:bg-slate-100'}`}>
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

PlayerMenu.propTypes = {
    playerName: PropTypes.string.isRequired,
    actions: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        icon: PropTypes.string.isRequired,
        onClick: PropTypes.func.isRequired,
        danger: PropTypes.bool,
    })).isRequired,
};
