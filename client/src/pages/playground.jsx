import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import DrawBoard from '../components/drawBoard';
import ChatBox from '../components/chatbox';
import PlayerList from '../components/playerlist';
import socket from '../socket/socket';
import { Badge, Logo } from '../ui';
import { getClientId } from '../utils/clientId.js';

const Playground = () => {

  const navigate = useNavigate();
  const { roomCode } = useParams();
  const [players, setPlayers] = useState([]);
  const [spectators, setSpectators] = useState([]);
  const [hostId, setHostId] = useState("");
  const [drawerId, setDrawerId] = useState("");

  // Applies room data from player_list_update / get_room (players and spectators are separate lists).
  const applyRoom = (data) => {
    setPlayers(data.players || []);
    setSpectators(data.spectators || []);
    setHostId(data.hostId || "");
  };

  useEffect(() => {
    const handleGameState = (gameState) => {
      setDrawerId(gameState.drawerId);
    };

    // leaderboard_update lists the players sorted by score (spectators are never on it).
    const handleLeaderboardUpdate = (updatedPlayers) => {
      setPlayers(updatedPlayers);
    };

    const handleSnapshot = ({ gameState } = {}) => {
      if (gameState?.drawerId) setDrawerId(gameState.drawerId);
    };

    socket.on("game_state", handleGameState);
    socket.on("leaderboard_update", handleLeaderboardUpdate);
    socket.on("player_list_update", applyRoom);
    socket.on("game_snapshot", handleSnapshot);

    return () => {
      socket.off("game_state", handleGameState);
      socket.off("leaderboard_update", handleLeaderboardUpdate);
      socket.off("player_list_update", applyRoom);
      socket.off("game_snapshot", handleSnapshot);
    };
  }, []);

  useEffect(() => {
    const playerName = localStorage.getItem("name")?.trim() || "Player";
    const emoji_array = ['🙂', '😎', '💀', '😁', '😡', '🫣', '🌚', '😋', '😉', '😍', '🫡', '😪', '😌', '🥸', '🤠', '🤡', '😇', '🤖', '👾', '👽', '👻', '🦁', '🦊'];
    const avatar = emoji_array[Number(localStorage.getItem("emojiIndex")) || 0] || '😀';

    // A page refresh or a dropped connection gives this tab a new socket id that is no longer in
    // the room, so join (again) before asking for the room — the server just reports the role if we
    // are still in, and makes us a spectator if the game is already running.
    const joinGame = () => {
      socket.emit("join_room", { roomCode, playerName, avatar, clientId: getClientId() }, (response) => {
        if (!response?.success) {
          toast.error(response?.message || "Failed to join room");
          navigate("/");
          return;
        }
        // No game running (e.g. our leaving ended a 2-player game): the lobby is the right screen.
        if (!response.gameStarted) {
          navigate(`/room/${roomCode}`, { replace: true });
          return;
        }
        socket.emit("get_room", { roomCode }, (res) => {
          if (res.success) applyRoom(res);
        });
        // Full game picture (state, strokes, word-choice countdown, chat) for whoever just opened this screen.
        socket.emit("sync_game", { roomCode });
      });
    };

    joinGame();
    socket.on("connect", joinGame);
    return () => socket.off("connect", joinGame);
  }, [roomCode, navigate]);

  // The server decides the role; the client only mirrors it to choose what to show.
  const role = spectators.some((s) => s.id === socket.id) ? "spectator" : "player";

  return (
    <div className="animate-fade mx-auto flex w-full max-w-[1400px] flex-col gap-3 self-start px-3 py-3 md:px-4 md:py-4 cursor-default">

      <header className="flex items-center justify-between gap-3">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          {role === "spectator" && <Badge tone="blue" className="h-8 px-3 text-xs">👁 Spectator</Badge>}
          <Badge tone="slate" className="h-8 px-3 text-xs">Room <span className="tracking-widest text-ink">{roomCode}</span></Badge>
        </div>
      </header>

      <div className="grid items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_17rem] xl:grid-cols-[16rem_minmax(0,1fr)_19rem]">

        <div className="lg:h-[calc(100dvh-6rem)] lg:max-h-[760px]">
          <PlayerList
            players={players}
            spectators={spectators}
            hostId={hostId}
            drawerId={drawerId}
            roomCode={roomCode}
            isSpectator={role === "spectator"}
          />
        </div>

        <div className="mx-auto w-full min-w-0 max-w-[800px]">
          <DrawBoard isSpectator={role === "spectator"} hostId={hostId} />
        </div>

        <div className="h-[360px] lg:h-[calc(100dvh-6rem)] lg:max-h-[760px]">
          <ChatBox roomCode={roomCode} />
        </div>

      </div>
    </div>
  );
};

export default Playground;
