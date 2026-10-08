// Shared "a player leaves the room" logic, used by disconnect, leave_room, kick, ban and vote kick,
// so every way of leaving cleans up the same way.

/**
 * Removes `socketId` (player or spectator) from `room` and keeps the game consistent:
 * host hand-over, vote cleanup, notifications, empty-room deletion,
 * ending the game when fewer than 2 active players remain, or skipping to the next
 * turn if the drawer left. Returns the removed Player, or null.
 */
export function removePlayerFromRoom(rooms, room, socketId, { message } = {}) {
    // A spectator leaving only removes the spectator: host, drawer, scores, turn order and
    // the game itself are untouched.
    const spectator = room.removeSpectator(socketId);
    if (spectator) {
        room.clearVotesFor(socketId);
        room.broadcast("player_list_update", room.toPublicJSON());
        room.broadcast("chat_message", {
            id: crypto.randomUUID(),
            type: "system",
            text: message ?? `${spectator.name} stopped watching`,
        });
        if (room.isEmpty()) {
            room.game.reset();
            rooms.deleteRoom(room.roomCode);
        }
        return spectator;
    }

    const wasDrawer = room.gameStarted && room.game.isDrawer(socketId);
    room.game.beforePlayerRemoved(socketId); // keep the turn order pointing at the right player
    const player = room.removePlayer(socketId);
    if (!player) return null;

    room.clearVotesFor(socketId);

    if (room.hostId === socketId && room.players.length > 0) {
        room.broadcast("new_host", room.transferHost());
    }

    room.broadcast("player_left", player.toPublicJSON());
    room.broadcast("player_list_update", room.toPublicJSON());
    room.broadcast("chat_message", {
        id: crypto.randomUUID(),
        type: "system",
        text: message ?? `${player.name} left the room`,
    });

    if (room.isEmpty()) {
        room.game.reset();
        rooms.deleteRoom(room.roomCode);
        return player;
    }

    if (room.gameStarted && room.players.length < 2) {
        room.game.endGame();
    } else if (wasDrawer) {
        room.game.nextTurn();
    }
    return player;
}

/**
 * Kicks (and optionally bans) a player: tells them why, takes their socket out of the
 * Socket.IO room, then removes them like any other leaver.
 */
export function kickPlayer(rooms, room, target, { ban = false, reason, message } = {}) {
    if (ban && target.clientId) room.bannedClientIds.add(target.clientId);

    room.sendTo(target.id, "kicked", { reason, banned: ban });
    room.io?.in(target.id).socketsLeave(room.roomCode);

    return removePlayerFromRoom(rooms, room, target.id, { message });
}
