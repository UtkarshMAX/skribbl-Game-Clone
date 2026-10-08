// Single source of truth for room settings: allowed ranges, defaults and validation.
// The server never trusts settings sent by a client — everything goes through validateSettings().

export const NUMBER_RULES = {
    maxPlayers: { min: 2, max: 20 },
    maxRounds: { min: 2, max: 10 },
    drawTime: { min: 15, max: 240 },
    wordCount: { min: 1, max: 5 },
    hintCount: { min: 0, max: 5 },   // 0 = hints disabled
};

export const GAME_MODES = ["normal", "hidden", "combination"];

export const CATEGORIES = ["all", "animal", "objects", "food", "places", "actions", "countries", "movieCharacters"];

export const LANGUAGES = ["en", "hi"]; // English, Hindi (romanized)

export const MIN_ONLY_CUSTOM_WORDS = 10;
export const MAX_CUSTOM_WORDS = 500;

export const DEFAULT_SETTINGS = {
    maxPlayers: 8,
    maxRounds: 3,
    drawTime: 75,
    wordCount: 3,
    hintCount: 2,
    gameMode: "normal",
    category: "all",
    isPrivate: true,
    language: "en",
    customWords: [],
    onlyCustomWords: false,
};

/**
 * Custom words from a comma-separated string (or an array):
 * each word is trimmed, inner spaces collapsed, and kept only if it is 1–30 characters of
 * letters, spaces and hyphens (with at least one letter). Duplicates (any case) are removed.
 */
export function sanitizeCustomWords(input) {
    const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,\n]/) : [];
    const seen = new Set();
    const words = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const word = item.trim().replace(/\s+/g, " ");
        if (!/^[\p{L} -]{1,30}$/u.test(word) || !/\p{L}/u.test(word)) continue;
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        words.push(word);
        if (words.length >= MAX_CUSTOM_WORDS) break;
    }
    return words;
}

/**
 * Validates a (partial) settings object and merges it over `base`.
 * Unknown keys are ignored. Returns { ok: true, settings } or { ok: false, message }.
 */
export function validateSettings(input, base = DEFAULT_SETTINGS) {
    if (input === undefined || input === null) input = {};
    if (typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, message: "Settings must be an object" };
    }

    const settings = { ...DEFAULT_SETTINGS, ...base };

    for (const [key, { min, max }] of Object.entries(NUMBER_RULES)) {
        if (input[key] === undefined) continue;
        const value = input[key];
        if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
            return { ok: false, message: `${key} must be a whole number between ${min} and ${max}` };
        }
        settings[key] = value;
    }

    if (input.gameMode !== undefined) {
        const mode = typeof input.gameMode === "string" ? input.gameMode.toLowerCase() : null;
        if (!GAME_MODES.includes(mode)) {
            return { ok: false, message: `gameMode must be one of: ${GAME_MODES.join(", ")}` };
        }
        settings.gameMode = mode;
    }

    if (input.category !== undefined) {
        if (!CATEGORIES.includes(input.category)) {
            return { ok: false, message: `category must be one of: ${CATEGORIES.join(", ")}` };
        }
        settings.category = input.category;
    }

    // Safe default: anything except an explicit `false` makes the room private.
    if (input.isPrivate !== undefined) {
        settings.isPrivate = input.isPrivate !== false;
    }

    if (input.language !== undefined) {
        if (!LANGUAGES.includes(input.language)) {
            return { ok: false, message: `language must be one of: ${LANGUAGES.join(", ")}` };
        }
        settings.language = input.language;
    }

    if (input.customWords !== undefined) {
        if (typeof input.customWords !== "string" && !Array.isArray(input.customWords)) {
            return { ok: false, message: "customWords must be a comma-separated list" };
        }
        settings.customWords = sanitizeCustomWords(input.customWords);
    }

    if (input.onlyCustomWords !== undefined) {
        if (typeof input.onlyCustomWords !== "boolean") {
            return { ok: false, message: "onlyCustomWords must be true or false" };
        }
        settings.onlyCustomWords = input.onlyCustomWords;
    }

    if (settings.onlyCustomWords && settings.customWords.length < MIN_ONLY_CUSTOM_WORDS) {
        return {
            ok: false,
            message: `Add at least ${MIN_ONLY_CUSTOM_WORDS} valid custom words to use only custom words (you have ${settings.customWords.length})`,
        };
    }

    // Kept for older code paths: hints are on whenever at least one hint is allowed.
    settings.hintsEnabled = settings.hintCount > 0;

    return { ok: true, settings };
}
