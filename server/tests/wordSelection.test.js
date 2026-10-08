// Existing feature (kept working): 20s word selection with countdown, auto-pick and cleanup.
// Uses a fake `io` that records every emit. Takes ~25s because it runs real timers.
import { test } from "node:test";
import assert from "node:assert/strict";
import Room from "../models/Room.js";
import Player from "../models/Player.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGame(settings = {}) {
    const emits = [];
    const io = { to: (target) => ({ emit: (event, data) => emits.push({ t: Date.now(), target, event, data }) }) };
    // Phase 3: the Room sends all messages, so it gets the recording io.
    const room = new Room("ROOM1", "A", { drawTime: 60, hintCount: 0, ...settings }, io);
    ["A", "B", "C"].forEach((id) => room.addPlayer(new Player(id, id)));
    const game = room.gameManager;
    let timerStarts = 0;
    const orig = game.startTimer.bind(game);
    game.startTimer = (io2) => { timerStarts++; return orig(io2); };
    return { game, io, emits, room, starts: () => timerStarts };
}
const of = (emits, event) => emits.filter((e) => e.event === event);

test("countdown 20 → 0 to the room, choices only to the drawer, random auto-pick at 0", async () => {
    const { game, io, emits, starts } = makeGame();
    game.startGame(io);
    await sleep(1300);
    const choose = of(emits, "word_options");
    assert.equal(choose.length, 1);
    assert.equal(choose[0].target, "A");
    assert.equal(choose[0].data.timeLeft, 20);
    assert.equal(choose[0].data.words.length, 3);
    for (const w of choose[0].data.words) {
        assert.ok(!emits.some((e) => e.target !== "A" && JSON.stringify(e.data ?? "").includes(`"${w}"`)), "words never sent to others");
    }

    await sleep(20200);
    const ticks = of(emits, "word_selection_tick");
    assert.equal(ticks.length, 21);
    assert.ok(ticks.every((e) => e.target === "ROOM1" && e.data.drawerName === "A" && !("words" in e.data)));
    assert.deepEqual(ticks.map((t) => t.data.timeLeft), [...Array(21).keys()].reverse());

    assert.equal(of(emits, "word_selected").length, 1);
    assert.ok(choose[0].data.words.includes(game.currentWord));
    assert.equal(starts(), 1);

    const other = choose[0].data.words.find((w) => w !== game.currentWord);
    assert.equal(game.selectWord(io, other), false, "late click after auto-pick is ignored");
    assert.equal(starts(), 1);
    game.reset();
});

test("manual pick: first valid pick wins, countdown stops, unoffered words rejected", async () => {
    const { game, io, emits, starts } = makeGame();
    game.startGame(io);
    await sleep(2200);
    const words = of(emits, "word_options")[0].data.words;
    assert.equal(game.selectWord(io, "not-offered"), false);
    assert.deepEqual([game.selectWord(io, words[1]), game.selectWord(io, words[0]), game.selectWord(io, words[1])], [true, false, false]);
    assert.equal(game.currentWord, words[1]);
    assert.equal(starts(), 1);
    const n = of(emits, "word_selection_tick").length;
    await sleep(1500);
    assert.equal(of(emits, "word_selection_tick").length, n, "countdown stopped");
    game.reset();
});

for (const [label, action] of [
    ["next turn (drawer left)", (g, io, room) => { room.removePlayer("A"); g.currentDrawerIndex--; g.nextTurn(io); }],
    ["game over", (g, io) => g.endGame(io)],
    ["room reset", (g) => g.reset()],
]) {
    test(`no countdown keeps running after ${label}`, async () => {
        const { game, io, emits, room } = makeGame();
        game.startGame(io);
        await sleep(2200);
        const ticksFor = (id) => emits.filter((e) => e.event === "word_selection_tick" && e.data.drawerId === id).length;
        action(game, io, room);
        const n = ticksFor("A");
        await sleep(1600);
        assert.equal(ticksFor("A"), n);
        game.reset();
    });
}

test("auto-pick is random across offered words (30 games in parallel)", async () => {
    const games = Array.from({ length: 30 }, () => makeGame());
    games.forEach(({ game, io }) => game.startGame(io));
    await sleep(21500);
    const positions = games.map(({ emits, game }) => of(emits, "word_options")[0].data.words.indexOf(game.currentWord));
    assert.ok(positions.every((p) => p >= 0));
    assert.ok(new Set(positions).size >= 2, `picked positions: ${positions}`);
    games.forEach(({ game }) => game.reset());
});
