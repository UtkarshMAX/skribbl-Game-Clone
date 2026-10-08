import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import socket from '../socket/socket.js';

const TOAST_ID = 'connection';
const SLOW_CONNECT_MS = 1500; // only show the toast if connecting actually takes a while

/**
 * Shows "Connecting to server…" while the socket isn't connected (e.g. the free Render
 * instance waking up, ~50s), "Reconnecting…" after a drop, and "Connected" once back.
 * A drop during a game can't be resumed (the server treats it as leaving), so the player
 * is sent Home; the lobby re-joins on its own.
 */
export default function ConnectionStatus() {
    const navigate = useNavigate();

    useEffect(() => {
        let shown = false;
        let lostDuringGame = false;
        let connectedOnce = socket.connected;

        const showConnecting = (message) => {
            shown = true;
            toast.loading(message, { id: TOAST_ID });
        };

        // Only for the very first connection — a later drop shows "Connection lost" instead.
        const slowTimer = setTimeout(() => {
            if (!socket.connected && !connectedOnce) {
                showConnecting('Connecting to server… The free server can take up to a minute to wake up.');
            }
        }, SLOW_CONNECT_MS);

        const handleConnect = () => {
            connectedOnce = true;
            if (shown) toast.success('Connected!', { id: TOAST_ID, duration: 2000 });
            shown = false;
            if (lostDuringGame) {
                lostDuringGame = false;
                toast.error('You were disconnected during the game. Please join again.', { duration: 4000 });
                navigate('/');
            }
        };

        const handleDisconnect = (reason) => {
            if (reason === 'io client disconnect') return; // closed on purpose
            lostDuringGame = window.location.pathname.startsWith('/playground/');
            showConnecting('Connection lost — reconnecting…');
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        return () => {
            clearTimeout(slowTimer);
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        };
    }, [navigate]);

    return null;
}
