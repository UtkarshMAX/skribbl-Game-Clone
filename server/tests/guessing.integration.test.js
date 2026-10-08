// Phase 2 — guess flow, word-leak protection, round_end payload, rate limit and text limits,
// tested against a real server process with 3 connected players.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { io as connect } from "socket.io-client";

const PORT = 3998;
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
after(() => { sockets.forEach((s) => s.close()); server?.kill(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Connects a client that records every event it receives (in order).
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
const waitFor = async (s, event, pred = () => true, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const hit = received(s, event).find(pred);
        if (hit) return hit;
        await sleep(25);
    }
    throw new Error(`[${s.label}] no "${event}" within ${ms}ms`);
};
const everything = (s) => JSON.stringify(s.log).toLowerCase();

// Host A draws first (turn order = join order). B and C guess.
async function startGame(settings = {}) {
    const A = await client("A"), B = await client("B"), C = await client("C");
    const { roomCode } = await ack(A, "create_room", { playerName: "Alice", avatar: "🙂", settings: { wordCount: 5, category: "animal", hintCount: 0, drawTime: 60, ...settings } });
    await ack(B, "join_room", { roomCode, playerName: "Bob", avatar: "😎" });
    await ack(C, "join_room", { roomCode, playerName: "Cara", avatar: "🦊" });
    B.emit("toggle_ready", { roomCode }); C.emit("toggle_ready", { roomCode });
    await sleep(200);
    A.emit("start_game", { roomCode });
    const { words } = await waitFor(A, "word_options");
    return { A, B, C, roomCode, words };
}

test("full guess flow with word-leak protection", async () => {
    const { A, B, C, roomCode, words } = await startGame();
    assert.equal(words.length, 5);
    assert.equal(received(B, "word_options").length + received(C, "word_options").length, 0, "only the drawer gets word_options");

    // Drawer picks a word with ≥ 5 letters so a "close" guess is possible.
    const word = words.find((w) => w.length >= 5) ?? words[0];
    A.emit("word_chosen", { roomCode, word });
    await waitFor(C, "word_selected");
    await sleep(100);
    const lower = word.toLowerCase();

    // Old event names are gone.
    B.emit("guess_word", { roomCode, guess: word });
    await sleep(200);
    assert.equal(received(B, "guess_result").length, 0, "guess_word no longer exists");

    // 1) Wrong guess -> private guess_result to B, normal chat for everyone.
    B.emit("guess", { roomCode, guess: "zzzz" });
    const wrong = await waitFor(B, "guess_result");
    assert.deepEqual({ correct: wrong.correct, points: wrong.points, guess: wrong.guess }, { correct: false, points: 0, guess: "zzzz" });
    await waitFor(C, "chat_message", (m) => m.text === "zzzz" && m.playerName === "Bob");
    assert.equal(received(C, "guess_result").length, 0, "wrong results are not broadcast");

    // 2) Close guess -> close_guess to B only, not broadcast.
    const close = word.slice(0, -1) + (word.endsWith("q") ? "z" : "q");
    B.emit("guess", { roomCode, guess: close });
    const cg = await waitFor(B, "close_guess");
    assert.equal(cg.guess, close);
    await sleep(200);
    assert.equal(received(C, "close_guess").length, 0);
    assert.ok(!received(C, "chat_message").some((m) => m.text === close), "close guess not shown to others");

    // 3) A message containing the word (not a correct guess) is echoed to the sender only.
    B.emit("chat", { roomCode, text: `is it ${word} maybe` });
    await waitFor(B, "chat_message", (m) => m.private && m.text.includes(word));
    await sleep(200);

    // 4) The drawer's chat only goes to people who know the word.
    A.emit("chat", { roomCode, text: `psst it's ${word}` });
    await waitFor(A, "chat_message", (m) => m.type === "guessed");
    await sleep(200);

    assert.ok(!everything(C).includes(lower), "C (not guessed) never received the word");

    // 5) Correct guess typed in CHAT with odd case/punctuation -> scored, text never broadcast.
    B.emit("chat", { roomCode, text: `  ${word.toUpperCase()}!! ` });
    const right = await waitFor(C, "guess_result", (r) => r.correct);
    assert.equal(right.playerName, "Bob");
    assert.ok(right.points > 0);
    assert.equal("guess" in right, false, "guess text is not in the broadcast");
    await waitFor(C, "chat_message", (m) => m.type === "system" && m.tone === "success" && m.text === "Bob guessed the word!");
    assert.ok(!everything(C).includes(lower), "still no word for C after Bob's correct guess");
    assert.equal((await waitFor(B, "drawer_word")).word, word, "the correct guesser now gets the word");

    // 6) Bob (guessed) chats -> only A and Bob see it, styled "guessed".
    B.emit("chat", { roomCode, text: `haha ${word} was easy` });
    await waitFor(A, "chat_message", (m) => m.type === "guessed" && m.playerName === "Bob");
    await sleep(200);
    assert.ok(!everything(C).includes(lower), "guessed players' chat never reaches C");

    // 7) Bob can't score twice.
    B.emit("guess", { roomCode, guess: word });
    await sleep(200);
    assert.equal(received(C, "guess_result").filter((r) => r.correct && r.playerName === "Bob").length, 1);

    // 8) Cara guesses -> everyone guessed -> round_end with word, scores and next drawer.
    C.emit("guess", { roomCode, guess: word });
    const end = await waitFor(C, "round_end");
    assert.equal(end.word, word);
    const by = Object.fromEntries(end.scores.map((s) => [s.name, s]));
    assert.ok(by.Bob.earned > 0 && by.Cara.earned > 0 && by.Alice.earned > 0, JSON.stringify(end.scores));
    assert.ok(by.Bob.earned >= by.Cara.earned, "earlier guess earns at least as much (points use whole seconds left)");
    assert.equal(by.Alice.earned, by.Alice.score, "drawer earned points this turn");
    assert.equal(end.nextDrawerId, B.id, "Bob draws next");
    assert.equal(received(C, "round_end").length, 1);

    // 9) After the turn: normal chat again, and late guesses don't score or end the turn twice.
    C.emit("chat", { roomCode, text: `gg it was ${word}` });
    await waitFor(B, "chat_message", (m) => m.text === `gg it was ${word}`);
    const scoreBefore = by.Cara.score;
    await sleep(300);
    assert.equal(received(A, "round_end").length, 1, "turn ended exactly once");
    const lastBoard = received(A, "leaderboard_update").at(-1);
    assert.equal(lastBoard.find((p) => p.name === "Cara").score, scoreBefore);
});

test("time running out then a late guess does not score or skip the next drawer", async () => {
    const { A, B, C, roomCode, words } = await startGame({ drawTime: 15 });
    A.emit("word_chosen", { roomCode, word: words[0] });
    await waitFor(B, "word_selected");
    const end = await waitFor(B, "round_end", () => true, 20000);
    assert.equal(end.word, words[0]);
    B.emit("guess", { roomCode, guess: words[0] });
    await sleep(300);
    assert.equal(received(B, "guess_result").filter((r) => r.correct).length, 0, "no score after the turn ended");
    const turn = await waitFor(B, "new_round", () => true, 7000);
    assert.equal(turn.drawerId, B.id, "next drawer is Bob — nobody skipped");
    assert.equal(received(C, "round_end").length, 1);
});

test("rate limit: max 5 messages per 3 seconds, extras dropped with a private warning", async () => {
    const A = await client("RA"), B = await client("RB");
    const { roomCode } = await ack(A, "create_room", { playerName: "Spammy", avatar: "🙂", settings: {} });
    await ack(B, "join_room", { roomCode, playerName: "Reader", avatar: "😎" });
    for (let i = 1; i <= 8; i++) A.emit("chat", { roomCode, text: `spam ${i}` });
    await sleep(500);
    const got = received(B, "chat_message").filter((m) => m.text?.startsWith("spam"));
    assert.equal(got.length, 5, `reader got ${got.length}`);
    const warnings = received(A, "error").filter((e) => /too fast/.test(e.message));
    assert.equal(warnings.length, 3);
    assert.equal(received(B, "error").length, 0, "warning is private");
    await sleep(3100);
    A.emit("chat", { roomCode, text: "back again" });
    await waitFor(B, "chat_message", (m) => m.text === "back again");
});

test("text is trimmed and length-limited on the server", async () => {
    const A = await client("TA"), B = await client("TB");
    const { roomCode } = await ack(A, "create_room", { playerName: "Longy", avatar: "🙂", settings: {} });
    await ack(B, "join_room", { roomCode, playerName: "Reader2", avatar: "😎" });
    A.emit("chat", { roomCode, text: "   " + "a".repeat(400) + "   " });
    A.emit("chat", { roomCode, text: "    " });
    A.emit("chat", { roomCode, text: { evil: true } });
    A.emit("chat", { roomCode, text: "line1\nline2" });
    await waitFor(B, "chat_message", (m) => m.text === "line1 line2");
    const msgs = received(B, "chat_message").filter((m) => m.playerName === "Longy");
    assert.equal(msgs.length, 2, "blank and non-string messages dropped");
    assert.equal(msgs[0].text.length, 150);
});
