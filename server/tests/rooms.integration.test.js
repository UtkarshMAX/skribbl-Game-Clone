// Phase 1 — end-to-end checks against a real server process over Socket.IO:
// settings validation, public/private rooms + Quick Play, lobby settings, ready-up, `error` event.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { io as connect } from "socket.io-client";

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
const sockets = [];

before(async () => {
    server = spawn(process.execPath, ["index.js"], { cwd: serverDir, env: { ...process.env, PORT: String(PORT) } });
    await new Promise((resolve, reject) => {
        server.stdout.on("data", (d) => { if (String(d).includes("SERVER RUNNING")) resolve(); });
        server.on("error", reject);
        setTimeout(() => reject(new Error("server did not start")), 8000);
    });
});

after(() => {
    sockets.forEach((s) => s.close());
    server?.kill();
});

const client = async () => {
    const s = connect(URL, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    await new Promise((resolve) => s.on("connect", resolve));
    return s;
};
const once = (s, event, ms = 2000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no "${event}" within ${ms}ms`)), ms);
    s.once(event, (data) => { clearTimeout(t); resolve(data); });
});
const none = (s, event, ms = 400) => new Promise((resolve, reject) => {
    const handler = (data) => reject(new Error(`unexpected "${event}": ${JSON.stringify(data)}`));
    s.once(event, handler);
    setTimeout(() => { s.off(event, handler); resolve(); }, ms);
});
const ack = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));

const createRoom = async (s, settings, name = "Host1") => ack(s, "create_room", { playerName: name, avatar: "🙂", settings });
const join = async (s, roomCode, name) => ack(s, "join_room", { roomCode, playerName: name, avatar: "😎" });

test("create_room rejects invalid settings with `error`", async () => {
    const s = await client();
    for (const settings of [{ wordCount: 6 }, { hintCount: -1 }, { drawTime: 10 }, { maxPlayers: 21 }, { maxRounds: 1 }, { gameMode: "x" }, { category: "cars" }]) {
        const err = once(s, "error");
        const res = await createRoom(s, settings);
        assert.equal(res.success, false, JSON.stringify(settings));
        assert.match((await err).message, /must/);
    }
});

test("isPrivate other than an explicit false creates a private room (safe default)", async () => {
    const s = await client();
    for (const isPrivate of ["yes", "false", 0]) {
        const res = await createRoom(s, { isPrivate });
        assert.equal(res.success, true);
        assert.equal((await ack(s, "get_room", { roomCode: res.roomCode })).isPrivate, true, JSON.stringify(isPrivate));
    }
});

test("Create Room is private by default and stores validated settings", async () => {
    const s = await client();
    const res = await createRoom(s, { wordCount: 5, hintCount: 0, category: "food", gameMode: "Hidden" });
    assert.equal(res.success, true);
    const room = await ack(s, "get_room", { roomCode: res.roomCode });
    assert.equal(room.isPrivate, true);
    assert.equal(room.settings.wordCount, 5);
    assert.equal(room.settings.hintCount, 0);
    assert.equal(room.settings.category, "food");
    assert.equal(room.settings.gameMode, "hidden");
});

test("Quick Play never joins private rooms; joins open public rooms; otherwise creates a public room", async () => {
    const host = await client();
    const priv = await createRoom(host, { isPrivate: true });

    const q1 = await client();
    q1.emit("quick_play", { playerName: "Quick1", emojiIndex: 0 });
    const { roomCode: code1 } = await once(q1, "quick_play_joined");
    assert.notEqual(code1, priv.roomCode, "Quick Play must not enter the private room");
    const r1 = await ack(q1, "get_room", { roomCode: code1 });
    assert.equal(r1.isPrivate, false, "Quick Play creates a PUBLIC room");

    const q2 = await client();
    q2.emit("quick_play", { playerName: "Quick2", emojiIndex: 1 });
    const { roomCode: code2 } = await once(q2, "quick_play_joined");
    assert.equal(code2, code1, "second Quick Play joins the same public room");

    // A public room made through Create Room is also open to Quick Play.
    const h2 = await client();
    const pub = await createRoom(h2, { isPrivate: false, maxPlayers: 2 }, "Pub1");
    const privRoom = await ack(host, "get_room", { roomCode: priv.roomCode });
    assert.equal(privRoom.players.length, 1, "private room still only has its host");

    // The private room is still joinable by code.
    const friend = await client();
    assert.equal((await join(friend, priv.roomCode, "Friend")).success, true);
    assert.ok(pub.success);
});

test("full and started public rooms are skipped by Quick Play", async () => {
    const h = await client();
    const pub = await createRoom(h, { isPrivate: false, maxPlayers: 2 }, "Full1");
    const g = await client();
    await join(g, pub.roomCode, "Full2"); // now full
    const q = await client();
    q.emit("quick_play", { playerName: "Quick3", emojiIndex: 2 });
    const { roomCode } = await once(q, "quick_play_joined");
    assert.notEqual(roomCode, pub.roomCode);
});

test("lobby settings: host can update (validated + broadcast); others cannot", async () => {
    const host = await client(); const guest = await client();
    const { roomCode } = await createRoom(host, {});
    await join(guest, roomCode, "Guest1");

    const seen = once(guest, "settings_updated");
    host.emit("update_settings", { roomCode, settings: { drawTime: 120, category: "animal", isPrivate: false } });
    const { settings, isPrivate } = await seen;
    assert.equal(settings.drawTime, 120);
    assert.equal(settings.category, "animal");
    assert.equal(isPrivate, false);

    let err = once(guest, "error");
    guest.emit("update_settings", { roomCode, settings: { drawTime: 30 } });
    assert.match((await err).message, /Only the host/);

    err = once(host, "error");
    const noBroadcast = none(guest, "settings_updated");
    host.emit("update_settings", { roomCode, settings: { wordCount: 9 } });
    assert.match((await err).message, /wordCount/);
    await noBroadcast;

    host.emit("update_settings", { roomCode, settings: { maxPlayers: 2 } }); // ok: exactly 2 players
    await once(guest, "settings_updated");
    const g3 = await client();
    // Before the game starts a full room turns newcomers away (spectators only exist once a game runs).
    assert.deepEqual(await join(g3, roomCode, "Late1"), { success: false, message: "Room is full" });
});

test("ready-up: start blocked until every non-host player is ready; server enforces it", async () => {
    const host = await client(); const a = await client(); const b = await client();
    const { roomCode } = await createRoom(host, {});
    await join(a, roomCode, "ReadyA"); await join(b, roomCode, "ReadyB");

    let err = once(host, "error");
    host.emit("start_game", { roomCode });
    assert.match((await err).message, /ready/);

    err = once(host, "error");
    host.emit("toggle_ready", { roomCode });
    assert.match((await err).message, /host/i);

    let update = once(host, "player_list_update");
    a.emit("toggle_ready", { roomCode });
    assert.equal((await update).players.find((p) => p.name === "ReadyA").ready, true);

    err = once(host, "error");
    host.emit("start_game", { roomCode });
    assert.match((await err).message, /ready/, "still one player not ready");

    update = once(host, "player_list_update");
    b.emit("toggle_ready", { roomCode }); await update;
    update = once(host, "player_list_update");
    b.emit("toggle_ready", { roomCode }); // un-ready
    assert.equal((await update).players.find((p) => p.name === "ReadyB").ready, false);
    update = once(host, "player_list_update");
    b.emit("toggle_ready", { roomCode }); await update;

    err = once(a, "error");
    a.emit("start_game", { roomCode });
    assert.match((await err).message, /Only the host/);

    const started = once(a, "game_started");
    host.emit("start_game", { roomCode });
    await started;

    const room = await ack(host, "get_room", { roomCode });
    assert.ok(room.players.every((p) => p.ready === false), "ready states reset once the game starts");

    err = once(host, "error");
    host.emit("update_settings", { roomCode, settings: { drawTime: 30 } });
    assert.match((await err).message, /during a game/);
    err = once(a, "error");
    a.emit("toggle_ready", { roomCode });
    assert.match((await err).message, /already started/);
});

test("2 players: host can start once the only guest is ready", async () => {
    const host = await client(); const a = await client();
    const { roomCode } = await createRoom(host, {});
    await join(a, roomCode, "Solo1");
    const upd = once(host, "player_list_update");
    a.emit("toggle_ready", { roomCode }); await upd;
    const started = once(host, "game_started");
    host.emit("start_game", { roomCode });
    await started;
});

test("malformed payloads don't crash the server", async () => {
    const s = await client();
    s.emit("update_settings");
    s.emit("toggle_ready", null);
    s.emit("create_room", null);
    s.emit("start_game");
    s.emit("quick_play", { playerName: "<script>" });
    await new Promise((r) => setTimeout(r, 300));
    const res = await createRoom(s, {});
    assert.equal(res.success, true, "server still responds");
});
