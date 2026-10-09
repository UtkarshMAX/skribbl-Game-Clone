import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import socket from "../socket/socket";
import toast from "react-hot-toast";
import { Badge, Card, IconButton, Logo, PlayerCard, PrimaryButton, SecondaryButton } from "../ui";
import RoomSettingsForm from "../components/RoomSettingsForm.jsx";
import usePlayerActions from "../components/usePlayerActions.jsx";
import { getClientId } from "../utils/clientId.js";

const Lobby = () => {

    const navigate = useNavigate();
    const { roomCode } = useParams();
    const [players, setPlayers] = useState([]);
    const [spectators, setSpectators] = useState([]); // only left over from a previous game (see Play again)
    const [hostId, setHostId] = useState("");
    const [settings, setSettings] = useState(null);
    const [isPrivate, setIsPrivate] = useState(null);
    const [customWordsText, setCustomWordsText] = useState(""); // host only

    // Applies any lobby payload from the server (player_list_update / get_room / settings_updated).
    const applyLobbyState = useCallback((data) => {
        if (data.players) setPlayers(data.players);
        if (data.spectators) setSpectators(data.spectators);
        if (data.hostId) setHostId(data.hostId);
        if (data.settings) setSettings(data.settings);
        if (typeof data.isPrivate === "boolean") setIsPrivate(data.isPrivate);
        if (Array.isArray(data.customWords)) setCustomWordsText(data.customWords.join(", "));
        // Arriving while a game is running (spectator / invite link) -> straight to the game screen.
        if (data.gameStarted) navigate(`/playground/${roomCode}`);
    }, [navigate, roomCode]);

    useEffect(() => {
        const handlePlayerListUpdate = (data) => {
            applyLobbyState(data);
        };
        const handleGameStarted = () => {
            navigate(`/playground/${roomCode}`);
        };
        const handleNewHost = (newHostId) => {
            setHostId(newHostId);
        };
        const handleSettingsUpdated = (data) => {
            applyLobbyState(data);
        };
        // Host only: the cleaned-up custom word list after a change.
        const handleCustomWords = ({ words = [] }) => setCustomWordsText(words.join(", "));

        socket.on("player_list_update", handlePlayerListUpdate);
        socket.on("game_started", handleGameStarted);
        socket.on("new_host", handleNewHost);
        socket.on("settings_updated", handleSettingsUpdated);
        socket.on("custom_words", handleCustomWords);

        return () => {
            socket.off("player_list_update", handlePlayerListUpdate);
            socket.off("game_started", handleGameStarted);
            socket.off("new_host", handleNewHost);
            socket.off("settings_updated", handleSettingsUpdated);
            socket.off("custom_words", handleCustomWords);
        };

    }, [navigate, roomCode, applyLobbyState]);

    useEffect(() => {
        const playerName = localStorage.getItem("name")?.trim() || "Player";
        const emoji_array = ['🙂', '😎', '💀', '😁', '😡', '🫣', '🌚', '😋', '😉', '😍', '🫡', '😪', '😌', '🥸', '🤠', '🤡', '😇', '🤖', '👾', '👽', '👻', '🦁', '🦊'];
        const avatar = emoji_array[Number(localStorage.getItem("emojiIndex")) || 0] || '😀';

        const joinLobby = () => {
            socket.emit("join_room", { roomCode, playerName, avatar, clientId: getClientId() }, (response) => {
                if (!response.success) {
                    toast.error(response.message || "Failed to join room");
                    navigate("/");
                    return;
                }
                // Joined after the game started (e.g. via an invite link): spectators skip the lobby.
                if (response.role === "spectator") {
                    navigate(`/playground/${roomCode}`, { replace: true });
                    return;
                }
                socket.emit("get_room", { roomCode }, (res) => {
                    if (res.success) {
                        applyLobbyState(res);
                    }
                });
            });
        };

        joinLobby();
        // After a dropped connection the server has removed us, so join again on reconnect
        // (joining twice on the same connection is harmless — the server just says "already in").
        socket.on("connect", joinLobby);
        return () => socket.off("connect", joinLobby);
    }, [roomCode, navigate, applyLobbyState]);

    const startGame = () => {
        socket.emit("start_game", { roomCode });
    };

    const toggleReady = () => {
        socket.emit("toggle_ready", { roomCode });
    };

    // Host edits are sent to the server; the lobby updates when `settings_updated` comes back.
    const updateSettings = (patch) => {
        socket.emit("update_settings", { roomCode, settings: patch });
    };

    const inviteLink = `${window.location.origin}/room/${roomCode}`;
    const isHost = socket.id === hostId;
    const me = players.find((player) => player.id === socket.id);   // undefined for a spectator
    const isSpectator = spectators.some((s) => s.id === socket.id);
    const others = players.filter((player) => player.id !== hostId);
    const { actionsFor, dialog: reportDialog } = usePlayerActions(roomCode, hostId, isSpectator);
    const readyCount = others.filter((player) => player.ready).length;

    // Mirrors the server rule: ≥ 2 players and every non-host player ready.
    const startBlocker =
        players.length < 2 ? "Waiting for at least 2 players"
            : readyCount < others.length ? `Waiting for players to get ready (${readyCount}/${others.length})`
                : null;

    return (
        <div className="animate-fade w-full">
            <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-10">

                <header className="animate-rise text-center">
                    <Logo size="sm" />
                    <h1 className="mt-1 flex items-center justify-center gap-2 text-3xl font-black text-ink">
                        Lobby
                        {isPrivate !== null && (
                            <Badge tone={isPrivate ? "slate" : "green"} className="translate-y-0.5">
                                {isPrivate ? "🔒 Private" : "🌐 Public"}
                            </Badge>
                        )}
                    </h1>
                    {isPrivate !== null && (
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                            {isPrivate
                                ? "Only people with the code or invite link can join."
                                : "Anyone pressing Play! can join this room."}
                        </p>
                    )}
                </header>

                <Card className="w-full p-5 sm:p-6" style={{ animationDelay: '60ms' }}>

                    {/* ----Room code + invite link----- */}
                    <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                        <div className="flex items-center justify-between gap-3 rounded-control bg-blue-50 p-3 pl-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider text-blue-700/70">Room code</p>
                                <p className="text-2xl font-black tracking-[0.2em] text-ink">{roomCode}</p>
                            </div>
                            <IconButton label="Copy room code" icon="content_copy"
                                onClick={() => { navigator.clipboard.writeText(roomCode); toast.success("Room code copied!"); }} />
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-3 rounded-control bg-blue-50 p-3 pl-4">
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-wider text-blue-700/70">Invite link</p>
                                <p className="truncate font-bold text-blue-700" title={inviteLink}>{inviteLink}</p>
                            </div>
                            <IconButton label="Copy invite link" icon="link"
                                onClick={() => {
                                    navigator.clipboard.writeText(inviteLink);
                                    toast.success("Invite link copied!");
                                }} />
                        </div>
                    </div>

                    {/* ----Players----- */}
                    <div className="mt-6">
                        <h2 className="mb-3 flex items-baseline gap-2 text-lg font-black text-ink">
                            Players <span className="text-sm font-bold text-slate-400">{players.length}{settings ? ` / ${settings.maxPlayers}` : ""}{spectators.length ? ` · ${spectators.length} watching` : ""}</span>
                        </h2>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {players.map((player) => (
                                <PlayerCard key={player.id} player={player} showScore={false}
                                    isHost={player.id === hostId} isYou={player.id === socket.id}
                                    isReady={player.id === hostId ? undefined : !!player.ready}
                                    actions={actionsFor(player)} />
                            ))}
                            {spectators.map((spectator) => (
                                <PlayerCard key={spectator.id} player={spectator} showScore={false}
                                    isYou={spectator.id === socket.id} actions={actionsFor(spectator)} />
                            ))}
                        </div>
                    </div>

                    {/* ----Settings----- */}
                    {settings && (
                        <section className="mt-6" aria-labelledby="settings-title">
                            <h2 id="settings-title" className="mb-3 flex items-baseline gap-2 text-lg font-black text-ink">
                                Room settings
                                {!isHost && <span className="text-xs font-bold text-slate-400">set by the host</span>}
                            </h2>
                            <RoomSettingsForm settings={{ ...settings, isPrivate }} readOnly={!isHost} onChange={updateSettings}
                                customWordsText={customWordsText}
                                onCustomWordsCommit={(text) => updateSettings({ customWords: text })} />
                        </section>
                    )}

                    <div className="mt-6 flex flex-col items-center gap-2 border-t border-slate-100 pt-6">
                        {isHost ? (
                            <>
                                <PrimaryButton size="lg" className="w-full sm:w-auto" onClick={startGame} disabled={!!startBlocker}>
                                    Start Game
                                </PrimaryButton>
                                {startBlocker && <p className="text-sm font-bold text-slate-500" role="status">{startBlocker}</p>}
                            </>
                        ) : (
                            <>
                                {me && (
                                    me.ready
                                        ? <SecondaryButton size="lg" className="w-full sm:w-auto" onClick={toggleReady} aria-pressed="true">✓ Ready — click to undo</SecondaryButton>
                                        : <PrimaryButton size="lg" className="w-full sm:w-auto" onClick={toggleReady} aria-pressed="false">I&apos;m ready</PrimaryButton>
                                )}
                                <p className="flex items-center gap-2 text-sm font-bold text-slate-500" role="status">
                                    Waiting for the host to start
                                    <span aria-hidden="true" className="flex gap-1">
                                        <span className="waiting-dot size-1.5 rounded-full bg-amber-400" />
                                        <span className="waiting-dot size-1.5 rounded-full bg-amber-400" />
                                        <span className="waiting-dot size-1.5 rounded-full bg-amber-400" />
                                    </span>
                                </p>
                            </>
                        )}
                    </div>
                </Card>
            </main>
            {reportDialog}
        </div>
    );
};

export default Lobby;
