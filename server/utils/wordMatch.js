// Pure word-matching helpers used to judge guesses and protect the secret word.
// No side effects — everything here is unit-tested in tests/wordMatch.test.js.

/**
 * Normalizes text for comparison:
 * trim, lowercase, strip accents (NFD), treat the combination "+" as a space,
 * remove punctuation (keep letters, digits, spaces) and collapse multiple spaces.
 *   "  Crème-Brûlée!! " -> "cremebrulee"      "Tiger + Pizza" -> "tiger pizza"
 */
export function normalize(text) {
    if (typeof text !== "string") return "";
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")      // accents
        .toLowerCase()
        .replace(/\+/g, " ")                  // combination separator
        .replace(/[^\p{L}\p{N}\s]/gu, "")     // punctuation / symbols
        .replace(/\s+/g, " ")
        .trim();
}

/** Exact match after normalization. */
export function isCorrect(guess, word) {
    const g = normalize(guess);
    return g.length > 0 && g === normalize(word);
}

/** Classic Levenshtein edit distance (insert / delete / substitute = 1). */
export function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        for (let j = 1; j <= b.length; j++) {
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = curr;
    }
    return prev[b.length];
}

/**
 * "Close" (but not correct) guesses:
 * - one edit away from a word of 5+ characters, or
 * - exactly one of the two parts of a combination word ("Tiger + Pizza" -> "tiger").
 */
export function isClose(guess, word) {
    const g = normalize(guess);
    const w = normalize(word);
    if (!g || g === w) return false;

    if (w.length >= 5 && levenshtein(g, w) === 1) return true;

    if (typeof word === "string" && word.includes("+")) {
        const parts = word.split("+").map(normalize).filter(Boolean);
        if (parts.includes(g)) return true;
    }
    return false;
}

/** True if the normalized text contains the normalized word anywhere. */
export function containsWord(text, word) {
    const t = normalize(text);
    const w = normalize(word);
    return w.length > 0 && t.includes(w);
}
