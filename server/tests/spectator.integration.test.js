// Server-authoritative spectator mode, against a real server:
// role on join, secret-word protection, rejected gameplay actions, scores, disconnect, rounds, game over.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { io as connect } from "socket.io-client";

const PORT = 3992;
const URL = `http://localhost:${PORT}`;
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
const sockets = [];

before(async () => {
    server = spawn(process.execPath, ["index.js"], { cwd: serverDir, env: { ...process.env, PORT: String(PORT) } });
    server.out = "";
    server.stdout.on("data", (d) => { server.out += d; });
    await new Promise((resolve, reject) => {
        const t = setInterval(() => { if (server.out.includes("SERVER RUNNING")) { clearInterval(t); resolve(); } }, 50);
        setTimeout(() => reject(new Error("server did not start")), 8000);
    });
});
after(() => { sockets.forEach((s) => s.close()); server?.kill(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = async (label) => {
    const s = connect(URL, { transports: ["websocket"], forceNew: true });
    s.label = label;
    s.log = [];
    s.onAny((event, data) => s.log.push({ event, data }));
    sockets.push(s);
    await new Promise((resolve) => s.on("connect", resolve));
    return s;
};
const ack = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
const received = (s, event) => s.log.filter((e) => e.event === event).map((e) => e.data);
const waitFor = async (s, event, pred = () => true, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const hit = received(s, event).find(pred);
        if (hit) return hit;
        await sleep(25);
    }
    throw new Error(`[${s.label}] no "${event}" within ${ms}ms`);
};
const logText = (s, from = 0) => JSON.stringify(s.log.slice(from)).toLowerCase();

test("spectator mode: Utkarsh + Rahul play, Aman joins after the start", async () => {
    const A = await client("Utkarsh"), B = await client("Rahul");
    const { roomCode } = await ack(A, "create_room", { playerName: "Utkarsh", avatar: "😎", settings: { maxRounds: 2, drawTime: 30, hintCount: 1 } });
    assert.equal((await ack(B, "join_room", { roomCode, playerName: "Rahul", avatar: "😊" })).role, "player");
    B.emit("toggle_ready", { roomCode });
    await sleep(150);
    A.emit("start_game", { roomCode });
    const { words } = await waitFor(A, "word_options");

    // ---- Aman joins while Utkarsh is choosing ----
    const C = await client("Aman");
    const joined = await ack(C, "join_room", { roomCode, playerName: "Aman", avatar: "🙂" });
    assert.deepEqual(joined, { success: true, role: "spectator", gameStarted: true }, "joined after the start -> spectator");

    const snap = await waitFor(C, "game_snapshot");
    assert.equal(snap.gameState.drawerId, A.id, "sees the current drawer");
    assert.equal(snap.gameState.maxRounds, 2);
    assert.ok(Array.isArray(snap.strokes) && Array.isArray(snap.chat), "strokes + chat history");
    const roomView = await ack(C, "get_room", { roomCode });
    assert.deepEqual(roomView.players.map((p) => p.name), ["Utkarsh", "Rahul"], "players[] has players only");
    assert.deepEqual(roomView.spectators, [{ id: C.id, name: "Aman", avatar: "🙂", isSpectator: true }], "spectators[] is separate, no score");

    // TEST 1 — word selection: Rahul and Aman see "Utkarsh is choosing", never the options.
    const tick = await waitFor(C, "word_selection_tick", (t) => t.timeLeft <= 20);
    assert.equal(tick.drawerName, "Utkarsh");
    await waitFor(B, "word_selection_tick");
    for (const s of [B, C]) {
        assert.equal(received(s, "word_options").length, 0, `${s.label} never gets word_options`);
        for (const w of words) assert.ok(!logText(s).includes(`"${w.toLowerCase()}"`), `${s.label} never receives the option "${w}"`);
    }

    // TEST 3 (choosing phase) — every privileged action from the spectator is rejected.
    const errorsBefore = received(C, "error").length;
    C.emit("word_chosen", { roomCode, word: words[0] });
    C.emit("choose_word", { roomCode, word: words[0] });        // old event name — no handler
    C.emit("start_game", { roomCode });
    C.emit("update_settings", { roomCode, settings: { drawTime: 15 } });
    C.emit("toggle_ready", { roomCode });                     // rejected: lobby-only (checked first)
    C.emit("vote_kick", { roomCode, playerId: B.id });
    C.emit("kick_player", { roomCode, playerId: B.id });
    C.emit("play_again", { roomCode });
    await sleep(400);
    const errors = received(C, "error").slice(errorsBefore).map((e) => e.message);
    for (const expected of ["Only the host can start the game", "Only the host can change settings",
        "The game has already started", "Spectators can't vote to kick", "Only the host can kick players",
        "Only the host can start a new game"]) {
        assert.ok(errors.includes(expected), `rejected with "${expected}" (got ${JSON.stringify(errors)})`);
    }
    assert.equal(received(A, "word_selected").length, 0, "spectator could not choose the word");
    assert.equal(received(B, "settings_updated").length, 0, "settings unchanged");
    assert.equal(received(B, "kicked").length, 0, "Rahul not kicked");

    // Utkarsh (drawer) picks; only he gets the real word.
    A.emit("word_chosen", { roomCode, word: words[1] });
    const word = words[1];
    await waitFor(C, "word_selected");
    assert.equal(received(A, "drawer_word").at(-1).word, word);
    assert.equal(received(C, "drawer_word").length, 0, "spectator never gets drawer_word");

    // Live drawing reaches the spectator.
    A.emit("draw_start", { roomCode, x: 10, y: 10, color: "black", size: 5 });
    A.emit("draw_move", { roomCode, x: 30, y: 40 });
    A.emit("draw_end");
    await waitFor(C, "draw_move");

    // TEST 3 (drawing phase) — spectator drawing / undo / clear / guessing all rejected.
    const strokesSeen = received(B, "draw_start").length;
    C.emit("draw_start", { roomCode, x: 1, y: 1, color: "red", size: 9 });
    C.emit("draw_move", { roomCode, x: 2, y: 2 });
    C.emit("draw_undo", { roomCode });
    C.emit("canvas_clear", { roomCode });
    C.emit("guess", { roomCode, guess: word });
    C.emit("guess_word", { roomCode, guess: word });             // old event name — no handler
    await waitFor(C, "error", (e) => e.message === "Spectators can't guess");
    await sleep(300);
    assert.equal(received(B, "draw_start").length, strokesSeen, "no spectator stroke reached anyone");
    assert.equal(received(B, "draw_undo").length + received(B, "canvas_clear").filter(() => true).length, 0, "no undo / clear");
    const sync = (await new Promise((r) => { B.emit("sync_game", { roomCode }); setTimeout(r, 200); }), received(B, "game_snapshot").at(-1));
    assert.equal(sync.strokes.length, 1, "canvas still has exactly Utkarsh's stroke");
    assert.equal(received(B, "guess_result").length, 0, "spectator guess not scored or announced");
    assert.ok(!logText(B).includes(`"${word.toLowerCase()}"`), "Rahul never saw the word");
    assert.ok(!logText(C).includes(`"${word.toLowerCase()}"`), "Aman never saw the word (before the round ends)");

    // Spectator chat works and is marked.
    C.emit("chat", { roomCode, text: "Nice drawing!" });
    const msg = await waitFor(B, "chat_message", (m) => m.text === "Nice drawing!");
    assert.equal(msg.spectator, true);
    assert.equal(msg.playerName, "Aman");

    // TEST 4 — Rahul guesses; round completes without waiting for Aman; Aman never scores.
    B.emit("guess", { roomCode, guess: word });
    const end = await waitFor(C, "round_end");
    assert.deepEqual(end.scores.map((s) => s.name).sort(), ["Rahul", "Utkarsh"], "spectator not in round scores");
    for (const board of received(C, "leaderboard_update")) {
        assert.ok(!board.some((p) => p.name === "Aman"), "spectator never on the leaderboard");
    }

    // TEST 6 — new round: Rahul draws, Aman is still a spectator.
    const next = await waitFor(C, "new_round", () => true, 8000);
    assert.equal(next.drawerId, B.id, "a player draws next, never the spectator");
    assert.equal((await ack(C, "get_room", { roomCode })).spectators.length, 1);

    // TEST 5 — Aman disconnects: only he is removed; nothing about the game changes.
    const before = await ack(A, "get_room", { roomCode });
    const listUpdate = received(A, "player_list_update").length;
    C.close();
    await waitFor(A, "player_list_update", (u) => u.spectators?.length === 0 && received(A, "player_list_update").length > listUpdate);
    const afterLeave = await ack(A, "get_room", { roomCode });
    assert.deepEqual(afterLeave.players, before.players, "players, scores and host unchanged");
    assert.equal(afterLeave.hostId, before.hostId);
    assert.equal(afterLeave.phase, before.phase, "game phase unchanged");
    assert.equal(received(A, "new_host").length, 0, "no host change");
    assert.equal(received(A, "game_over").length, 0, "game not ended");
});

test("game over: spectators get game_over but are not on the leaderboard; play again promotes them", async () => {
    const A = await client("Utkarsh2"), B = await client("Rahul2");
    const { roomCode } = await ack(A, "create_room", { playerName: "Utkarsh", avatar: "😎", settings: { maxRounds: 2, drawTime: 30, hintCount: 0 } });
    await ack(B, "join_room", { roomCode, playerName: "Rahul", avatar: "😊" });
    B.emit("toggle_ready", { roomCode }); await sleep(150);
    A.emit("start_game", { roomCode });
    await waitFor(A, "word_options");
    const C = await client("Aman2");
    assert.equal((await ack(C, "join_room", { roomCode, playerName: "Aman", avatar: "🙂" })).role, "spectator");

    // Play all 4 turns quickly: the drawer picks, the other player guesses.
    for (let turn = 0; turn < 4; turn++) {
        const drawer = turn % 2 === 0 ? A : B, guesser = turn % 2 === 0 ? B : A;
        const { words } = await waitFor(drawer, "word_options", (o) => !o.used, 9000);
        received(drawer, "word_options").forEach((o) => { o.used = true; });
        drawer.emit("word_chosen", { roomCode, word: words[0] });
        await sleep(300);
        guesser.emit("guess", { roomCode, guess: words[0] });
        if (turn < 3) await waitFor(C, "new_round", (r) => !r.seen && (r.seen = true), 9000);
    }
    const over = await waitFor(C, "game_over", () => true, 9000);
    assert.deepEqual(over.leaderboard.map((p) => p.name).sort(), ["Rahul", "Utkarsh"], "spectator not on the final leaderboard");
    assert.notEqual(over.winner.name, "Aman");

    // A spectator can't play again; the host can, and the spectator becomes a player.
    C.emit("play_again", { roomCode });
    await waitFor(C, "error", (e) => /Only the host/.test(e.message));
    A.emit("play_again", { roomCode });
    await waitFor(C, "returned_to_lobby");
    const r = await ack(C, "get_room", { roomCode });
    assert.deepEqual(r.players.map((p) => p.name), ["Utkarsh", "Rahul", "Aman"]);
    assert.deepEqual(r.spectators, []);
});
