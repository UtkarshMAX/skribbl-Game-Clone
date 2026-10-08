import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import CreateRoom from '../components/createroom.jsx';
import Join from '../components/join.jsx';
import socket from '../socket/socket.js';
import { getClientId } from '../utils/clientId.js';
import { Avatar, Card, IconButton, Input, Logo, PrimaryButton, SecondaryButton, Tooltip, displayName } from '../ui';

function Login() {

  const [openCreateRoom, setOpenCreateRoom] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const nameInputRef = useRef(null);

  // Name
  const [name, setName] = useState(
    localStorage.getItem("name") || ""
  );

  // Avatar
  const emoji_array = [
    '🙂', '😎', '💀', '😁', '😡', '🫣', '🌚', '😋', '😉',
    '😍', '🫡', '😪', '😌', '🥸', '🤠', '🤡', '😇',
    '🤖', '👾', '👽', '👻', '🦁', '🦊'
  ];

  const [index, setIndex] = useState(
    Number(localStorage.getItem("emojiIndex")) || 0
  );

  const leftClick = () => {
    const newIndex = (index - 1 + emoji_array.length) % emoji_array.length;
    setIndex(newIndex);
    localStorage.setItem("emojiIndex", newIndex)
  };

  const rightClick = () => {
    const newIndex = (index + 1) % emoji_array.length;
    setIndex(newIndex);
    localStorage.setItem("emojiIndex", newIndex)
  };

  // Blocks repeat Play requests (e.g. rapid Enter) while one is in flight.
  const playPendingRef = useRef(false);

  const playButton = () => {

    if (!/^[A-Za-z0-9_]{2,8}$/.test(name)) {
      alert("Name should have 2 or more character and only use A-Z a-z 0-9 '_'");
      return;
    }

    if (playPendingRef.current) return;
    playPendingRef.current = true;
    setTimeout(() => { playPendingRef.current = false; }, 3000);

    socket.emit("quick_play", {
      playerName: name,
      emojiIndex: index,
      clientId: getClientId() // lets the server keep banned players out of rooms they were banned from
    });

  }

const navigate = useNavigate();

useEffect(() => {
  socket.on("quick_play_joined",({ roomCode }) => {
      navigate(`/room/${roomCode}`);
    }
  );

  return () => {socket.off("quick_play_joined");};

}, [navigate]);

// Page-wide shortcuts matching the hint: Enter → Play, ←/→ → change character.
useEffect(() => {
  const handleKeyDown = (event) => {
    if (openJoin || openCreateRoom) return;              // dialogs handle their own keys
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const target = event.target;
    const isNameInput = target === nameInputRef.current;
    const isField = target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable);

    if (event.key === "Enter") {
      // Focused buttons keep their own Enter behaviour; other fields are left alone.
      if (event.repeat || target instanceof HTMLButtonElement || (isField && !isNameInput)) return;
      event.preventDefault();
      playButton();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (isField) return;                                 // keep normal text-cursor movement
      event.preventDefault();
      if (event.key === "ArrowLeft") leftClick(); else rightClick();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
});

return (
  <div className="animate-fade w-full">
    <main className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-6 px-4 py-10">

      <header className="animate-rise text-center">
        <h1><Logo /></h1>
        <p className="mt-1 font-bold text-slate-500">Draw it. Guess it. Win it.</p>
      </header>

      <Card className="flex w-full flex-col gap-5 p-6" style={{ animationDelay: '60ms' }}>

        {/* Character */}
        <div className="flex items-center justify-between gap-2">
          <IconButton label="Previous character" icon="chevron_left" onClick={leftClick} />

          <div className="flex flex-col items-center gap-2">
            <div tabIndex={0} role="group"
              aria-label={`Character ${index + 1} of ${emoji_array.length}. Use left and right arrow keys to change.`}
              className="rounded-full">
              <Avatar key={index} emoji={emoji_array[index]} size="xl" className="animate-pop-in ring-2 ring-blue-100" />
            </div>
            <span className="h-7 text-xl font-black text-ink">
              {displayName(name)}
            </span>
          </div>

          <IconButton label="Next character" icon="chevron_right" onClick={rightClick} />
        </div>

        {/* Name */}
        <Input label="Your name" placeholder="Up to 8 characters" maxLength={8} autoComplete="off"
          value={name} onChange={(event) => {
            setName(event.target.value);
            localStorage.setItem("name", event.target.value);
          }}
          ref={nameInputRef}
        />

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Tooltip text="Join a random public room" id="play-hint" className="w-full">
            <PrimaryButton size="lg" className="w-full" onClick={playButton} aria-describedby="play-hint">Play!</PrimaryButton>
          </Tooltip>

          <div className="flex gap-3">
            <SecondaryButton className="flex-1"
              onClick={() => {
                if (!/^[A-Za-z0-9_]{2,8}$/.test(name)) {
                  alert("Name should have 2 or more character and only use A-Z a-z 0-9 '_'");
                  return;
                }
                setOpenJoin(true)
              }} >
              Join room
            </SecondaryButton>

            <SecondaryButton className="flex-1"
              onClick={() => {
                if (!/^[A-Za-z0-9_]{2,8}$/.test(name)) {
                  alert("Name should have 2 or more character and only use A-Z a-z 0-9 '_'");
                  return;
                }
                setOpenCreateRoom(true)
              }}>
              Create room
            </SecondaryButton>
          </div>

          <p className="text-center text-xs font-bold text-slate-400">
            <kbd>Enter</kbd> to play · <kbd>←</kbd> <kbd>→</kbd> change character
          </p>
        </div>
      </Card>

      <ol className="animate-rise flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm font-bold text-slate-500"
        style={{ animationDelay: '120ms' }}>
        <li><span className="text-amber-500">1</span> Pick a word</li>
        <li><span className="text-amber-500">2</span> Draw it</li>
        <li><span className="text-amber-500">3</span> Guess fast</li>
      </ol>
    </main>

    {
      openJoin && (
        <Join
          setOpen={setOpenJoin}
        />
      )
    }

    {
      openCreateRoom && (
        <CreateRoom
          setOpen={setOpenCreateRoom}
        />
      )
    }
  </div>
)
}

export default Login;
