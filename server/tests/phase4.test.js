// Phase 4 unit tests: custom words, word pools / languages, vote-kick maths, spectators, replay data, play again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeCustomWords, validateSettings } from "../utils/roomSettings.js";
import WordManager, { WORD_LISTS } from "../utils/WordManager.js";
import Room from "../models/Room.js";
import Player from "../models/Player.js";
import Spectator from "../models/Spectator.js";

const recordingIo = () => {
    const emits = [];
    return { emits, to: (target) => ({ emit: (event, data) => emits.push({ target, event, data }) }), in: () => ({ socketsLeave() {} }) };
};

// ---------- 4.4 Custom words ----------

test("sanitizeCustomWords: trims, 1–30 chars, letters/spaces/hyphens only, dedupes (any case)", () => {
    const words = sanitizeCustomWords("  Taj Mahal , taj mahal, Ice-cream,,  R2D2, a, " + "x".repeat(31) + ", <b>bold</b>, 🍕, Crème brûlée ,  - , Spider   Man");
    assert.deepEqual(words, ["Taj Mahal", "Ice-cream", "a", "Crème brûlée", "Spider Man"]);
    assert.deepEqual(sanitizeCustomWords(["Cat", 5, null, "cat", "Dog"]), ["Cat", "Dog"]);
    assert.deepEqual(sanitizeCustomWords(42), []);
});

test("onlyCustomWords needs at least 10 valid words", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `word${"abcdefghij"[i]}`).join(",");
    assert.equal(validateSettings({ customWords: nine, onlyCustomWords: true }).ok, false);
    const ten = nine + ",wordz";
    const ok = validateSettings({ customWords: ten, onlyCustomWords: true });
    assert.equal(ok.ok, true);
    assert.equal(ok.settings.customWords.length, 10);
    // Invalid entries don't count toward the 10.
    assert.equal(validateSettings({ customWords: nine + ",123", onlyCustomWords: true }).ok, false);
    assert.equal(validateSettings({ customWords: { a: 1 } }).ok, false);
});

test("word pool merges custom words, or uses only them", () => {
    const custom = ["Jalebi Baba", "Chai Break", "Lion"];
    const merged = WordManager.buildPool({ category: "animal", customWords: custom });
    assert.ok(merged.includes("Tiger") && merged.includes("Jalebi Baba"));
    assert.equal(merged.filter((w) => w.toLowerCase() === "lion").length, 1, "no duplicate with built-ins");
    assert.deepEqual(WordManager.buildPool({ customWords: custom, onlyCustomWords: true }), custom);
});

test("a room with only custom words offers only custom words (incl. combination mode)", () => {
    const customWords = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
    const room = new Room("CW0001", "a", { customWords, onlyCustomWords: true, wordCount: 5 });
    for (let i = 0; i < 20; i++) {
        for (const w of room.game.generateWordOptions()) assert.ok(customWords.includes(w), w);
    }
    const combo = new Room("CW0002", "a", { customWords, onlyCustomWords: true, gameMode: "combination" });
    for (const w of combo.game.generateWordOptions()) {
        const [x, y] = w.split(" + ");
        assert.ok(customWords.includes(x) && customWords.includes(y) && x !== y, w);
    }
});

test("non-hosts only see how many custom words there are", () => {
    const room = new Room("CW0003", "a", { customWords: "Secret One, Secret Two" });
    const json = JSON.stringify(room.toPublicJSON());
    assert.ok(!json.includes("Secret"));
    assert.equal(room.toPublicJSON().settings.customWordCount, 2);
});

// ---------- 4.7 Languages ----------

test("Hindi list has the same categories as English, with enough words each", () => {
    assert.deepEqual(Object.keys(WORD_LISTS.hi).sort(), Object.keys(WORD_LISTS.en).sort());
    for (const [category, list] of Object.entries(WORD_LISTS.hi)) {
        assert.ok(list.length >= 25, `${category}: ${list.length}`);
        assert.equal(new Set(list.map((w) => w.toLowerCase())).size, list.length, `${category} has duplicates`);
        for (const w of list) assert.match(w, /^[A-Za-z -]{1,30}$/, `${category}: ${w}`);
    }
});

test("language setting picks the word list", () => {
    assert.equal(validateSettings({ language: "hi" }).settings.language, "hi");
    assert.equal(validateSettings({ language: "fr" }).ok, false);
    const room = new Room("HI0001", "a", { language: "hi", category: "food", wordCount: 5 });
    for (const w of room.game.generateWordOptions()) assert.ok(WORD_LISTS.hi.food.includes(w), w);
});

// ---------- 4.2 Vote kick maths ----------

