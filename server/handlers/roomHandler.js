import Player from "../models/Player.js";
import Spectator from "../models/Spectator.js";
import generateRoomCode from "../utils/generateRoomCode.js";
import { validateSettings } from "../utils/roomSettings.js";
import { removePlayerFromRoom } from "./roomLifecycle.js";

// Room / lobby events. Registered on the MessageHandler (see socket/MessageHandler.js),
// which has already validated payload types and run the listed permission checks.

const NAME_REGEX = /^[A-Za-z0-9_]{2,8}$/;
const MAX_SPECTATORS = 20;
const isValidName = (name) => typeof name === "string" && NAME_REGEX.test(name);

// Avatars are short emoji strings; anything else falls back to the default.
// Persistent browser id (UUID from localStorage); only used to enforce bans.
const cleanClientId = (id) => (typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null);

const cleanAvatar = (avatar) => (typeof avatar === "string" && avatar.length > 0 && avatar.length <= 16 ? avatar : "😀");

const QUICK_PLAY_AVATARS = [
    '🙂', '😎', '💀', '😁', '😡', '🫣', '🌚', '😋', '😉',
    '😍', '🫡', '😪', '😌', '🥸', '🤠', '🤡', '😇',
    '🤖', '👾', '👽', '👻', '🦁', '🦊'
];

