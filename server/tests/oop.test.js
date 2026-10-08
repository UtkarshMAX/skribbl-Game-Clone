// Phase 3 — Room / Game / Player / MessageHandler classes.
import { test } from "node:test";
import assert from "node:assert/strict";
import Room from "../models/Room.js";
import Player from "../models/Player.js";
import Game from "../models/Game.js";
import GameManager from "../managers/GameManager.js";
import MessageHandler from "../socket/MessageHandler.js";

const recordingIo = () => {
    const emits = [];
    return { emits, to: (target) => ({ emit: (event, data) => emits.push({ target, event, data }) }) };
};

test("Player has isHost, hasGuessedThisRound and a public view (no spectator flag — spectators are separate)", () => {
    const p = new Player("s1", "Ann", "🦊");
    assert.equal(p.isHost, false);
    assert.equal(p.hasGuessedThisRound, false);
    assert.deepEqual(Object.keys(p.toPublicJSON()).sort(),
        ["avatar", "hasGuessedThisRound", "id", "isHost", "name", "ready", "score"]);
});

test("Room.broadcast / sendTo go through io to the room or one player", () => {
    const io = recordingIo();
    const room = new Room("ABC123", "h", {}, io);
    room.broadcast("hello", { a: 1 });
    room.sendTo("p2", "secret", { b: 2 });
    assert.deepEqual(io.emits, [
        { target: "ABC123", event: "hello", data: { a: 1 } },
        { target: "p2", event: "secret", data: { b: 2 } },
    ]);
    // Without io (unit tests) messaging is a harmless no-op.
    assert.doesNotThrow(() => new Room("X", "h", {}).broadcast("x"));
});

test("Room.addPlayer marks the host; removePlayer returns the removed player", () => {
    const room = new Room("R1", "h", {});
    const host = room.addPlayer(new Player("h", "Host"));
    const guest = room.addPlayer(new Player("g", "Guest"));
    assert.equal(host.isHost, true);
    assert.equal(guest.isHost, false);
    assert.equal(room.removePlayer("g"), guest);
    assert.equal(room.removePlayer("nobody"), null);
    assert.equal(room.players.length, 1);
});

test("Room.transferHost moves the host flag and clears the new host's ready state", () => {
    const room = new Room("R2", "a", {});
    ["a", "b", "c"].forEach((id) => room.addPlayer(new Player(id, id + "x")));
    room.getPlayer("c").ready = true;
    assert.equal(room.transferHost("c"), "c");
    assert.equal(room.hostId, "c");
    assert.deepEqual(room.players.map((p) => p.isHost), [false, false, true]);
    assert.equal(room.getPlayer("c").ready, false);
    room.removePlayer("c");
    assert.equal(room.transferHost(), "a", "defaults to the first player");
    assert.equal(room.transferHost("ghost"), null);
});

test("Room.toPublicJSON never includes the secret word (or word options)", () => {
    const io = recordingIo();
    const room = new Room("R3", "a", { hintCount: 0 }, io);
    ["a", "b"].forEach((id) => room.addPlayer(new Player(id, id + "x")));
    room.game.startGame();
    room.game.wordOptions = ["Giraffe", "Penguin"];
    room.game.phase = "choosing";
    let json = JSON.stringify(room.toPublicJSON());
    assert.ok(!json.includes("Giraffe") && !json.includes("Penguin"), "no word options");
    room.game.selectWord("Giraffe");
    json = JSON.stringify(room.toPublicJSON());
    assert.equal(room.toPublicJSON().phase, "drawing");
    assert.ok(!json.toLowerCase().includes("giraffe"), "no secret word");
    room.game.reset();
});

test("GameManager is an alias of Game; Room owns a Game", () => {
    assert.equal(GameManager, Game);
    const room = new Room("R4", "a", {});
    assert.ok(room.game instanceof Game);
    assert.equal(room.gameManager, room.game);
});

