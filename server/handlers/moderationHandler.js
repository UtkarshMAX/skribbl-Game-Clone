import { kickPlayer, removePlayerFromRoom } from "./roomLifecycle.js";
import { cleanText } from "../utils/text.js";

// Moderation: kick / ban (host), vote kick (players), report (anyone in the room), leave room.

export default function registerModerationEvents(handler) {

    // ---------- Kick / ban (host only, lobby or game; players or spectators) ----------

    handler.on("kick_player", {
        schema: { roomCode: "string", playerId: "string", ban: "boolean?" },
        requires: ["room", "member", "host"],
        messages: { host: "Only the host can kick players" },
        handler: ({ rooms, room, socket, payload, error }) => {
            const { playerId, ban = false } = payload;
            if (playerId === socket.id) return error("You can't kick yourself");
            const target = room.getMember(playerId);
            if (!target) return error("Player not found");

            kickPlayer(rooms, room, target, {
                ban,
                reason: ban ? "You were banned from the room by the host" : "You were kicked from the room by the host",
                message: ban ? `${target.name} was banned by the host` : `${target.name} was kicked by the host`,
            });
        },
    });

    // ---------- Vote kick (players only — spectators can't influence the game) ----------

    handler.on("vote_kick", {
        schema: { roomCode: "string", playerId: "string" },
        requires: ["room", "member", "player"],
        messages: { player: "Spectators can't vote to kick" },
        handler: ({ rooms, room, socket, player, payload, error }) => {
            const target = room.getMember(payload.playerId);
            if (!target) return error("Player not found");
            if (target.id === socket.id) return error("You can't vote to kick yourself");

            const voters = room.voteKicks.get(target.id) ?? new Set();
            if (voters.has(socket.id)) return error(`You already voted to kick ${target.name}`);
            voters.add(socket.id);
            room.voteKicks.set(target.id, voters);

            // Kick once votes are more than half of the players other than the target.
            const needed = room.votesNeededToKick(target.id);
            room.broadcast("chat_message", {
                id: crypto.randomUUID(),
                type: "system",
                tone: "warning",
                text: `Vote kick ${target.name}: ${voters.size}/${needed}`,
            });

            if (voters.size >= needed) {
                kickPlayer(rooms, room, target, {
                    reason: "You were removed from the room by a vote kick",
                    message: `${target.name} was removed by a vote kick`,
                });
            }
            console.log(`[vote_kick] ${room.roomCode}: ${player.name} -> ${target.name} (${voters.size}/${needed})`);
        },
    });

    // ---------- Report (logged on the server, confirmed privately) ----------

    handler.on("report_player", {
        schema: { roomCode: "string", playerId: "string", reason: "string?" },
        requires: ["room", "member"],
        handler: ({ room, socket, member, payload, error }) => {
            const target = room.getMember(payload.playerId);
            if (!target) return error("Player not found");
            if (target.id === socket.id) return error("You can't report yourself");

            const reason = cleanText(payload.reason, 200) ?? "No reason given";
            console.log(`[report] room ${room.roomCode}: ${member.name} reported ${target.name} (client ${target.clientId ?? "unknown"}) — ${reason}`);
            socket.emit("report_received", { playerName: target.name });
        },
    });

    // ---------- Leave room (e.g. "Back to home") ----------

    handler.on("leave_room", {
        schema: { roomCode: "string" },
        requires: ["room", "member"],
        silent: true,
        handler: ({ rooms, room, socket }) => {
            socket.leave(room.roomCode);
            removePlayerFromRoom(rooms, room, socket.id);
        },
    });
}
