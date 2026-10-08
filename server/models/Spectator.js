import Player from "./Player.js";

/**
 * Someone watching a game that was already running when they joined.
 * Kept in room.spectators (never room.players), so spectators are never part of
 * turn order, scoring, guessing, the leaderboard or host hand-over.
 */
export default class Spectator {
    constructor(socketId, name, avatar = "😀", clientId = null) {
        this.id = socketId;
        this.name = name;
        this.avatar = avatar;
        this.clientId = clientId; // private: only used for bans
    }

    get isSpectator() {
        return true;
    }

    toPublicJSON() {
        return { id: this.id, name: this.name, avatar: this.avatar, isSpectator: true };
    }

    // "Play again": a spectator becomes a normal player in the next game.
    toPlayer() {
        return new Player(this.id, this.name, this.avatar, this.clientId);
    }
}
