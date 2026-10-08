import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import socket from '../socket/socket';
import PropTypes from 'prop-types';
import { Modal, PrimaryButton } from '../ui';
import RoomSettingsForm from './RoomSettingsForm.jsx';
import { DEFAULT_SETTINGS } from './roomSettingsOptions.js';
import { getClientId } from '../utils/clientId.js';

const CreateRoom = ({ setOpen }) => {

  const playerName = localStorage.getItem("name") || "";


  const navigate = useNavigate();

  // Defaults match the server's (private room, 3 word choices, 2 hints, all categories).
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [creating, setCreating] = useState(false);

  const createRoom = () => {

    if (!/^[A-Za-z0-9_]{2,8}$/.test(playerName)) {
      toast.error("Name should have 2 or more character and only use A-Z a-z 0-9 '_'");
      return;
    }
    if (creating) return;
    setCreating(true);

    const emoji_array = ['🙂', '😎', '💀', '😁', '😡', '🫣', '🌚', '😋', '😉', '😍', '🫡', '😪', '😌', '🥸', '🤠', '🤡', '😇', '🤖', '👾', '👽', '👻', '🦁', '🦊'];
    const avatar = emoji_array[Number(localStorage.getItem("emojiIndex")) || 0] || '😀';

    socket.emit("create_room", { playerName, avatar, settings, clientId: getClientId() },

      (response) => {
        setCreating(false);
        if (!response.success) {
          // The server's reason is also shown by the global `error` toast; avoid a duplicate here.
          return;
        }
        localStorage.setItem("isHost", "true");
        setOpen(false);
        navigate(`/room/${response.roomCode}`);
      }
    );
  }

  return (
    <Modal size="lg" title="Create a room" description="Pick your settings, then share the code with friends."
      onClose={() => setOpen(false)}>

      <RoomSettingsForm settings={settings} autoFocus liveCustomWords
        customWordsText={settings.customWords}
        onCustomWordsCommit={(text) => setSettings((prev) => ({ ...prev, customWords: text }))}
        onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))} />

      <div className='flex justify-center mt-7'>
        <PrimaryButton size="lg" className='w-full sm:w-auto' onClick={createRoom} disabled={creating}>
          Create Room
        </PrimaryButton>
      </div>

    </Modal>
  )
}

CreateRoom.propTypes = {
  setOpen: PropTypes.func.isRequired
};

export default CreateRoom
