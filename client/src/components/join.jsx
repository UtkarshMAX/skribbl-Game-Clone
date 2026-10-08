import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom';
import socket from '../socket/socket';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { Input, Modal, PrimaryButton } from '../ui';
import { getClientId } from '../utils/clientId.js';

const Join = (props) => {

    const [roomCode, setRoomCode] = useState("");
    const navigate = useNavigate();

    const joinRoom = () => {

        const roomCodeRegex = /^[A-Z0-9]{6}$/;

        if (!roomCodeRegex.test(roomCode)) {
            toast.error("Enter valid 6 character room code");
            return;
        }

        const playerName = localStorage.getItem("name")?.trim() || "Player";

        if (!/^[A-Za-z0-9_]{2,8}$/.test(playerName)) {
            toast.error("Name should have 2 or more character and only use A-Z a-z 0-9 '_'");
            return;
        }

        const emoji_array = ['🙂', '😎', '💀', '😁', '😡', '🫣', '🌚', '😋', '😉', '😍', '🫡', '😪', '😌', '🥸', '🤠', '🤡', '😇', '🤖', '👾', '👽', '👻', '🦁', '🦊'];
        const avatar = emoji_array[Number(localStorage.getItem("emojiIndex")) || 0] || '😀';

        // The server decides the role: player before the game starts, spectator once it's running.
        socket.emit("join_room", { roomCode, playerName, avatar, clientId: getClientId() }, (response) => {
            if (!response.success) {
                toast.error(response.message);
                return;
            }

            // Spectators skip the lobby and go straight to the running game.
            navigate(response.role === "spectator" ? `/playground/${roomCode}` : `/room/${roomCode}`);
        });
    }

    return (
        <Modal title="Join a room" description="Enter the 6-character code from your friend." onClose={() => props.setOpen(false)}>
            <div className='flex flex-col gap-4'>
                <Input type="text" value={roomCode} autoFocus maxLength={6} autoComplete="off" spellCheck={false}
                    aria-label="Room code"
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    onKeyDown={(event) => { if (event.key === "Enter") joinRoom(); }}
                    className='h-14 text-center text-2xl font-black tracking-[0.3em] placeholder:tracking-normal'
                    placeholder='ABC123' />

                <PrimaryButton onClick={() => joinRoom()}>Join</PrimaryButton>
            </div>
        </Modal>
    );
};

Join.propTypes = {
    setOpen: PropTypes.func.isRequired
}

export default Join;