test("Game owns the phase and per-player hasGuessedThisRound", () => {
    const io = recordingIo();
    const room = new Room("R5", "a", { hintCount: 0 }, io);
    ["a", "b", "c"].forEach((id) => room.addPlayer(new Player(id, id + "x")));
    const game = room.game;
    assert.equal(game.phase, "lobby");
    game.startGame();
    assert.equal(game.phase, "choosing");
    game.selectWord(game.wordOptions[0]);
    assert.equal(game.phase, "drawing");
    game.handleCorrectGuess(room.getPlayer("b"));
    assert.equal(room.getPlayer("b").hasGuessedThisRound, true);
    assert.equal(room.getPlayer("c").hasGuessedThisRound, false);
    // Messages went out through the room, not a raw io argument.
    assert.ok(io.emits.some((e) => e.event === "guess_result" && e.target === "R5"));
    assert.ok(io.emits.some((e) => e.event === "drawer_word" && e.target === "b"));
    game.handleCorrectGuess(room.getPlayer("c"));
    assert.equal(game.phase, "round_end");
    game.nextTurn();
    assert.equal(game.phase, "choosing");
    assert.ok(room.players.every((p) => p.hasGuessedThisRound === false), "reset for the next turn");
    game.endGame();
    assert.equal(game.phase, "game_over");
});

// ---------- MessageHandler ----------

function fakeSetup() {
    const io = recordingIo();
    const rooms = new Map();
    const fakeManager = {
        rooms,
        attach() {},
        getRoom: (code) => rooms.get(code),
    };
    const handler = new MessageHandler(io, fakeManager);
    const socket = {
        id: "s1", sent: [], listeners: {},
        emit(event, data) { this.sent.push({ event, data }); },
        on(event, fn) { this.listeners[event] = fn; },
    };
    return { io, rooms, handler, socket };
}

test("MessageHandler: registers routes, validates payload types", () => {
    const { handler, socket } = fakeSetup();
    const calls = [];
    handler.on("ping", { schema: { n: "number", label: "string?" }, handler: (ctx) => calls.push(ctx.payload) });
    handler.register(socket);
    socket.listeners.ping({ n: 3 });
    socket.listeners.ping({ n: "3" });
    socket.listeners.ping({ n: 1, label: 5 });
    socket.listeners.ping(null);
    assert.deepEqual(calls, [{ n: 3 }]);
    assert.deepEqual(socket.sent.map((s) => s.data.message), [
        "Invalid request: n must be a number",
        "Invalid request: label must be a string",
        "Invalid request: n is required",
    ]);
});

test("MessageHandler: permission checks run in order with custom messages; acks get failures too", () => {
    const { handler, socket, rooms } = fakeSetup();
    const room = new Room("ROOM01", "host", {});
    room.addPlayer(new Player("host", "Host"));
    rooms.set("ROOM01", room);
    let ran = 0;
    handler.on("host_thing", {
        schema: { roomCode: "string" },
        requires: ["room", "member", "host", "lobby"],
        messages: { host: "Only the host can do host things" },
        handler: () => { ran++; },
    });
    handler.register(socket);

    const acks = [];
    socket.listeners.host_thing({ roomCode: "NOPE00" }, (r) => acks.push(r));
    socket.listeners.host_thing({ roomCode: "ROOM01" });
    room.addPlayer(new Player("s1", "Me"));
    socket.listeners.host_thing({ roomCode: "ROOM01" });
    room.transferHost("s1");
    room.gameStarted = true;
    socket.listeners.host_thing({ roomCode: "ROOM01" });
    room.gameStarted = false;
    socket.listeners.host_thing({ roomCode: "ROOM01" });

    assert.equal(ran, 1);
    assert.deepEqual(socket.sent.map((s) => s.data.message), [
        "Room not found",
        "You are not in this room",
        "Only the host can do host things",
        "The game has already started",
    ]);
    assert.deepEqual(acks, [{ success: false, message: "Room not found" }]);
});

test("MessageHandler: silent routes drop failures; handler exceptions don't escape", () => {
    const { handler, socket } = fakeSetup();
    handler.on("quiet", { schema: { roomCode: "string" }, requires: ["room"], silent: true, handler: () => {} });
    handler.on("boom", { handler: () => { throw new Error("kaboom"); } });
    handler.register(socket);
    socket.listeners.quiet({ roomCode: "NOPE00" });
    assert.equal(socket.sent.length, 0);
    const origError = console.error; console.error = () => {};
    assert.doesNotThrow(() => socket.listeners.boom({}));
    console.error = origError;
    assert.deepEqual(socket.sent, [{ event: "error", data: { message: "Something went wrong on the server" } }]);
});
