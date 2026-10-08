// Server-side cleanup for any free text a client sends (chat, guesses).

export const MAX_MESSAGE_LENGTH = 150;

/**
 * Returns a trimmed, length-limited copy of `text` with control characters removed,
 * or null if there's nothing left to send.
 */
export function cleanText(text, maxLength = MAX_MESSAGE_LENGTH) {
    if (typeof text !== "string") return null;
    const cleaned = text
        .replace(/[\u0000-\u001f\u007f]/g, " ")   // newlines / control chars -> space
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
        .trim();
    return cleaned.length ? cleaned : null;
}
