// Phase 1.1 / 1.2 / 1.5 — settings validation (ranges, modes, categories, privacy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSettings, DEFAULT_SETTINGS, NUMBER_RULES } from "../utils/roomSettings.js";

test("empty input gives the defaults (private room, 3 word choices, 2 hints)", () => {
    const { ok, settings } = validateSettings({});
    assert.equal(ok, true);
    assert.equal(settings.isPrivate, true);
    assert.equal(settings.wordCount, 3);
    assert.equal(settings.hintCount, 2);
    assert.equal(settings.category, "all");
    assert.equal(settings.hintsEnabled, true);
});

test("every numeric setting accepts its min and max and rejects values outside", () => {
    for (const [key, { min, max }] of Object.entries(NUMBER_RULES)) {
        assert.equal(validateSettings({ [key]: min }).settings[key], min, `${key} min`);
        assert.equal(validateSettings({ [key]: max }).settings[key], max, `${key} max`);
        assert.equal(validateSettings({ [key]: min - 1 }).ok, false, `${key} below min`);
        assert.equal(validateSettings({ [key]: max + 1 }).ok, false, `${key} above max`);
        assert.equal(validateSettings({ [key]: min + 0.5 }).ok, false, `${key} non-integer`);
        assert.equal(validateSettings({ [key]: String(min) }).ok, false, `${key} string`);
    }
});

test("exact ranges from the assignment", () => {
    assert.deepEqual(NUMBER_RULES, {
        maxPlayers: { min: 2, max: 20 },
        maxRounds: { min: 2, max: 10 },
        drawTime: { min: 15, max: 240 },
        wordCount: { min: 1, max: 5 },
        hintCount: { min: 0, max: 5 },
    });
});

test("hintCount 0 disables hints", () => {
    const { settings } = validateSettings({ hintCount: 0 });
    assert.equal(settings.hintCount, 0);
    assert.equal(settings.hintsEnabled, false);
});

test("gameMode must be normal/hidden/combination (case-insensitive, stored lowercase)", () => {
    assert.equal(validateSettings({ gameMode: "Combination" }).settings.gameMode, "combination");
    assert.equal(validateSettings({ gameMode: "hidden" }).settings.gameMode, "hidden");
    assert.equal(validateSettings({ gameMode: "speedrun" }).ok, false);
    assert.equal(validateSettings({ gameMode: 5 }).ok, false);
});

test("category must be one of the known categories", () => {
    for (const c of ["all", "animal", "objects", "food", "places", "actions", "countries", "movieCharacters"]) {
        assert.equal(validateSettings({ category: c }).settings.category, c);
    }
    assert.equal(validateSettings({ category: "cars" }).ok, false);
    assert.equal(validateSettings({ category: "__proto__" }).ok, false);
});

test("isPrivate: anything except an explicit false makes the room private", () => {
    assert.equal(validateSettings({ isPrivate: false }).settings.isPrivate, false);
    assert.equal(validateSettings({ isPrivate: true }).settings.isPrivate, true);
    for (const value of ["false", 0, null, "yes", {}]) {
        const result = validateSettings({ isPrivate: value });
        assert.equal(result.ok, true);
        assert.equal(result.settings.isPrivate, true, `isPrivate: ${JSON.stringify(value)} -> private`);
    }
});

test("partial updates merge over the current settings; unknown keys are ignored", () => {
    const base = validateSettings({ drawTime: 120, category: "food" }).settings;
    const { ok, settings } = validateSettings({ maxRounds: 5, evil: "x" }, base);
    assert.equal(ok, true);
    assert.equal(settings.drawTime, 120);
    assert.equal(settings.category, "food");
    assert.equal(settings.maxRounds, 5);
    assert.equal("evil" in settings, false);
});

test("non-object payloads are rejected", () => {
    assert.equal(validateSettings("hello").ok, false);
    assert.equal(validateSettings([1, 2]).ok, false);
    assert.equal(validateSettings(null).ok, true); // treated as "no changes"
    // Phase 4 adds language, customWords and onlyCustomWords.
    assert.deepEqual(Object.keys(DEFAULT_SETTINGS).sort(), ["category", "customWords", "drawTime", "gameMode", "hintCount", "isPrivate", "language", "maxPlayers", "maxRounds", "onlyCustomWords", "wordCount"]);
});