export default function registerRoomEvents(handler) {

    //----------Create Room------------

    handler.on("create_room", {
        schema: { playerName: "string?", avatar: "string?", settings: "object?", clientId: "string?" },
        handler: ({ socket, rooms, payload, reply, error }) => {
            const { playerName, settings, avatar } = payload;

            if (!isValidName(playerName)) {
                error("Invalid player name");
                return reply({ success: false, message: "Invalid player name" });
            }

            // Create Room defaults to a private room unless the client explicitly asks for public.
            const result = validateSettings(settings);
            if (!result.ok) {
                error(result.message);
                return reply({ success: false, message: result.message });
            }

            const roomCode = generateRoomCode();
            const room = rooms.createRoom(roomCode, socket.id, result.settings);
            room.addPlayer(new Player(socket.id, playerName, cleanAvatar(avatar), cleanClientId(payload.clientId)));
            socket.join(roomCode);

            reply({ success: true, roomCode });
            room.broadcast("player_list_update", room.toPublicJSON());
        },
    });

    //---------Join Room----------

    handler.on("join_room", {
        schema: { roomCode: "string?", playerName: "string?", avatar: "string?", clientId: "string?" },
        handler: ({ socket, payload, reply, room }) => {
            const { roomCode, playerName, avatar } = payload;

            if (!room) return reply({ success: false, message: "Room not found" });

            // Already in the room (e.g. the lobby re-joining): just report the current role.
            if (room.getPlayer(socket.id)) return reply({ success: true, role: "player", gameStarted: room.gameStarted });
            if (room.getSpectator(socket.id)) return reply({ success: true, role: "spectator", gameStarted: room.gameStarted });

            if (room.isBanned(payload.clientId)) return reply({ success: false, message: "You are banned from this room" });

            if (!isValidName(playerName)) return reply({ success: false, message: "Invalid player name" });

            // Works the same for public and private rooms (the code/link is the invitation).
            // Role is decided by the server: before the game starts -> player, once it's running -> spectator,
            // except a player whose connection dropped during this game: they take their seat (and score) back.
            const saved = room.gameStarted && !room.isFull() ? room.takeDroppedPlayer(payload.clientId) : null;
            const role = room.gameStarted && !saved ? "spectator" : "player";
            if (role === "player" && room.isFull()) return reply({ success: false, message: "Room is full" });
            if (role === "spectator" && room.spectators.length >= MAX_SPECTATORS) {
                return reply({ success: false, message: "Too many spectators in this room" });
            }

            const args = [socket.id, playerName, cleanAvatar(avatar), cleanClientId(payload.clientId)];
            const member = role === "player" ? room.addPlayer(new Player(...args)) : room.addSpectator(new Spectator(...args));
            if (saved) { // back at the end of the turn order, score and this turn's guess kept
                member.score = saved.score;
                room.game.playerReconnected(saved.id, member);
            }
            socket.join(roomCode);

            reply({ success: true, role, gameStarted: room.gameStarted });

            socket.emit("canvas_state", room.canvasStrokes);
            // Joining mid-game: send the full public picture (state, strokes, countdown, chat — never the word).
            if (room.gameStarted) socket.emit("game_snapshot", room.game.snapshot());

            room.broadcast("player_list_update", room.toPublicJSON());
            room.broadcast("chat_message", {
                id: crypto.randomUUID(),
                type: "system",
                text: role === "spectator" ? `${member.name} is watching as a spectator`
                    : saved ? `${member.name} rejoined the game` : `${member.name} joined the room`
            });
        },
    });

    // ---Game snapshot on demand (the game screen asks for it when it opens)---

    handler.on("sync_game", {
        schema: { roomCode: "string" },
        requires: ["room", "member"],
        silent: true,
        handler: ({ socket, room }) => socket.emit("game_snapshot", room.game.snapshot()),
    });

    // ---Play again (host, after game over): everyone back to the lobby---

    handler.on("play_again", {
        schema: { roomCode: "string" },
        requires: ["room", "host"],
        messages: { host: "Only the host can start a new game" },
        handler: ({ room, error }) => {
            if (room.game.phase !== "game_over") return error("You can only play again after the game ends");
            room.game.returnToLobby();
            room.broadcast("returned_to_lobby", { roomCode: room.roomCode });
            room.broadcast("player_list_update", room.toPublicJSON());
        },
    });

    // ---GET_ROOM-----

    handler.on("get_room", {
        schema: { roomCode: "string?" },
        handler: ({ room, reply, socket }) => {
            if (!room) return reply({ success: false, message: "Room not found" });
            // The host also gets the custom word list (others only see how many there are).
            const hostOnly = room.hostId === socket.id ? { customWords: room.settings.customWords ?? [] } : {};
            reply({ success: true, ...room.toPublicJSON(), ...hostOnly });
        },
    });

    // ----------Quick Play----------

    handler.on("quick_play", {
        schema: { playerName: "string?", emojiIndex: "number?", clientId: "string?" },
        handler: ({ socket, rooms, payload, error }) => {
            const { playerName, emojiIndex } = payload;
            if (!isValidName(playerName)) return error("Invalid player name");

            const avatar = QUICK_PLAY_AVATARS[emojiIndex] || '😀';

            // Only PUBLIC rooms (never private ones); if none is open, start a new public room.
            let room = rooms.findPublicRoom(payload.clientId);
            if (!room) {
                room = rooms.createRoom(generateRoomCode(), socket.id, { isPrivate: false });
            }

            if (!room.getMember(socket.id)) {
                room.addPlayer(new Player(socket.id, playerName, avatar, cleanClientId(payload.clientId)));
            }

            socket.join(room.roomCode);
            socket.emit("quick_play_joined", { roomCode: room.roomCode });
            room.broadcast("player_list_update", room.toPublicJSON());
        },
    });

    // ----------Update Settings (host, lobby only)----------

    handler.on("update_settings", {
        schema: { roomCode: "string", settings: "object?" },
        requires: ["room", "host", "lobby"],
        messages: {
            host: "Only the host can change settings",
            lobby: "Settings can't be changed during a game",
        },
        handler: ({ room, payload, error }) => {
            const result = validateSettings(payload.settings, room.settings);
            if (!result.ok) return error(result.message);

            if (result.settings.maxPlayers < room.players.length) {
                return error(`There are already ${room.players.length} players in the room`);
            }

            room.settings = result.settings;
            room.broadcast("settings_updated", { settings: room.publicSettings(), isPrivate: room.isPrivate });
            // Only the host sees the (sanitized) custom word list.
            room.sendTo(room.hostId, "custom_words", { words: room.settings.customWords ?? [] });
        },
    });

    // ----------Ready-up (non-host players, lobby only)----------

    handler.on("toggle_ready", {
        schema: { roomCode: "string" },
        requires: ["room", "lobby", "member", "player", "notHost"],
        messages: { player: "Spectators don't need to ready up", notHost: "The host doesn't need to ready up" },
        handler: ({ room, player }) => {
            player.ready = !player.ready;
            room.broadcast("player_list_update", room.toPublicJSON());
        },
    });

    // ----------Disconnect-----------

    handler.onDisconnect(({ socket, rooms }) => {
        for (const room of [...rooms.rooms.values()]) {
            removePlayerFromRoom(rooms, room, socket.id, { dropped: true });
        }
    });
}
