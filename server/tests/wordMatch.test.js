// Phase 2.6 — word matching: case, spaces, accents, punctuation, combination words,
// close guesses and containsWord. Plus text cleanup and the rate limiter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, isCorrect, isClose, containsWord, levenshtein } from "../utils/wordMatch.js";
import { cleanText, MAX_MESSAGE_LENGTH } from "../utils/text.js";
import RateLimiter from "../utils/RateLimiter.js";

test("normalize: trim, lowercase, collapse spaces", () => {
    assert.equal(normalize("  Ice   Cream  "), "ice cream");
    assert.equal(normalize("ELEPHANT"), "elephant");
    assert.equal(normalize("\tIce\n Cream"), "ice cream");
});

test("normalize: strips accents", () => {
    assert.equal(normalize("Crème Brûlée"), "creme brulee");
    assert.equal(normalize("Pokémon"), "pokemon");
    assert.equal(normalize("Ñandú"), "nandu");
});

test("normalize: strips punctuation, keeps letters/digits/spaces", () => {
    assert.equal(normalize("cat!!!"), "cat");
    assert.equal(normalize("it's a T-Rex?"), "its a trex");
    assert.equal(normalize("R2-D2"), "r2d2");
    assert.equal(normalize("🍕 pizza 🍕"), "pizza");
});

test("normalize: combination '+' is treated as a space", () => {
    assert.equal(normalize("Tiger + Pizza"), "tiger pizza");
    assert.equal(normalize("tiger+pizza"), "tiger pizza");
});

test("normalize: non-strings become empty", () => {
    assert.equal(normalize(null), "");
    assert.equal(normalize(42), "");
    assert.equal(normalize({}), "");
});

test("isCorrect: exact after normalization", () => {
    assert.equal(isCorrect("elephant", "Elephant"), true);
    assert.equal(isCorrect("  ELEPHANT!! ", "Elephant"), true);
    assert.equal(isCorrect("ice  cream", "Ice Cream"), true);
    assert.equal(isCorrect("creme brulee", "Crème Brûlée"), true);
    assert.equal(isCorrect("t-rex", "T-Rex"), true);
    assert.equal(isCorrect("elephants", "Elephant"), false);
    assert.equal(isCorrect("", "Elephant"), false);
    assert.equal(isCorrect("!!!", "Elephant"), false);
});

test("isCorrect: combination words need both parts in order", () => {
    assert.equal(isCorrect("tiger pizza", "Tiger + Pizza"), true);
    assert.equal(isCorrect("Tiger+Pizza", "Tiger + Pizza"), true);
    assert.equal(isCorrect("tiger", "Tiger + Pizza"), false);
    assert.equal(isCorrect("pizza tiger", "Tiger + Pizza"), false);
});

test("levenshtein distance", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
    assert.equal(levenshtein("elephant", "elefant"), 2);
    assert.equal(levenshtein("giraffe", "girafe"), 1);
    assert.equal(levenshtein("", "abc"), 3);
    assert.equal(levenshtein("same", "same"), 0);
});

test("isClose: one edit away for words of length ≥ 5", () => {
    assert.equal(isClose("girafe", "Giraffe"), true);   // deletion
    assert.equal(isClose("giraffes", "Giraffe"), true); // insertion
    assert.equal(isClose("giraffa", "Giraffe"), true);  // substitution
    assert.equal(isClose("GIRAFE!", "Giraffe"), true);  // normalized first
    assert.equal(isClose("girafa", "Giraffe"), false);  // 2 edits
    assert.equal(isClose("cot", "Cat"), false);         // short words never "close"
    assert.equal(isClose("bear", "Beard"), true);       // word has 5 letters, guess is 1 edit away
    assert.equal(isClose("bead", "Bear"), false);       // word has only 4 letters
});

test("isClose: guess is one part of a combination word", () => {
    assert.equal(isClose("tiger", "Tiger + Pizza"), true);
    assert.equal(isClose("PIZZA", "Tiger + Pizza"), true);
    assert.equal(isClose("burger", "Tiger + Pizza"), false);
});

test("isClose: a correct guess is never 'close'", () => {
    assert.equal(isClose("giraffe", "Giraffe"), false);
    assert.equal(isClose("tiger pizza", "Tiger + Pizza"), false);
    assert.equal(isClose("", "Giraffe"), false);
});

test("containsWord: normalized substring match", () => {
    assert.equal(containsWord("I think it's a GIRAFFE!", "Giraffe"), true);
    assert.equal(containsWord("ice-cream please", "Ice Cream"), false); // hyphen removed -> "icecream"
    assert.equal(containsWord("i love ice cream", "Ice Cream"), true);
    assert.equal(containsWord("tiger and pizza", "Tiger + Pizza"), false);
    assert.equal(containsWord("tiger pizza lol", "Tiger + Pizza"), true);
    assert.equal(containsWord("crème brûlée time", "Creme Brulee"), true);
    assert.equal(containsWord("no match here", "Giraffe"), false);
    assert.equal(containsWord("anything", ""), false);
});

test("cleanText: trims, collapses whitespace, strips control chars, limits length", () => {
    assert.equal(cleanText("  hello   world  "), "hello world");
    assert.equal(cleanText("line1\nline2\u0007"), "line1 line2");
    assert.equal(cleanText("x".repeat(500)).length, MAX_MESSAGE_LENGTH);
    assert.equal(cleanText("   "), null);
    assert.equal(cleanText(123), null);
});

test("RateLimiter: 5 per 3 seconds per key", () => {
    const limiter = new RateLimiter(5, 3000);
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) assert.equal(limiter.allow("a", t + i * 10), true);
    assert.equal(limiter.allow("a", t + 100), false, "6th within 3s dropped");
    assert.equal(limiter.allow("b", t + 100), true, "other players unaffected");
    assert.equal(limiter.allow("a", t + 3001), true, "window slides");
    limiter.forget("a");
    assert.equal(limiter.allow("a", t + 3002), true);
});
