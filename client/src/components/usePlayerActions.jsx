import { useState } from 'react';
import socket from '../socket/socket.js';
import { Input, Modal, PrimaryButton, Select } from '../ui';

const REPORT_REASONS = ['Inappropriate drawing', 'Offensive chat', 'Cheating / spoiling the word', 'Spam', 'Other'];

/**
 * Moderation actions for player cards (lobby + in-game list):
 *  - host:       Kick, Ban, Report
 *  - players:    Vote kick, Report
 *  - spectators: Report only (the server rejects their vote kicks anyway)
 * Returns { actionsFor(player), dialog } — render `dialog` once in the page.
 */
export default function usePlayerActions(roomCode, hostId, viewerIsSpectator = false) {
    const [reportTarget, setReportTarget] = useState(null);
    const [reason, setReason] = useState(REPORT_REASONS[0]);
    const [details, setDetails] = useState('');

    const actionsFor = (player) => {
        if (!player || player.id === socket.id) return [];
        const report = { label: 'Report', icon: 'flag', onClick: () => { setReportTarget(player); setReason(REPORT_REASONS[0]); setDetails(''); } };
        if (socket.id === hostId) {
            return [
                { label: 'Kick', icon: 'person_remove', danger: true, onClick: () => socket.emit('kick_player', { roomCode, playerId: player.id }) },
                { label: 'Ban', icon: 'block', danger: true, onClick: () => socket.emit('kick_player', { roomCode, playerId: player.id, ban: true }) },
                report,
            ];
        }
        if (viewerIsSpectator) return [report];
        return [
            { label: 'Vote kick', icon: 'how_to_vote', danger: true, onClick: () => socket.emit('vote_kick', { roomCode, playerId: player.id }) },
            report,
        ];
    };

    const sendReport = () => {
        const text = details.trim() ? `${reason}: ${details.trim()}` : reason;
        socket.emit('report_player', { roomCode, playerId: reportTarget.id, reason: text });
        setReportTarget(null);
    };

    const dialog = reportTarget && (
        <Modal title={`Report ${reportTarget.name}`} description="The report is sent privately to the server." onClose={() => setReportTarget(null)}>
            <div className="flex flex-col gap-4">
                <Select label="Reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
                <Input label="Details (optional)" maxLength={150} value={details} onChange={(e) => setDetails(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendReport(); }} placeholder="What happened?" />
                <PrimaryButton onClick={sendReport}>Send report</PrimaryButton>
            </div>
        </Modal>
    );

    return { actionsFor, dialog };
}
