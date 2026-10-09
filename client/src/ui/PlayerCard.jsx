import PropTypes from 'prop-types';
import Avatar from './Avatar.jsx';
import Badge from './Badge.jsx';
import Score from './Score.jsx';
import PlayerMenu from './PlayerMenu.jsx';
import { displayName } from './displayName.js';

export default function PlayerCard({ player, isHost, isDrawing, isYou, isReady, rank, showScore = true, actions = [], className = '' }) {
  const isSpectator = !!player.isSpectator;
  return (
    <div
      className={`animate-slide-in flex min-w-0 items-center gap-3 rounded-control p-2.5 transition-colors duration-300
        ${isDrawing ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-slate-50'} ${className}`}
    >
      {rank != null && <span className="w-7 shrink-0 text-center text-sm font-black text-slate-400">#{rank}</span>}
      <Avatar emoji={player.avatar || '😀'} highlight={isDrawing} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-extrabold text-ink">{displayName(player.name)}</span>
          {isYou && <span className="shrink-0 text-xs font-bold text-slate-400">(you)</span>}
        </div>
        {(isHost || isDrawing || isSpectator || isReady !== undefined) && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {isHost && <Badge tone="amber">Host</Badge>}
            {isDrawing && <Badge tone="blue">Drawing</Badge>}
            {isSpectator && <Badge tone="slate">👁 Spectator</Badge>}
            {!isSpectator && isReady === true && <Badge tone="green">✓ Ready</Badge>}
            {!isSpectator && isReady === false && <Badge tone="slate">Not ready</Badge>}
          </div>
        )}
      </div>

      {showScore && !isSpectator && <Score value={player.score ?? 0} className="shrink-0 text-sm" />}
      <PlayerMenu playerName={displayName(player.name)} actions={actions} />
    </div>
  );
}

PlayerCard.propTypes = {
  player: PropTypes.shape({
    name: PropTypes.string,
    avatar: PropTypes.string,
    score: PropTypes.number,
  }).isRequired,
  isHost: PropTypes.bool,
  isDrawing: PropTypes.bool,
  isYou: PropTypes.bool,
  isReady: PropTypes.bool, // undefined = don't show ready state (outside the lobby)
  rank: PropTypes.number,
  showScore: PropTypes.bool,
  actions: PropTypes.array, // [{ label, icon, onClick, danger }] for the "⋯" menu
  className: PropTypes.string,
};
