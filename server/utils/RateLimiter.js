// Sliding-window rate limiter: at most `limit` actions per `windowMs` per key (socket id).
export default class RateLimiter {
    constructor(limit = 5, windowMs = 3000) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.hits = new Map(); // key -> timestamps of recent allowed actions
    }

    /** Records an attempt; returns true if it's allowed, false if it should be dropped. */
    allow(key, now = Date.now()) {
        const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
        if (recent.length >= this.limit) {
            this.hits.set(key, recent);
            return false;
        }
        recent.push(now);
        this.hits.set(key, recent);
        return true;
    }

    forget(key) {
        this.hits.delete(key);
    }
}