test("vote kick needs more than half of everyone except the target", () => {
    const room = new Room("VK0001", "a", {});
    const needed = (n) => {
        room.players = [];
        for (let i = 0; i < n; i++) room.addPlayer(new Player(`p${i}`, `P${i}`));
        return room.votesNeededToKick("p0"); // target = p0, so the other players vote
    };
    assert.equal(needed(2), 1); // 1 eligible -> 1
    assert.equal(needed(3), 2); // 2 eligible -> 2
    assert.equal(needed(4), 2); // 3 eligible -> 2
    assert.equal(needed(5), 3); // 4 eligible -> 3
    assert.equal(needed(8), 4); // 7 eligible -> 4
});

// ---------- 4.5 Spectators ----------

test("spectators are not in the turn order, can't guess, and don't count for start", () => {
    const io = recordingIo();
    const room = new Room("SP0001", "a", { hintCount: 0 }, io);
    room.addPlayer(new Player("a", "Ann"));
    room.addSpectator(new Spectator("s", "Spec"));
    assert.equal(room.startBlocker(), "Minimum 2 players required");
    room.addPlayer(new Player("b", "Bob"));
    room.getPlayer("b").ready = true;
    assert.equal(room.startBlocker(), null, "spectator doesn't need to be ready");

    const game = room.game;
    game.startGame();
    const drawers = [game.currentDrawerId];
    game.selectWord(game.wordOptions[0]);
    assert.equal(game.canGuess("s"), false);
    assert.equal(room.getPlayer("s"), undefined, "spectators are never in room.players");
    assert.equal(game.phase, "drawing");
    game.handleCorrectGuess(room.getPlayer("b"));
    assert.equal(game.phase, "round_end", "only Bob had to guess");
    const roundEnd = io.emits.find((e) => e.event === "round_end").data;
    assert.deepEqual(roundEnd.scores.map((s) => s.name).sort(), ["Ann", "Bob"], "spectator not in scores");
    game.nextTurn();
    drawers.push(game.currentDrawerId);
    assert.deepEqual(drawers, ["a", "b"], "spectator never draws");
    game.reset();
});

test("snapshot has state + strokes and never the word", () => {
    const io = recordingIo();
    const room = new Room("SP0002", "a", { hintCount: 0 }, io);
    room.addPlayer(new Player("a", "Ann")); room.addPlayer(new Player("b", "Bob"));
    room.game.startGame();
    room.game.selectWord(room.game.wordOptions[0]);
    room.canvasStrokes.push({ id: "s1", color: "red", size: 4, points: [{ x: 1, y: 2, t: 0 }] });
    const snap = room.game.snapshot();
    assert.equal(snap.gameState.drawerId, "a");
    assert.equal(snap.gameState.phase, "drawing");
    assert.equal(snap.strokes.length, 1);
    assert.ok(!JSON.stringify(snap).toLowerCase().includes(room.game.currentWord.toLowerCase()));
    room.game.reset();
});

// ---------- 4.6 Replay data ----------

test("round_end carries the turn's strokes for replay", () => {
    const io = recordingIo();
    const room = new Room("RP0001", "a", { hintCount: 0 }, io);
    room.addPlayer(new Player("a", "Ann")); room.addPlayer(new Player("b", "Bob"));
    room.game.startGame();
    room.game.selectWord(room.game.wordOptions[0]);
    room.canvasStrokes.push({ id: "s1", color: "red", size: 4, points: [{ x: 1, y: 2, t: 10 }, { x: 3, y: 4, t: 50 }] });
    room.game.handleCorrectGuess(room.getPlayer("b"));
    const end = io.emits.find((e) => e.event === "round_end").data;
    assert.equal(end.strokes.length, 1);
    assert.deepEqual(end.strokes[0].points.map((p) => p.t), [10, 50]);
    room.game.reset();
});

// ---------- 4.8 Play again ----------

test("returnToLobby resets scores and ready, keeps players, promotes spectators if there's space", () => {
    const room = new Room("PA0001", "a", { maxPlayers: 3 });
    ["a", "b"].forEach((id) => room.addPlayer(new Player(id, id + "x")));
    room.addSpectator(new Spectator("s1", "Spec1"));
    room.addSpectator(new Spectator("s2", "Spec2"));
    room.players.forEach((p) => { p.score = 99; p.ready = true; });
    room.game.phase = "game_over";
    room.game.returnToLobby();
    assert.equal(room.players.length + room.spectators.length, 4, "nobody removed");
    assert.ok(room.players.every((p) => p.score === 0 && p.ready === false));
    assert.ok(room.getPlayer("s1") && !room.getSpectator("s1"), "first spectator promoted to player");
    assert.ok(room.getSpectator("s2") && !room.getPlayer("s2"), "no space left for the second");
    assert.equal(room.game.phase, "lobby");
    assert.equal(room.gameStarted, false);
});
