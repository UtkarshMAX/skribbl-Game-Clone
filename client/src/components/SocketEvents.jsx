import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import socket from '../socket/socket.js';

// App-wide socket events that need navigation (rendered inside the router).
export default function SocketEvents() {
    const navigate = useNavigate();

    useEffect(() => {
        // 4.1 / 4.2: removed by the host or a vote kick -> back to Home with a toast.
        const handleKicked = ({ reason } = {}) => {
            toast.error(reason || "You were removed from the room", { duration: 4000 });
            navigate('/');
        };
        // 4.3: private confirmation of a report.
        const handleReportReceived = ({ playerName } = {}) => {
            toast.success(`Thanks — your report about ${playerName} was sent`);
        };
        // 4.8: host chose "Play again" -> everyone still in the room goes back to the lobby.
        const handleReturnedToLobby = ({ roomCode } = {}) => {
            if (roomCode) navigate(`/room/${roomCode}`);
        };

        socket.on('kicked', handleKicked);
        socket.on('report_received', handleReportReceived);
        socket.on('returned_to_lobby', handleReturnedToLobby);
        return () => {
            socket.off('kicked', handleKicked);
            socket.off('report_received', handleReportReceived);
            socket.off('returned_to_lobby', handleReturnedToLobby);
        };
    }, [navigate]);

    return null;
}
