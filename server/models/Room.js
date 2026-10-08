import Game from "./Game.js";
import ChatManager from "../managers/ChatManager.js";
import { validateSettings } from "../utils/roomSettings.js";

/**
 * A room: its players, host, settings, canvas and the Game being played in it.
 * All messages to clients go through broadcast() / sendTo(), so nothing else
 * needs the Socket.IO server object.
 */
export default class Room {
    // `settings` should already be validated by the caller; anything invalid falls back to defaults.
    // `io` is the Socket.IO server (optional in unit tests — then messages are simply not sent).
    constructor(roomCode, hostId, settings = {}, io = null) {
        this.roomCode = roomCode;
        this.hostId = hostId;
        this.io = io;

        const result = validateSettings(settings);
        this.settings = result.ok ? result.settings : validateSettings({}).settings;

        this.players = [];      // take turns, guess, score, can be host
        this.spectators = [];   // joined after the game started: watch + chat only
        this.canvasStrokes = [];
        this.chatManager = new ChatManager();
        this.game = new Game(this);
        this.gameStarted = false;

        this.bannedClientIds = new Set(); // persistent client ids the host has banned
        this.voteKicks = new Map();       // targetPlayerId -> Set of voter ids
    }

    // ---------- Moderation ----------

    isBanned(clientId) {
        return typeof clientId === "string" && this.bannedClientIds.has(clientId);
    }

    // Votes needed to kick: more than half of the eligible voters (players other than the target).
    votesNeededToKick(targetId) {
        const eligible = this.players.filter((p) => p.id !== targetId).length;
        return Math.floor(eligible / 2) + 1;
    }

    // Drops a leaving player's own vote-kick tally and any votes they cast.
    clearVotesFor(playerId) {
        this.voteKicks.delete(playerId);
        for (const voters of this.voteKicks.values()) voters.delete(playerId);
    }

    // Older code refers to the game as `room.gameManager`.
    get gameManager() {
        return this.game;
    }

    // Private rooms can only be joined with the room code / invite link, never via Quick Play.
    get isPrivate() {
        return this.settings.isPrivate;
    }

    // ---------- Messaging ----------

    /** Sends an event to everyone in the room. */
    broadcast(event, data) {
        this.io?.to(this.roomCode).emit(event, data);
    }

    /** Sends an event to one player only (their socket id is also a Socket.IO room). */
    sendTo(playerId, event, data) {
        this.io?.to(playerId).emit(event, data);
    }

    // ---------- Players ----------

    addPlayer(player) {
        player.isHost = player.id === this.hostId;
        this.players.push(player);
        return player;
    }

    /** Removes a player and returns them (or null if they weren't here). */
    removePlayer(socketId) {
        const player = this.getPlayer(socketId) ?? null;
        this.players = this.players.filter((p) => p.id !== socketId);
        return player;
    }

    getPlayer(socketId) {
        return this.players.find(
            (player) => player.id === socketId
        );
    }

    // ---------- Spectators ----------

    addSpectator(spectator) {
        this.spectators.push(spectator);
        return spectator;
    }

    /** Removes a spectator and returns them (or null if they weren't watching). */
    removeSpectator(socketId) {
        const spectator = this.getSpectator(socketId) ?? null;
        this.spectators = this.spectators.filter((s) => s.id !== socketId);
        return spectator;
    }

    getSpectator(socketId) {
        return this.spectators.find((s) => s.id === socketId);
    }

    /** A player or a spectator — anyone in the room (used for chat, reports, leaving). */
    getMember(socketId) {
        return this.getPlayer(socketId) ?? this.getSpectator(socketId);
    }

    isEmpty() {
        return this.players.length === 0 && this.spectators.length === 0;
    }

    // Full when the players reach the room's player limit (spectators don't count).
    isFull() {
        return this.players.length >= this.settings.maxPlayers;
    }

    // A new player can join as a regular player: game not started and room not full.
    isJoinable() {
        return !this.gameStarted && !this.isFull();
    }

    /**
     * Makes another player the host (default: the first player). Spectators can never be host.
     * The new host doesn't ready up, so their ready flag is cleared. Returns the new host id.
     */
    transferHost(newHostId = this.players[0]?.id) {
        const next = this.getPlayer(newHostId);
        if (!next) return null;
        this.hostId = next.id;
        this.players.forEach((p) => { p.isHost = p.id === next.id; });
        next.ready = false;
        return next.id;
    }

    // ---------- Ready-up ----------

    // Players who must be ready before the host can start (everyone except the host).
    get nonHostPlayers() {
        return this.players.filter((player) => player.id !== this.hostId);
    }

    allNonHostReady() {
        return this.nonHostPlayers.every((player) => player.ready);
    }

    // Returns null if the game can start, otherwise the reason it can't.
    startBlocker() {
        if (this.players.length < 2) return "Minimum 2 players required";
        if (!this.allNonHostReady()) return "All players must be ready before starting";
        return null;
    }

    // Used whenever everyone goes back to the lobby (game start/over).
    resetReady() {
        this.players.forEach((player) => { player.ready = false; });
    }

    // ---------- Public view ----------

    /**
     * Settings everyone may see. The custom word list itself is left out (only its size),
     * so players can't read the possible answers; the host gets the list separately.
     */
    publicSettings() {
        const { customWords = [], ...rest } = this.settings;
        return { ...rest, customWordCount: customWords.length };
    }

    /** Everything clients may know about the room. Never includes the secret word. */
    toPublicJSON() {
        return {
            roomCode: this.roomCode,
            hostId: this.hostId,
            isPrivate: this.isPrivate,
            settings: this.publicSettings(),
            gameStarted: this.gameStarted,
            phase: this.game.phase,
            players: this.players.map((p) => p.toPublicJSON()),
            spectators: this.spectators.map((s) => s.toPublicJSON()),
        };
    }
}
