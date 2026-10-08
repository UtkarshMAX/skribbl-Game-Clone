// Phase 4 against a real server: kick/ban, vote kick, report, leave, spectators + snapshot,
// replay strokes, custom words visibility, play again.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { io as connect } from "socket.io-client";

const PORT = 3997;
const URL = `http://localhost:${PORT}`;
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
const sockets = [];

before(async () => {
    server = spawn(process.execPath, ["index.js"], { cwd: serverDir, env: { ...process.env, PORT: String(PORT) } });
    server.stdout.on("data", (d) => { server.out = (server.out || "") + d; });
    await new Promise((resolve, reject) => {
        const t = setInterval(() => { if ((server.out || "").includes("SERVER RUNNING")) { clearInterval(t); resolve(); } }, 50);
        server.on("error", reject);
        setTimeout(() => reject(new Error("server did not start")), 8000);
    });
});
after(() => { sockets.forEach((s) => s.close()); server?.kill(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const client = async (label) => {
    const s = connect(URL, { transports: ["websocket"], forceNew: true });
    s.label = label;
    s.clientId = `client-${label}-${++n}-abcdef`;
    s.log = [];
    s.onAny((event, data) => s.log.push({ event, data }));
    sockets.push(s);
    await new Promise((resolve) => s.on("connect", resolve));
    return s;
};
const ack = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
const received = (s, event) => s.log.filter((e) => e.event === event).map((e) => e.data);
const waitFor = async (s, event, pred = () => true, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const hit = received(s, event).find(pred);
        if (hit) return hit;
        await sleep(25);
    }
    throw new Error(`[${s.label}] no "${event}" within ${ms}ms`);
};
const create = (s, name, settings = {}) => ack(s, "create_room", { playerName: name, avatar: "🙂", clientId: s.clientId, settings });
const join = (s, roomCode, name, extra = {}) => ack(s, "join_room", { roomCode, playerName: name, avatar: "😎", clientId: s.clientId, ...extra });
const room = (s, roomCode) => ack(s, "get_room", { roomCode });

async function lobby(names, settings = {}) {
    const socks = [];
    for (const name of names) socks.push(await client(name));
    const { roomCode } = await create(socks[0], names[0], settings);
    for (let i = 1; i < socks.length; i++) await join(socks[i], roomCode, names[i]);
    return { roomCode, socks };
}

async function startGame(socks, roomCode) {
    for (const s of socks.slice(1)) s.emit("toggle_ready", { roomCode });
    await sleep(200);
    socks[0].emit("start_game", { roomCode });
    return waitFor(socks[0], "word_options");
}

// ---------- 4.1 Kick / ban ----------

test("host kicks a player: they get `kicked`, are removed and stop receiving room events", async () => {
    const { roomCode, socks: [H, A, B] } = await lobby(["Host", "Amy", "Ben"]);
    let err = waitFor(A, "error", (e) => /Only the host can kick/.test(e.message));
    A.emit("kick_player", { roomCode, playerId: B.id });
    await err;
    err = waitFor(H, "error", (e) => /kick yourself/.test(e.message));
    H.emit("kick_player", { roomCode, playerId: H.id });
    await err;

    H.emit("kick_player", { roomCode, playerId: B.id });
    const kicked = await waitFor(B, "kicked");
    assert.equal(kicked.banned, false);
    assert.match(kicked.reason, /kicked/);
    await waitFor(A, "chat_message", (m) => m.text === "Ben was kicked by the host");
    assert.deepEqual((await room(H, roomCode)).players.map((p) => p.name), ["Host", "Amy"]);

    const before = B.log.length;
    H.emit("chat", { roomCode, text: "anyone there?" });
    await waitFor(A, "chat_message", (m) => m.text === "anyone there?");
    assert.equal(B.log.length, before, "kicked socket left the Socket.IO room");

    // A kicked (not banned) player may come back.
    assert.equal((await join(B, roomCode, "Ben")).success, true);
});

test("ban: banned clientId can't rejoin (even with a new connection) and Quick Play skips the room", async () => {
    const { roomCode, socks: [H, A] } = await lobby(["Host2", "Amy2"], { isPrivate: false });
    H.emit("kick_player", { roomCode, playerId: A.id, ban: true });
    assert.equal((await waitFor(A, "kicked")).banned, true);
    assert.deepEqual(await join(A, roomCode, "Amy2"), { success: false, message: "You are banned from this room" });

    const A2 = await client("Amy2b");
    A2.clientId = A.clientId; // same browser, new socket
    assert.equal((await join(A2, roomCode, "Amy2")).success, false);
    A2.emit("quick_play", { playerName: "Amy2", emojiIndex: 0, clientId: A.clientId });
    const { roomCode: qp } = await waitFor(A2, "quick_play_joined");
    assert.notEqual(qp, roomCode, "Quick Play does not drop a banned player back in");

    const other = await client("Other");
    assert.equal((await join(other, roomCode, "Other")).success, true, "other players are unaffected");
});

test("kicking the drawer ends the turn and moves on", async () => {
    const { roomCode, socks } = await lobby(["Host3", "Amy3", "Ben3"]);
    const [H, A] = socks;
    await startGame(socks, roomCode); // host draws first; the host can't kick themself,
    // so play turn 1 quickly (everyone guesses) and kick Amy while she draws turn 2.
    const { words } = received(H, "word_options")[0];
    H.emit("word_chosen", { roomCode, word: words[0] });
    await waitFor(A, "word_selected");
    A.emit("guess", { roomCode, guess: words[0] });
    socks[2].emit("guess", { roomCode, guess: words[0] });
    const turn = await waitFor(A, "new_round", () => true, 8000);
    assert.equal(turn.drawerId, A.id);

    H.emit("kick_player", { roomCode, playerId: A.id });
    const next = await waitFor(socks[2], "new_round", (r) => r.drawerId !== A.id, 4000);
    assert.equal(next.drawerId, socks[2].id, "next player draws");
});

// ---------- 4.2 Vote kick ----------

test("vote kick: one vote per voter, progress in chat, kicked at > 50% of eligible voters", async () => {
    const { roomCode, socks: [H, A, B, C] } = await lobby(["Host4", "Amy4", "Ben4", "Cat4"]);
    // 4 players, target Cat -> 3 eligible -> 2 votes needed.
    A.emit("vote_kick", { roomCode, playerId: C.id });
    await waitFor(H, "chat_message", (m) => m.text === "Vote kick Cat4: 1/2");
    const dup = waitFor(A, "error", (e) => /already voted/.test(e.message));
    A.emit("vote_kick", { roomCode, playerId: C.id });
    await dup;
    const self = waitFor(C, "error", (e) => /yourself/.test(e.message));
    C.emit("vote_kick", { roomCode, playerId: C.id });
    await self;
    assert.equal(received(C, "kicked").length, 0);

    B.emit("vote_kick", { roomCode, playerId: C.id });
    await waitFor(H, "chat_message", (m) => m.text === "Vote kick Cat4: 2/2");
    const kicked = await waitFor(C, "kicked");
    assert.match(kicked.reason, /vote kick/);
    await waitFor(H, "chat_message", (m) => m.text === "Cat4 was removed by a vote kick");
});

// ---------- 4.3 Report ----------

test("report is confirmed privately and logged on the server", async () => {
    const { roomCode, socks: [H, A] } = await lobby(["Host5", "Amy5"]);
    A.emit("report_player", { roomCode, playerId: H.id, reason: "rude drawing" });
    assert.equal((await waitFor(A, "report_received")).playerName, "Host5");
    await sleep(200);
    assert.equal(received(H, "report_received").length, 0, "the reported player isn't told");
    assert.match(server.out, /\[report\] room \w+: Amy5 reported Host5 .* rude drawing/);
});

// ---------- leave_room ("Back to home") ----------

test("leave_room removes the player (no ghost) and hands over host", async () => {
    const { roomCode, socks: [H, A] } = await lobby(["Host6", "Amy6"]);
    H.emit("leave_room", { roomCode });
    assert.equal(await waitFor(A, "new_host"), A.id);
    const r = await room(A, roomCode);
    assert.deepEqual(r.players.map((p) => p.name), ["Amy6"]);
    assert.equal(r.players[0].isHost, true);
});

// ---------- 4.5 Spectators + snapshot, 4.6 replay strokes ----------

test("joining a running game makes you a spectator with a full snapshot; spectators can't draw, guess or score", async () => {
    const { roomCode, socks } = await lobby(["Host7", "Amy7"], { hintCount: 0 });
    const [H, A] = socks;
    const { words } = await startGame(socks, roomCode);
    H.emit("word_chosen", { roomCode, word: words[0] });
    await waitFor(A, "word_selected");
    H.emit("draw_start", { roomCode, x: 10, y: 10, color: "red", size: 5 });
    H.emit("draw_move", { roomCode, x: 20, y: 25 });
    H.emit("draw_end");
    await waitFor(A, "draw_move");

    const S = await client("Spec7");
    const res = await join(S, roomCode, "Spec7");
    assert.deepEqual(res, { success: true, role: "spectator", gameStarted: true });
    const snap = await waitFor(S, "game_snapshot");
    assert.equal(snap.gameState.drawerId, H.id);
    assert.equal(snap.gameState.phase, "drawing");
    assert.equal(snap.strokes.length, 1);
    assert.equal(snap.strokes[0].points.length, 2);
    assert.ok(snap.strokes[0].points.every((p) => typeof p.t === "number"), "points are timestamped");
    assert.ok(!JSON.stringify(snap).toLowerCase().includes(words[0].toLowerCase()), "no word in the snapshot");

    // sync_game returns the same snapshot on demand.
    S.emit("sync_game", { roomCode });
    await waitFor(S, "game_snapshot", (s) => s !== snap);

    // Spectator can't draw.
    S.emit("draw_start", { roomCode, x: 1, y: 1, color: "blue", size: 3 });
    // Spectator guess (even the right word) is rejected by the server: no score, nothing shown.
    S.emit("guess", { roomCode, guess: words[0] });
    await waitFor(S, "error", (e) => e.message === "Spectators can't guess");
    // Typing the word in chat is only echoed back to the spectator.
    S.emit("chat", { roomCode, text: words[0] });
    await waitFor(S, "chat_message", (m) => m.private);
    S.emit("chat", { roomCode, text: "nice drawing" });
    const specMsg = await waitFor(A, "chat_message", (m) => m.text === "nice drawing");
    assert.equal(specMsg.spectator, true, "spectator chat is marked so it can show 👁");
    await sleep(200);
    assert.equal(received(A, "draw_start").length, 1, "spectator stroke was dropped");
    assert.equal(received(A, "guess_result").length, 0, "spectator never scores");
    assert.ok(!JSON.stringify(A.log).toLowerCase().includes(words[0].toLowerCase()), "Amy never saw the word");

    // Amy guesses -> round ends without waiting for the spectator; replay strokes included.
    A.emit("guess", { roomCode, guess: words[0] });
    const end = await waitFor(S, "round_end");
    assert.deepEqual(end.scores.map((s) => s.name).sort(), ["Amy7", "Host7"]);
    assert.equal(end.strokes.length, 1);
    assert.ok(end.strokes[0].points[1].t >= end.strokes[0].points[0].t);
});

test("before the game starts everyone joins as a player (the client can't ask to be a spectator)", async () => {
    const { roomCode } = await lobby(["Host8"], { maxPlayers: 2 });
    const P = await client("Play8");
    assert.equal((await join(P, roomCode, "Play8", { spectator: true })).role, "player", "role is decided by the server");
    const r = await room(P, roomCode);
    assert.deepEqual(r.players.map((p) => p.name), ["Host8", "Play8"]);
    assert.deepEqual(r.spectators, []);
    const late = await client("Late8");
    assert.deepEqual(await join(late, roomCode, "Late8"), { success: false, message: "Room is full" });
});

// ---------- 4.4 custom words, 4.7 language ----------

test("custom words: validated, only the host sees the list, game uses them", async () => {
    const H = await client("Host9");
    const bad = await create(H, "Host9", { customWords: "one,two", onlyCustomWords: true });
    assert.equal(bad.success, false);
    assert.match(bad.message, /at least 10/);

    const list = "Alpha,Bravo,Charlie,Delta,Echo,Foxtrot,Golf,Hotel,India,Juliet";
    const { roomCode } = await create(H, "Host9", { customWords: list + ",bad<word>", onlyCustomWords: true, wordCount: 5 });
    const A = await client("Amy9");
    await join(A, roomCode, "Amy9");
    const hostView = await room(H, roomCode);
    const guestView = await room(A, roomCode);
    assert.equal(hostView.customWords.length, 10);
    assert.equal(guestView.customWords, undefined);
    assert.equal(guestView.settings.customWordCount, 10);
    assert.ok(!JSON.stringify(guestView).includes("Foxtrot"));

    H.emit("update_settings", { roomCode, settings: { customWords: list + ",Kilo" } });
    assert.equal((await waitFor(H, "custom_words")).words.length, 11);
    const upd = await waitFor(A, "settings_updated");
    assert.equal(upd.settings.customWordCount, 11);
    assert.equal(received(A, "custom_words").length, 0, "guest never receives the list");

    const { words } = await startGame([H, A], roomCode);
    assert.equal(words.length, 5);
    for (const w of words) assert.ok((list + ",Kilo").split(",").includes(w), w);
});

test("Hindi language room offers Hindi words", async () => {
    const H = await client("Host10"), A = await client("Amy10");
    const { roomCode } = await create(H, "Host10", { language: "hi", category: "animal", wordCount: 5 });
    await join(A, roomCode, "Amy10");
    const { words } = await startGame([H, A], roomCode);
    const hindiAnimals = (await import("../data/words.hi.js")).default.animal;
    for (const w of words) assert.ok(hindiAnimals.includes(w), w);
});

// ---------- 4.8 Play again ----------

test("play again: host only, after game over; everyone returns to the lobby with scores and ready reset", async () => {
    const { roomCode, socks } = await lobby(["Host11", "Amy11"], { maxRounds: 2, drawTime: 15, hintCount: 0 });
    const [H, A] = socks;
    let err = waitFor(H, "error", (e) => /only play again after the game ends/.test(e.message));
    H.emit("play_again", { roomCode });
    await err;

    const { words } = await startGame(socks, roomCode);
    H.emit("word_chosen", { roomCode, word: words[0] });
    await waitFor(A, "word_selected");
    A.emit("guess", { roomCode, guess: words[0] }); // Amy scores
    // Late spectator joins mid-game; will be promoted on play again.
    const S = await client("Spec11");
    assert.equal((await join(S, roomCode, "Spec11")).role, "spectator");
    // Make the game end quickly: Amy leaves -> fewer than 2 active players -> game over.
    const A2 = A;
    A2.emit("leave_room", { roomCode });
    const over = await waitFor(H, "game_over");
    assert.equal(over.winner.name, "Host11");

    err = waitFor(S, "error", (e) => /Only the host/.test(e.message));
    S.emit("play_again", { roomCode });
    await err;

    H.emit("play_again", { roomCode });
    await waitFor(S, "returned_to_lobby");
    const r = await room(H, roomCode);
    assert.equal(r.gameStarted, false);
    assert.equal(r.phase, "lobby");
    assert.deepEqual(r.players.map((p) => [p.name, p.score, p.ready]), [
        ["Host11", 0, false],
        ["Spec11", 0, false],
    ], "the spectator became a player");
    assert.deepEqual(r.spectators, []);
});
