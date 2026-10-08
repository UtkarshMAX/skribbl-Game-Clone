// Allowed browser origins for CORS (Express + Socket.IO), from the CLIENT_URL env variable.
//
//   CLIENT_URL="http://localhost:5173,https://my-scribble.vercel.app"
//   CLIENT_URL="http://localhost:5173,https://*.vercel.app"   (wildcard = any Vercel preview URL)
//
// Plain entries must match exactly (a trailing "/" is ignored); entries with "*" become patterns.

export const DEFAULT_ORIGINS = ["http://localhost:5173"];

const escapeRegex = (text) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

export function parseAllowedOrigins(value) {
    const entries = (value ?? "")
        .split(",")
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter(Boolean);
    if (!entries.length) return [...DEFAULT_ORIGINS];

    return entries.map((entry) =>
        entry.includes("*")
            ? new RegExp(`^${entry.split("*").map(escapeRegex).join("[a-z0-9-]+")}$`, "i")
            : entry
    );
}

/** True if `origin` is allowed by the parsed list (used by tests and for logging). */
export function isOriginAllowed(origin, allowed) {
    return allowed.some((rule) => (rule instanceof RegExp ? rule.test(origin) : rule === origin));
}
