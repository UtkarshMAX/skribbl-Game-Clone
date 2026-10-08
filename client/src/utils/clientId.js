// A persistent per-browser id (UUID in localStorage), sent when creating/joining rooms.
// The server uses it to enforce bans across reconnects; it is never shown to other players.
export function getClientId() {
    try {
        let id = localStorage.getItem("clientId");
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem("clientId", id);
        }
        return id;
    } catch {
        return undefined; // storage blocked: bans just can't follow this browser
    }
}
