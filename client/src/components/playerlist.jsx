import PropTypes from 'prop-types';
import socket from '../socket/socket';
import { GamePanel, PlayerCard } from '../ui';
import usePlayerActions from './usePlayerActions.jsx';

// Players (scores, drawer, host) and, separately, spectators (no score).
const PlayerList = (props) => {

    const players = props.players || [];
    const spectators = props.spectators || [];
    const { actionsFor, dialog } = usePlayerActions(props.roomCode, props.hostId, props.isSpectator);

    const card = (member) => (
        <PlayerCard key={member.id} player={member}
            isHost={member.id === props.hostId}
            isDrawing={member.id === props.drawerId}
            isYou={member.id === socket.id}
            actions={actionsFor(member)} />
    );

    return (
        <>
            <GamePanel title="Players" meta={`${players.length} playing`} className="h-full"
                bodyClassName="flex flex-col gap-3 p-3 lg:overflow-y-auto">
                <div className="grid content-start grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                    {players.map(card)}
                </div>
                {spectators.length > 0 && (
                    <section aria-label="Spectators">
                        <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Spectators · {spectators.length}</h3>
                        <div className="grid content-start grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                            {spectators.map(card)}
                        </div>
                    </section>
                )}
            </GamePanel>
            {dialog}
        </>
    );
};

PlayerList.propTypes = {
    players: PropTypes.array,
    spectators: PropTypes.array,
    hostId: PropTypes.string,
    drawerId: PropTypes.string,
    roomCode: PropTypes.string,
    isSpectator: PropTypes.bool, // the viewer is a spectator (fewer actions in the ⋯ menu)
}

export default PlayerList;
