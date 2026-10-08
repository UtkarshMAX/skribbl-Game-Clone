// Phase 1.1 / 1.5 — hint timing + limits, word options count, categories, ready-up rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import GameManager from "../managers/GameManager.js";
import HintManager from "../utils/HintManager.js";
import WordManager from "../utils/WordManager.js";
import Room from "../models/Room.js";
import Player from "../models/Player.js";
import words from "../data/words.js";

test("hint i is revealed at drawTime * i / (hintCount + 1) seconds", () => {
    assert.deepEqual(GameManager.hintTimes(60, 2), [20000, 40000]);
    assert.deepEqual(GameManager.hintTimes(75, 4), [15000, 30000, 45000, 60000]);
    assert.deepEqual(GameManager.hintTimes(90, 1), [45000]);
    assert.deepEqual(GameManager.hintTimes(90, 0), []);
});

test("never reveal more than half the letters", () => {
    // "Cat" has 3 letters -> at most 1 hint even if hintCount is 5.
    assert.equal(HintManager.canReveal([], 5, "Cat"), true);
    assert.equal(HintManager.canReveal([0], 5, "Cat"), false);
    // "Elephant" has 8 letters -> at most 4.
    assert.equal(HintManager.canReveal([0, 1, 2], 5, "Elephant"), true);
    assert.equal(HintManager.canReveal([0, 1, 2, 3], 5, "Elephant"), false);
    // The room's hint limit still applies.
    assert.equal(HintManager.canReveal([0, 1], 2, "Elephant"), false);
    // Spaces, hyphens and "+" don't count as letters: "Ox + Bee" has 5 letters -> at most 2.
    assert.equal(HintManager.letterCount("Ox + Bee"), 5);
    assert.equal(HintManager.canReveal([0, 1], 5, "Ox + Bee"), false);
});

test("hints never reveal spaces, hyphens or +", () => {
    const word = "T-Rex + Ice Cream";
    let display = WordManager.createDisplayWord(word);
    assert.equal(display, "_-___ + ___ _____");
    let revealed = [];
    for (let i = 0; i < 6; i++) {
        const r = HintManager.revealLetter(word, display, revealed);
        display = r.displayWord; revealed = r.revealedIndexes;
    }
    for (const i of revealed) assert.ok(HintManager.isLetter(word[i]), `revealed index ${i} is a letter`);
    assert.equal(display.replace(/[^ +\-]/g, ""), word.replace(/[^ +\-]/g, ""), "separators unchanged");
});

function makeGame(settings) {
    const room = new Room("TEST01", "A", settings);
    room.addPlayer(new Player("A", "Alice"));
    room.addPlayer(new Player("B", "Bob"));
    return room;
}

test("the drawer is offered exactly wordCount distinct options (1–5)", () => {
    for (let count = 1; count <= 5; count++) {
        const room = makeGame({ wordCount: count });
        for (let i = 0; i < 50; i++) {
            const options = room.gameManager.generateWordOptions();
            assert.equal(options.length, count);
            assert.equal(new Set(options).size, count, "no duplicates");
        }
    }
});

test("word options respect the room category", () => {
    for (const category of ["animal", "objects", "food", "places", "actions", "countries", "movieCharacters"]) {
        const room = makeGame({ category, wordCount: 5 });
        for (const w of room.gameManager.generateWordOptions()) {
            assert.ok(words[category].includes(w), `${w} is in ${category}`);
        }
    }
    const combo = makeGame({ category: "food", gameMode: "combination", wordCount: 3 });
    for (const w of combo.gameManager.generateWordOptions()) {
        const [a, b] = w.split(" + ");
        assert.ok(words.food.includes(a) && words.food.includes(b), `${w} uses two food words`);
    }
});

test("ready-up: start needs ≥2 players and all non-host players ready", () => {
    const room = new Room("TEST02", "A", {});
    room.addPlayer(new Player("A", "Host"));
    assert.equal(room.startBlocker(), "Minimum 2 players required");
    room.addPlayer(new Player("B", "Bob"));
    room.addPlayer(new Player("C", "Cat"));
    assert.equal(room.startBlocker(), "All players must be ready before starting");
    room.getPlayer("B").ready = true;
    assert.equal(room.startBlocker(), "All players must be ready before starting");
    room.getPlayer("C").ready = true;
    assert.equal(room.startBlocker(), null, "host does not need to be ready");
    room.resetReady();
    assert.ok(room.players.every((p) => p.ready === false));
});

test("ready states reset when the game starts and when it ends (back to lobby)", () => {
    const room = new Room("TEST03", "A", {});
    ["A", "B", "C"].forEach((id) => room.addPlayer(new Player(id, id + "x")));
    room.getPlayer("B").ready = true; room.getPlayer("C").ready = true;
    const io = { to: () => ({ emit: () => {} }) };
    room.gameManager.startGame(io);
    assert.ok(room.players.every((p) => !p.ready), "reset on start");
    room.getPlayer("B").ready = true;
    room.gameManager.endGame(io);
    assert.ok(room.players.every((p) => !p.ready), "reset on game over");
    assert.equal(room.gameStarted, false);
});
